import Link from "next/link";
import { createProject } from "../actions";
import { FilterForm, LiveRefresh, SubmitButton } from "@/components/client";
import { Empty, Flash, HealthBadge, PageHeader, ProjectBadge } from "@/components/ui";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";
import {
  filterAndSortProjects,
  hasProjectFilters,
  parseProjectFilters,
  projectFiltersQS,
  type ProjectSort,
} from "@/lib/list-filters";
import { nextMilestone } from "@/lib/milestones";
import { getCompanies, getPeople, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUSES, type ProjectStatus, type TaskStatus } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  status: ProjectStatus;
  due_date: string | null;
  owner_id: string | null;
  company_id: string | null;
  company: { name: string } | null;
  tasks: {
    id: string;
    title: string;
    status: TaskStatus;
    due_date: string | null;
    is_milestone: boolean;
    milestone_id: string | null;
  }[];
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const f = parseProjectFilters(params);
  const me = await requireProfile();
  const supabase = await createClient();

  const query = supabase
    .from("projects")
    .select("id, name, status, due_date, owner_id, company_id, company:companies(name), tasks(id, title, status, due_date, is_milestone, milestone_id)");

  const [{ data }, people, companies, { data: templateData }] = await Promise.all([
    query,
    getPeople(),
    getCompanies(),
    me.role === "admin"
      ? supabase.from("project_templates").select("id, name").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const templates = templateData ?? [];
  const today = todayISO();
  const all = (data ?? []) as unknown as Row[];
  const rows = filterAndSortProjects(all, f, today);
  const filtered = hasProjectFilters(f);
  const owners = people.filter((p) => all.some((r) => r.owner_id === p.id));
  const sortHead = (key: ProjectSort, label: string) => {
    const active = f.sort === key;
    const dir = active && f.dir === "asc" ? "desc" : "asc";
    return (
      <th className="table-head" aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={`/projects${projectFiltersQS(f, { sort: key, dir })}`} className="inline-flex items-center gap-1 hover:text-stone-900">
          {label}
          {active && <span aria-hidden="true">{f.dir === "asc" ? "▲" : "▼"}</span>}
        </Link>
      </th>
    );
  };

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks" }]} />
      <PageHeader title="Projects" subtitle={`${rows.length} ${filtered ? "matching" : "open"}`}>
        <a href={`/export/projects${projectFiltersQS(f)}`} className="btn">Export CSV</a>
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {me.role === "admin" && (
      <details className="card mb-6 p-4" open={rows.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ New project</summary>
        <form action={createProject} className="mt-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required className="input w-full" placeholder="Homepage refresh" />
          </div>
          <div>
            <label className="label" htmlFor="company_id">Client</label>
            <select id="company_id" name="company_id" className="input w-full" defaultValue="">
              <option value="">— None —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="owner_id">Owner</label>
            <select id="owner_id" name="owner_id" className="input w-full" defaultValue={me.id}>
              {people.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>{personOption(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="start_date">Start</label>
            <input id="start_date" name="start_date" type="date" className="input w-full" />
          </div>
          <div>
            <label className="label" htmlFor="due_date">Due</label>
            <input id="due_date" name="due_date" type="date" className="input w-full" />
          </div>
          {templates.length > 0 && (
            <div className="md:col-span-3">
              <label className="label" htmlFor="template_id">Start from template</label>
              <select id="template_id" name="template_id" className="input w-full" defaultValue="">
                <option value="">Blank project</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-500">
                Needs a start date. Leave Due empty to use the template&apos;s length.
              </p>
            </div>
          )}
          <div className="md:col-span-6">
            <SubmitButton pendingText="Creating…">Create project</SubmitButton>
            {companies.length === 0 && (
              <span className="ml-3 text-xs text-stone-500">
                Tip: <Link href="/clients" className="link">add clients</Link> first to group projects.
              </span>
            )}
          </div>
        </form>
      </details>
      )}

      <FilterForm key={projectFiltersQS(f)} className="mb-4 flex flex-wrap items-end gap-2">
        {f.sort !== "due" && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir !== "asc" && <input type="hidden" name="dir" value={f.dir} />}
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Project or client, press Enter" className="input w-full" />
        </div>
        <div>
          <label className="label" htmlFor="f_status">Status</label>
          <select id="f_status" name="status" defaultValue={f.status === "open" ? "" : f.status} className="input">
            <option value="">Open</option>
            <option value="all">All</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label} only</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f_client">Client</label>
          <select id="f_client" name="client" defaultValue={f.client} className="input">
            <option value="">Any client</option>
            <option value="none">No client</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f_owner">Owner</label>
          <select id="f_owner" name="owner" defaultValue={f.owner} className="input">
            <option value="">Anyone</option>
            <option value="none">No owner</option>
            {owners.map((p) => (
              <option key={p.id} value={p.id}>{p.id === me.id ? "You" : p.full_name}</option>
            ))}
          </select>
        </div>
        {filtered && (
          <Link href={`/projects${projectFiltersQS(f, { status: "open", client: "", owner: "", q: "" })}`} className="btn">
            Clear filters
          </Link>
        )}
      </FilterForm>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>
            {filtered ? (
              <>
                No projects match these filters.{" "}
                <Link href="/projects" className="link">Clear filters</Link>
              </>
            ) : (
              "No projects yet."
            )}
          </Empty>
        ) : (
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                {sortHead("name", "Project")}
                {sortHead("client", "Client")}
                <th className="table-head">Owner</th>
                <th className="table-head">Status</th>
                {sortHead("milestone", "Next milestone")}
                <th className="table-head">Open tasks</th>
                {sortHead("due", "Due")}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const open = p.tasks.filter((t) => t.status !== "done").length;
                const late = p.due_date && p.due_date < today && p.status !== "complete";
                const next = nextMilestone(p.tasks, today);
                return (
                  <tr key={p.id} className="hover:bg-stone-50">
                    <td className="table-cell">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </td>
                    <td className="table-cell text-stone-600">{p.company?.name ?? "—"}</td>
                    <td className="table-cell text-stone-600">{nameOf(people, p.owner_id)}</td>
                    <td className="table-cell"><ProjectBadge status={p.status} /></td>
                    <td className="table-cell">
                      {next ? (
                        <div className="min-w-0">
                          <Link href={`/tasks/${next.milestone.id}`} className="block max-w-56 truncate font-medium hover:underline">
                            ◆ {next.milestone.title}
                          </Link>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            {next.milestone.due_date
                              ? `${formatDate(next.milestone.due_date)} (${relativeDay(next.milestone.due_date, today)})`
                              : "No date"}
                            <HealthBadge health={next.health} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-stone-400">None</span>
                      )}
                    </td>
                    <td className="table-cell text-stone-600">
                      {open} <span className="text-stone-400">/ {p.tasks.length}</span>
                    </td>
                    <td className={`table-cell ${late ? "font-medium text-red-700" : "text-stone-600"}`}>
                      {formatDate(p.due_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
