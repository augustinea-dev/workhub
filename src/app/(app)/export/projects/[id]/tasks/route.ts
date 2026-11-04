import type { NextRequest } from "next/server";
import { ASSIGNEES, assigneeLabel, openRoleNames, withAssignees } from "@/lib/assignees";
import { csvResponse, slug } from "@/lib/csv";
import { getJobRoles, getPeople } from "@/lib/data";
import { formatTimestamp, todayISO } from "@/lib/dates";
import { compareTasks, hasTaskFilters, parseTaskFilters, taskMatches } from "@/lib/list-filters";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TASK_STATUSES, type Task } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const tf = parseTaskFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const [{ data: project }, { data: tasks }, { data: time }, people] = await Promise.all([
    supabase.from("projects").select("name").eq("id", id).maybeSingle(),
    supabase.from("tasks").select(`*, ${ASSIGNEES}`).eq("project_id", id).order("sort_order"),
    supabase.from("time_entries").select("task_id, hours").eq("project_id", id),
    getPeople(),
  ]);
  const jobRoles = await getJobRoles();
  if (!project) return new Response("Project not found.", { status: 404 });

  const all = ((tasks ?? []) as (Omit<Task, "assignee_ids" | "open_roles"> & { task_assignees: { profile_id: string }[] })[]).map(
    withAssignees,
  ) as Task[];
  const title = new Map(all.map((t) => [t.id, t.title]));
  const today = todayISO();
  const customised = hasTaskFilters(tf) || tf.sort !== "due" || tf.dir !== "asc";
  const list = customised ? all.filter((t) => taskMatches(t, tf, me.id, today)).sort(compareTasks(tf, people)) : all;
  const logged = new Map<string, number>();
  for (const e of time ?? []) {
    if (e.task_id) logged.set(e.task_id, (logged.get(e.task_id) ?? 0) + Number(e.hours));
  }

  const rows = list.map((t) => [
    t.title,
    t.is_milestone ? "Milestone" : "Task",
    t.milestone_id ? title.get(t.milestone_id) ?? "" : "",
    t.parent_task_id ? title.get(t.parent_task_id) ?? "" : "",
    assigneeLabel(t.assignee_ids, people, ""),
    openRoleNames(t.open_roles, jobRoles).map((n) => n.replace(" (open)", "")).join(", "),
    TASK_STATUSES.find((s) => s.value === t.status)?.label ?? t.status,
    t.start_date ?? "",
    t.due_date ?? "",
    t.estimate_hours != null ? Number(t.estimate_hours) : "",
    +(logged.get(t.id) ?? 0).toFixed(2),
    t.completed_at ? formatTimestamp(t.completed_at) : "",
  ]);

  return csvResponse(
    `workhub-tasks-${slug(project.name)}-${today}.csv`,
    ["Task", "Type", "Milestone", "Parent task", "Assignees", "Open roles", "Status", "Start", "Due", "Estimate (h)", "Hours logged", "Completed"],
    rows,
  );
}
