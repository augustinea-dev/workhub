import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, deleteComment, deleteTask, logTime, updateTask } from "../../actions";
import { LiveRefresh, SubmitButton, TaskStatusSelect } from "@/components/client";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { Empty, Flash, TaskBadge } from "@/components/ui";
import { formatDate, formatDay, formatTimestamp, todayISO } from "@/lib/dates";
import { getPeople, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, TASK_STATUSES, type Comment, type Task, type TimeEntry } from "@/lib/types";

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

  // Opening a task counts as reading its notifications.
  await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", me.id)
    .eq("task_id", id)
    .is("read_at", null);

  const [{ data: task }, { data: comments }, { data: time }, people] = await Promise.all([
    supabase.from("tasks").select("*, project:projects(id, name, company:companies(name))").eq("id", id).maybeSingle(),
    supabase.from("comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("time_entries").select("*").eq("task_id", id).order("work_date", { ascending: false }),
    getPeople(),
  ]);
  if (!task) notFound();

  const t = task as Task & { project: { id: string; name: string; company: { name: string } | null } };
  const thread = (comments ?? []) as Comment[];
  const entries = (time ?? []) as TimeEntry[];
  const logged = entries.reduce((s, e) => s + Number(e.hours), 0);
  const here = `/tasks/${id}`;
  const isAssignee = t.assignee_id === me.id;
  const timeRows: TimeRow[] = entries.map((e) => ({
    ...e,
    personName: nameOf(people, e.user_id),
    dayLabel: formatDay(e.work_date),
  }));

  return (
    <>
      <LiveRefresh
        subs={[
          { table: "tasks", filter: `id=eq.${id}` },
          { table: "comments", filter: `task_id=eq.${id}` },
          { table: "time_entries", filter: `task_id=eq.${id}` },
        ]}
      />
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/projects" className="hover:underline">Projects</Link>
        {" · "}
        {t.project.company?.name && <>{t.project.company.name} · </>}
        <Link href={`/projects/${t.project.id}`} className="hover:underline">{t.project.name}</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {t.is_milestone && <span title="Milestone">◆ </span>}
          {t.title}
        </h1>
        <TaskBadge status={t.status} />
      </div>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
              Updates <span className="font-normal text-stone-400">· {thread.length}</span>
            </h2>
            {thread.length === 0 ? (
              <Empty>No comments yet.</Empty>
            ) : (
              <ul>
                {thread.map((c) => (
                  <li key={c.id} className="border-b border-stone-100 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {nameOf(people, c.author_id)}
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
              <textarea name="body" required rows={3} placeholder="Write an update…" aria-label="Comment" className="input w-full" />
              <SubmitButton pendingText="Posting…">Post update</SubmitButton>
            </form>
          </section>

          <section className="card">
            <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
              Time <span className="font-normal text-stone-400">· {logged.toFixed(2)} h logged</span>
              {t.estimate_hours != null && (
                <span className="font-normal text-stone-400"> of {Number(t.estimate_hours).toFixed(2)} h estimated</span>
              )}
            </h2>
            {timeRows.length === 0 ? (
              <Empty>No time logged on this task yet.</Empty>
            ) : (
              <TimeEntryTable rows={timeRows} meId={me.id} isAdmin={isAdmin} redirectTo={here} second="person" />
            )}
            <form action={logTime} className="border-t border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Log time</p>
              <div className="grid gap-2 md:grid-cols-[9rem_6rem_9rem_1fr_auto]">
                <input type="hidden" name="task_id" value={id} />
                <input type="hidden" name="redirect_to" value={here} />
                <input name="work_date" type="date" defaultValue={todayISO()} aria-label="Date" className="input" />
                <input name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="Hours" aria-label="Hours" className="input" />
                <select name="hour_type" defaultValue="billable" aria-label="Hour type" className="input">
                  {HOUR_TYPES.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
                <input name="note" placeholder="Note (optional)" aria-label="Note" className="input" />
                <SubmitButton pendingText="Logging…">Log time</SubmitButton>
              </div>
            </form>
          </section>
        </div>

        <section className="card h-fit p-4">
          <h2 className="mb-3 text-sm font-semibold">Details</h2>
          {isAdmin ? (
            <form action={updateTask} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={t.version} />
              <div>
                <label className="label" htmlFor="title">Title</label>
                <input id="title" name="title" defaultValue={t.title} required className="input w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" defaultValue={t.status} className="input w-full">
                    {TASK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
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
              <div>
                <label className="label" htmlFor="estimate_hours">Estimate (hours)</label>
                <input id="estimate_hours" name="estimate_hours" type="number" step="0.25" min="0" defaultValue={t.estimate_hours ?? ""} className="input w-full" />
              </div>
              <div>
                <label className="label" htmlFor="description">Description</label>
                <textarea id="description" name="description" rows={5} defaultValue={t.description ?? ""} className="input w-full" />
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" name="is_milestone" defaultChecked={t.is_milestone} /> Milestone
              </label>
              <SubmitButton>Save task</SubmitButton>
              <p className="text-xs text-stone-400">Last updated {formatTimestamp(t.updated_at)}</p>
            </form>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="label">Status</dt>
                <dd>
                  {isAssignee ? (
                    <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo={here} />
                  ) : (
                    <TaskBadge status={t.status} />
                  )}
                </dd>
              </div>
              <div>
                <dt className="label">Assignee</dt>
                <dd>{nameOf(people, t.assignee_id)}</dd>
              </div>
              <div>
                <dt className="label">Due</dt>
                <dd>{formatDate(t.due_date)}</dd>
              </div>
              <div>
                <dt className="label">Estimate</dt>
                <dd>{t.estimate_hours != null ? `${Number(t.estimate_hours).toFixed(2)} h` : "—"}</dd>
              </div>
              <div>
                <dt className="label">Description</dt>
                <dd className="whitespace-pre-wrap text-stone-700">{t.description || "—"}</dd>
              </div>
              <p className="text-xs text-stone-400">
                {isAssignee ? "You can update the status. " : ""}Ask an admin to change other details.
              </p>
            </dl>
          )}
          {isAdmin && (
            <form action={deleteTask} className="mt-4 border-t border-stone-100 pt-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="project_id" value={t.project.id} />
              <button className="btn-danger">Delete task</button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
