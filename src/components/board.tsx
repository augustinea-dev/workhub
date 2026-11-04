"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveTask } from "@/app/(app)/actions";
import { TASK_STATUSES, type TaskStatus } from "@/lib/types";

export type BoardCard = {
  id: string;
  title: string;
  status: TaskStatus;
  version: number;
  isMilestone: boolean;
  milestone: string | null;
  parent: string | null;
  assignee: string;
  isMine: boolean;
  due: string | null;
  late: boolean;
  hours: string | null;
  canMove: boolean;
};

const DONE_LIMIT = 10;

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

/** Cards are passed in display order; Done should be most recently finished first. */
export function Board({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [, startTransition] = useTransition();
  const [shown, applyMove] = useOptimistic(cards, (state, m: { id: string; status: TaskStatus }) =>
    state.map((c) => (c.id === m.id ? { ...c, status: m.status } : c)),
  );
  const dragged = shown.find((c) => c.id === dragId);

  function move(card: BoardCard, status: TaskStatus) {
    if (!card.canMove || card.status === status) return;
    setError(null);
    startTransition(async () => {
      applyMove({ id: card.id, status });
      const res = await moveTask(card.id, card.version, status);
      if (res.error) {
        setError(res.error);
        router.refresh();
      }
    });
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((col) => {
          const all = shown.filter((c) => c.status === col.value);
          const items = col.value === "done" && !showAllDone ? all.slice(0, DONE_LIMIT) : all;
          const isOver = over === col.value && dragged && dragged.status !== col.value;
          return (
            <section
              key={col.value}
              aria-label={`${col.label}, ${all.length} tasks`}
              onDragOver={(e) => {
                if (!dragged?.canMove) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(col.value);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragged) move(dragged, col.value);
              }}
              className={`flex min-h-40 flex-col rounded-xl p-2 transition-colors ${
                isOver ? "bg-blue-50 ring-2 ring-blue-600/30" : "bg-stone-100"
              }`}
            >
              <h3 className="flex items-center justify-between px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-600">
                {col.label}
                <span className="rounded-full bg-white px-2 py-0.5 font-medium text-stone-500">{all.length}</span>
              </h3>
              <ul className="flex flex-1 flex-col gap-2">
                {items.map((c) => (
                  <li
                    key={c.id}
                    draggable={c.canMove}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    className={`rounded-lg border border-stone-200 bg-white p-3 shadow-sm ${
                      c.canMove ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    {c.milestone && <p className="mb-1 truncate text-xs text-stone-500">◆ {c.milestone}</p>}
                    {c.parent && <p className="mb-1 truncate text-xs text-stone-500">↳ {c.parent}</p>}
                    <Link
                      href={`/tasks/${c.id}`}
                      draggable={false}
                      className={`block text-sm font-medium hover:underline ${c.status === "done" ? "text-stone-500" : ""}`}
                    >
                      {c.isMilestone && <span title="Milestone">◆ </span>}
                      {c.title}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      <span className={c.isMine ? "font-medium text-stone-900" : undefined}>{c.assignee}</span>
                      {c.due && (
                        <span className={c.late ? "font-medium text-red-700" : undefined}>
                          {c.late ? `Overdue, ${c.due}` : `Due ${c.due}`}
                        </span>
                      )}
                      {c.hours && <span>{c.hours}</span>}
                    </div>
                    {c.canMove ? (
                      <select
                        aria-label={`Status for ${c.title}`}
                        value={c.status}
                        onChange={(e) => move(c, e.target.value as TaskStatus)}
                        className="mt-2 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-2 flex items-center gap-1 text-xs text-stone-400" title="Only the assignee or an Admin can move this card">
                        <LockIcon /> Assignee or Admin can move
                      </p>
                    )}
                  </li>
                ))}
                {all.length === 0 && (
                  <li className="rounded-lg border border-dashed border-stone-300 px-3 py-6 text-center text-xs text-stone-400">
                    {dragged?.canMove ? "Drop here" : "No tasks"}
                  </li>
                )}
              </ul>
              {col.value === "done" && all.length > DONE_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllDone((v) => !v)}
                  className="mt-2 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-white"
                >
                  {showAllDone ? "Show recent only" : `Show all ${all.length}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
