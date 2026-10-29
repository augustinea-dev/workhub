import Link from "next/link";
import { notFound } from "next/navigation";
import { createTask, deleteProject, updateProject } from "../../actions";
import { LiveRefresh, SubmitButton, TaskStatusSelect } from "@/components/client";
import { Empty, Flash, PageHeader, ProjectBadge, TaskBadge } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/dates";
import { getCompanies, getPeople, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUSES, type Project, type Task } from "@/lib/types";

export default async function ProjectPage({
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

  const [{ data: project }, { data: tasks }, { data: time }, people, companies] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("tasks").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("time_entries").select("hours, hour_type").eq("project_id", id),
    getPeople(),
    getCompanies(),
  ]);
  if (!project) notFound();

  const p = project as Project;
  const list = (tasks ?? []) as Task[];
  const open = list.filter((t) => t.status !== "done");
  const finished = list.filter((t) => t.status === "done");
  const totalHours = (time ?? []).reduce((s, t) => s + Number(t.hours), 0);
  const billable = (time ?? []).filter((t) => t.hour_type === "billable").reduce((s, t) => s + Number(t.hours), 0);
  const company = companies.find((c) => c.id === p.company_id);
  const today = todayISO();
  const here = `/projects/${id}`;
  const activePeople = people.filter((x) => x.active);

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks", filter: `project_id=eq.${id}` }]} />
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/projects" className="hover:underline">Projects</Link>
        {company && <> · {company.name}</>}
      </p>
      <PageHeader
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <ProjectBadge status={p.status} />
            <span>Owner: {nameOf(people, p.owner_id)}</span>
            <span>Due {formatDate(p.due_date)}</span>
            <span>{totalHours.toFixed(1)} h logged ({billable.toFixed(1)} billable)</span>
          </span>
        }
      />
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
            Tasks <span className="font-normal text-stone-400">· {open.length} open</span>
          </h2>
          {list.length === 0 ? (
            <Empty>No tasks yet.{isAdmin && " Add the first one below."}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className="table-head">Task</th>
                    <th className="table-head">Assignee</th>
                    <th className="table-head">Due</th>
                    <th className="table-head">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...open, ...finished].map((t) => {
                    const late = t.due_date && t.due_date < today && t.status !== "done";
                    const canChange = isAdmin || t.assignee_id === me.id;
                    return (
                      <tr key={t.id} className="hover:bg-stone-50">
                        <td className="table-cell">
                          <Link
                            href={`/tasks/${t.id}`}
                            className={`font-medium hover:underline ${t.status === "done" ? "text-stone-400 line-through" : ""}`}
                          >
                            {t.is_milestone && <span title="Milestone">◆ </span>}
                            {t.title}
                          </Link>
                        </td>
                        <td className={`table-cell ${t.assignee_id === me.id ? "font-medium" : "text-stone-600"}`}>
                          {t.assignee_id === me.id ? "You" : nameOf(people, t.assignee_id)}
                        </td>
                        <td className={`table-cell whitespace-nowrap ${late ? "font-medium text-red-700" : "text-stone-600"}`}>
                          {formatDate(t.due_date)}
                        </td>
                        <td className="table-cell">
                          {canChange ? (
                            <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo={here} />
                          ) : (
                            <TaskBadge status={t.status} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && (
            <form action={createTask} className="border-t border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Add a task</p>
              <div className="grid gap-2 md:grid-cols-6">
                <input type="hidden" name="project_id" value={id} />
                <input name="title" required placeholder="Task title" aria-label="Task title" className="input md:col-span-2" />
                <select name="assignee_id" aria-label="Assignee" className="input md:col-span-2" defaultValue="">
                  <option value="">Assign to… (unassigned)</option>
                  {activePeople.map((x) => (
                    <option key={x.id} value={x.id}>{personOption(x)}</option>
                  ))}
                </select>
                <input name="due_date" type="date" aria-label="Due date" className="input" />
                <SubmitButton pendingText="Adding…">Add task</SubmitButton>
                <label className="flex items-center gap-2 text-xs text-stone-600 md:col-span-6">
                  <input type="checkbox" name="is_milestone" /> Milestone
                </label>
              </div>
            </form>
          )}
        </section>

        <section className="card h-fit p-4">
          <h2 className="mb-3 text-sm font-semibold">Project details</h2>
          {isAdmin ? (
            <>
              <form action={updateProject} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={p.version} />
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" name="name" defaultValue={p.name} required className="input w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="status">Status</label>
                    <select id="status" name="status" defaultValue={p.status} className="input w-full">
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="owner_id">Owner</label>
                    <select id="owner_id" name="owner_id" defaultValue={p.owner_id ?? ""} className="input w-full">
                      <option value="">—</option>
                      {activePeople.map((x) => (
                        <option key={x.id} value={x.id}>{personOption(x)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="company_id">Client</label>
                  <select id="company_id" name="company_id" defaultValue={p.company_id ?? ""} className="input w-full">
                    <option value="">— None —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="start_date">Start</label>
                    <input id="start_date" name="start_date" type="date" defaultValue={p.start_date ?? ""} className="input w-full" />
                  </div>
                  <div>
                    <label className="label" htmlFor="due_date">Due</label>
                    <input id="due_date" name="due_date" type="date" defaultValue={p.due_date ?? ""} className="input w-full" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="description">Description</label>
                  <textarea id="description" name="description" rows={4} defaultValue={p.description ?? ""} className="input w-full" />
                </div>
                <SubmitButton>Save project</SubmitButton>
              </form>
              <form action={deleteProject} className="mt-4 border-t border-stone-100 pt-3">
                <input type="hidden" name="id" value={id} />
                <button className="btn-danger">Delete project and its tasks</button>
              </form>
            </>
          ) : (
            <dl className="space-y-3 text-sm">
              <div><dt className="label">Status</dt><dd><ProjectBadge status={p.status} /></dd></div>
              <div><dt className="label">Owner</dt><dd>{nameOf(people, p.owner_id)}</dd></div>
              <div><dt className="label">Client</dt><dd>{company?.name ?? "—"}</dd></div>
              <div className="grid grid-cols-2 gap-3">
                <div><dt className="label">Start</dt><dd>{formatDate(p.start_date)}</dd></div>
                <div><dt className="label">Due</dt><dd>{formatDate(p.due_date)}</dd></div>
              </div>
              <div><dt className="label">Description</dt><dd className="whitespace-pre-wrap text-stone-700">{p.description || "—"}</dd></div>
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
