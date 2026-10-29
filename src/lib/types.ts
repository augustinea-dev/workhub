export type UserRole = "admin" | "member";
export type ProjectStatus = "planning" | "active" | "on_hold" | "complete" | "cancelled";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type HourType = "billable" | "non_billable" | "admin" | "meeting" | "pto";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  job_role: string | null;
  active: boolean;
};

export type Company = { id: string; name: string };

export type Project = {
  id: string;
  name: string;
  company_id: string | null;
  owner_id: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
  version: number;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  is_milestone: boolean;
  due_date: string | null;
  estimate_hours: number | null;
  version: number;
  updated_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  task_id: string | null;
  project_id: string;
  user_id: string;
  work_date: string;
  hours: number;
  hour_type: HourType;
  note: string | null;
};

export type NotificationEvent = {
  id: string;
  kind: string;
  summary: string;
  task_id: string | null;
  project_id: string | null;
  read_at: string | null;
  created_at: string;
};

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

export const HOUR_TYPES: { value: HourType; label: string }[] = [
  { value: "billable", label: "Billable" },
  { value: "non_billable", label: "Non-billable" },
  { value: "admin", label: "Admin" },
  { value: "meeting", label: "Meeting" },
  { value: "pto", label: "PTO" },
];
