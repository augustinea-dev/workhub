"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { DayCell, RowTask, WorkloadRow } from "@/lib/workload";

const h = (n: number) => (+n.toFixed(2)).toString();
const date = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

type Open = { row: WorkloadRow; day: string; top: number; left: number; above: boolean };

export function WorkloadGrid({
  days,
  rows,
  unassigned,
  today,
  more,
}: {
  days: string[];
  rows: WorkloadRow[];
  unassigned: WorkloadRow | null;
  today: string;
  more: string | null;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(() => {
    loading.current = false;
  }, [days.length]);

  const onScroll = () => {
    const box = scroller.current;
    if (!box || !more || loading.current) return;
    if (box.scrollLeft > 0 && box.scrollLeft + box.clientWidth >= box.scrollWidth - 120) {
      loading.current = true;
      router.replace(more, { scroll: false });
    }
  };

  const place = useCallback((el: HTMLElement, row: WorkloadRow, day: string) => {
    const r = el.getBoundingClientRect();
    const width = 320;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    setOpen({ row, day, left, top: above ? r.top - 6 : r.bottom + 6, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onDown = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      anchor.current?.focus();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const weeks: { start: string; count: number }[] = [];
  for (const d of days) {
    const last = weeks[weeks.length - 1];
    if (last && last.count < 7) last.count++;
    else weeks.push({ start: d, count: 1 });
  }
  const allRows = unassigned ? [unassigned, ...rows] : rows;
  const expandable = allRows.filter((r) => r.tasks.length);
  const allOpen = expandable.length > 0 && expandable.every((r) => expanded.has(r.id));
  const cell = open?.row.days[open.day];

  return (
    <>
      <div ref={scroller} onScroll={onScroll} className="overflow-x-auto">
        <table className="text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-56 border-b border-r border-stone-200 bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500" rowSpan={2}>
                <span className="flex items-center justify-between gap-2">
                  Person
                  {expandable.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(allOpen ? new Set() : new Set(expandable.map((r) => r.id)))}
                      className="text-[11px] font-medium normal-case tracking-normal text-blue-700 hover:underline"
                    >
                      {allOpen ? "Collapse all" : "Expand all"}
                    </button>
                  )}
                </span>
              </th>
              {weeks.map((w) => (
                <th key={w.start} colSpan={w.count} className="border-b border-l border-stone-200 bg-white px-2 py-1.5 text-left text-xs font-semibold text-stone-700">
                  Wk of {date(w.start, { month: "short", day: "numeric" })}
                </th>
              ))}
              {more && <th rowSpan={2} className="border-b border-stone-200 bg-white" />}
            </tr>
            <tr>
              {days.map((d) => {
                const isToday = d === today;
                return (
                  <th
                    key={d}
                    className={`min-w-14 border-b border-stone-200 px-1 py-1.5 text-center text-[11px] font-medium leading-tight ${new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? "border-l" : ""} ${
                      isToday ? "border-b-2 border-b-blue-600 bg-blue-50 text-blue-800" : "bg-white text-stone-500"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-stone-800">{date(d, { day: "numeric" })}</span>
                    {date(d, { weekday: "short" })}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const isOpen = expanded.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className={r.id === "unassigned" ? "bg-stone-50" : ""}>
                    <td className="sticky left-0 z-10 border-b border-r border-stone-200 bg-white px-2 py-2">
                      <span className="flex items-start gap-1">
                        {r.tasks.length ? (
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} tasks for ${r.name}`}
                            className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                          >
                            <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M6 3l5 5-5 5" />
                            </svg>
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block font-medium text-stone-900">{r.name}</span>
                          {r.role && <span className="block text-xs text-stone-500">{r.role}</span>}
                          {r.tasks.length > 0 && !isOpen && <span className="block text-xs text-stone-400">{r.tasks.length} {r.tasks.length === 1 ? "task" : "tasks"}</span>}
                        </span>
                      </span>
                    </td>
                    {days.map((d) => (
                      <Day
                        key={d}
                        c={r.days[d]}
                        sunday={new Date(`${d}T00:00:00Z`).getUTCDay() === 0}
                        unassigned={r.id === "unassigned"}
                        active={open?.row.id === r.id && open.day === d}
                        label={`${r.name}, ${date(d, { weekday: "long", month: "short", day: "numeric" })}`}
                        onOpen={(el) => {
                          if (open?.row.id === r.id && open.day === d) return setOpen(null);
                          anchor.current = el;
                          place(el, r, d);
                        }}
                      />
                    ))}
                    {more && <td className="w-4 border-b border-stone-200" />}
                  </tr>
                  {isOpen && r.tasks.map((t) => <TaskBar key={`${r.id}-${t.id}`} t={t} row={r} days={days} more={!!more} />)}
                </Fragment>
              );
            })}
            {!allRows.length && (
              <tr>
                <td colSpan={days.length + 1} className="px-4 py-8 text-center text-sm text-stone-500">No one to show.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && cell && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Tasks for ${open.row.name}`}
          className="fixed z-30 w-80 rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
          style={{ left: open.left, top: open.top, transform: open.above ? "translateY(-100%)" : undefined }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-stone-900">{open.row.name}</p>
              <p className="text-xs text-stone-500">{date(open.day, { weekday: "long", month: "short", day: "numeric" })}</p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="text-xs font-medium text-stone-500 hover:text-stone-800">Close</button>
          </div>
          <p className="mb-2 text-xs text-stone-600">
            {open.row.id === "unassigned"
              ? `${h(cell.planned)} h waiting for someone`
              : cell.holiday
                ? `Holiday. ${h(cell.planned)} h planned.`
                : `${h(cell.planned)} of ${h(Math.max(0, cell.capacity - cell.pto))} h planned${cell.pto > 0.005 ? ` (${h(cell.pto)} h time off)` : ""}`}
          </p>
          {cell.tasks.length ? (
            <ul className="max-h-60 space-y-1.5 overflow-y-auto">
              {cell.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 text-xs font-semibold tabular-nums text-stone-700">{h(t.hours)}h</span>
                  <span className="min-w-0">
                    <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium text-stone-900 hover:underline">{t.title}</Link>
                    <span className="block truncate text-xs text-stone-500">
                      {t.project}
                      {t.roles?.length ? ` · Open: ${t.roles.join(", ")}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">No tasks planned.</p>
          )}
        </div>
      )}
    </>
  );
}

function Day({ c, sunday, unassigned, active, label, onOpen }: { c: DayCell; sunday: boolean; unassigned: boolean; active: boolean; label: string; onOpen: (el: HTMLElement) => void }) {
  const avail = Math.max(0, c.capacity - c.pto);
  const has = c.planned > 0.005;
  const working = c.capacity > 0;
  const over = !unassigned && has && c.planned > avail + 0.005;
  const off = !unassigned && c.pto > 0.005;
  const offLabel = c.off.join(", ");
  const bg = c.holiday ? "bg-amber-50" : off && avail < 0.005 && working ? "bg-violet-50" : !working && !unassigned ? "wl-hatch" : "";
  const tone = unassigned ? "bg-stone-200 text-stone-800" : over ? "bg-red-100 text-red-700 font-semibold" : "bg-sky-100 text-sky-900";
  return (
    <td className={`h-12 border-b border-stone-200 p-0.5 text-center ${sunday ? "border-l" : ""} ${bg}`}>
      {has || c.holiday || off ? (
        <button
          type="button"
          onClick={(e) => onOpen(e.currentTarget)}
          aria-label={`${label}: ${h(c.planned)} hours planned`}
          aria-expanded={active}
          className={`flex h-full w-full flex-col items-center justify-center rounded text-xs tabular-nums transition-colors hover:ring-2 hover:ring-blue-300 ${active ? "ring-2 ring-blue-500" : ""} ${has ? tone : "text-stone-500"}`}
        >
          {has && <span>{h(c.planned)}</span>}
          {c.holiday && <span className="text-[10px] font-medium text-amber-800">Holiday</span>}
          {off && !c.holiday && <span className={`max-w-full truncate px-0.5 text-[10px] font-medium ${has ? "" : "text-violet-800"}`} title={`${offLabel}: ${h(c.pto)} h`}>{offLabel}</span>}
        </button>
      ) : null}
    </td>
  );
}

function TaskBar({ t, row, days, more }: { t: RowTask; row: WorkloadRow; days: string[]; more: boolean }) {
  const first = days[0];
  const last = days[days.length - 1];
  const a = days.indexOf(t.start < first ? first : t.start);
  const b = days.indexOf(t.end > last ? last : t.end);
  const shade = (d: string) => {
    const c = row.days[d];
    return `${c.holiday ? "bg-amber-50" : c.capacity === 0 && row.id !== "unassigned" ? "wl-hatch" : ""} ${new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? "border-l border-stone-200" : ""}`;
  };
  const span = (from: string, to: string) => (from === to ? date(from, { month: "short", day: "numeric" }) : `${date(from, { month: "short", day: "numeric" })} to ${date(to, { month: "short", day: "numeric" })}`);
  const cutLeft = t.start < first;
  const cutRight = t.end > last;
  const corners = cutLeft && cutRight ? "border-x-0" : cutLeft ? "rounded-r-md border-l-0" : cutRight ? "rounded-l-md border-r-0" : "rounded-md";
  return (
    <tr className="bg-white">
      <td className="sticky left-0 z-10 border-r border-stone-200 bg-white py-1 pl-8 pr-2">
        <Link href={`/tasks/${t.id}`} className="block max-w-48 truncate text-xs font-medium text-stone-700 hover:underline" title={t.title}>{t.title}</Link>
        <span className="block max-w-48 truncate text-[11px] text-stone-400" title={t.project}>
          {t.project}
          {t.roles?.length ? <span className="text-amber-800"> · Open: {t.roles.join(", ")}</span> : null}
        </span>
      </td>
      {days.slice(0, a).map((d) => (
        <td key={d} className={shade(d)} />
      ))}
      <td colSpan={b - a + 1} className={`relative h-11 p-0 ${new Date(`${days[a]}T00:00:00Z`).getUTCDay() === 0 ? "border-l border-stone-200" : ""}`}>
        <Link
          href={`/tasks/${t.id}`}
          title={`${t.title} · ${t.project} · ${span(t.start, t.end)} · ${h(t.hours)} h${t.roles?.length ? ` · Open: ${t.roles.join(", ")}` : ""}`}
          className={`absolute inset-x-0.5 inset-y-1 flex items-center gap-1.5 overflow-hidden border border-sky-300 bg-sky-50 px-1.5 text-xs text-sky-950 hover:border-sky-500 hover:bg-sky-100 ${corners}`}
        >
          <span className="shrink-0 rounded bg-white px-1 font-semibold tabular-nums ring-1 ring-sky-200">{h(t.hours)}h</span>
          <span className="truncate font-medium">{t.title}</span>
        </Link>
      </td>
      {days.slice(b + 1).map((d) => (
        <td key={d} className={shade(d)} />
      ))}
      {more && <td />}
    </tr>
  );
}
