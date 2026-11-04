import { nextMilestone } from "@/lib/milestones";
import { PROJECT_STATUSES, TASK_STATUSES, type Profile, type ProjectStatus, type TaskStatus } from "@/lib/types";

type Params = Record<string, string | string[] | undefined>;
export type SortDir = "asc" | "desc";

function one(p: Params, key: string): string {
  const v = p[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function dirOf(p: Params): SortDir {
  return one(p, "dir") === "desc" ? "desc" : "asc";
}

/** Empty values sort last whichever way the list is sorted. */
function compareText(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const c = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

export function queryString(values: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// ---------- projects ----------
export const PROJECT_SORTS = ["due", "name", "client", "milestone"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

/** "open" and "all" are views; anything else is a single status. */
export type ProjectFilters = {
  status: "open" | "all" | ProjectStatus;
  client: string;
  owner: string;
  q: string;
  sort: ProjectSort;
  dir: SortDir;
};

export function parseProjectFilters(p: Params): ProjectFilters {
  const status = one(p, "status") || (one(p, "show") === "all" ? "all" : "open");
  const sort = one(p, "sort");
  return {
    status: status === "all" || PROJECT_STATUSES.some((s) => s.value === status) ? (status as ProjectFilters["status"]) : "open",
    client: one(p, "client"),
    owner: one(p, "owner"),
    q: one(p, "q"),
    sort: (PROJECT_SORTS as readonly string[]).includes(sort) ? (sort as ProjectSort) : "due",
    dir: dirOf(p),
  };
}

export function projectFiltersQS(f: ProjectFilters, override: Partial<ProjectFilters> = {}): string {
  const v = { ...f, ...override };
  return queryString({
    status: v.status === "open" ? undefined : v.status,
    client: v.client,
    owner: v.owner,
    q: v.q,
    sort: v.sort === "due" ? undefined : v.sort,
    dir: v.dir === "asc" ? undefined : v.dir,
  });
}

export function hasProjectFilters(f: ProjectFilters): boolean {
  return f.status !== "open" || !!f.client || !!f.owner || !!f.q;
}

type ProjectLike = {
  name: string;
  status: ProjectStatus;
  due_date: string | null;
  owner_id: string | null;
  company_id: string | null;
  company: { name: string } | null;
  tasks: { id: string; title: string; status: TaskStatus; due_date: string | null; is_milestone: boolean; milestone_id: string | null }[];
};

export function filterAndSortProjects<T extends ProjectLike>(rows: T[], f: ProjectFilters, today: string): T[] {
  const q = f.q.toLowerCase();
  const kept = rows.filter(
    (p) =>
      (f.status === "all" ||
        (f.status === "open" ? p.status !== "complete" && p.status !== "cancelled" : p.status === f.status)) &&
      (!f.client || (f.client === "none" ? !p.company_id : p.company_id === f.client)) &&
      (!f.owner || (f.owner === "none" ? !p.owner_id : p.owner_id === f.owner)) &&
      (!q || p.name.toLowerCase().includes(q) || !!p.company?.name.toLowerCase().includes(q)),
  );
  const key = (p: T): string | null | undefined =>
    f.sort === "name"
      ? p.name
      : f.sort === "client"
        ? p.company?.name
        : f.sort === "milestone"
          ? nextMilestone(p.tasks, today)?.milestone.due_date
          : p.due_date;
  return kept.sort((a, b) => compareText(key(a), key(b), f.dir) || a.name.localeCompare(b.name));
}

// ---------- tasks (a project's list) ----------
export const TASK_SORTS = ["due", "status", "assignee"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export type TaskFilters = {
  /** "" everyone, "me", "none" (unassigned) or a person's id. */
  assignee: string;
  status: TaskStatus | "";
  overdue: boolean;
  sort: TaskSort;
  dir: SortDir;
};

export function parseTaskFilters(p: Params): TaskFilters {
  const status = one(p, "status");
  const sort = one(p, "sort");
  return {
    assignee: one(p, "assignee"),
    status: TASK_STATUSES.some((s) => s.value === status) ? (status as TaskStatus) : "",
    overdue: one(p, "overdue") === "1",
    sort: (TASK_SORTS as readonly string[]).includes(sort) ? (sort as TaskSort) : "due",
    dir: dirOf(p),
  };
}

export function taskFiltersQS(f: TaskFilters, override: Partial<TaskFilters> = {}): string {
  const v = { ...f, ...override };
  return queryString({
    assignee: v.assignee,
    status: v.status,
    overdue: v.overdue ? "1" : undefined,
    sort: v.sort === "due" ? undefined : v.sort,
    dir: v.dir === "asc" ? undefined : v.dir,
  });
}

export function hasTaskFilters(f: TaskFilters): boolean {
  return !!f.assignee || !!f.status || f.overdue;
}

type TaskLike = { status: TaskStatus; due_date: string | null; assignee_id: string | null };

export function taskMatches(t: TaskLike, f: TaskFilters, meId: string, today: string): boolean {
  return (
    (!f.assignee ||
      (f.assignee === "me" ? t.assignee_id === meId : f.assignee === "none" ? !t.assignee_id : t.assignee_id === f.assignee)) &&
    (!f.status || t.status === f.status) &&
    (!f.overdue || (!!t.due_date && t.due_date < today && t.status !== "done"))
  );
}

const STATUS_ORDER = Object.fromEntries(TASK_STATUSES.map((s, i) => [s.value, String(i)]));

/** Open tasks first, then by the chosen column. */
export function compareTasks(f: TaskFilters, people: Profile[]) {
  const name = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name ?? "" : "");
  return (a: TaskLike, b: TaskLike): number => {
    const done = Number(a.status === "done") - Number(b.status === "done");
    if (done && f.sort !== "status") return done;
    if (f.sort === "status") return compareText(STATUS_ORDER[a.status], STATUS_ORDER[b.status], f.dir);
    if (f.sort === "assignee") return compareText(name(a.assignee_id), name(b.assignee_id), f.dir) || compareText(a.due_date, b.due_date, "asc");
    return compareText(a.due_date, b.due_date, f.dir);
  };
}
