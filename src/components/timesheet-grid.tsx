"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { saveTimesheetWeek } from "@/app/(app)/actions";
import { BudgetBar } from "@/components/budget-bar";
import { SubmitButton } from "@/components/client";
import { budgetOf } from "@/lib/budget";

export type GridCell = { hours: number; note: string | null; count: number };
export type GridRow = {
  key: string;
  label: string;
  href?: string;
  group: string;
  groupClient?: string;
  groupTitle?: string;
  groupHref?: string;
  projectId?: string;
  kind: "task" | "project" | "category";
  roleId: string | null;
  allocation?: { share: number; logged: number };
  locked?: string;
  cells: Record<string, GridCell>;
};
export type AddableTask = { key: string; label: string; group: string; groupClient?: string; groupTitle?: string; groupHref?: string; projectId: string; href: string; roleId: string | null };
export type ProjectBudgets = Record<string, { planned: number | null; logged: number }>;

type Cell = { key: string; day: string };
type NoteAt = Cell & { top: number; left: number; above: boolean };

type Group = { name: string; client?: string; title?: string; href?: string; projectId?: string; rows: GridRow[] };

const fmt = (n: number) => (Math.abs(n) < 0.005 ? "" : (+n.toFixed(2)).toString());

export function TimesheetGrid({
  week,
  userId,
  redirectTo,
  days,
  dayLabels,
  rows: initialRows,
  addable,
  roles,
  editable,
  holidayKey,
  holidayFill,
  closedDays,
  budgets,
}: {
  week: string;
  userId: string;
  redirectTo: string;
  days: string[];
  dayLabels: string[];
  rows: GridRow[];
  addable: AddableTask[];
  roles: { id: string; name: string }[];
  editable: boolean;
  holidayKey: string | null;
  holidayFill: number;
  closedDays: string[];
  budgets: ProjectBudgets;
}) {
  const [added, setAdded] = useState<GridRow[]>([]);
  const rows = useMemo(() => [...initialRows, ...added], [initialRows, added]);
  const original = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of initialRows) for (const d of days) m[`${r.key}|${d}`] = fmt(r.cells[d]?.hours ?? 0);
    return m;
  }, [initialRows, days]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const m = { ...original };
    if (editable && holidayKey && holidayFill > 0) {
      const row = initialRows.find((r) => r.key === holidayKey);
      for (const d of closedDays) if (row && !(row.cells[d]?.count ?? 0)) m[`${holidayKey}|${d}`] = fmt(holidayFill);
    }
    return m;
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rolePick, setRolePick] = useState<Record<string, string>>({});
  const [noteAt, setNoteAt] = useState<NoteAt | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const openCell = useRef<Cell | null>(null);
  const popover = useRef<HTMLDivElement | null>(null);

  const place = useCallback((cell: Cell, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = 320;
    const above = r.bottom + 150 > window.innerHeight - 90;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    setNoteAt({ ...cell, left, top: above ? r.top - 6 : r.bottom + 6, above });
  }, []);
  const openNote = (cell: Cell, el: HTMLElement) => {
    anchor.current = el;
    openCell.current = cell;
    place(cell, el);
  };
  const closeNote = (refocus: boolean) => {
    if (refocus && noteAt) {
      document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(`h|${noteAt.key}|${noteAt.day}`)}"]`)?.focus();
    }
    setNoteAt(null);
    anchor.current = null;
    openCell.current = null;
  };

  const isNoteOpen = noteAt !== null;
  useEffect(() => {
    if (!isNoteOpen) return;
    const follow = () => anchor.current && openCell.current && place(openCell.current, anchor.current);
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popover.current?.contains(t) || anchor.current?.contains(t)) return;
      setNoteAt(null);
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      document.removeEventListener("mousedown", outside);
    };
  }, [isNoteOpen, place]);
  const [pick, setPick] = useState("");
  const [touched, setTouched] = useState(false);

  const num = (k: string) => {
    const n = Number.parseFloat(values[k] ?? "");
    return Number.isFinite(n) ? n : 0;
  };
  const dirty =
    Object.keys(values).some((k) => (values[k] ?? "") !== (original[k] ?? "")) || Object.keys(notes).length > 0 || Object.keys(rolePick).length > 0;

  useEffect(() => {
    if (!dirty || !editable || !touched) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editable, touched]);

  const groups: Group[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.name === r.group);
    if (g) g.rows.push(r);
    else groups.push({ name: r.group, client: r.groupClient, title: r.groupTitle, href: r.groupHref, projectId: r.projectId, rows: [r] });
  }
  const pendingFor = (g: { rows: GridRow[] }) =>
    g.rows.reduce((s, r) => s + days.reduce((t, d) => t + num(`${r.key}|${d}`) - (Number.parseFloat(original[`${r.key}|${d}`] ?? "") || 0), 0), 0);
  const dayTotal = (d: string) => rows.reduce((s, r) => s + num(`${r.key}|${d}`), 0);
  const weekTotal = days.reduce((s, d) => s + dayTotal(d), 0);
  const noteFor = (key: string, day: string) => notes[`${key}|${day}`] ?? rows.find((r) => r.key === key)?.cells[day]?.note ?? "";
  const noteRow = noteAt ? rows.find((r) => r.key === noteAt.key) : null;
  const options = addable.filter((t) => !rows.some((r) => r.key === t.key));

  return (
    <form action={saveTimesheetWeek} className="card mb-6">
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {Object.entries(notes).map(([k, v]) => (
        <input key={k} type="hidden" name={`n|${k}`} value={v} />
      ))}
      {Object.entries(rolePick).map(([k, v]) => (
        <input key={k} type="hidden" name={`r|${k}`} value={v} />
      ))}

      <div className="overflow-x-auto rounded-t-xl">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>
              <th className="table-head w-[30%]">Name</th>
              <th className="table-head w-40">Job role</th>
              {days.map((d, i) => (
                <th key={d} className={`table-head text-center ${closedDays.includes(d) ? "bg-amber-50" : ""}`}>
                  {dayLabels[i]}
                </th>
              ))}
              <th className="table-head text-right">Total</th>
            </tr>
            <tr className="border-b border-stone-200 bg-stone-50">
              <td className="table-cell text-right font-medium text-stone-600" colSpan={2}>Totals</td>
              {days.map((d) => (
                <td key={d} className="table-cell text-center font-semibold tabular-nums">{fmt(dayTotal(d))}</td>
              ))}
              <td className="table-cell text-right font-semibold tabular-nums">{fmt(weekTotal) || "0"}</td>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.name}
                group={g}
                budget={g.projectId ? budgets[g.projectId] : undefined}
                pending={g.projectId ? pendingFor(g) : 0}
                days={days}
                roles={roles}
                editable={editable}
                values={values}
                original={original}
                setValue={(k, v) => {
                  setTouched(true);
                  setValues((m) => ({ ...m, [k]: v }));
                }}
                roleOf={(r) => rolePick[r.key] ?? r.roleId ?? ""}
                setRole={(key, v) => {
                  setTouched(true);
                  setRolePick((m) => ({ ...m, [key]: v }));
                }}
                noteFor={noteFor}
                noteAt={noteAt}
                openNote={openNote}
                closedDays={closedDays}
                num={num}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="sticky bottom-0 z-10 rounded-b-xl border-t border-stone-200 bg-white shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {options.length > 0 && (
                <>
                  <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a task to this week" className="input max-w-80 py-1.5">
                    <option value="">Add a task…</option>
                    {[...new Set(options.map((o) => o.group))].map((g) => (
                      <optgroup key={g} label={g}>
                        {options.filter((o) => o.group === g).map((o) => (
                          <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn py-1.5"
                    disabled={!pick}
                    onClick={() => {
                      const t = addable.find((o) => o.key === pick);
                      if (!t) return;
                      setAdded((a) => [...a, { key: t.key, label: t.label, href: t.href, group: t.group, groupClient: t.groupClient, groupTitle: t.groupTitle, groupHref: t.groupHref, projectId: t.projectId, kind: "task", roleId: t.roleId, cells: {} }]);
                      setPick("");
                    }}
                  >
                    Add
                  </button>
                </>
              )}
              <span className="text-xs text-stone-400">
                To add a note, select the pencil on an hours box or press Enter in it. Planning time off? Go to that week and enter the hours in Vacation or Sick Leave.
              </span>
            </div>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs font-medium text-amber-800">Unsaved changes</span>}
              <SubmitButton pendingText="Saving…">Save week</SubmitButton>
            </div>
          </div>
        </div>
      )}
      {editable && noteAt && noteRow && (
        <div
          ref={popover}
          role="dialog"
          aria-label="Time entry note"
          className="fixed z-30 w-80 rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
          style={{ left: noteAt.left, top: noteAt.top, transform: noteAt.above ? "translateY(-100%)" : undefined }}
        >
          <label htmlFor="grid_note" className="mb-1.5 block text-xs font-medium text-stone-600">
            Note for {noteRow.label}, {dayLabels[days.indexOf(noteAt.day)]}
          </label>
          <textarea
            id="grid_note"
            autoFocus
            rows={2}
            value={noteFor(noteAt.key, noteAt.day)}
            onChange={(e) => {
              setTouched(true);
              setNotes((m) => ({ ...m, [`${noteAt.key}|${noteAt.day}`]: e.target.value }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                e.preventDefault();
                closeNote(true);
              }
            }}
            placeholder="What you did (optional)"
            className="input w-full resize-none py-1.5"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-stone-400">Enter to close. Saved with the week.</span>
            <button type="button" className="btn py-1" onClick={() => closeNote(true)}>Done</button>
          </div>
        </div>
      )}
    </form>
  );
}

function GroupRows({
  group,
  budget,
  pending,
  days,
  roles,
  editable,
  values,
  original,
  setValue,
  roleOf,
  setRole,
  noteFor,
  noteAt,
  openNote,
  closedDays,
  num,
}: {
  group: Group;
  budget?: { planned: number | null; logged: number };
  pending: number;
  days: string[];
  roles: { id: string; name: string }[];
  editable: boolean;
  values: Record<string, string>;
  original: Record<string, string>;
  setValue: (k: string, v: string) => void;
  roleOf: (r: GridRow) => string;
  setRole: (key: string, v: string) => void;
  noteFor: (key: string, day: string) => string;
  noteAt: Cell | null;
  openNote: (cell: Cell, el: HTMLElement) => void;
  closedDays: string[];
  num: (k: string) => number;
}) {
  const groupTotal = group.rows.reduce((s, r) => s + days.reduce((t, d) => t + num(`${r.key}|${d}`), 0), 0);
  return (
    <>
      <tr className="border-t-2 border-b border-t-stone-300 border-b-stone-200 bg-stone-50">
        <td colSpan={days.length + 2} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 text-[0.9375rem] font-semibold leading-tight text-stone-900">
                {group.client && `${group.client} · `}
                {group.href ? (
                  <Link href={group.href} className="hover:underline">{group.title ?? group.name}</Link>
                ) : (
                  <span>{group.title ?? group.name}</span>
                )}
            </span>
            {budget?.planned != null && (
              <span className="text-xs text-stone-600">
                <BudgetBar budget={budgetOf(budget.planned, budget.logged + pending)} pending={pending} />
              </span>
            )}
          </div>
        </td>
        <td className="table-cell text-right font-semibold tabular-nums text-stone-900">{fmt(groupTotal)}</td>
      </tr>
      {group.rows.map((r) => {
        const total = days.reduce((s, d) => s + num(`${r.key}|${d}`), 0);
        const rowPending = days.reduce((s, d) => s + num(`${r.key}|${d}`) - (Number.parseFloat(original[`${r.key}|${d}`] ?? "") || 0), 0);
        const used = r.allocation ? r.allocation.logged + rowPending : 0;
        const rowEditable = editable && !r.locked;
        return (
          <tr key={r.key} className="border-b border-stone-100">
            <td className="table-cell pl-6 text-stone-500">
              {r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}
              {r.locked && (
                <span className="flex items-center gap-1 text-xs text-stone-500">
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  {r.locked}
                </span>
              )}
              {r.allocation && !r.locked && (
                <span className={`block text-xs tabular-nums ${used > r.allocation.share + 0.005 ? "font-medium text-red-700" : "text-stone-400"}`}>
                  {+used.toFixed(2)} of {+r.allocation.share.toFixed(2)} h allocated
                  {used > r.allocation.share + 0.005 && ` (${+(used - r.allocation.share).toFixed(2)} h over)`}
                </span>
              )}
            </td>
            <td className="table-cell">
              {r.kind === "category" ? (
                <span className="text-xs text-stone-400">n/a</span>
              ) : rowEditable ? (
                <select
                  value={roleOf(r)}
                  onChange={(e) => setRole(r.key, e.target.value)}
                  aria-label={`Job role for ${r.label}`}
                  className="input w-full py-1 text-xs"
                >
                  <option value="">No role</option>
                  {roles.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-stone-600">{roles.find((x) => x.id === roleOf(r))?.name ?? "No role"}</span>
              )}
            </td>
            {days.map((d) => {
              const k = `${r.key}|${d}`;
              const changed = (values[k] ?? "") !== (original[k] ?? "");
              const hasNote = !!noteFor(r.key, d);
              const isOpen = noteAt?.key === r.key && noteAt.day === d;
              return (
                <td key={d} className={`px-1 py-1 text-center ${closedDays.includes(d) ? "bg-amber-50/60" : ""}`}>
                  {rowEditable ? (
                    <span className="group relative inline-block">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.25"
                        min="0"
                        max="24"
                        name={`h|${k}`}
                        value={values[k] ?? ""}
                        onChange={(e) => setValue(k, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          openNote({ key: r.key, day: d }, e.currentTarget.parentElement!);
                        }}
                        aria-label={`${r.label}, ${d}`}
                        className={`input no-spin w-16 px-1.5 py-1 text-center tabular-nums ${changed ? "border-amber-400 bg-amber-50" : ""} ${isOpen ? "ring-2 ring-blue-300" : ""}`}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => openNote({ key: r.key, day: d }, e.currentTarget.parentElement!)}
                        aria-label={hasNote ? `Edit note for ${r.label}, ${d}` : `Add a note for ${r.label}, ${d}`}
                        title={hasNote ? noteFor(r.key, d) : "Add a note"}
                        className={`absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border transition-opacity ${
                          hasNote
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-stone-300 bg-white text-stone-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        } ${isOpen ? "opacity-100" : ""}`}
                      >
                        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                        </svg>
                      </button>
                    </span>
                  ) : (
                    <span className="tabular-nums" title={noteFor(r.key, d) || undefined}>
                      {values[k] || <span className="text-stone-300">·</span>}
                      {hasNote && <span className="ml-0.5 text-blue-600">•</span>}
                    </span>
                  )}
                </td>
              );
            })}
            <td className="table-cell text-right tabular-nums text-stone-500">{fmt(total)}</td>
          </tr>
        );
      })}
    </>
  );
}
