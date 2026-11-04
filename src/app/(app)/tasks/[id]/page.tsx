import Link from "next/link";
import { notFound } from "next/navigation";
import { createTask, deleteComment, deleteTask, logTime, setTaskStatus, updateTask } from "../../actions";
import { AssigneePicker } from "@/components/assignee-picker";
import { LiveRefresh, SubmitButton } from "@/components/client";
import { MentionComposer } from "@/components/mention-composer";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { Empty, Flash, HealthBadge, TaskBadge } from "@/components/ui";
import { assigneeLabel, pickerOptions, withAssignees } from "@/lib/assignees";
import { daysBetween, formatDate, formatDay, formatTimestamp, relativeDay, todayISO } from "@/lib/dates";
import { getPeople, nameOf, sp } from "@/lib/data";
import { groupByMilestone } from "@/lib/milestones";
import { canChangeStatus } from "@/lib/permissions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, TASK_STATUSES, type Comment, type Profile, type Task, type TaskStatus, type TimeEntry } from "@/lib/types";

type Subtask = { id: string; title: string; status: TaskStatus; assignee_ids: string[]; due_date: string | null };
type Raw<T> = Omit<T, "assignee_ids"> & { task_assignees: { profile_id: string }[] };
type Child = Subtask & { version: number; start_date: string | null; estimate_hours: number | null };
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
              {assigneeLabel(s.assignee_ids, people, meId)}
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

function withMentions(body: string, names: string[], myName: string): React.ReactNode {
  if (!names.length) return body;
  const pattern = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return body.split(new RegExp(`(@(?:${pattern.join("|")}))`, "g")).map((part, i) =>
    i % 2 ? (
      <span
        key={i}
        className={`rounded px-0.5 font-medium ${part === `@${myName}` ? "bg-blue-100 text-blue-900" : "text-blue-800"}`}
      >
        {part}
      </span>
    ) : (
      part
    ),
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
        "*, task_assignees(profile_id), project:projects(id, name, company:companies(name), tasks(id, title, status, due_date, is_milestone, milestone_id, task_assignees(profile_id))), parent:parent_task_id(id, title)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("time_entries").select("*").eq("task_id", id).order("work_date", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, start_date, estimate_hours, version, task_assignees(profile_id)")
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

  const raw = task as Raw<Task> & {
    project: { id: string; name: string; company: { name: string } | null; tasks: Raw<ProjectTask>[] };
    parent: { id: string; title: string } | null;
  };
  const t = { ...withAssignees(raw), project: { ...raw.project, tasks: raw.project.tasks.map(withAssignees) as ProjectTask[] } } as Task & {
    project: { id: string; name: string; company: { name: string } | null; tasks: ProjectTask[] };
    parent: { id: string; title: string } | null;
  };
  const parent = t.parent;
  const subtasks = ((children ?? []) as Raw<Child>[]).map(withAssignees) as Child[];
  const { data: childTime } = subtasks.length
    ? await supabase.from("time_entries").select("hours").in("task_id", subtasks.map((s) => s.id))
    : { data: [] as { hours: number }[] };
  const subtaskHours = (childTime ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const subtasksDone = subtasks.filter((s) => s.status === "done").length;
  const rolled = {
    start: subtasks.some((s) => s.start_date),
    due: subtasks.some((s) => s.due_date),
    estimate: subtasks.some((s) => s.estimate_hours != null),
  };
  const canHaveSubtasks = !t.parent_task_id && !t.is_milestone;
  const thread = (comments ?? []) as Comment[];
  const entries = (time ?? []) as TimeEntry[];
  const logged = entries.reduce((s, e) => s + Number(e.hours), 0);
  const loggedTotal = logged + subtaskHours;
  const mine = entries.filter((e) => e.user_id === me.id).reduce((s, e) => s + Number(e.hours), 0);
  const estimate = t.estimate_hours != null ? Number(t.estimate_hours) : null;
  const here = `/tasks/${id}`;
  const today = todayISO();
  const isAssignee = t.assignee_ids.includes(me.id);
  const isDone = t.status === "done";
  const dueIn = t.due_date ? daysBetween(today, t.due_date) : null;
  const overdue = !isDone && dueIn != null && dueIn < 0;
  const assigneeName = assigneeLabel(t.assignee_ids, people, me.id);
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
          { table: "task_assignees", filter: `task_id=eq.${id}` },
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
        {t.assignee_ids.length ? <>Assigned to <span className="font-medium text-stone-900">{assigneeName}</span></> : "Unassigned"}
        {" · "}
        {t.due_date ? <>Due {dueText}</> : dueText}
      </p>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      {!isAdmin && canChangeStatus(me, t) && (
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

      {!isAdmin && !canChangeStatus(me, t) && (
        <p className="mb-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          {t.assignee_ids.length
            ? `This task is assigned to ${assigneeName}. You can post updates and log time; ${t.assignee_ids.length > 1 ? "its assignees" : assigneeName} or an admin can change its status.`
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

          {subtasks.length > 0 && subtasksDone === subtasks.length && !isDone && canChangeStatus(me, t) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span>All subtasks are done. Mark this task done?</span>
              <form action={setTaskStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="version" value={t.version} />
                <input type="hidden" name="status" value="done" />
                <input type="hidden" name="redirect_to" value={here} />
                <SubmitButton pendingText="Saving…">Mark done</SubmitButton>
              </form>
            </div>
          )}

          {canHaveSubtasks && (subtasks.length > 0 || isAdmin) && (
            <section className="card overflow-hidden">
              <div className="border-b border-stone-200 px-4 py-3">
                <h2 className="text-sm font-semibold">
                  Subtasks{" "}
                  {subtasks.length > 0 && (
                    <span className="font-normal text-stone-400">· {subtasksDone} of {subtasks.length} done</span>
                  )}
                </h2>
                {subtasks.length > 0 && (
                  <div
                    role="progressbar"
                    aria-label="Subtasks done"
                    aria-valuemin={0}
                    aria-valuemax={subtasks.length}
                    aria-valuenow={subtasksDone}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"
                  >
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(subtasksDone / subtasks.length) * 100}%` }} />
                  </div>
                )}
              </div>
              {subtasks.length === 0 ? (
                <Empty>No subtasks yet. Break this task into steps below.</Empty>
              ) : (
                <ul>
                  {subtasks.map((s) => {
                    const done = s.status === "done";
                    const late = !done && !!s.due_date && s.due_date < today;
                    return (
                      <li key={s.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
                        {canChangeStatus(me, s) ? (
                          <form action={setTaskStatus}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="version" value={s.version} />
                            <input type="hidden" name="status" value={done ? "todo" : "done"} />
                            <input type="hidden" name="redirect_to" value={here} />
                            <button
                              aria-label={done ? `Mark ${s.title} not done` : `Mark ${s.title} done`}
                              aria-pressed={done}
                              className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                                done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white hover:border-stone-500"
                              }`}
                            >
                              {done && "✓"}
                            </button>
                          </form>
                        ) : (
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                              done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-200 bg-stone-50"
                            }`}
                          >
                            {done && "✓"}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/tasks/${s.id}`}
                            className={`block truncate text-sm font-medium hover:underline ${done ? "text-stone-400 line-through" : ""}`}
                          >
                            {s.title}
                          </Link>
                          <p className="text-xs text-stone-500">
                            {assigneeLabel(s.assignee_ids, people, me.id)}
                            {s.due_date && (
                              <span className={late ? "font-medium text-red-700" : undefined}> · Due {formatDate(s.due_date)}</span>
                            )}
                            {s.estimate_hours != null && ` · ${hrs(Number(s.estimate_hours))} planned`}
                          </p>
                        </div>
                        <TaskBadge status={s.status} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {isAdmin && (
                <form action={createTask} className="border-t border-stone-200 bg-stone-50 p-4">
                  <input type="hidden" name="project_id" value={t.project.id} />
                  <input type="hidden" name="parent_task_id" value={t.id} />
                  <input type="hidden" name="redirect_to" value={here} />
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Add a subtask</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <input name="title" required placeholder="Subtask title" aria-label="Subtask title" className="input min-w-48 flex-1" />
                    <div className="w-72">
                      <AssigneePicker {...pickerOptions(people)} defaultValue={t.assignee_ids} />
                    </div>
                    <input name="start_date" type="date" defaultValue={t.start_date ?? ""} aria-label="Start date" className="input w-40" />
                    <input name="due_date" type="date" defaultValue={t.due_date ?? ""} aria-label="Due date" className="input w-40" />
                    <input name="estimate_hours" type="number" step="0.25" min="0" placeholder="Hours" aria-label="Planned hours" className="input w-24" />
                    <SubmitButton pendingText="Adding…" className="btn-primary shrink-0">Add subtask</SubmitButton>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    Dates start as this task&apos;s. Once subtasks have dates or hours, this task&apos;s start, due and planned hours are calculated from them.
                  </p>
                </form>
              )}
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
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">
                      {withMentions(
                        c.body,
                        (c.mentions ?? []).map((m) => people.find((x) => x.id === m)?.full_name).filter((n): n is string => !!n),
                        me.full_name,
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <MentionComposer
              key={thread.length}
              taskId={id}
              people={people
                .filter((x) => x.active && x.id !== me.id)
                .map((x) => ({ id: x.id, name: x.full_name, email: x.email }))}
            />
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
                    <input id="start_date" name="start_date" type="date" defaultValue={t.start_date ?? ""} disabled={rolled.start} className="input w-full disabled:bg-stone-50 disabled:text-stone-500" />
                  </div>
                  <div>
                    <label className="label" htmlFor="due_date">Due</label>
                    <input id="due_date" name="due_date" type="date" defaultValue={t.due_date ?? ""} disabled={rolled.due} className="input w-full disabled:bg-stone-50 disabled:text-stone-500" />
                  </div>
                </div>
                <div>
                  <AssigneePicker key={t.version} {...pickerOptions(people, t.assignee_ids)} defaultValue={t.assignee_ids} />
                </div>
                {(rolled.start || rolled.due) && (
                  <p className="-mt-1 text-xs text-stone-500">Calculated from subtasks.</p>
                )}
                {!t.is_milestone && !t.parent_task_id && milestones.length > 0 && (
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
                  <input id="estimate_hours" name="estimate_hours" type="number" step="0.25" min="0" defaultValue={t.estimate_hours ?? ""} disabled={rolled.estimate} className="input w-full disabled:bg-stone-50 disabled:text-stone-500" />
                  {rolled.estimate && <p className="mt-1 text-xs text-stone-500">Total of the subtasks&apos; planned hours.</p>}
                </div>
                <div>
                  <label className="label" htmlFor="description">Description</label>
                  <textarea id="description" name="description" rows={5} defaultValue={t.description ?? ""} className="input w-full" />
                </div>
                {!t.parent_task_id && subtasks.length === 0 && (
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input type="checkbox" name="is_milestone" defaultChecked={t.is_milestone} /> This task is a milestone
                  </label>
                )}
                <SubmitButton>Save task</SubmitButton>
              </form>
              <form action={deleteTask} className="mt-4 border-t border-stone-100 pt-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="project_id" value={t.project.id} />
                <button className="btn-danger">
                  {subtasks.length ? `Delete task and its ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}` : "Delete task"}
                </button>
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
                <Field label={t.assignee_ids.length > 1 ? "Assignees" : "Assignee"}>{assigneeName}</Field>
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
            <Field label="Logged">{hrs(loggedTotal)}</Field>
            {subtasks.length > 0 && <Field label="On subtasks">{hrs(subtaskHours)}</Field>}
            <Field label="Yours">{hrs(mine)}</Field>
            <Field label={estimate != null && loggedTotal > estimate ? "Over by" : "Remaining"}>
              {estimate == null ? (
                <span className="text-stone-500">Not set</span>
              ) : loggedTotal > estimate ? (
                <span className="font-medium text-red-700">{hrs(loggedTotal - estimate)}</span>
              ) : (
                hrs(estimate - loggedTotal)
              )}
            </Field>
            {estimate != null && estimate > 0 && (
              <div className="col-span-2">
                <div
                  role="progressbar"
                  aria-label="Hours loggedTotal against plan"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, (loggedTotal / estimate) * 100))}
                  className="h-1.5 overflow-hidden rounded-full bg-stone-100"
                >
                  <div
                    className={`h-full rounded-full ${loggedTotal > estimate ? "bg-red-600" : "bg-blue-700"}`}
                    style={{ width: `${Math.min(100, (loggedTotal / estimate) * 100)}%` }}
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
              {isAssignee ? "You can update the status. " : ""}Need a change to dates, hours or assignees? Ask an admin or post an update.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
