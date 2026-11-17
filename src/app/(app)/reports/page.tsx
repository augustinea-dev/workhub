import Link from "next/link";
import { FilterForm } from "@/components/client";
import { Empty, PageHeader } from "@/components/ui";
import { getJobRoles, getPeople, getTeams, sp } from "@/lib/data";
import { daysBetween, formatDate, todayISO } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import {
  available,
  BREAKDOWNS,
  buildReport,
  loadProjectTotals,
  loadReportData,
  MAX_RANGE_DAYS,
  pick,
  RANGES,
  ratio,
  resolveRange,
  VIEWS,
  type Cell,
  type Period,
} from "@/lib/utilization";

const h = (n: number) => (Math.abs(n) < 0.005 ? "0" : (+n.toFixed(1)).toString());
const pct = (n: number | null) => (n == null ? "n/a" : `${Math.round(n)}%`);

function Pct({ value, kind }: { value: number | null; kind: "planned" | "actual" | "billable" }) {
  if (value == null) return <span className="text-stone-400">n/a</span>;
  const tone =
    kind === "planned"
      ? value > 100 ? "bg-red-600" : value >= 80 ? "bg-emerald-500" : "bg-amber-500"
      : kind === "actual"
        ? value >= 90 ? "bg-emerald-500" : "bg-amber-500"
        : "bg-blue-700";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-1.5 w-12 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
        <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </span>
      <span className={`tabular-nums ${kind === "planned" && value > 100 ? "font-semibold text-red-700" : ""}`}>{pct(value)}</span>
    </span>
  );
}

function TotalCells({ c, strong, extraPlanned = 0 }: { c: Cell; strong?: boolean; extraPlanned?: number }) {
  const num = `table-cell text-right tabular-nums ${strong ? "font-semibold" : ""}`;
  return (
    <>
      <td className={num}>{h(available(c))}</td>
      <td className={num}>
        {h(c.planned)}
        {extraPlanned > 0.005 && <span className="block text-xs font-normal text-amber-800">{h(extraPlanned)} open</span>}
      </td>
      <td className={num}>{h(c.worked)}</td>
      <td className={num}>{h(c.billable)}</td>
      <td className={num}>{h(c.pto)}</td>
      <td className="table-cell"><Pct value={ratio(c.planned, c)} kind="planned" /></td>
      <td className="table-cell"><Pct value={ratio(c.worked, c)} kind="actual" /></td>
      <td className="table-cell"><Pct value={ratio(c.billable, c)} kind="billable" /></td>
    </>
  );
}

function GridCells({ cells, periods, today, open }: { cells: Record<string, Cell>; periods: Period[]; today: string; open?: Record<string, number> }) {
  return (
    <>
      {periods.map((p) => {
        const c = cells[p.key];
        const pl = ratio(c.planned, c);
        const past = p.from <= today;
        const bg = pl == null ? "" : pl > 100 ? "bg-red-50" : pl >= 80 ? "bg-emerald-50" : "";
        return (
          <td key={p.key} className={`table-cell text-center tabular-nums ${bg}`}>
            <span className={`block font-medium ${pl != null && pl > 100 ? "text-red-700" : ""}`}>{pct(pl)}</span>
            <span className="block text-xs text-stone-500">
              {h(c.planned)} / {h(available(c))} h
            </span>
            {past && <span className="block text-xs text-stone-400">worked {h(c.worked)}</span>}
            {open && (open[p.key] ?? 0) > 0.005 && <span className="block text-xs text-amber-800">{h(open[p.key])} open</span>}
          </td>
        );
      })}
    </>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const today = todayISO();
  const range = resolveRange(sp(params.range), sp(params.from), sp(params.to), today);
  const view = pick(sp(params.view), VIEWS, "person");
  const by = view === "project" ? "total" : pick(sp(params.by), BREAKDOWNS, "total");
  const tooLong = daysBetween(range.from, range.to) > MAX_RANGE_DAYS;
  const teamId = sp(params.team) ?? "";

  const [people, teams, roles] = await Promise.all([getPeople(), getTeams(), getJobRoles()]);
  const activeTeams = teams.filter((t) => t.active);
  const team = activeTeams.find((t) => t.id === teamId);
  const report = tooLong
    ? null
    : buildReport({ people, roles, data: await loadReportData(range.from, range.to), from: range.from, to: range.to, by, teamIds: team ? team.member_ids : null });
  if (report && view === "project") {
    const totals = await loadProjectTotals(report.projectRows.map((r) => r.id));
    for (const r of report.projectRows) r.toDate = totals.get(r.id) ?? 0;
  }

  const base: Record<string, string> = { range: range.preset, ...(range.preset === "custom" ? { from: range.from, to: range.to } : {}), ...(team ? { team: team.id } : {}) };
  const href = (o: Record<string, string>) => `/reports?${new URLSearchParams({ ...base, view, ...(by !== "total" ? { by } : {}), ...o })}`;
  const exportQs = new URLSearchParams({ ...base, view, by });
  const grid = by !== "total";

  return (
    <>
      <PageHeader title="Reports" subtitle="Admins only." />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Utilization</h2>
            <p className="max-w-3xl text-xs text-stone-500">
              {formatDate(range.from)} to {formatDate(range.to)} · {report?.workDays ?? 0} working days (weekends and holidays left out). Available
              is weekly hours spread over the working days, minus PTO. Planned spreads each task&apos;s estimate evenly over the working days from its
              start to due date, split among its people and open roles.
            </p>
          </div>
          <a href={`/export/utilization?${exportQs}`} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100">
            Export CSV
          </a>
        </div>

        <nav aria-label="Report view" className="flex flex-wrap gap-1 border-b border-stone-200 px-4 py-2 text-sm font-medium">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={href({ view: v.value })}
              aria-current={view === v.value ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${view === v.value ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        <FilterForm key={`${range.preset}-${range.from}-${range.to}-${teamId}-${view}-${by}`} className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
          <input type="hidden" name="view" value={view} />
          <div>
            <label className="label" htmlFor="r_range">Dates</label>
            <select id="r_range" name="range" defaultValue={range.preset} className="input">
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {range.preset === "custom" && (
            <>
              <div>
                <label className="label" htmlFor="r_from">From</label>
                <input id="r_from" name="from" type="date" defaultValue={range.from} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="r_to">To</label>
                <input id="r_to" name="to" type="date" defaultValue={range.to} className="input" />
              </div>
              <button type="submit" className="btn">Apply</button>
            </>
          )}
          {view !== "project" && (
            <div>
              <label className="label" htmlFor="r_by">Break down</label>
              <select id="r_by" name="by" defaultValue={by} className="input">
                {BREAKDOWNS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          )}
          {activeTeams.length > 0 && (
            <div>
              <label className="label" htmlFor="r_team">Team</label>
              <select id="r_team" name="team" defaultValue={team?.id ?? ""} className="input">
                <option value="">Everyone</option>
                {activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {(range.preset !== "last_month" || team || by !== "total") && (
            <Link href={`/reports?view=${view}`} className="btn">Reset</Link>
          )}
        </FilterForm>

        {!report ? (
          <Empty>Pick a range of a year or less.</Empty>
        ) : view === "project" ? (
          report.projectRows.length === 0 ? (
            <Empty>No planned or logged hours on any project in these dates.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="table-head">Project</th>
                    <th className="table-head text-right" title="Sum of the project's task estimates, all dates">Estimate</th>
                    <th className="table-head text-right">Planned in range</th>
                    <th className="table-head text-right">Worked in range</th>
                    <th className="table-head text-right">Billable in range</th>
                    <th className="table-head text-right" title="All non-PTO hours ever logged on the project">Logged to date</th>
                    <th className="table-head">Budget used</th>
                  </tr>
                </thead>
                <tbody>
                  {report.projectRows.map((r) => {
                    const used = r.estimate ? (r.toDate / r.estimate) * 100 : null;
                    return (
                      <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                        <td className="table-cell">
                          <Link href={`/projects/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                          {r.client && <span className="block text-xs text-stone-500">{r.client}</span>}
                        </td>
                        <td className="table-cell text-right tabular-nums">{r.estimate != null ? h(r.estimate) : "n/a"}</td>
                        <td className="table-cell text-right tabular-nums">{h(r.planned)}</td>
                        <td className="table-cell text-right tabular-nums">{h(r.worked)}</td>
                        <td className="table-cell text-right tabular-nums">{h(r.billable)}</td>
                        <td className="table-cell text-right tabular-nums">{h(r.toDate)}</td>
                        <td className={`table-cell tabular-nums ${used != null && used > 100 ? "font-semibold text-red-700" : used != null && used >= 75 ? "text-amber-800" : ""}`}>
                          {pct(used)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (view === "person" ? report.personRows.length : report.roleRows.length) === 0 ? (
          <Empty>No one to show for these filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${grid ? "" : "min-w-[980px]"}`}>
              <thead>
                <tr>
                  <th className="table-head sticky left-0 bg-white">{view === "person" ? "Person" : "Job role"}</th>
                  {grid ? (
                    report.periods.map((p) => (
                      <th key={p.key} className="table-head min-w-28 text-center">{p.label}</th>
                    ))
                  ) : (
                    <>
                      <th className="table-head text-right">Available</th>
                      <th className="table-head text-right">Planned</th>
                      <th className="table-head text-right">Worked</th>
                      <th className="table-head text-right">Billable</th>
                      <th className="table-head text-right">PTO</th>
                      <th className="table-head" title="Planned ÷ available">Planned util.</th>
                      <th className="table-head" title="Worked ÷ available">Actual util.</th>
                      <th className="table-head" title="Billable ÷ available">Billable util.</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {view === "person"
                  ? report.personRows.map((r) => (
                      <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                        <td className="table-cell sticky left-0 bg-white">
                          <span className="font-medium">{r.name}</span>
                          <span className="block text-xs text-stone-500">
                            {roles.find((x) => x.id === r.mainRoleId)?.name ?? "No main role"} · {h(r.weeklyHours)} h/week
                          </span>
                        </td>
                        {grid ? <GridCells cells={r.cells} periods={report.periods} today={today} /> : <TotalCells c={r.total} />}
                      </tr>
                    ))
                  : report.roleRows.flatMap((role) => [
                      <tr key={role.id} className="border-b border-stone-200 bg-stone-50">
                        <td className="table-cell sticky left-0 bg-stone-50">
                          <span className="font-semibold">{role.name}</span>
                          <span className="block text-xs text-stone-500">
                            {role.members.length} {role.members.length === 1 ? "person" : "people"}
                            {role.openTotal > 0.005 && ` · ${h(role.openTotal)} h not yet assigned`}
                          </span>
                        </td>
                        {grid ? (
                          <GridCells cells={role.cells} periods={report.periods} today={today} open={role.open} />
                        ) : (
                          <TotalCells c={role.total} strong extraPlanned={role.openTotal} />
                        )}
                      </tr>,
                      ...role.members.map((m) => (
                        <tr key={`${role.id}-${m.id}`} className="border-b border-stone-100 hover:bg-stone-50">
                          <td className="table-cell sticky left-0 bg-white pl-8 text-stone-700">{m.name}</td>
                          {grid ? <GridCells cells={m.cells} periods={report.periods} today={today} /> : <TotalCells c={m.total} />}
                        </tr>
                      )),
                    ])}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td className="table-cell sticky left-0 bg-stone-50 font-semibold">
                    Everyone shown
                    {report.totals.openTotal > 0.005 && (
                      <span className="block text-xs font-normal text-amber-800">plus {h(report.totals.openTotal)} h for open roles</span>
                    )}
                  </td>
                  {grid ? (
                    <GridCells cells={report.totals.cells} periods={report.periods} today={today} open={report.totals.open} />
                  ) : (
                    <TotalCells c={report.totals.total} strong />
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="border-t border-stone-200 px-4 py-2.5 text-xs text-stone-500">
          Planned utilization over 100% means more work is scheduled than the person has hours for. Hours are as logged, whether or not the
          week is submitted. Open roles count toward the role and the project, not toward any one person.
        </p>
      </section>

      {report && report.unscheduled.length > 0 && view !== "project" && (
        <section className="card mt-6 overflow-hidden">
          <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
            Unscheduled <span className="font-normal text-stone-400">· {report.unscheduled.length} open tasks with estimates but no dates ({h(report.unscheduled.reduce((s, u) => s + u.hours, 0))} h)</span>
          </h2>
          <p className="px-4 pt-3 text-xs text-stone-500">These can&apos;t be placed on the calendar, so they aren&apos;t in planned hours. Give them a start or due date.</p>
          <ul className="px-4 py-3 text-sm">
            {report.unscheduled.slice(0, 25).map((u) => (
              <li key={u.id} className="flex justify-between gap-3 py-1">
                <span className="min-w-0 truncate">
                  <Link href={`/tasks/${u.id}`} className="font-medium hover:underline">{u.title}</Link>
                  <span className="text-stone-500"> · {u.project}</span>
                </span>
                <span className="shrink-0 tabular-nums text-stone-600">{h(u.hours)} h</span>
              </li>
            ))}
            {report.unscheduled.length > 25 && <li className="pt-1 text-xs text-stone-500">and {report.unscheduled.length - 25} more</li>}
          </ul>
        </section>
      )}
    </>
  );
}
