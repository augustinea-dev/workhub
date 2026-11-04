import Link from "next/link";
import { createCompany, deleteCompany, updateCompany } from "../actions";
import { SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { sp } from "@/lib/data";
import { MONTHS } from "@/lib/naming";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  name: string;
  project_label: string | null;
  fiscal_year_start_month: number | null;
  projects: { id: string; status: string }[];
};

function YearSelect({ id, value }: { id: string; value: number | null }) {
  return (
    <select id={id} name="fiscal_year_start_month" defaultValue={value ?? ""} aria-label="Billing year" className="input py-1.5">
      <option value="">Calendar year (2026)</option>
      {MONTHS.slice(1).map((m, i) => (
        <option key={m} value={i + 2}>Fiscal year from {m} (FY##)</option>
      ))}
    </select>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, project_label, fiscal_year_start_month, projects(id, status)").order("name");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} clients`} />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {isAdmin && (
      <form action={createCompany} className="card mb-6 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="new_client_name">Client (legal billing name)</label>
          <input id="new_client_name" name="name" required placeholder="Maloney Group" className="input w-full" />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="new_client_label">Name on projects</label>
          <input id="new_client_label" name="project_label" placeholder="Same as client, or a brand" className="input w-full" />
        </div>
        <div>
          <label className="label" htmlFor="new_client_year">Billing year</label>
          <YearSelect id="new_client_year" value={null} />
        </div>
        <SubmitButton pendingText="Adding…">Add client</SubmitButton>
      </form>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No clients yet.</Empty>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Client</th>
                <th className="table-head">Active projects</th>
                <th className="table-head">All projects</th>
                {isAdmin && <th className="table-head"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="table-cell">
                    {isAdmin ? (
                      <form action={updateCompany} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="name" required defaultValue={c.name} aria-label={`Name for ${c.name}`} className="input min-w-48 py-1.5" />
                        <input
                          name="project_label"
                          defaultValue={c.project_label ?? ""}
                          placeholder="Name on projects"
                          aria-label={`Name on projects for ${c.name}`}
                          className="input min-w-40 py-1.5"
                        />
                        <YearSelect id={`year_${c.id}`} value={c.fiscal_year_start_month} />
                        <SubmitButton className="btn py-1.5" pendingText="Saving…">Save</SubmitButton>
                        <Link href={`/projects?client=${c.id}&status=all`} className="text-xs font-medium text-stone-500 hover:underline">
                          View projects
                        </Link>
                      </form>
                    ) : (
                      <>
                        <Link href={`/projects?client=${c.id}&status=all`} className="font-medium hover:underline">{c.name}</Link>
                        {c.project_label && <span className="ml-2 text-xs text-stone-500">Projects named “{c.project_label}”</span>}
                      </>
                    )}
                  </td>
                  <td className="table-cell text-stone-600">
                    {c.projects.filter((p) => !["complete", "cancelled"].includes(p.status)).length}
                  </td>
                  <td className="table-cell text-stone-600">{c.projects.length}</td>
                  {isAdmin && (
                    <td className="table-cell text-right">
                      {c.projects.length === 0 ? (
                        <form action={deleteCompany}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn-danger" aria-label={`Delete ${c.name}`}>Delete</button>
                        </form>
                      ) : (
                        <span className="text-xs text-stone-400" title="Move or delete its projects first">Has projects</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-4 text-sm text-stone-500">
        Projects are linked to a client when you create them on the <Link href="/projects" className="link">Projects</Link> page.
      </p>
    </>
  );
}
