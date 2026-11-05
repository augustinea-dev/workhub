import Link from "next/link";
import { takeRoleTask } from "./actions";
import { FilterForm, LiveRefresh, SubmitButton, TaskStatusSelect } from "@/components/client";
import { QuickLogRow } from "@/components/quick-log-row";
import { Empty, Flash, PageHeader, ProjectDot } from "@/components/ui";
import { addDays, formatDate, todayISO, weekStart } from "@/lib/dates";
import { getJobRoles, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";

type OpenSlot = {
  id: string;
  role_id: string;
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    due_date: string | null;
    project: { id: string; name: string; company: { name: string } | null } | null;
    task_assignees: { profile_id: string }[];
  } | null;
};

type Row = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  version: number;
  is_milestone: boolean;
  parent: { id: string; title: string } | null;
  project: { id: string; name: string; company: { id: string; name: string } | null } | null;
};

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const today = todayISO();
  const monday = weekStart(today);

  const [{ data: tasks }, { data: hours }, { data: myRoles }, jobRoles] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, status, due_date, version, is_milestone, project:projects(id, name, company:companies(id, name)), parent:parent_task_id(id, title), task_assignees!inner(profile_id)",
      )
      .eq("task_assignees.profile_id", me.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("time_entries")
      .select("hours")
      .eq("user_id", me.id)
      .gte("work_date", monday)
      .lte("work_date", addDays(monday, 6)),
    supabase.from("profile_job_roles").select("role_id").eq("profile_id", me.id),
    getJobRoles(),
  ]);
  const myRoleIds = (myRoles ?? []).map((r) => r.role_id as string);
  const { data: slotData } = myRoleIds.length
    ? await supabase
        .from("task_role_slots")
        .select("id, role_id, task:tasks(id, title, status, due_date, project:projects(id, name, company:companies(name)), task_assignees(profile_id))")
        .in("role_id", myRoleIds)
    : { data: [] };
  const openWork = ((slotData ?? []) as unknown as OpenSlot[])
    .filter((s) => s.task && s.task.status !== "done" && !s.task.task_assignees.some((a) => a.profile_id === me.id))
    .sort((a, b) => (a.task!.due_date ?? "9999").localeCompare(b.task!.due_date ?? "9999"));

  const mine = (tasks ?? []) as unknown as Row[];
  const projectFilter = sp(params.project) ?? "";
  const clientFilter = sp(params.client) ?? "";
  const rows = mine.filter(
    (t) => (!projectFilter || t.project?.id === projectFilter) && (!clientFilter || t.project?.company?.id === clientFilter),
  );
  const filtered = !!projectFilter || !!clientFilter;
  const projectOptions = [...new Map(mine.filter((t) => t.project).map((t) => [t.project!.id, t.project!.name])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const clientOptions = [
    ...new Map(mine.filter((t) => t.project?.company).map((t) => [t.project!.company!.id, t.project!.company!.name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const weekHours = (hours ?? []).reduce((s, h) => s + Number(h.hours), 0);
  const endOfWeek = addDays(monday, 6);

  const groups = [
    { label: "Overdue", items: rows.filter((t) => t.due_date && t.due_date < today), tone: "text-red-700" },
    { label: "Due this week", items: rows.filter((t) => t.due_date && t.due_date >= today && t.due_date <= endOfWeek), tone: "text-stone-900" },
    { label: "Later", items: rows.filter((t) => t.due_date && t.due_date > endOfWeek), tone: "text-stone-900" },
    { label: "No due date", items: rows.filter((t) => !t.due_date), tone: "text-stone-500" },
  ];

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks" }, { table: "task_assignees", filter: `profile_id=eq.${me.id}` }, { table: "task_role_slots" }]} />
      <PageHeader title={`Hi, ${me.full_name.split(" ")[0]}`} subtitle={filtered ? `${rows.length} of ${mine.length} open tasks assigned to you` : `${mine.length} open tasks assigned to you`}>
        <Link href="/time" className="card px-4 py-3 text-right hover:bg-stone-50">
          <span className="block text-xs uppercase tracking-wide text-stone-500">Logged this week</span>
          <span className="text-xl font-semibold">{weekHours.toFixed(1)} h</span>
        </Link>
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {projectOptions.length > 1 && (
        <FilterForm key={`${projectFilter}-${clientFilter}`} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="f_project">Project</label>
            <select id="f_project" name="project" defaultValue={projectFilter} className="input">
              <option value="">All projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          {clientOptions.length > 1 && (
            <div>
              <label className="label" htmlFor="f_client">Client</label>
              <select id="f_client" name="client" defaultValue={clientFilter} className="input">
                <option value="">All clients</option>
                {clientOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}
          {filtered && <Link href="/" className="btn">Clear filters</Link>}
        </FilterForm>
      )}

      {openWork.length > 0 && (
        <section className="card mb-6 overflow-hidden border-amber-200">
          <h2 className="border-b border-stone-200 bg-amber-50/60 px-4 py-3 text-sm font-semibold">
            Open work for your roles <span className="font-normal text-stone-500">· {openWork.length}</span>
          </h2>
          <ul>
            {openWork.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {jobRoles.find((r) => r.id === s.role_id)?.name ?? "Role"}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${s.task!.id}`} className="font-medium hover:underline">{s.task!.title}</Link>
                  <p className="truncate text-xs text-stone-500">
                    {s.task!.project?.company?.name ? `${s.task!.project.company.name} · ` : ""}
                    {s.task!.project?.name}
                    {s.task!.due_date && ` · Due ${formatDate(s.task!.due_date)}`}
                  </p>
                </div>
                <form action={takeRoleTask}>
                  <input type="hidden" name="slot_id" value={s.id} />
                  <input type="hidden" name="redirect_to" value="/" />
                  <SubmitButton className="btn" pendingText="Taking…">Take it</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <Empty>
            {filtered ? (
              <>
                None of your open tasks match these filters. <Link href="/" className="link">Clear filters</Link>
              </>
            ) : (
              <>
                Nothing assigned to you. <Link href="/projects" className="link">Browse projects</Link>
              </>
            )}
          </Empty>
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.label} className="card overflow-hidden">
                <h2 className={`border-b border-stone-200 px-4 py-3 text-sm font-semibold ${g.tone}`}>
                  {g.label} <span className="font-normal text-stone-400">· {g.items.length}</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead>
                      <tr>
                        <th className="table-head">Task</th>
                        <th className="table-head w-28">Due</th>
                        <th className="table-head w-36">Status</th>
                        <th className="table-head w-28"><span className="sr-only">Log time</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((t) => (
                        <QuickLogRow key={t.id} taskId={t.id} title={t.title} today={today} columns={3}>
                          <td className="table-cell">
                            <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                              {t.is_milestone && <span title="Milestone">◆ </span>}
                              {t.title}
                            </Link>
                            <p className="flex items-center gap-1.5 truncate text-xs text-stone-500">
                              {t.project && <ProjectDot id={t.project.id} />}
                              {t.project?.company?.name ? `${t.project.company.name} · ` : ""}
                              {t.project?.name}
                              {t.parent && ` › ${t.parent.title}`}
                            </p>
                          </td>
                          <td className={`table-cell whitespace-nowrap ${g.label === "Overdue" ? "font-medium text-red-700" : "text-stone-600"}`}>
                            {formatDate(t.due_date)}
                          </td>
                          <td className="table-cell">
                            <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo="/" />
                          </td>
                        </QuickLogRow>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
