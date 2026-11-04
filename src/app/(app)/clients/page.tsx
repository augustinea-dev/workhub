import Link from "next/link";
import { createCompany, deleteCompany, updateCompany } from "../actions";
import { SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Row = { id: string; name: string; projects: { id: string; status: string }[] };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, projects(id, status)").order("name");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} clients`} />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {isAdmin && (
      <form action={createCompany} className="card mb-6 flex flex-wrap gap-2 p-4">
        <input name="name" required placeholder="Client name" aria-label="Client name" className="input min-w-64 flex-1" />
        <SubmitButton pendingText="Adding…">Add client</SubmitButton>
      </form>
      )}

      <div className="card overflow-hidden">
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
                        <SubmitButton className="btn py-1.5" pendingText="Saving…">Rename</SubmitButton>
                        <Link href={`/projects?client=${c.id}&status=all`} className="text-xs font-medium text-stone-500 hover:underline">
                          View projects
                        </Link>
                      </form>
                    ) : (
                      <Link href={`/projects?client=${c.id}&status=all`} className="font-medium hover:underline">{c.name}</Link>
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
