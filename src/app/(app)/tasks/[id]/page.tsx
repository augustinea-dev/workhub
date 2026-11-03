import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, deleteComment, deleteTask, logTime, setTaskStatus, updateTask } from "../../actions";
import { LiveRefresh, SubmitButton } from "@/components/client";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { Empty, Flash, HealthBadge, TaskBadge } from "@/components/ui";
import { daysBetween, formatDate, formatDay, formatTimestamp, relativeDay, todayISO } from "@/lib/dates";
import { getPeople, nameOf, personOption, sp } from "@/lib/data";
import { groupByMilestone } from "@/lib/milestones";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, TASK_STATUSES, type Comment, type Profile, type Task, type TaskStatus, type TimeEntry } from "@/lib/types";

type Subtask = { id: string; title: string; status: TaskStatus; assignee_id: string | null; due_date: string | null };
type ProjectTask = Subtask & { is_milestone: boolean; milestone_id: string | null };

function TaskList({ items, people, meId }: { items: Subtask[]; people: Profile[]; meId: string }) {
  return (
    <ul>
      {items.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
          <div className="min-w-0">
            <Link href={`/tasks/${s.id}`} className="block truncate text-sm font-medium hover:underline">
              {s.title}
            </Link>
            <p className="text-xs text-stone-500">
              {s.assignee_id === meId ? "You" : nameOf(people, s.assignee_id)}
              {s.due_date && ` · Due ${formatDate(s.due_date)}`}
            </p>
          </div>
          <TaskBadge status={s.status} />
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="label">{label}</dt>
      <dd className="text-sm text-stone-900">{children}</dd>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

function hrs(n: number): string {
  return `${n.toFixed(2).replace(/\.?0+$/, "")} h`;
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const supabase = await createClient();

  const [{ data: task }, { data: comments }, { data: time }, { data: children }, people] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*, project:projects(id, name, company:companies(name), tasks(id, title, status, due_date, assignee_id, is_milestone, milestone_id)), parent:parent_task_id(id, title)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("time_entries").select("*").eq("task_id", id).order("work_date", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, status, assignee_id, due_date")
      .eq("parent_task_id", id)
      .order("sort_order"),
    getPeople(),
    // Opening a task counts as reading its notifications.
    supabase
      .from("notification_events")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", me.id)
      .eq("task_id", id)
      .is("read_at", null),
  ]);
  if (!task) notFound();

  const t = task as Task & {
    project: { id: string; name: string; company: { name: string } | null; tasks: ProjectTask[] };
    parent: { id: string; title: string } | null;
  };
  const parent = t.parent;
  const subtasks = (children ?? []) as Subtask[];
  const thread = (comments ?? []) as Comment[];
  const entries = (time ?? []) as TimeEntry[];
  const logged = entries.reduce((s, e) => s + Number(e.hours), 0);
  const mine = entries.filter((e) => e.user_id === me.id).reduce((s, e) => s + Number(e.hours), 0);
  const estimate = t.estimate_hours != null ? Number(t.estimate_hours) : null;
  const here = `/tasks/${id}`;
  const today = todayISO();
  const isAssignee = t.assignee_id === me.id;
  const isDone = t.status === "done";
  const dueIn = t.due_date ? daysBetween(today, t.due_date) : null;
  const overdue = !isDone && dueIn != null && dueIn < 0;
  const assigneeName = isAssignee ? "You" : nameOf(people, t.assignee_id);
  const milestones = groupByMilestone(t.project.tasks, today);
  const inMilestone = t.milestone_id ? milestones.find((g) => g.milestone.id === t.milestone_id) : undefined;
  const ownGroup = t.is_milestone ? milestones.find((g) => g.milestone.id === t.id) : undefined;
  const timeRows: TimeRow[] = entries.map((e) => ({
    ...e,
    personName: nameOf(people, e.user_id),
    dayLabel: formatDay(e.work_date),
  }));

  const dueText = t.due_date ? (
    <span className={overdue ? "font-medium text-red-700" : undefined}>
      {formatDate(t.due_date)}{" "}
      <span className={overdue ? undefined : "text-stone-500"}>
        ({overdue ? `overdue by ${-dueIn!} day${dueIn === -1 ? "" : "s"}` : relativeDay(t.due_date, today)})
      </span>
    </span>
  ) : (
    <span className="text-stone-500">No due date</span>
  );

  return (
    <>
      <LiveRefresh
        subs={[
          { table: "tasks", filter: `id=eq.${id}` },
          { table: "tasks", filter: `parent_task_id=eq.${id}` },
          { table: "comments", filter: `task_id=eq.${id}` },
          { table: "time_entries", filter: `task_id=eq.${id}` },
        ]}
      />
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/projects" className="hover:underline">Projects</Link>
        {" · "}
        {t.project.company?.name && <>{t.project.company.name} · </>}
        <Link href={`/projects/${t.project.id}`} className="hover:underline">{t.project.name}</Link>
        {parent && (
          <>
            {" · "}
            <Link href={`/tasks/${parent.id}`} className="hover:underline">{parent.title}</Link>
          </>
        )}
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {t.is_milestone && <span title="Milestone">◆ </span>}
          {t.title}
        </h1>
        <TaskBadge status={t.status} />
      </div>
      <p className="mb-6 text-sm text-stone-600">
        {t.assignee_id ? <>Assigned to <span className="font-medium text-stone-900">{assigneeName}</span></> : "Unassigned"}
        {" · "}
        {t.due_date ? <>Due {dueText}</> : dueText}
      </p>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      {!isAdmin && isAssignee && (
        <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Your status</h2>
            <p className="text-xs text-stone-500">Keep this current so the team knows where things stand.</p>
          </div>
          <div role="group" aria-label="Task status" className="flex flex-wrap gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            {TASK_STATUSES.map((s) =>
              s.value === t.status ? (
                <span key={s.value} aria-current="true" className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">
                  {s.label}
                </span>
              ) : (
                <form key={s.value} action={setTaskStatus}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="version" value={t.version} />
                  <input type="hidden" name="status" value={s.value} />
                  <input type="hidden" name="redirect_to" value={here} />
                  <SubmitButton
                    pendingText="Saving…"
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-50"
                  >
                    {s.label}
                  </SubmitButton>
                </form>
              ),
            )}
          </div>
        </section>
      )}

      {!isAdmin && !isAssignee && (
        <p className="mb-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          {t.assignee_id
            ? `This task is assigned to ${assigneeName}. You can post updates and log time; ${assigneeName} or an admin can change its status.`
            : "This task isn't assigned to anyone yet. You can post updates and log time; ask an admin to assign it."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {!isAdmin && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              {t.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{t.description}</p>
              ) : (
                <p className="text-sm text-stone-500">
                  No description yet. If you need more detail, ask in Updates below.
                </p>
              )}
            </section>
          )}

          {ownGroup && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
                <h2 className="text-sm font-semibold">
                  Tasks in this milestone{" "}
                  <span className="font-normal text-stone-400">
                    · {ownGroup.done} of {ownGroup.tasks.length} done
                  </span>
                </h2>
                <HealthBadge health={ownGroup.health} showReason />
              </div>
              {ownGroup.tasks.length === 0 ? (
                <Empty>No tasks in this milestone yet.{isAdmin && " Pick it as the milestone on a task to add one."}</Empty>
              ) : (
                <TaskList items={ownGroup.tasks} people={people} meId={me.id} />
              )}
            </section>
          )}

          {subtasks.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
                Subtasks{" "}
                <span className="font-normal text-stone-400">
                  · {subtasks.filter((s) => s.status === "done").length} of {subtasks.length} done
                </span>
              </h2>
              <TaskList items={subtasks} people={people} meId={me.id} />
            </section>
          )}

          <section className="card">
            <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
              Updates <span className="font-normal text-stone-400">· {thread.length}</span>
            </h2>
            {thread.length === 0 ? (
              <Empty>No updates yet. Questions, progress notes and handoffs go here.</Empty>
            ) : (
              <ul>
                {thread.map((c) => (
                  <li key={c.id} className="border-b border-stone-100 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {c.author_id === me.id ? "You" : nameOf(people, c.author_id)}
                        <span className="ml-2 font-normal text-stone-400">{formatTimestamp(c.created_at)}</span>
                      </p>
                      {isAdmin && (
                        <form action={deleteComment}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="task_id" value={id} />
                          <button className="btn-danger" aria-label="Delete comment">Delete</button>
                        </form>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={addComment} className="space-y-2 p-4">
              <input type="hidden" name="task_id" value={id} />
              <textarea name="body" required rows={3} placeholder="Post a progress note, question or handoff…" aria-label="Update" className="input w-full" />
              <SubmitButton pendingText="Posting…">Post update</SubmitButton>
            </form>
          </section>

          <section className="card">
            <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
              Time <span className="font-normal text-stone-400">· {hrs(logged)} logged</span>
              {estimate != null && <span className="font-normal text-stone-400"> of {hrs(estimate)} planned</span>}
            </h2>
            {timeRows.length === 0 ? (
              <Empty>No time logged on this task yet.</Empty>
            ) : (
              <TimeEntryTable rows={timeRows} meId={me.id} isAdmin={isAdmin} redirectTo={here} second="person" />
            )}
            <form action={logTime} className="border-t border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Log time</p>
              <div className="flex flex-wrap gap-2">
                <input type="hidden" name="task_id" value={id} />
                <input type="hidden" name="redirect_to" value={here} />
                <input name="work_date" type="date" defaultValue={today} aria-label="Date" className="input w-40" />
                <input name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="Hours" aria-label="Hours" className="input w-24" />
                <select name="hour_type" defaultValue="billable" aria-label="Hour type" className="input w-36">
                  {HOUR_TYPES.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
                <input name="note" placeholder="Note (optional)" aria-label="Note" className="input min-w-48 flex-1" />
                <SubmitButton pendingText="Logging…" className="btn-primary shrink-0">Log time</SubmitButton>
              </div>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          {isAdmin ? (
            <section className="card h-fit p-4">
              <h2 className="mb-3 text-sm font-semibold">Details</h2>
              <form action={updateTask} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={t.version} />
                <div>
                  <label className="label" htmlFor="title">Title</label>
                  <input id="title" name="title" defaultValue={t.title} required className="input w-full" />
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" defaultValue={t.status} className="input w-full">
                    {TASK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="start_date">Start</label>
                    <input id="start_date" name="start_date" type="date" defaultValue={t.start_date ?? ""} className="input w-full" />
                  </div>
                  <div>
                    <label className="label" htmlFor="due_date">Due</label>
                    <input id="due_date" name="due_date" type="date" defaultValue={t.due_date ?? ""} className="input w-full" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="assignee_id">Assignee</label>
                  <select id="assignee_id" name="assignee_id" defaultValue={t.assignee_id ?? ""} className="input w-full">
                    <option value="">Unassigned</option>
                    {people.filter((x) => x.active).map((x) => (
                      <option key={x.id} value={x.id}>{personOption(x)}</option>
                    ))}
                  </select>
                </div>
                {!t.is_milestone && milestones.length > 0 && (
                  <div>
                    <label className="label" htmlFor="milestone_id">Milestone</label>
                    <select id="milestone_id" name="milestone_id" defaultValue={t.milestone_id ?? ""} className="input w-full">
                      <option value="">Not in a milestone</option>
                      {milestones.map((g) => (
                        <option key={g.milestone.id} value={g.milestone.id}>
                          {g.milestone.title}
                          {g.milestone.due_date ? ` (${formatDate(g.milestone.due_date)})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="estimate_hours">Estimate (hours)</label>
                  <input id="estimate_hours" name="estimate_hours" type="number" step="0.25" min="0" defaultValue={t.estimate_hours ?? ""} className="input w-full" />
                </div>
                <div>
                  <label className="label" htmlFor="description">Description</label>
                  <textarea id="description" name="description" rows={5} defaultValue={t.description ?? ""} className="input w-full" />
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" name="is_milestone" defaultChecked={t.is_milestone} /> This task is a milestone
                </label>
                <SubmitButton>Save task</SubmitButton>
              </form>
              <form action={deleteTask} className="mt-4 border-t border-stone-100 pt-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="project_id" value={t.project.id} />
                <button className="btn-danger">Delete task</button>
              </form>
            </section>
          ) : (
            <>
              <InfoCard title="Details">
                <Field label="Project" wide>
                  <Link href={`/projects/${t.project.id}`} className="link">{t.project.name}</Link>
                </Field>
                <Field label="Client">{t.project.company?.name ?? "No client"}</Field>
                <Field label="Status"><TaskBadge status={t.status} /></Field>
                <Field label="Assignee">{t.assignee_id ? assigneeName : "Unassigned"}</Field>
                {inMilestone && (
                  <Field label="Milestone" wide>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/tasks/${inMilestone.milestone.id}`} className="link">
                        ◆ {inMilestone.milestone.title}
                      </Link>
                      {inMilestone.milestone.due_date && (
                        <span className="text-stone-500">{formatDate(inMilestone.milestone.due_date)}</span>
                      )}
                      <HealthBadge health={inMilestone.health} />
                    </span>
                  </Field>
                )}
              </InfoCard>

              <InfoCard title="Dates">
                <Field label="Start">{t.start_date ? formatDate(t.start_date) : <span className="text-stone-500">Not set</span>}</Field>
                <Field label="Due">{dueText}</Field>
                {t.completed_at && <Field label="Completed" wide>{formatTimestamp(t.completed_at)}</Field>}
              </InfoCard>
            </>
          )}

          <InfoCard title="Hours">
            <Field label="Planned">{estimate != null ? hrs(estimate) : <span className="text-stone-500">Not set</span>}</Field>
            <Field label="Logged">{hrs(logged)}</Field>
            <Field label="Yours">{hrs(mine)}</Field>
            <Field label={estimate != null && logged > estimate ? "Over by" : "Remaining"}>
              {estimate == null ? (
                <span className="text-stone-500">Not set</span>
              ) : logged > estimate ? (
                <span className="font-medium text-red-700">{hrs(logged - estimate)}</span>
              ) : (
                hrs(estimate - logged)
              )}
            </Field>
            {estimate != null && estimate > 0 && (
              <div className="col-span-2">
                <div
                  role="progressbar"
                  aria-label="Hours logged against plan"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, (logged / estimate) * 100))}
                  className="h-1.5 overflow-hidden rounded-full bg-stone-100"
                >
                  <div
                    className={`h-full rounded-full ${logged > estimate ? "bg-red-600" : "bg-blue-700"}`}
                    style={{ width: `${Math.min(100, (logged / estimate) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </InfoCard>

          <InfoCard title="History">
            <Field label="Created">{formatTimestamp(t.created_at)}</Field>
            <Field label="Created by">{t.created_by ? nameOf(people, t.created_by) : "Unknown"}</Field>
            <Field label="Last updated" wide>{formatTimestamp(t.updated_at)}</Field>
          </InfoCard>

          {!isAdmin && (
            <p className="text-xs text-stone-500">
              {isAssignee ? "You can update the status. " : ""}Need a change to dates, hours or the assignee? Ask an admin or post an update.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
