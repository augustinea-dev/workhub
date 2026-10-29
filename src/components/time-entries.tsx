"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteTime, updateTime } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/client";
import { HOUR_TYPES, type HourType } from "@/lib/types";

export type TimeRow = {
  id: string;
  user_id: string;
  work_date: string;
  hours: number;
  hour_type: HourType;
  note: string | null;
  personName: string;
  dayLabel: string;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
};

const GRID = "grid grid-cols-[7.5rem_10rem_4.5rem_7rem_minmax(12rem,1fr)_6.5rem] gap-3 items-start";

/**
 * Time entries with column headers. Notes are shown in full. Each row can be
 * opened to edit or removed by its owner (or an admin); the database enforces the same rule.
 */
export function TimeEntryTable({
  rows,
  meId,
  isAdmin,
  redirectTo,
  second,
}: {
  rows: TimeRow[];
  meId: string;
  isAdmin: boolean;
  redirectTo: string;
  /** What the second column shows: the person (on a task) or the project / task (on the Time page). */
  second: "person" | "work";
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className={`${GRID} border-b border-stone-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-stone-500`}>
          <span>Date</span>
          <span>{second === "person" ? "Person" : "Project / task"}</span>
          <span className="text-right">Hours</span>
          <span>Type</span>
          <span>Note</span>
          <span className="sr-only">Actions</span>
        </div>
        {rows.map((r) => (
          <Row
            key={r.id}
            r={r}
            canEdit={isAdmin || r.user_id === meId}
            redirectTo={redirectTo}
            second={second}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  r,
  canEdit,
  redirectTo,
  second,
}: {
  r: TimeRow;
  canEdit: boolean;
  redirectTo: string;
  second: "person" | "work";
}) {
  const [editing, setEditing] = useState(false);
  const typeLabel = HOUR_TYPES.find((h) => h.value === r.hour_type)?.label;

  return (
    <div className="border-b border-stone-100">
      <div className={`${GRID} px-4 py-2 text-sm`}>
        <span className="text-stone-600">{r.dayLabel}</span>
        <span className="min-w-0">
          {second === "person" ? (
            r.personName
          ) : (
            <>
              {r.project && (
                <Link href={`/projects/${r.project.id}`} className="hover:underline">
                  {r.project.name}
                </Link>
              )}
              {r.task && (
                <>
                  <span className="text-stone-400"> / </span>
                  <Link href={`/tasks/${r.task.id}`} className="text-stone-600 hover:underline">
                    {r.task.title}
                  </Link>
                </>
              )}
            </>
          )}
        </span>
        <span className="text-right font-medium tabular-nums">{Number(r.hours).toFixed(2)}</span>
        <span className="text-stone-600">{typeLabel}</span>
        <span className="whitespace-pre-wrap break-words text-stone-700">{r.note || <span className="text-stone-400">—</span>}</span>
        <span className="text-right">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs font-medium text-blue-700 hover:underline"
              aria-expanded={editing}
            >
              {editing ? "Close" : "Edit"}
            </button>
          )}
        </span>
      </div>

      {editing && (
        <div className="bg-stone-50 px-4 py-3">
          <form action={updateTime} className="grid gap-2 md:grid-cols-[9rem_6rem_9rem_1fr]">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <label className="text-xs text-stone-600">
              Date
              <input name="work_date" type="date" defaultValue={r.work_date} required className="input mt-1 w-full" />
            </label>
            <label className="text-xs text-stone-600">
              Hours
              <input
                name="hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                defaultValue={Number(r.hours)}
                required
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-xs text-stone-600">
              Type
              <select name="hour_type" defaultValue={r.hour_type} className="input mt-1 w-full">
                {HOUR_TYPES.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-600">
              Note
              <textarea name="note" rows={2} defaultValue={r.note ?? ""} className="input mt-1 w-full" />
            </label>
            <div className="flex items-center gap-2 md:col-span-4">
              <SubmitButton>Save changes</SubmitButton>
              <button type="button" onClick={() => setEditing(false)} className="btn">
                Cancel
              </button>
            </div>
          </form>
          <form action={deleteTime} className="mt-2">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <button className="btn-danger">Remove this entry</button>
          </form>
        </div>
      )}
    </div>
  );
}
