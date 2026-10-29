import type { ProjectStatus, TaskStatus } from "@/lib/types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return error ? (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {error}
    </div>
  ) : (
    <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {notice}
    </div>
  );
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
