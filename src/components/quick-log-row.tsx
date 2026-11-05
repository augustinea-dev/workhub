"use client";

import { useState } from "react";
import { logTime } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/client";
import { HOUR_TYPES } from "@/lib/types";

/** A task row with a "Log time" button that opens a small form underneath it. */
export function QuickLogRow({
  taskId,
  title,
  today,
  columns,
  children,
}: {
  taskId: string;
  title: string;
  today: string;
  /** Number of cells in `children`, so the form row spans the table. */
  columns: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={open ? "bg-stone-50" : "hover:bg-stone-50"}>
        {children}
        <td className="table-cell text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="btn whitespace-nowrap px-2.5 py-1 text-xs"
          >
            {open ? "Close" : "Log time"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-stone-50">
          <td colSpan={columns + 1} className="border-b border-stone-200 px-4 pb-4 pt-1">
            <form
              action={async (fd) => {
                setOpen(false);
                await logTime(fd);
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="task_id" value={taskId} />
              <input type="hidden" name="redirect_to" value="/" />
              <div className="w-40">
                <label className="label" htmlFor={`ql_date_${taskId}`}>Date</label>
                <input id={`ql_date_${taskId}`} name="work_date" type="date" defaultValue={today} max={today} className="input w-full" />
              </div>
              <div className="w-24">
                <label className="label" htmlFor={`ql_hours_${taskId}`}>Hours</label>
                <input
                  id={`ql_hours_${taskId}`}
                  name="hours"
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  required
                  autoFocus
                  className="input w-full"
                />
              </div>
              <div className="w-36">
                <label className="label" htmlFor={`ql_type_${taskId}`}>Type</label>
                <select id={`ql_type_${taskId}`} name="hour_type" defaultValue="billable" className="input w-full">
                  {HOUR_TYPES.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor={`ql_note_${taskId}`}>Note</label>
                <input id={`ql_note_${taskId}`} name="note" placeholder={`What you did on ${title}`} className="input w-full" />
              </div>
              <SubmitButton pendingText="Logging…">Log time</SubmitButton>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
