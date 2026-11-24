import Link from "next/link";
import { FilterForm } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { WorkloadGrid } from "@/components/workload-grid";
import { getJobRoles, getPeople, getTeams, sp } from "@/lib/data";
import { addDays, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { loadReportData } from "@/lib/utilization";
import { buildWorkload, WEEKS } from "@/lib/workload";

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const today = todayISO();
  const thisWeek = weekStart(today);
  const fromParam = sp(params.from);
  const from = fromParam && isValidISODate(fromParam) ? weekStart(fromParam) : thisWeek;
  const weeksParam = Number.parseInt(sp(params.weeks) ?? "", 10);
  const weeks = Number.isInteger(weeksParam) ? Math.min(WEEKS.max, Math.max(WEEKS.start, weeksParam)) : WEEKS.start;
  const to = addDays(from, weeks * 7 - 1);
  const teamId = sp(params.team) ?? "";

  const [people, teams, roles] = await Promise.all([getPeople(), getTeams(), getJobRoles()]);
  const activeTeams = teams.filter((t) => t.active);
  const team = activeTeams.find((t) => t.id === teamId);
  const { days, rows, unassigned, unscheduled } = buildWorkload({
    people,
    roles,
    data: await loadReportData(from, to),
    from,
    to,
    teamIds: team ? team.member_ids : null,
  });

  const href = (f: string, w = weeks) => {
    const q = new URLSearchParams();
    if (f !== thisWeek) q.set("from", f);
    if (w !== WEEKS.start) q.set("weeks", String(w));
    if (team) q.set("team", team.id);
    const s = q.toString();
    return s ? `/workload?${s}` : "/workload";
  };
  const more = weeks < WEEKS.max ? href(from, Math.min(WEEKS.max, weeks + WEEKS.step)) : null;

  return (
    <div>
      <PageHeader title="Workload" subtitle="Planned hours per person per day, from task estimates. Admins only." />

      <div className="card mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={href(addDays(from, -7))} className="btn" aria-label="Previous week">←</Link>
            <Link href={href(thisWeek)} className={`btn ${from === thisWeek ? "pointer-events-none opacity-50" : ""}`}>This week</Link>
            <Link href={href(addDays(from, 7))} className="btn" aria-label="Next week">→</Link>
          </div>
          <FilterForm key={`${from}-${weeks}-${teamId}`} className="flex items-end gap-2">
            {from !== thisWeek && <input type="hidden" name="from" value={from} />}
            {weeks !== WEEKS.start && <input type="hidden" name="weeks" value={weeks} />}
            <div>
              <label className="label" htmlFor="w_team">Team</label>
              <select id="w_team" name="team" defaultValue={team?.id ?? ""} className="input">
                <option value="">Everyone</option>
                {activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </FilterForm>
        </div>

        <WorkloadGrid days={days} rows={rows} unassigned={unassigned} today={today} more={more} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-xs text-stone-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-sky-100 ring-1 ring-sky-200" />Within their hours</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-200" />Over their hours</span>
            <span className="inline-flex items-center gap-1.5"><span className="wl-hatch h-3 w-3 rounded-sm ring-1 ring-stone-200" />Weekend</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-200" />Holiday</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-violet-100 ring-1 ring-violet-200" />Time off (from timesheets)</span>
            <span>Select a day to see its tasks.</span>
          </div>
          {more && (
            <Link href={more} scroll={false} className="font-medium text-blue-700 hover:underline">
              Show {WEEKS.step} more weeks →
            </Link>
          )}
        </div>
      </div>

      {unscheduled > 0 && (
        <p className="text-sm text-stone-600">
          {unscheduled} open {unscheduled === 1 ? "task has" : "tasks have"} an estimate but no start or due date, so {unscheduled === 1 ? "it isn't" : "they aren't"} shown. Reports lists them under Unscheduled.
        </p>
      )}
    </div>
  );
}
