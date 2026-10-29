"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireProfile } from "@/lib/session";
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
  await requireProfile();
  const name = str(fd, "name");
  if (!name) fail("/clients", "Enter a client name.");
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ name });
  if (error) fail("/clients", error.code === "23505" ? `${name} already exists.` : error.message);
  done("/clients", `Added ${name}.`);
}

// ---------- projects ----------
export async function createProject(fd: FormData) {
  const me = await requireProfile();
  const name = str(fd, "name");
  if (!name) fail("/projects", "Enter a project name.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      company_id: opt(fd, "company_id"),
      owner_id: opt(fd, "owner_id") ?? me.id,
      due_date: optDate(fd, "due_date"),
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) fail("/projects", error?.message ?? "Couldn't create the project.");
  done(`/projects/${data.id}`, "Project created.");
}

export async function updateProject(fd: FormData) {
  await requireProfile();
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
  await requireProfile();
  const projectId = str(fd, "project_id");
  const back = safePath(str(fd, "redirect_to"), `/projects/${projectId}`);
  const title = str(fd, "title");
  if (!title) fail(back, "Enter a task title.");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    title,
    assignee_id: opt(fd, "assignee_id"),
    due_date: optDate(fd, "due_date"),
    is_milestone: str(fd, "is_milestone") === "on",
  });
  if (error) fail(back, error.message);
  done(back, `Added “${title}”.`);
}

export async function updateTask(fd: FormData) {
  await requireProfile();
  const id = str(fd, "id");
  const path = `/tasks/${id}`;
  const title = str(fd, "title");
  if (!title) fail(path, "Task title can't be empty.");
  const estimate = Number.parseFloat(str(fd, "estimate_hours"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title,
      description: opt(fd, "description"),
      status: oneOf(str(fd, "status"), TASK_STATUSES, "todo"),
      assignee_id: opt(fd, "assignee_id"),
      due_date: optDate(fd, "due_date"),
      estimate_hours: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
      is_milestone: str(fd, "is_milestone") === "on",
    })
    .eq("id", id)
    .eq("version", int(fd, "version"))
    .select("id");
  if (error) fail(path, error.message);
  if (!data?.length) fail(path, CONFLICT);
  done(path, "Task saved.");
}

/** Quick status change from a list; same version check as the full edit. */
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
  if (!data?.length) fail(back, "That task was just changed by someone else. The list is refreshed — try again.");
  done(back);
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

// ---------- comments ----------
export async function addComment(fd: FormData) {
  const me = await requireProfile();
  const taskId = str(fd, "task_id");
  const path = `/tasks/${taskId}`;
  const body = str(fd, "body");
  if (!body) fail(path, "Write a comment first.");
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ task_id: taskId, body, author_id: me.id });
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

export async function deleteTime(fd: FormData) {
  await requireAdmin();
  const back = safePath(str(fd, "redirect_to"), "/time");
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_entries").delete().eq("id", str(fd, "id")).select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, "Only an admin can remove time entries.");
  done(back, "Time entry removed.");
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: str(fd, "full_name") || undefined, job_role: opt(fd, "job_role"), role, active })
    .eq("id", id);
  if (error) fail("/admin", error.message);
  done("/admin", "Saved.");
}
