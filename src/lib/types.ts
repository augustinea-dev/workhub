export type UserRole = "admin" | "member";
export type ProjectStatus = "planning" | "active" | "on_hold" | "complete" | "cancelled";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type HourType = "billable" | "non_billable" | "admin" | "meeting" | "pto";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  weekly_hours: number;
  /** Present when loaded with getPeople(). */
  job_roles?: { role_id: string; is_main: boolean }[];
};

export type JobRole = { id: string; name: string; active: boolean; sort_order: number };

/** An open role on a task (or template task) that nobody has taken yet. */
export type RoleSlot = { id: string; role_id: string };

export type Company = {
  id: string;
  name: string;
  project_label: string | null;
  fiscal_year_start_month: number | null;
};

export type ProjectType = { code: string; label: string; description: string | null; active: boolean; sort_order: number };

export type Project = {
  id: string;
  name: string;
  company_id: string | null;
  owner_id: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
  reference_number: number | null;
  billing_year: string | null;
  name_on_project: string | null;
  title: string | null;
  project_type: string | null;
  cost_code: string | null;
  name_locked: boolean;
  version: number;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_ids: string[];
  open_roles: RoleSlot[];
  status: TaskStatus;
  is_milestone: boolean;
  parent_task_id: string | null;
  milestone_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  sort_order: number;
  completed_at: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  mentions: string[];
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
  timesheet_id: string | null;
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

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  updated_at: string;
};

export type TemplateTask = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  start_day: number;
  due_day: number;
  estimate_hours: number | null;
  is_milestone: boolean;
  milestone_id: string | null;
  assignee_ids: string[];
  open_roles: RoleSlot[];
  sort_order: number;
  version: number;
};

export type TimesheetStatus = "open" | "submitted" | "approved" | "returned";

export type Timesheet = {
  id: string;
  user_id: string;
  week_start: string;
  status: TimesheetStatus;
  total_hours: number | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  return_note: string | null;
};

export type Team = { id: string; name: string; manager_id: string | null; active: boolean; member_ids: string[] };

export const NOTIFICATION_KINDS: { kind: string; label: string; help: string; locked?: boolean }[] = [
  { kind: "task_assigned", label: "Assigned to a task", help: "Someone adds you to a task." },
  { kind: "task_comment", label: "New updates", help: "Someone posts on a task you're on, own, or have posted on." },
  { kind: "mention", label: "@Mentions", help: "Someone mentions you, or a team you're in, in an update." },
  { kind: "timesheet_approved", label: "Timesheet approved", help: "Your submitted week is approved." },
  { kind: "timesheet_reopened", label: "Timesheet reopened", help: "An approved week is reopened for changes." },
  { kind: "timesheet_returned", label: "Timesheet returned", help: "Your week is sent back with a note. Always on, so it isn't missed.", locked: true },
];
