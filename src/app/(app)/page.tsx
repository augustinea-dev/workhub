import Link from "next/link";
import { FilterForm, LiveRefresh, TaskStatusSelect } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { addDays, formatDate, todayISO, weekStart } from "@/lib/dates";
import { sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  version: number;
  is_milestone: boolean;
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

  const [{ data: tasks }, { data: hours }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, version, is_milestone, project:projects(id, name, company:companies(id, name))")
      .eq("assignee_id", me.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("time_entries")
      .select("hours")
      .eq("user_id", me.id)
      .gte("work_date", monday)
      .lte("work_date", addDays(monday, 6)),
  ]);

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
      <LiveRefresh subs={[{ table: "tasks", filter: `assignee_id=eq.${me.id}` }]} />
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
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr>
                        <th className="table-head">Task</th>
                        <th className="table-head w-28">Due</th>
                        <th className="table-head w-36">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((t) => (
                        <tr key={t.id} className="hover:bg-stone-50">
                          <td className="table-cell">
                            <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                              {t.is_milestone && <span title="Milestone">◆ </span>}
                              {t.title}
                            </Link>
                            <p className="truncate text-xs text-stone-500">
                              {t.project?.company?.name ? `${t.project.company.name} · ` : ""}
                              {t.project?.name}
                            </p>
                          </td>
                          <td className={`table-cell whitespace-nowrap ${g.label === "Overdue" ? "font-medium text-red-700" : "text-stone-600"}`}>
                            {formatDate(t.due_date)}
                          </td>
                          <td className="table-cell">
                            <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo="/" />
                          </td>
                        </tr>
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
