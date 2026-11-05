import Link from "next/link";
import { redirect } from "next/navigation";
import { decideTimesheet } from "../../actions";
import { FilterForm, LiveRefresh, SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader, TimesheetBadge } from "@/components/ui";
import { addDays, formatDate, formatTimestamp } from "@/lib/dates";
import { getPeople, getTeams, managedIds, nameOf, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Timesheet } from "@/lib/types";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const teams = await getTeams();
  const managed = managedIds(teams, me.id);
  if (!isAdmin && !managed.length) redirect("/time");
  const teamFilter = sp(params.team) ?? "";
  const team = teams.find((t) => t.id === teamFilter);
  // Managers see their team's weeks (never their own); admins see everyone, optionally one team.
  const inScope = (userId: string) =>
    (isAdmin ? true : managed.includes(userId)) && (!team || team.member_ids.includes(userId));
  const supabase = await createClient();
  const [{ data: waitingData }, { data: recentData }, people] = await Promise.all([
    supabase.from("timesheets").select("*").eq("status", "submitted").order("week_start").order("submitted_at"),
    supabase
      .from("timesheets")
      .select("*")
      .in("status", ["approved", "returned"])
      .order("decided_at", { ascending: false })
      .limit(20),
    getPeople(),
  ]);
  const waiting = ((waitingData ?? []) as Timesheet[]).filter((t) => inScope(t.user_id));
  const recent = ((recentData ?? []) as Timesheet[]).filter((t) => inScope(t.user_id));
  const ids = [...new Set(waiting.map((t) => t.user_id))];
  const weeks = waiting.map((t) => t.week_start);
  const { data: hoursData } = ids.length
    ? await supabase
        .from("time_entries")
        .select("user_id, work_date, hours, hour_type")
        .in("user_id", ids)
        .gte("work_date", weeks.reduce((a, b) => (a < b ? a : b)))
        .lte("work_date", addDays(weeks.reduce((a, b) => (a > b ? a : b)), 6))
    : { data: [] };
  const billableFor = (t: Timesheet) =>
    (hoursData ?? [])
      .filter((h) => h.user_id === t.user_id && h.hour_type === "billable" && h.work_date >= t.week_start && h.work_date <= addDays(t.week_start, 6))
      .reduce((s, h) => s + Number(h.hours), 0);
  const review = (t: Timesheet) => `/time?week=${t.week_start}&user=${t.user_id}`;
  const week = (t: Timesheet) => `${formatDate(t.week_start)} to ${formatDate(addDays(t.week_start, 6))}`;

  return (
    <>
      <LiveRefresh subs={[{ table: "timesheets" }]} />
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/time" className="hover:underline">Time</Link>
      </p>
      <PageHeader
        title="Approvals"
        subtitle={`${waiting.length} timesheet${waiting.length === 1 ? "" : "s"} waiting${isAdmin ? "" : " from your team"}`}
      >
        {teams.some((t) => t.active) && (
          <FilterForm key={teamFilter} className="flex items-center gap-2">
            <label htmlFor="approvals_team" className="text-xs font-medium uppercase tracking-wide text-stone-500">Team</label>
            <select id="approvals_team" name="team" defaultValue={teamFilter} className="input w-56">
              <option value="">{isAdmin ? "Everyone" : "All my teams"}</option>
              {teams
                .filter((t) => t.active && (isAdmin || t.manager_id === me.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
          </FilterForm>
        )}
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Waiting for a decision</h2>
        {waiting.length === 0 ? (
          <Empty>Nothing to approve right now.</Empty>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="table-head">Person</th>
                <th className="table-head">Week</th>
                <th className="table-head text-right">Total</th>
                <th className="table-head text-right">Billable</th>
                <th className="table-head">Submitted</th>
                <th className="table-head"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50">
                  <td className="table-cell font-medium">{nameOf(people, t.user_id)}</td>
                  <td className="table-cell text-stone-600">{week(t)}</td>
                  <td className="table-cell text-right tabular-nums">{Number(t.total_hours)} h</td>
                  <td className="table-cell text-right tabular-nums text-stone-600">{+billableFor(t).toFixed(2)} h</td>
                  <td className="table-cell text-stone-600">{t.submitted_at ? formatTimestamp(t.submitted_at) : ""}</td>
                  <td className="table-cell">
                    <div className="flex justify-end gap-2">
                      <Link href={review(t)} className="btn">Review</Link>
                      <form action={decideTimesheet}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <input type="hidden" name="redirect_to" value="/time/approvals" />
                        <SubmitButton pendingText="Approving…">Approve</SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">
          To return a week, open <span className="font-medium">Review</span>, add a note saying what needs fixing, and select Return.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Recently decided</h2>
        {recent.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <ul>
            {recent.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 px-4 py-3 text-sm">
                <TimesheetBadge status={t.status} />
                <Link href={review(t)} className="font-medium hover:underline">{nameOf(people, t.user_id)}</Link>
                <span className="text-stone-600">{week(t)}</span>
                <span className="text-stone-400">
                  {t.decided_by ? nameOf(people, t.decided_by) : ""}
                  {t.decided_at ? `, ${formatTimestamp(t.decided_at)}` : ""}
                </span>
                {t.status === "returned" && t.return_note && <span className="w-full text-stone-500">“{t.return_note}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
