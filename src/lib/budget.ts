import type { HourType } from "@/lib/types";

export type Budget = {
  planned: number | null;
  logged: number;
  pct: number | null;
  state: "none" | "ok" | "near" | "over";
};

export function projectBudget(
  tasks: { parent_task_id: string | null; estimate_hours: number | string | null }[],
  time: { hours: number | string; hour_type: HourType }[],
): Budget {
  const estimates = tasks.filter((t) => !t.parent_task_id && t.estimate_hours != null).map((t) => Number(t.estimate_hours));
  const planned = estimates.length ? estimates.reduce((s, h) => s + h, 0) : null;
  const logged = time.filter((t) => t.hour_type !== "pto").reduce((s, t) => s + Number(t.hours), 0);
  return budgetOf(planned, logged);
}

export function budgetOf(planned: number | null, logged: number): Budget {
  if (!planned) return { planned, logged, pct: null, state: "none" };
  const pct = (logged / planned) * 100;
  return { planned, logged, pct, state: pct > 100 ? "over" : pct >= 75 ? "near" : "ok" };
}
