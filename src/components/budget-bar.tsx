import type { Budget } from "@/lib/budget";

const BUDGET_TONE = { none: "", ok: "bg-emerald-500", near: "bg-amber-500", over: "bg-red-600" };

export function BudgetBar({ budget, pending = 0 }: { budget: Budget; pending?: number }) {
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
        {Math.abs(pending) >= 0.05 && (
          <span className="font-semibold text-stone-900"> · {pending > 0 ? "+" : "−"}{h(Math.abs(pending))} h unsaved</span>
        )}
      </span>
    </span>
  );
}
