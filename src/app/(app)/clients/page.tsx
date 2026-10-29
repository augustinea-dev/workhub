import Link from "next/link";
import { createCompany } from "../actions";
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
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, projects(id, status)").order("name");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} clients`} />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {me.role === "admin" && (
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
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="table-cell font-medium">{c.name}</td>
                  <td className="table-cell text-stone-600">
                    {c.projects.filter((p) => !["complete", "cancelled"].includes(p.status)).length}
                  </td>
                  <td className="table-cell text-stone-600">{c.projects.length}</td>
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
