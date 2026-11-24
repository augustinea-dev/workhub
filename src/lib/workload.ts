import { addDays, isWorkingDay } from "@/lib/dates";
import type { JobRole, Profile } from "@/lib/types";
import { type loadReportData, workingDaysIn } from "@/lib/utilization";

export const WEEKS = { start: 3, step: 3, max: 52 };

export type DayTask = { id: string; title: string; project: string; hours: number; roles?: string[] };
export type DayCell = { capacity: number; pto: number; planned: number; holiday: boolean; tasks: DayTask[] };
export type WorkloadRow = { id: string; name: string; role: string | null; days: Record<string, DayCell> };

export function buildWorkload(opts: {
  people: Profile[];
  roles: JobRole[];
  data: Awaited<ReturnType<typeof loadReportData>>;
  from: string;
  to: string;
  teamIds: string[] | null;
}) {
  const { people, roles, data, from, to, teamIds } = opts;
  const { holidays } = data;
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "Role";
  const projectName = new Map(data.projects.map((p) => [p.id, p.title || p.name]));

  const blankDays = (weekly: number) =>
    Object.fromEntries(
      days.map((d) => [d, { capacity: isWorkingDay(d, holidays) ? weekly / 5 : 0, pto: 0, planned: 0, holiday: holidays.has(d), tasks: [] } as DayCell]),
    );

  const rows: WorkloadRow[] = people
    .filter((p) => p.active && (!teamIds || teamIds.includes(p.id)))
    .map((p) => {
      const main = p.job_roles?.find((r) => r.is_main)?.role_id;
      return { id: p.id, name: p.full_name, role: main ? roleName(main) : null, days: blankDays(Number(p.weekly_hours ?? 0)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unassigned: WorkloadRow = { id: "unassigned", name: "Unassigned work", role: "Open roles and tasks with no one on them", days: blankDays(0) };

  for (const e of data.entries) {
    if (e.hour_type !== "pto" || e.category?.kind === "holiday") continue;
    const c = byId.get(e.user_id)?.days[e.work_date];
    if (c) c.pto += Number(e.hours);
  }

  const addTask = (c: DayCell, t: DayTask) => {
    c.planned += t.hours;
    c.tasks.push(t);
  };

  const hasEstimatedChild = new Set(data.tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id as string));
  let unscheduled = 0;
  for (const t of data.tasks) {
    if (hasEstimatedChild.has(t.id) || t.status === "done") continue;
    const est = Number(t.estimate_hours);
    if (!est) continue;
    const start = t.start_date ?? t.due_date;
    const end = t.due_date ?? t.start_date;
    if (!start || !end) {
      if (!teamIds || t.task_assignees.some((a) => teamIds.includes(a.profile_id))) unscheduled++;
      continue;
    }
    const [a, b] = start <= end ? [start, end] : [end, start];
    if (b < from || a > to) continue;
    let span = workingDaysIn(a, b, holidays);
    if (!span.length) span = [b];
    const shares = t.task_assignees.length + t.task_role_slots.length || 1;
    const perDay = est / shares / span.length;
    const base = { id: t.id, title: t.title, project: projectName.get(t.project_id) ?? "" };
    for (const d of span) {
      if (d < from || d > to) continue;
      for (const as of t.task_assignees) {
        const c = byId.get(as.profile_id)?.days[d];
        if (c) addTask(c, { ...base, hours: perDay });
      }
      if (teamIds) continue;
      const open = t.task_role_slots.length;
      if (open || !t.task_assignees.length) {
        addTask(unassigned.days[d], { ...base, hours: perDay * (open || 1), roles: t.task_role_slots.map((s) => roleName(s.role_id)) });
      }
    }
  }

  for (const r of [...rows, unassigned]) for (const c of Object.values(r.days)) c.tasks.sort((x, y) => y.hours - x.hours);
  const hasUnassigned = Object.values(unassigned.days).some((c) => c.planned > 0.005);
  return { days, rows, unassigned: hasUnassigned ? unassigned : null, unscheduled };
}
