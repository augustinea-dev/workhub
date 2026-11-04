import Link from "next/link";
import { createProject } from "../actions";
import { LiveRefresh, SubmitButton } from "@/components/client";
import { Empty, Flash, HealthBadge, PageHeader, ProjectBadge } from "@/components/ui";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";
import { nextMilestone } from "@/lib/milestones";
import { getCompanies, getPeople, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus, TaskStatus } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  status: ProjectStatus;
  due_date: string | null;
  owner_id: string | null;
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
  const show = sp(params.show) === "all" ? "all" : "open";
  const me = await requireProfile();
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("id, name, status, due_date, owner_id, company:companies(name), tasks(id, title, status, due_date, is_milestone, milestone_id)")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (show === "open") query = query.not("status", "in", "(complete,cancelled)");

  const [{ data }, people, companies, { data: templateData }] = await Promise.all([
    query,
    getPeople(),
    getCompanies(),
    me.role === "admin"
      ? supabase.from("project_templates").select("id, name").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const templates = templateData ?? [];
  const rows = (data ?? []) as unknown as Row[];
  const today = todayISO();

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks" }]} />
      <PageHeader title="Projects" subtitle={`${rows.length} ${show === "open" ? "open" : "total"}`}>
        <div className="flex gap-2 text-sm">
          <Link href="/projects" className={show === "open" ? "btn-primary" : "btn"}>Open</Link>
          <Link href="/projects?show=all" className={show === "all" ? "btn-primary" : "btn"}>All</Link>
        </div>
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

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="table-head">Project</th>
                <th className="table-head">Client</th>
                <th className="table-head">Owner</th>
                <th className="table-head">Status</th>
                <th className="table-head">Next milestone</th>
                <th className="table-head">Open tasks</th>
                <th className="table-head">Due</th>
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
