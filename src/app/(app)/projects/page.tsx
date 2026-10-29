import Link from "next/link";
import { createProject } from "../actions";
import { LiveRefresh, SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader, ProjectBadge } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/dates";
import { getCompanies, getPeople, nameOf, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  status: ProjectStatus;
  due_date: string | null;
  owner_id: string | null;
  company: { name: string } | null;
  tasks: { status: string }[];
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
    .select("id, name, status, due_date, owner_id, company:companies(name), tasks(status)")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (show === "open") query = query.not("status", "in", "(complete,cancelled)");

  const [{ data }, people, companies] = await Promise.all([query, getPeople(), getCompanies()]);
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

      <details className="card mb-6 p-4" open={rows.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ New project</summary>
        <form action={createProject} className="mt-4 grid gap-3 md:grid-cols-5">
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
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="due_date">Due</label>
            <input id="due_date" name="due_date" type="date" className="input w-full" />
          </div>
          <div className="md:col-span-5">
            <SubmitButton pendingText="Creating…">Create project</SubmitButton>
            {companies.length === 0 && (
              <span className="ml-3 text-xs text-stone-500">
                Tip: <Link href="/clients" className="link">add clients</Link> first to group projects.
              </span>
            )}
          </div>
        </form>
      </details>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-head">Project</th>
                <th className="table-head">Client</th>
                <th className="table-head">Owner</th>
                <th className="table-head">Status</th>
                <th className="table-head">Open tasks</th>
                <th className="table-head">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const open = p.tasks.filter((t) => t.status !== "done").length;
                const late = p.due_date && p.due_date < today && p.status !== "complete";
                return (
                  <tr key={p.id} className="hover:bg-stone-50">
                    <td className="table-cell">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </td>
                    <td className="table-cell text-stone-600">{p.company?.name ?? "—"}</td>
                    <td className="table-cell text-stone-600">{nameOf(people, p.owner_id)}</td>
                    <td className="table-cell"><ProjectBadge status={p.status} /></td>
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
