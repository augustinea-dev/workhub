import { addDays, isValidISODate, isWorkingDay, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { HourType, JobRole, Profile, TaskStatus } from "@/lib/types";

export const RANGES = [
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "next_week", label: "Next week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "next_month", label: "Next month" },
  { value: "custom", label: "Custom" },
] as const;
export type RangePreset = (typeof RANGES)[number]["value"];

export const VIEWS = [
  { value: "person", label: "By person" },
  { value: "role", label: "By job role" },
  { value: "project", label: "By project" },
  { value: "task", label: "By task" },
] as const;
export type View = (typeof VIEWS)[number]["value"];

export const BREAKDOWNS = [
  { value: "total", label: "Total" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
] as const;
export type Breakdown = (typeof BREAKDOWNS)[number]["value"];

export const MAX_RANGE_DAYS = 366;

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

export function resolveRange(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined,
  today: string,
): { preset: RangePreset; from: string; to: string } {
  const sunday = weekStart(today);
  switch (preset) {
    case "this_week":
      return { preset, from: sunday, to: addDays(sunday, 6) };
    case "last_week":
      return { preset, from: addDays(sunday, -7), to: addDays(sunday, -1) };
    case "next_week":
      return { preset, from: addDays(sunday, 7), to: addDays(sunday, 13) };
    case "this_month":
      return { preset, from: monthStart(today), to: monthEnd(today) };
    case "next_month": {
      const next = addDays(monthEnd(today), 1);
      return { preset, from: next, to: monthEnd(next) };
    }
    case "custom":
      if (fromParam && toParam && isValidISODate(fromParam) && isValidISODate(toParam) && fromParam <= toParam) {
        return { preset, from: fromParam, to: toParam };
      }
      break;
  }
  const lastMonth = addDays(monthStart(today), -1);
  return { preset: preset === "custom" ? "custom" : "last_month", from: monthStart(lastMonth), to: monthEnd(lastMonth) };
}

export function pick<T extends string>(v: string | undefined, list: readonly { value: T }[], fallback: T): T {
  return list.some((x) => x.value === v) ? (v as T) : fallback;
}

export type Period = { key: string; label: string; from: string; to: string };

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function periods(from: string, to: string, by: Breakdown): Period[] {
  if (by === "total") return [{ key: "total", label: "Total", from, to }];
  const out: Period[] = [];
  let start = by === "week" ? weekStart(from) : monthStart(from);
  while (start <= to) {
    const end = by === "week" ? addDays(start, 6) : monthEnd(start);
    const a = start < from ? from : start;
    const b = end > to ? to : end;
    const label =
      by === "week"
        ? `Wk of ${short(start)}`
        : new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    out.push({ key: start, label, from: a, to: b });
    start = addDays(end, 1);
  }
  return out;
}

export function workingDaysIn(from: string, to: string, holidays: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, holidays)) out.push(d);
  return out;
}

async function pages<T>(build: (start: number, end: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let start = 0; ; start += size) {
    const { data, error } = await build(start, start + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) return out;
  }
}

type Entry = { user_id: string; project_id: string | null; task_id: string | null; work_date: string; hours: number | string; hour_type: HourType; category: { kind: string; name: string } | null };
type PlanTask = {
  id: string;
  title: string;
  status: TaskStatus;
  project_id: string;
  parent_task_id: string | null;
  estimate_hours: number | string;
  start_date: string | null;
  due_date: string | null;
  task_assignees: { profile_id: string }[];
  task_role_slots: { role_id: string }[];
};
type ProjectInfo = { id: string; name: string; title: string | null; status: string; company: { name: string } | null };

export async function loadReportData(from: string, to: string) {
  const supabase = await createClient();
  const [entries, tasks, { data: projects }, { data: hol }] = await Promise.all([
    pages<Entry>((a, b) =>
      supabase
        .from("time_entries")
        .select("user_id, project_id, task_id, work_date, hours, hour_type, category:time_categories(kind, name)")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("id")
        .range(a, b),
    ),
    pages<PlanTask>((a, b) =>
      supabase
        .from("tasks")
        .select("id, title, status, project_id, parent_task_id, estimate_hours, start_date, due_date, task_assignees(profile_id), task_role_slots(role_id)")
        .not("estimate_hours", "is", null)
        .order("id")
        .range(a, b),
    ),
    supabase.from("projects").select("id, name, title, status, company:companies(name)"),
    supabase.from("holidays").select("day"),
  ]);
  return {
    entries,
    tasks,
    projects: (projects ?? []) as unknown as ProjectInfo[],
    holidays: new Set(((hol ?? []) as { day: string }[]).map((h) => h.day)),
  };
}

export async function loadProjectTotals(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!projectIds.length) return out;
  const supabase = await createClient();
  const rows = await pages<{ project_id: string; hours: number | string }>((a, b) =>
    supabase.from("time_entries").select("project_id, hours").in("project_id", projectIds).neq("hour_type", "pto").order("id").range(a, b),
  );
  for (const r of rows) out.set(r.project_id, (out.get(r.project_id) ?? 0) + Number(r.hours));
  return out;
}

export type Cell = { capacity: number; pto: number; planned: number; billable: number; worked: number };
const blank = (): Cell => ({ capacity: 0, pto: 0, planned: 0, billable: 0, worked: 0 });
function add(a: Cell, b: Cell): Cell {
  return { capacity: a.capacity + b.capacity, pto: a.pto + b.pto, planned: a.planned + b.planned, billable: a.billable + b.billable, worked: a.worked + b.worked };
}
export const available = (c: Cell) => Math.max(0, c.capacity - c.pto);
export const ratio = (n: number, c: Cell) => (available(c) > 0 ? (n / available(c)) * 100 : null);

export type PersonRow = { id: string; name: string; email: string; weeklyHours: number; mainRoleId: string | null; cells: Record<string, Cell>; total: Cell };
export type RoleRow = { id: string; name: string; members: PersonRow[]; open: Record<string, number>; openTotal: number; cells: Record<string, Cell>; total: Cell };
export type ProjectRow = { id: string; name: string; client: string | null; estimate: number | null; planned: number; worked: number; billable: number; toDate: number };
export type Unscheduled = { id: string; title: string; project: string; hours: number };

export function buildReport(opts: {
  people: Profile[];
  roles: JobRole[];
  data: Awaited<ReturnType<typeof loadReportData>>;
  from: string;
  to: string;
  by: Breakdown;
  teamIds: string[] | null;
}) {
  const { people, roles, data, from, to, by, teamIds } = opts;
  const { holidays } = data;
  const per = periods(from, to, by);
  for (let i = 0; i < per.length && per.length > 1; ) {
    if (workingDaysIn(per[i].from, per[i].to, holidays).length > 0) {
      i++;
      continue;
    }
    if (i + 1 < per.length) per[i + 1] = { ...per[i + 1], from: per[i].from };
    else per[i - 1] = { ...per[i - 1], to: per[i].to };
    per.splice(i, 1);
  }
  const periodOf = (d: string) => per.find((p) => d >= p.from && d <= p.to)?.key;
  const inTeam = (id: string) => !teamIds || teamIds.includes(id);

  const cells = new Map<string, Record<string, Cell>>();
  const cellFor = (personId: string, key: string) => {
    const m = cells.get(personId) ?? {};
    cells.set(personId, m);
    return (m[key] ??= blank());
  };

  const workDays = new Map(per.map((p) => [p.key, workingDaysIn(p.from, p.to, holidays).length]));
  for (const p of people) {
    for (const pd of per) cellFor(p.id, pd.key).capacity = (Number(p.weekly_hours ?? 0) / 5) * (workDays.get(pd.key) ?? 0);
  }

  const projectWorked = new Map<string, { worked: number; billable: number }>();
  for (const e of data.entries) {
    const key = periodOf(e.work_date);
    if (!key) continue;
    if (e.category?.kind === "holiday") continue;
    const h = Number(e.hours);
    const c = cellFor(e.user_id, key);
    if (e.hour_type === "pto") c.pto += h;
    else {
      c.worked += h;
      if (e.hour_type === "billable") c.billable += h;
      if (inTeam(e.user_id) && e.project_id) {
        const pw = projectWorked.get(e.project_id) ?? { worked: 0, billable: 0 };
        pw.worked += h;
        if (e.hour_type === "billable") pw.billable += h;
        projectWorked.set(e.project_id, pw);
      }
    }
  }

  const hasEstimatedChild = new Set(data.tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id as string));
  const leaves = data.tasks.filter((t) => !hasEstimatedChild.has(t.id));
  const open = new Map<string, Record<string, number>>();
  const projectPlanned = new Map<string, number>();
  const unscheduled: Unscheduled[] = [];
  const projectName = new Map(data.projects.map((p) => [p.id, p.title || p.name]));

  for (const t of leaves) {
    const est = Number(t.estimate_hours);
    if (!est) continue;
    const start = t.start_date ?? t.due_date;
    const end = t.due_date ?? t.start_date;
    if (!start || !end) {
      if (t.status !== "done") unscheduled.push({ id: t.id, title: t.title, project: projectName.get(t.project_id) ?? "", hours: est });
      continue;
    }
    const [a, b] = start <= end ? [start, end] : [end, start];
    if (b < from || a > to) continue;
    let days = workingDaysIn(a, b, holidays);
    if (!days.length) days = [b];
    const shares = t.task_assignees.length + t.task_role_slots.length || 1;
    const perDay = est / shares / days.length;
    for (const d of days) {
      const key = periodOf(d);
      if (!key) continue;
      for (const a2 of t.task_assignees) {
        cellFor(a2.profile_id, key).planned += perDay;
        if (inTeam(a2.profile_id)) projectPlanned.set(t.project_id, (projectPlanned.get(t.project_id) ?? 0) + perDay);
      }
      if (!teamIds) {
        for (const s of t.task_role_slots) {
          const m = open.get(s.role_id) ?? {};
          m[key] = (m[key] ?? 0) + perDay;
          open.set(s.role_id, m);
        }
        const unassigned = t.task_assignees.length + t.task_role_slots.length === 0 ? perDay : perDay * t.task_role_slots.length;
        projectPlanned.set(t.project_id, (projectPlanned.get(t.project_id) ?? 0) + unassigned);
      }
    }
  }

  const sumCells = (m: Record<string, Cell>) => per.reduce((acc, p) => add(acc, m[p.key] ?? blank()), blank());

  const shown = people.filter((p) => inTeam(p.id) && (p.active || cells.get(p.id) && Object.values(cells.get(p.id)!).some((c) => c.worked || c.pto || c.planned)));
  const personRows: PersonRow[] = shown
    .map((p) => {
      const m = cells.get(p.id) ?? {};
      return {
        id: p.id,
        name: p.full_name,
        email: p.email,
        weeklyHours: Number(p.weekly_hours ?? 0),
        mainRoleId: p.job_roles?.find((r) => r.is_main)?.role_id ?? null,
        cells: Object.fromEntries(per.map((pd) => [pd.key, m[pd.key] ?? blank()])),
        total: sumCells(m),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const sumRows = (rows: PersonRow[]) => {
    const c: Record<string, Cell> = {};
    for (const pd of per) c[pd.key] = rows.reduce((acc, r) => add(acc, r.cells[pd.key]), blank());
    return c;
  };

  const roleIds = [...new Set([...personRows.map((r) => r.mainRoleId ?? ""), ...open.keys()])];
  const roleRows: RoleRow[] = roleIds
    .map((rid) => {
      const members = personRows.filter((r) => (r.mainRoleId ?? "") === rid);
      const c = sumRows(members);
      const o = open.get(rid) ?? {};
      for (const pd of per) c[pd.key] = { ...c[pd.key], planned: c[pd.key].planned + (o[pd.key] ?? 0) };
      return {
        id: rid || "none",
        name: rid ? (roles.find((r) => r.id === rid)?.name ?? "Role") : "No main role",
        members,
        open: o,
        openTotal: Object.values(o).reduce((s, n) => s + n, 0),
        cells: c,
        total: sumCells(c),
      };
    })
    .sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : a.name.localeCompare(b.name)));

  const totalCells = sumRows(personRows);
  const openAll: Record<string, number> = {};
  for (const r of roleRows) for (const [k, v] of Object.entries(r.open)) openAll[k] = (openAll[k] ?? 0) + v;
  const totals = { cells: totalCells, total: sumCells(totalCells), open: openAll, openTotal: Object.values(openAll).reduce((s, n) => s + n, 0) };

  const estimate = new Map<string, number>();
  for (const t of data.tasks) if (!t.parent_task_id) estimate.set(t.project_id, (estimate.get(t.project_id) ?? 0) + Number(t.estimate_hours));
  const projectIds = [...new Set([...projectPlanned.keys(), ...projectWorked.keys()])].filter(
    (id) => (projectPlanned.get(id) ?? 0) > 0.001 || (projectWorked.get(id)?.worked ?? 0) > 0,
  );
  const projectRows: ProjectRow[] = projectIds
    .map((id) => {
      const p = data.projects.find((x) => x.id === id);
      return {
        id,
        name: p ? p.title || p.name : "Project",
        client: p?.company?.name ?? null,
        estimate: estimate.get(id) ?? null,
        planned: projectPlanned.get(id) ?? 0,
        worked: projectWorked.get(id)?.worked ?? 0,
        billable: projectWorked.get(id)?.billable ?? 0,
        toDate: 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  unscheduled.sort((a, b) => a.project.localeCompare(b.project) || a.title.localeCompare(b.title));
  return { periods: per, personRows, roleRows, totals, projectRows, unscheduled, workDays: workingDaysIn(from, to, holidays).length };
}

export type TaskRow = {
  taskId: string;
  title: string;
  projectId: string;
  project: string;
  who: string;
  personId: string | null;
  allocated: number | null;
  planned: number;
  worked: number;
  toDate: number;
};

async function chunks<T>(ids: string[], load: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...(await load(ids.slice(i, i + 100))));
  return out;
}

export async function buildTaskReport(opts: {
  people: Profile[];
  roles: JobRole[];
  data: Awaited<ReturnType<typeof loadReportData>>;
  from: string;
  to: string;
  teamIds: string[] | null;
  personId: string | null;
}): Promise<TaskRow[]> {
  const { people, roles, data, from, to, teamIds, personId } = opts;
  const { holidays } = data;
  const show = (id: string) => (!teamIds || teamIds.includes(id)) && (!personId || personId === id);
  const showOpen = !teamIds && !personId;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? "Someone";
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "Role";
  const projectName = new Map(data.projects.map((p) => [p.id, p.title || p.name]));
  const rows = new Map<string, TaskRow>();
  const info = new Map<string, { title: string; projectId: string }>();
  const rowFor = (taskId: string, key: string, who: string, pid: string | null) => {
    const k = `${taskId}|${key}`;
    if (!rows.has(k)) {
      const t = info.get(taskId)!;
      rows.set(k, { taskId, title: t.title, projectId: t.projectId, project: projectName.get(t.projectId) ?? "", who, personId: pid, allocated: null, planned: 0, worked: 0, toDate: 0 });
    }
    return rows.get(k)!;
  };

  const hasEstimatedChild = new Set(data.tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id as string));
  for (const t of data.tasks) info.set(t.id, { title: t.title, projectId: t.project_id });
  for (const t of data.tasks) {
    if (hasEstimatedChild.has(t.id)) continue;
    const est = Number(t.estimate_hours);
    if (!est) continue;
    const start = t.start_date ?? t.due_date;
    const end = t.due_date ?? t.start_date;
    if (!start || !end) continue;
    const [a, b] = start <= end ? [start, end] : [end, start];
    if (b < from || a > to) continue;
    let span = workingDaysIn(a, b, holidays);
    if (!span.length) span = [b];
    const shares = t.task_assignees.length + t.task_role_slots.length || 1;
    const share = est / shares;
    const inRange = span.filter((d) => d >= from && d <= to).length;
    const planned = (share / span.length) * inRange;
    for (const as of t.task_assignees) {
      if (!show(as.profile_id)) continue;
      const r = rowFor(t.id, as.profile_id, nameOf(as.profile_id), as.profile_id);
      r.allocated = share;
      r.planned = planned;
    }
    if (!showOpen) continue;
    const counts = new Map<string, number>();
    for (const sl of t.task_role_slots) counts.set(sl.role_id, (counts.get(sl.role_id) ?? 0) + 1);
    for (const [rid, n] of counts) {
      const r = rowFor(t.id, `role:${rid}`, `Open: ${roleName(rid)}${n > 1 ? ` (${n})` : ""}`, null);
      r.allocated = share * n;
      r.planned = planned * n;
    }
    if (!t.task_assignees.length && !t.task_role_slots.length) {
      const r = rowFor(t.id, "none", "No one assigned", null);
      r.allocated = share;
      r.planned = planned;
    }
  }

  const workedIds = new Set<string>();
  for (const e of data.entries) if (e.task_id && e.hour_type !== "pto" && show(e.user_id)) workedIds.add(e.task_id);
  const missing = [...workedIds].filter((id) => !info.has(id));
  const supabase = await createClient();
  if (missing.length) {
    const extra = await chunks(missing, async (part) => {
      const { data: d } = await supabase.from("tasks").select("id, title, project_id").in("id", part);
      return (d ?? []) as { id: string; title: string; project_id: string }[];
    });
    for (const t of extra) info.set(t.id, { title: t.title, projectId: t.project_id });
  }
  for (const e of data.entries) {
    if (!e.task_id || e.hour_type === "pto" || !show(e.user_id) || !info.has(e.task_id)) continue;
    rowFor(e.task_id, e.user_id, nameOf(e.user_id), e.user_id).worked += Number(e.hours);
  }

  const ids = [...new Set([...rows.values()].map((r) => r.taskId))];
  const totals = await chunks(ids, (part) =>
    pages<{ task_id: string; user_id: string; hours: number | string }>((a, b) =>
      supabase.from("time_entries").select("task_id, user_id, hours").in("task_id", part).neq("hour_type", "pto").order("id").range(a, b),
    ),
  );
  for (const e of totals) {
    const r = rows.get(`${e.task_id}|${e.user_id}`);
    if (r) r.toDate += Number(e.hours);
  }

  return [...rows.values()].sort(
    (x, y) =>
      x.project.localeCompare(y.project) ||
      x.title.localeCompare(y.title) ||
      (x.personId ? 0 : 1) - (y.personId ? 0 : 1) ||
      x.who.localeCompare(y.who),
  );
}
