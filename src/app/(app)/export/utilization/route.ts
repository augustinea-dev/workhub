import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { getJobRoles, getPeople, getTeams } from "@/lib/data";
import { daysBetween, todayISO } from "@/lib/dates";
import { requireProfile } from "@/lib/session";
import {
  available,
  BREAKDOWNS,
  buildReport,
  loadProjectTotals,
  loadReportData,
  MAX_RANGE_DAYS,
  pick,
  ratio,
  resolveRange,
  VIEWS,
  type Cell,
} from "@/lib/utilization";

const n = (v: number) => +v.toFixed(2);
const p = (v: number | null) => (v == null ? "" : Math.round(v));

export async function GET(request: NextRequest) {
  const me = await requireProfile();
  if (me.role !== "admin") return new Response("Admins only.", { status: 403 });
  const q = request.nextUrl.searchParams;
  const get = (k: string) => q.get(k) ?? undefined;
  const range = resolveRange(get("range"), get("from"), get("to"), todayISO());
  if (daysBetween(range.from, range.to) > MAX_RANGE_DAYS) {
    return new Response("Pick a range of a year or less.", { status: 400 });
  }
  const view = pick(get("view"), VIEWS, "person");
  const by = view === "project" ? "total" : pick(get("by"), BREAKDOWNS, "total");
  const [people, teams, roles] = await Promise.all([getPeople(), getTeams(), getJobRoles()]);
  const team = teams.find((t) => t.active && t.id === q.get("team"));
  const report = buildReport({
    people,
    roles,
    data: await loadReportData(range.from, range.to),
    from: range.from,
    to: range.to,
    by,
    teamIds: team ? team.member_ids : null,
  });
  const file = `utilization-${view}-${range.from}-to-${range.to}${team ? `-${team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}.csv`;

  if (view === "project") {
    const totals = await loadProjectTotals(report.projectRows.map((r) => r.id));
    return csvResponse(
      file,
      ["Project", "Client", "Estimate", "Planned in range", "Worked in range", "Billable in range", "Logged to date", "Budget used %"],
      report.projectRows.map((r) => {
        const toDate = totals.get(r.id) ?? 0;
        return [r.name, r.client ?? "", r.estimate != null ? n(r.estimate) : "", n(r.planned), n(r.worked), n(r.billable), n(toDate), r.estimate ? p((toDate / r.estimate) * 100) : ""];
      }),
    );
  }

  const header = ["Group", "Person", "Period start", "Period end", "Available", "Planned", "Open role hours", "Worked", "Billable", "PTO", "Planned util %", "Actual util %", "Billable util %"];
  const line = (group: string, person: string, from: string, to: string, c: Cell, openHours = 0) => [
    group,
    person,
    from,
    to,
    n(available(c)),
    n(c.planned),
    openHours ? n(openHours) : "",
    n(c.worked),
    n(c.billable),
    n(c.pto),
    p(ratio(c.planned, c)),
    p(ratio(c.worked, c)),
    p(ratio(c.billable, c)),
  ];
  const rows: (string | number)[][] = [];
  for (const per of report.periods) {
    if (view === "person") {
      for (const r of report.personRows) rows.push(line(roles.find((x) => x.id === r.mainRoleId)?.name ?? "No main role", r.name, per.from, per.to, r.cells[per.key]));
    } else {
      for (const role of report.roleRows) {
        rows.push(line(role.name, "(role total)", per.from, per.to, role.cells[per.key], role.open[per.key] ?? 0));
        for (const m of role.members) rows.push(line(role.name, m.name, per.from, per.to, m.cells[per.key]));
      }
    }
    rows.push(line("Everyone shown", "", per.from, per.to, report.totals.cells[per.key], report.totals.open[per.key] ?? 0));
  }
  return csvResponse(file, header, rows);
}
