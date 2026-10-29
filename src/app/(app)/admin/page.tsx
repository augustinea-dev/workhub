import { updateMember } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { getPeople, nameOf, sp } from "@/lib/data";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: number;
  table_name: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  new_row: Record<string, unknown> | null;
  old_row: Record<string, unknown> | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireAdmin();
  const people = await getPeople();
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("audit_log")
    .select("id, table_name, action, changed_by, changed_at, new_row, old_row")
    .order("changed_at", { ascending: false })
    .limit(25);

  return (
    <>
      <PageHeader title="Admin" subtitle="People and recent changes" />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">People</h2>
        <ul>
          {people.map((p) => (
            <li key={p.id} className="border-b border-stone-100 px-4 py-3">
              <form action={updateMember} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="full_name" defaultValue={p.full_name} aria-label="Full name" className="input w-48" />
                <span className="w-56 truncate text-sm text-stone-500">{p.email}</span>
                <input name="job_role" defaultValue={p.job_role ?? ""} placeholder="Job role" aria-label="Job role" className="input w-40" />
                <select name="role" defaultValue={p.role} aria-label="Access" className="input">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="active" defaultChecked={p.active} disabled={p.id === me.id} />
                  Active
                  {p.id === me.id && <input type="hidden" name="active" value="on" />}
                </label>
                <SubmitButton className="btn">Save</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <p className="px-4 py-3 text-xs text-stone-500">
          To add someone: Supabase dashboard → Authentication → Users → <strong>Invite user</strong>. They appear here
          after they accept, as a Member.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Recent changes</h2>
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="table-head">When</th>
              <th className="table-head">Who</th>
              <th className="table-head">What</th>
            </tr>
          </thead>
          <tbody>
            {((audit ?? []) as AuditRow[]).map((a) => {
              const row = a.new_row ?? a.old_row ?? {};
              const label = String(row.title ?? row.name ?? row.full_name ?? row.hours ?? "");
              return (
                <tr key={a.id}>
                  <td className="table-cell text-stone-600">{formatTimestamp(a.changed_at)}</td>
                  <td className="table-cell">{a.changed_by ? nameOf(people, a.changed_by) : "System"}</td>
                  <td className="table-cell text-stone-600">
                    {a.action.toLowerCase()} {a.table_name.replace("_", " ").replace(/s$/, "")}
                    {label && <span className="text-stone-900"> “{label}”</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
