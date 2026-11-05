import { saveJobRole, saveProjectType, saveTeam, updateMember, updateNextReference } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { getJobRoles, getNextReference, getPeople, getProjectTypes, getTeams, nameOf, personOption, sp } from "@/lib/data";
import { AssigneePicker } from "@/components/assignee-picker";
import { pickerOptions } from "@/lib/assignees";
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
  const [people, projectTypes, nextReference, jobRoles] = await Promise.all([
    getPeople(),
    getProjectTypes(),
    getNextReference(),
    getJobRoles(),
  ]);
  const teams = await getTeams();
  const roleName = (id: string) => jobRoles.find((r) => r.id === id)?.name ?? "Role";
  const holders = (roleId: string) => people.filter((p) => p.job_roles?.some((x) => x.role_id === roleId)).length;
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

      <section className="card mb-6">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">People</h2>
        <ul>
          {people.map((p) => (
            <li key={p.id} className="border-b border-stone-100 px-4 py-3">
              <form action={updateMember} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="full_name" defaultValue={p.full_name} aria-label="Full name" className="input w-48" />
                <span className="w-56 truncate text-sm text-stone-500">{p.email}</span>
                <details className="relative">
                  <summary className="input flex w-56 cursor-pointer list-none items-center truncate [&::-webkit-details-marker]:hidden">
                    <span className="truncate">
                      {p.job_roles?.length
                        ? [...p.job_roles]
                            .sort((a, b) => Number(b.is_main) - Number(a.is_main))
                            .map((r) => (r.is_main ? `${roleName(r.role_id)} (main)` : roleName(r.role_id)))
                            .join(", ")
                        : <span className="text-stone-400">No roles</span>}
                    </span>
                  </summary>
                  <div className="absolute z-20 mt-1 w-72 rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
                    <p className="mb-2 text-xs text-stone-500">Tick their roles and pick the main one.</p>
                    <ul className="space-y-1.5">
                      {jobRoles
                        .filter((r) => r.active || p.job_roles?.some((x) => x.role_id === r.id))
                        .map((r) => {
                          const held = p.job_roles?.find((x) => x.role_id === r.id);
                          return (
                            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                              <label className="flex items-center gap-2">
                                <input type="checkbox" name="role_ids" value={r.id} defaultChecked={!!held} />
                                {r.name}
                              </label>
                              <label className="flex items-center gap-1 text-xs text-stone-500">
                                <input type="radio" name="main_role_id" value={r.id} defaultChecked={!!held?.is_main} /> Main
                              </label>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                </details>
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

      <section className="card mb-6">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Teams</h2>
        <p className="px-4 pt-3 text-xs text-stone-500">
          Group people into teams. A team&apos;s manager can approve, return and reopen their members&apos; timesheets
          (never their own), and anyone can @mention a team in an update.
        </p>
        <div className="divide-y divide-stone-100">
          {[...teams, null].map((t) => (
            <form
              key={t?.id ?? "new"}
              action={saveTeam}
              className="grid items-end gap-2 px-4 py-4 md:grid-cols-[12rem_14rem_minmax(0,1fr)_auto_auto]"
            >
              {t && <input type="hidden" name="id" value={t.id} />}
              <div>
                <label className="label" htmlFor={`team_name_${t?.id ?? "new"}`}>{t ? "Team" : "New team"}</label>
                <input
                  id={`team_name_${t?.id ?? "new"}`}
                  name="name"
                  required
                  defaultValue={t?.name ?? ""}
                  placeholder="Design team"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label" htmlFor={`team_mgr_${t?.id ?? "new"}`}>Manager</label>
                <select id={`team_mgr_${t?.id ?? "new"}`} name="manager_id" defaultValue={t?.manager_id ?? ""} className="input w-full">
                  <option value="">No manager</option>
                  {people.filter((p) => p.active || p.id === t?.manager_id).map((p) => (
                    <option key={p.id} value={p.id}>{personOption(p)}</option>
                  ))}
                </select>
              </div>
              <AssigneePicker
                key={t ? `${t.id}-${t.member_ids.join()}` : "new"}
                {...pickerOptions(people, t?.member_ids)}
                defaultValue={t?.member_ids ?? []}
                name="member_ids"
                label="Members"
              />
              <label className="flex items-center gap-1 pb-2 text-sm">
                <input type="checkbox" name="active" value="on" defaultChecked={t ? t.active : true} /> Active
              </label>
              <SubmitButton className={t ? "btn" : "btn-primary"} pendingText="Saving…">{t ? "Save" : "Add team"}</SubmitButton>
            </form>
          ))}
        </div>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Job roles</h2>
        <div className="space-y-2 px-4 py-3">
          <p className="mb-1 text-xs text-stone-500">
            Roles people hold. Tasks can be assigned to a role, and anyone with it can take the work from My Work. Untick
            Active to retire a role; roles still used on tasks can&apos;t be deleted.
          </p>
          {jobRoles.map((r) => (
            <form key={r.id} action={saveJobRole} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="name" required defaultValue={r.name} aria-label={`Name for ${r.name}`} className="input w-56 py-1.5" />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="active" value="on" defaultChecked={r.active} /> Active
              </label>
              <span className="text-xs text-stone-400">
                {holders(r.id)} {holders(r.id) === 1 ? "person" : "people"}
              </span>
              <SubmitButton className="btn py-1.5">Save</SubmitButton>
            </form>
          ))}
          <form action={saveJobRole} className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
            <input type="hidden" name="active" value="on" />
            <input name="name" required placeholder="New role, e.g. Producer" aria-label="New role name" className="input w-56 py-1.5" />
            <SubmitButton className="btn py-1.5" pendingText="Adding…">Add role</SubmitButton>
          </form>
        </div>
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
