import { saveProjectType, updateMember, updateNextReference } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { getNextReference, getPeople, getProjectTypes, nameOf, sp } from "@/lib/data";
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
  const [people, projectTypes, nextReference] = await Promise.all([getPeople(), getProjectTypes(), getNextReference()]);
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
                <label className="flex items-center gap-1 text-sm text-stone-600">
                  <input
                    name="weekly_hours"
                    type="number"
                    min="0"
                    max="80"
                    step="0.5"
                    defaultValue={Number(p.weekly_hours)}
                    aria-label="Hours per week"
                    className="input w-20"
                  />
                  h/week
                </label>
                <select name="role" defaultValue={p.role} aria-label="Access" className="input">
                  <option value="member">User</option>
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
          Hours per week is the minimum someone must log before they can submit a timesheet (40 by default; lower it for
          part-time staff). To add someone: Supabase dashboard → Authentication → Users → <strong>Invite user</strong>. They appear here
          after they accept, as a User.
        </p>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Project names</h2>
        <form action={updateNextReference} className="flex flex-wrap items-end gap-2 border-b border-stone-100 px-4 py-4">
          <div>
            <label className="label" htmlFor="next_reference_number">Next reference number</label>
            <input
              id="next_reference_number"
              name="next_reference_number"
              inputMode="numeric"
              defaultValue={nextReference ?? ""}
              className="input w-40"
            />
          </div>
          <SubmitButton className="btn">Save</SubmitButton>
          <p className="w-full text-xs text-stone-500">
            The number the next new project gets. It must stay above every number already in use; projects imported from
            Workfront keep their own numbers.
          </p>
        </form>
        <div className="px-4 py-3">
          <p className="label">Project types</p>
          <p className="mb-3 text-xs text-stone-500">
            The code goes at the end of project names (for example TA or HC). Codes can&apos;t be changed once added; untick
            Active to retire one.
          </p>
          <div className="space-y-2">
            {projectTypes.map((t) => (
              <form key={t.code} action={saveProjectType} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="existing" value={t.code} />
                <span className="w-20 font-mono text-sm font-medium">{t.code}</span>
                <input name="label" defaultValue={t.label} aria-label={`Label for ${t.code}`} className="input w-40 py-1.5" />
                <input
                  name="description"
                  defaultValue={t.description ?? ""}
                  placeholder="What it's for"
                  aria-label={`Description for ${t.code}`}
                  className="input min-w-56 flex-1 py-1.5"
                />
                <input name="sort_order" type="number" defaultValue={t.sort_order} aria-label={`Order for ${t.code}`} className="input w-20 py-1.5" />
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="active" value="on" defaultChecked={t.active} /> Active
                </label>
                <SubmitButton className="btn py-1.5">Save</SubmitButton>
              </form>
            ))}
            <form action={saveProjectType} className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
              <input type="hidden" name="active" value="on" />
              <input name="code" required placeholder="Code" aria-label="New type code" className="input w-20 py-1.5 font-mono" />
              <input name="label" placeholder="Label" aria-label="New type label" className="input w-40 py-1.5" />
              <input name="description" placeholder="What it's for" aria-label="New type description" className="input min-w-56 flex-1 py-1.5" />
              <input name="sort_order" type="number" defaultValue={projectTypes.length + 1} aria-label="New type order" className="input w-20 py-1.5" />
              <SubmitButton className="btn py-1.5" pendingText="Adding…">Add type</SubmitButton>
            </form>
          </div>
        </div>
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
