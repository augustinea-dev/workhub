import type { TaskStatus } from "@/lib/types";

type MilestoneTask = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  is_milestone: boolean;
  milestone_id: string | null;
};

export type Health = { state: "done" | "late" | "at_risk" | "on_track"; reason?: string };

export type MilestoneGroup<T extends MilestoneTask> = {
  milestone: T;
  tasks: T[];
  done: number;
  health: Health;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Late if its date has passed; at risk if any open task is overdue or due after it. */
export function milestoneHealth(
  milestone: Pick<MilestoneTask, "status" | "due_date">,
  tasks: Pick<MilestoneTask, "status" | "due_date">[],
  today: string,
): Health {
  if (milestone.status === "done") return { state: "done" };
  if (milestone.due_date && milestone.due_date < today) return { state: "late", reason: "Date has passed" };
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const after = milestone.due_date
    ? open.filter((t) => t.due_date && t.due_date > milestone.due_date!).length
    : 0;
  const reasons = [
    overdue && `${plural(overdue, "task")} overdue`,
    after && `${plural(after, "task")} due after it`,
  ].filter(Boolean);
  return reasons.length ? { state: "at_risk", reason: reasons.join(", ") } : { state: "on_track" };
}

/** Milestones in date order (undated last), each with its tasks and health. */
export function groupByMilestone<T extends MilestoneTask>(all: T[], today: string): MilestoneGroup<T>[] {
  return all
    .filter((t) => t.is_milestone)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .map((m) => {
      const tasks = all.filter((t) => t.milestone_id === m.id);
      return {
        milestone: m,
        tasks,
        done: tasks.filter((t) => t.status === "done").length,
        health: milestoneHealth(m, tasks, today),
      };
    });
}

/** The earliest milestone that isn't done yet. */
export function nextMilestone<T extends MilestoneTask>(all: T[], today: string): MilestoneGroup<T> | null {
  return groupByMilestone(all, today).find((g) => g.milestone.status !== "done") ?? null;
}
