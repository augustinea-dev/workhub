import Link from "next/link";
import { startTimer } from "@/app/(app)/actions";
import { SubmitButton, Toast } from "@/components/client";
import { projectColor } from "@/lib/colors";
import type { Budget } from "@/lib/budget";
import type { Health } from "@/lib/milestones";
import type { ProjectStatus, TaskStatus, TimesheetStatus } from "@/lib/types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return <Toast key={`${error ?? ""}|${notice ?? ""}`} error={error} notice={notice} />;
}

const TASK_TONE: Record<TaskStatus, string> = {
  todo: "bg-stone-100 text-stone-700",
  in_progress: "bg-blue-50 text-blue-800",
  in_review: "bg-amber-50 text-amber-800",
  done: "bg-emerald-50 text-emerald-800",
};

const PROJECT_TONE: Record<ProjectStatus, string> = {
  planning: "bg-stone-100 text-stone-700",
  active: "bg-blue-50 text-blue-800",
  on_hold: "bg-amber-50 text-amber-800",
  complete: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-stone-100 text-stone-500 line-through",
};

export function TaskBadge({ status }: { status: TaskStatus }) {
  const label = TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TASK_TONE[status]}`}>{label}</span>;
}

export function ProjectBadge({ status }: { status: ProjectStatus }) {
  const label = PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_TONE[status]}`}>{label}</span>;
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-stone-500">{children}</p>;
}

export function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-stone-200/70 ${className}`} />;
}

const HEALTH: Record<Health["state"], { label: string; tone: string }> = {
  on_track: { label: "On track", tone: "bg-emerald-50 text-emerald-800" },
  at_risk: { label: "At risk", tone: "bg-amber-50 text-amber-800" },
  late: { label: "Late", tone: "bg-red-50 text-red-800" },
  done: { label: "Done", tone: "bg-stone-100 text-stone-600" },
};

const BUDGET_TONE = { none: "", ok: "bg-emerald-500", near: "bg-amber-500", over: "bg-red-600" };

export function BudgetBar({ budget }: { budget: Budget }) {
  const h = (n: number) => +n.toFixed(1);
  if (budget.planned == null || budget.pct == null) {
    return <span className="text-stone-400">No task estimates yet</span>;
  }
  const over = budget.logged - budget.planned;
  return (
    <span className="inline-flex items-center gap-2" title="Hours logged (not counting PTO) against the task estimates">
      <span
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(budget.pct, 100))}
        className="relative inline-block h-2 w-28 overflow-hidden rounded-full bg-stone-200"
      >
        <span className={`absolute inset-y-0 left-0 ${BUDGET_TONE[budget.state]}`} style={{ width: `${Math.min(budget.pct, 100)}%` }} />
      </span>
      <span className={budget.state === "over" ? "font-medium text-red-700" : budget.state === "near" ? "font-medium text-amber-800" : ""}>
        {h(budget.logged)} of {h(budget.planned)} h · {Math.round(budget.pct)}%
        {budget.state === "over" && ` (${h(over)} h over)`}
      </span>
    </span>
  );
}

export function HealthBadge({ health, showReason }: { health: Health; showReason?: boolean }) {
  const h = HEALTH[health.state];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span title={health.reason} className={`rounded-full px-2 py-0.5 text-xs font-medium ${h.tone}`}>{h.label}</span>
      {showReason && health.reason && <span className="text-xs text-stone-500">{health.reason}</span>}
    </span>
  );
}

const TIMESHEET: Record<TimesheetStatus, { label: string; tone: string }> = {
  open: { label: "Open", tone: "bg-stone-100 text-stone-700" },
  submitted: { label: "Submitted", tone: "bg-blue-50 text-blue-800" },
  approved: { label: "Approved", tone: "bg-emerald-50 text-emerald-800" },
  returned: { label: "Returned", tone: "bg-amber-50 text-amber-800" },
};

export function TimesheetBadge({ status }: { status: TimesheetStatus }) {
  const t = TIMESHEET[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.tone}`}>{t.label}</span>;
}

export function ProjectDot({ id, size = "sm" }: { id: string; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded ${size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`}
      style={{ backgroundColor: projectColor(id) }}
    />
  );
}

export function TimerButton({ taskId, runningTaskId, redirectTo }: { taskId: string; runningTaskId: string | null; redirectTo: string }) {
  if (runningTaskId === taskId) {
    return (
      <Link href="/timer" className="btn whitespace-nowrap border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 hover:bg-emerald-100">
        Timing · Stop
      </Link>
    );
  }
  return (
    <form action={startTimer}>
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <SubmitButton pendingText="Starting…" className="btn whitespace-nowrap px-2.5 py-1 text-xs">
        Start timer
      </SubmitButton>
    </form>
  );
}
