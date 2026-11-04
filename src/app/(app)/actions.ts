"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireProfile } from "@/lib/session";
import { getPeople } from "@/lib/data";
import { isValidISODate } from "@/lib/dates";
import { HOUR_TYPES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

const CONFLICT =
  "Someone else changed this since you opened it. Their version is shown below — make your change again.";

// ---------- helpers ----------
function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function opt(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function optDate(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v && isValidISODate(v) ? v : null;
}
function int(fd: FormData, key: string): number {
  return Number.parseInt(str(fd, key), 10);
}
function safePath(p: string, fallback: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : fallback;
}
function withParam(path: string, key: "error" | "notice", msg: string): string {
  const [base] = path.split("?");
  return `${base}?${key}=${encodeURIComponent(msg)}`;
}
function fail(path: string, msg: string): never {
  redirect(withParam(path, "error", msg));
}
function done(path: string, msg?: string): never {
  revalidatePath("/", "layout");
  redirect(msg ? withParam(path, "notice", msg) : path.split("?")[0]);
}
function oneOf<T extends string>(v: string, list: { value: T }[], fallback: T): T {
  return (list.find((o) => o.value === v)?.value ?? fallback) as T;
}

// ---------- clients ----------
export async function createCompany(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) fail("/clients", "Enter a client name.");
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ name });
  if (error) fail("/clients", error.code === "23505" ? `${name} already exists.` : error.message);
  done("/clients", `Added ${name}.`);
}

export async function updateCompany(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) fail("/clients", "Client name can't be empty.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").update({ name }).eq("id", str(fd, "id")).select("id");
  if (error) fail("/clients", error.code === "23505" ? `${name} already exists.` : error.message);
  if (!data?.length) fail("/clients", "Only an admin can rename clients.");
  done("/clients", `Renamed to ${name}.`);
}

export async function deleteCompany(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").delete().eq("id", str(fd, "id")).select("name");
  if (error) {
    fail("/clients", error.code === "23503" ? "This client still has projects. Move or delete them first." : error.message);
  }
  if (!data?.length) fail("/clients", "Only an admin can delete clients.");
  done("/clients", `Deleted ${data[0].name}.`);
}

// ---------- projects ----------
export async function createProject(fd: FormData) {
  const me = await requireAdmin();
  const name = str(fd, "name");
  if (!name) fail("/projects", "Enter a project name.");
  if (str(fd, "template_id")) return createProjectFromTemplate(fd, me.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      company_id: opt(fd, "company_id"),
      owner_id: opt(fd, "owner_id") ?? me.id,
      start_date: optDate(fd, "start_date"),
      due_date: optDate(fd, "due_date"),
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) fail("/projects", error?.message ?? "Couldn't create the project.");
  done(`/projects/${data.id}`, "Project created.");
}

async function createProjectFromTemplate(fd: FormData, ownerFallback: string) {
  const name = str(fd, "name");
  const start = optDate(fd, "start_date");
  if (!start) fail("/projects", "Pick a start date so the template's task dates can be worked out.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project_from_template", {
    p_template: str(fd, "template_id"),
    p_name: name,
    p_company: opt(fd, "company_id"),
    p_owner: opt(fd, "owner_id") ?? ownerFallback,
    p_start: start,
    p_due: optDate(fd, "due_date"),
  });
  if (error || !data) fail("/projects", error?.message ?? "Couldn't create the project.");
  done(`/projects/${data}`, "Project created from the template.");
}

export async function saveProjectAsTemplate(fd: FormData) {
  await requireAdmin();
  const projectId = str(fd, "project_id");
  const name = str(fd, "name");
  if (!name) fail(`/projects/${projectId}`, "Give the template a name.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_template_from_project", { p_project: projectId, p_name: name });
  if (error || !data) fail(`/projects/${projectId}`, error?.message ?? "Couldn't save the template.");
  done(`/templates/${data}`, "Template saved. Check the days and assignees below.");
}

export async function updateProject(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const path = `/projects/${id}`;
  const name = str(fd, "name");
  if (!name) fail(path, "Project name can't be empty.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name,
      company_id: opt(fd, "company_id"),
      owner_id: opt(fd, "owner_id"),
      status: oneOf(str(fd, "status"), PROJECT_STATUSES, "active"),
      start_date: optDate(fd, "start_date"),
      due_date: optDate(fd, "due_date"),
      description: opt(fd, "description"),
    })
    .eq("id", id)
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(path, error.message);
  if (!data?.length) fail(path, CONFLICT);
  done(path, "Project saved.");
}

export async function deleteProject(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) fail(`/projects/${id}`, error.message);
  done("/projects", "Project deleted.");
}

// ---------- tasks ----------
export async function createTask(fd: FormData) {
  await requireAdmin();
  const projectId = str(fd, "project_id");
  const back = safePath(str(fd, "redirect_to"), `/projects/${projectId}`);
  const title = str(fd, "title");
  if (!title) fail(back, "Enter a task title.");
  const startDate = optDate(fd, "start_date");
  const dueDate = optDate(fd, "due_date");
  if (startDate && dueDate && startDate > dueDate) fail(back, "Start date can't be after the due date.");
  const isMilestone = str(fd, "is_milestone") === "on";
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    title,
    assignee_id: opt(fd, "assignee_id"),
    start_date: startDate,
    due_date: dueDate,
    is_milestone: isMilestone,
    milestone_id: isMilestone ? null : opt(fd, "milestone_id"),
  });
  if (error) fail(back, error.message);
  done(back, `Added “${title}”.`);
}

export async function updateTask(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const path = `/tasks/${id}`;
  const title = str(fd, "title");
  if (!title) fail(path, "Task title can't be empty.");
  const startDate = optDate(fd, "start_date");
  const dueDate = optDate(fd, "due_date");
  if (startDate && dueDate && startDate > dueDate) fail(path, "Start date can't be after the due date.");
  const estimate = Number.parseFloat(str(fd, "estimate_hours"));
  const isMilestone = str(fd, "is_milestone") === "on";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title,
      description: opt(fd, "description"),
      status: oneOf(str(fd, "status"), TASK_STATUSES, "todo"),
      assignee_id: opt(fd, "assignee_id"),
      start_date: startDate,
      due_date: dueDate,
      estimate_hours: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
      is_milestone: isMilestone,
      milestone_id: isMilestone ? null : opt(fd, "milestone_id"),
    })
    .eq("id", id)
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(path, error.message);
  if (!data?.length) fail(path, CONFLICT);
  done(path, "Task saved.");
}

/**
 * Quick status change from a list; same version check as the full edit.
 * Admins can change any task; members only tasks assigned to them (enforced by RLS).
 */
export async function setTaskStatus(fd: FormData) {
  await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: oneOf(str(fd, "status"), TASK_STATUSES, "todo") })
    .eq("id", str(fd, "id"))
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(back, error.message);
  if (!data?.length) {
    fail(back, "That task was just changed by someone else, or isn't assigned to you. The list is refreshed — try again.");
  }
  done(back);
}

/** Board move: same rules as setTaskStatus, but returns a result so the card can snap back. */
export async function moveTask(id: string, version: number, status: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: oneOf(status, TASK_STATUSES, "todo") })
    .eq("id", id)
    .eq("version", version)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) {
    return { error: "That task was just changed by someone else, or isn't assigned to you. The board is refreshed, try again." };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteTask(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const projectId = str(fd, "project_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error) fail(`/tasks/${id}`, error.message);
  if (!data?.length) fail(`/tasks/${id}`, "Only an admin can delete tasks.");
  done(`/projects/${projectId}`, "Task deleted.");
}

// ---------- templates (admin) ----------
function templateTaskFields(fd: FormData, back: string) {
  const title = str(fd, "title");
  if (!title) fail(back, "Enter a task title.");
  const startDay = int(fd, "start_day");
  const dueDay = int(fd, "due_day");
  if (!Number.isInteger(startDay) || startDay < 0) fail(back, "Start day must be 0 or more.");
  if (!Number.isInteger(dueDay) || dueDay < startDay) fail(back, "Due day can't be before the start day.");
  const estimate = Number.parseFloat(str(fd, "estimate_hours"));
  const kind = str(fd, "kind");
  return {
    title,
    description: opt(fd, "description"),
    start_day: startDay,
    due_day: dueDay,
    estimate_hours: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
    is_milestone: kind === "milestone",
    milestone_id: kind.startsWith("in:") ? kind.slice(3) : null,
    assignee_id: opt(fd, "assignee_id"),
  };
}

export async function createTemplate(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) fail("/templates", "Give the template a name.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .insert({ name, description: opt(fd, "description") })
    .select("id")
    .single();
  if (error || !data) fail("/templates", error?.message ?? "Couldn't create the template.");
  done(`/templates/${data.id}`, "Template created. Add its tasks below.");
}

export async function updateTemplate(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const back = `/templates/${id}`;
  const name = str(fd, "name");
  if (!name) fail(back, "Template name can't be empty.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .update({ name, description: opt(fd, "description") })
    .eq("id", id)
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, CONFLICT);
  done(back, "Template saved.");
}

export async function deleteTemplate(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("project_templates").delete().eq("id", str(fd, "id"));
  if (error) fail(`/templates/${str(fd, "id")}`, error.message);
  done("/templates", "Template deleted. Projects already created from it are unchanged.");
}

export async function createTemplateTask(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "template_id");
  const back = `/templates/${templateId}`;
  const fields = templateTaskFields(fd, back);
  const supabase = await createClient();
  const { error } = await supabase.from("template_tasks").insert({ template_id: templateId, ...fields });
  if (error) fail(back, error.message);
  done(back, `Added “${fields.title}”.`);
}

export async function updateTemplateTask(fd: FormData) {
  await requireAdmin();
  const back = `/templates/${str(fd, "template_id")}`;
  const fields = templateTaskFields(fd, back);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("template_tasks")
    .update(fields)
    .eq("id", str(fd, "id"))
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, CONFLICT);
  done(back, `Saved “${fields.title}”.`);
}

export async function deleteTemplateTask(fd: FormData) {
  await requireAdmin();
  const back = `/templates/${str(fd, "template_id")}`;
  const supabase = await createClient();
  const { error } = await supabase.from("template_tasks").delete().eq("id", str(fd, "id"));
  if (error) fail(back, error.message);
  done(back, "Task removed from the template.");
}

// ---------- comments ----------
export async function addComment(fd: FormData) {
  const me = await requireProfile();
  const taskId = str(fd, "task_id");
  const path = `/tasks/${taskId}`;
  const body = str(fd, "body");
  if (!body) fail(path, "Write a comment first.");
  const people = await getPeople();
  const mentions = [...new Set(fd.getAll("mention").map(String))].filter((id) => {
    const p = people.find((x) => x.id === id);
    return p && p.active && p.id !== me.id && body.includes(`@${p.full_name}`);
  });
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ task_id: taskId, body, author_id: me.id, mentions });
  if (error) fail(path, error.message);
  done(path);
}

export async function deleteComment(fd: FormData) {
  await requireAdmin();
  const taskId = str(fd, "task_id");
  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", str(fd, "id"));
  if (error) fail(`/tasks/${taskId}`, error.message);
  done(`/tasks/${taskId}`);
}

// ---------- time ----------
export async function logTime(fd: FormData) {
  const me = await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const hours = Number.parseFloat(str(fd, "hours"));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) fail(back, "Hours must be between 0 and 24.");
  const taskId = opt(fd, "task_id");
  const projectId = opt(fd, "project_id");
  if (!taskId && !projectId) fail(back, "Pick a project or task.");
  const supabase = await createClient();

  let resolvedProject = projectId;
  if (taskId) {
    const { data: t } = await supabase.from("tasks").select("project_id").eq("id", taskId).single();
    resolvedProject = t?.project_id ?? projectId;
  }
  const { error } = await supabase.from("time_entries").insert({
    task_id: taskId,
    project_id: resolvedProject,
    user_id: me.id,
    work_date: optDate(fd, "work_date") ?? undefined,
    hours,
    hour_type: oneOf(str(fd, "hour_type"), HOUR_TYPES, "billable"),
    note: opt(fd, "note"),
  });
  if (error) fail(back, error.message);
  done(back, `Logged ${hours} h.`);
}

/** Edit a time entry: your own, or anyone's if you're an admin (enforced by RLS). */
export async function updateTime(fd: FormData) {
  await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const hours = Number.parseFloat(str(fd, "hours"));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) fail(back, "Hours must be between 0 and 24.");
  const workDate = optDate(fd, "work_date");
  if (!workDate) fail(back, "Pick a date.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .update({
      work_date: workDate,
      hours,
      hour_type: oneOf(str(fd, "hour_type"), HOUR_TYPES, "billable"),
      note: opt(fd, "note"),
    })
    .eq("id", str(fd, "id"))
    .select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, "You can only edit your own time entries.");
  done(back, "Time entry updated.");
}

/** Remove a time entry: your own, or anyone's if you're an admin (enforced by RLS). */
export async function deleteTime(fd: FormData) {
  await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_entries").delete().eq("id", str(fd, "id")).select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, "You can only remove your own time entries.");
  done(back, "Time entry removed.");
}

// ---------- timesheets ----------
export async function submitTimesheet(fd: FormData) {
  await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_timesheet", { p_week: str(fd, "week") });
  if (error) fail(back, error.message);
  done(back, "Week submitted. Its time is locked until an admin approves or returns it.");
}

export async function recallTimesheet(fd: FormData) {
  await requireProfile();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const supabase = await createClient();
  const { error } = await supabase.rpc("recall_timesheet", { p_week: str(fd, "week") });
  if (error) fail(back, error.message);
  done(back, "Week recalled. You can change its time and submit again.");
}

export async function decideTimesheet(fd: FormData) {
  await requireAdmin();
  const back = safePath(str(fd, "redirect_to"), "/time/approvals");
  const approve = str(fd, "decision") === "approve";
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_timesheet", {
    p_id: str(fd, "id"),
    p_approve: approve,
    p_note: opt(fd, "note"),
  });
  if (error) fail(back, error.message);
  done(back, approve ? "Timesheet approved." : "Timesheet returned with your note.");
}

export async function reopenTimesheet(fd: FormData) {
  await requireAdmin();
  const back = safePath(str(fd, "redirect_to"), "/time/approvals");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_timesheet", { p_id: str(fd, "id") });
  if (error) fail(back, error.message);
  done(back, "Timesheet reopened. Its time can be changed again.");
}

// ---------- inbox ----------
export async function markAllRead() {
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", me.id)
    .is("read_at", null);
  done("/inbox");
}

// ---------- people (admin) ----------
export async function updateMember(fd: FormData) {
  const me = await requireAdmin();
  const id = str(fd, "id");
  const role = str(fd, "role") === "admin" ? "admin" : "member";
  const active = str(fd, "active") === "on";
  if (id === me.id && (role !== "admin" || !active)) {
    fail("/admin", "You can't remove your own admin access. Ask another admin.");
  }
  const weeklyHours = Number.parseFloat(str(fd, "weekly_hours"));
  if (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 80) {
    fail("/admin", "Weekly hours must be between 0 and 80.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: str(fd, "full_name") || undefined, job_role: opt(fd, "job_role"), role, active, weekly_hours: weeklyHours })
    .eq("id", id);
  if (error) fail("/admin", error.message);
  done("/admin", "Saved.");
}
