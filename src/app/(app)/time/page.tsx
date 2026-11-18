import Link from "next/link";
import { decideTimesheet, logTime, recallTimesheet, reopenTimesheet, submitTimesheet } from "../actions";
import { FilterForm, SubmitButton } from "@/components/client";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { TimesheetGrid, type AddableTask, type GridRow, type ProjectBudgets } from "@/components/timesheet-grid";
import { Empty, Flash, PageHeader, TimesheetBadge } from "@/components/ui";
import { addDays, formatDate, formatDay, formatTimestamp, isValidISODate, isWorkingDay, todayISO, weekStart } from "@/lib/dates";
import { getHolidays, getJobRoles, getPeople, getProjectOptions, getTeams, getTimeCategories, managedIds, nameOf, personOption, sp } from "@/lib/data";
import { projectBudget } from "@/lib/budget";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { HourType, Timesheet } from "@/lib/types";

type Row = {
  id: string;
  user_id: string;
  work_date: string;
  hours: number;
  hour_type: HourType;
  note: string | null;
  job_role_id: string | null;
  category_id: string | null;
  project: { id: string; name: string; title: string | null; company: { name: string } | null } | null;
  task: { id: string; title: string } | null;
  category: { name: string; group_name: string } | null;
};

type TaskOption = {
  id: string;
  title: string;
  project: { id: string; name: string; title: string | null; status: string; company: { name: string } | null } | null;
};

const projectLabel = (p: { name: string; title: string | null; company: { name: string } | null }) =>
  `${p.company?.name ? `${p.company.name} · ` : ""}${p.title || p.name}`;

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const [people, teams, roles, categories, holidays] = await Promise.all([getPeople(), getTeams(), getJobRoles(), getTimeCategories(), getHolidays()]);
  const managed = managedIds(teams, me.id);
  const reviewer = isAdmin || managed.length > 0;

  const requestedWeek = sp(params.week);
  const week = weekStart(requestedWeek && isValidISODate(requestedWeek) ? requestedWeek : todayISO());
  const saturday = addDays(week, 6);
  const requestedUser = sp(params.user);
  const canView = (id: string) => isAdmin || id === me.id || managed.includes(id);
  const userId = requestedUser && people.some((p) => p.id === requestedUser) && canView(requestedUser) ? requestedUser : me.id;
  const viewable = isAdmin ? people : people.filter((p) => p.id === me.id || managed.includes(p.id));
  const person = people.find((p) => p.id === userId);

  const supabase = await createClient();
  const [{ data }, projects, { data: sheet }, { count: waiting }, { data: assigned }, { data: open }] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "id, user_id, work_date, hours, hour_type, note, job_role_id, category_id, project:projects(id, name, title, company:companies(name)), task:tasks(id, title), category:time_categories(name, group_name)",
      )
      .eq("user_id", userId)
      .gte("work_date", week)
      .lte("work_date", saturday)
      .order("work_date")
      .order("created_at"),
    getProjectOptions(),
    supabase.from("timesheets").select("*").eq("user_id", userId).eq("week_start", week).maybeSingle(),
    isAdmin
      ? supabase.from("timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted")
      : managed.length
        ? supabase.from("timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted").in("user_id", managed)
        : Promise.resolve({ count: 0 }),
    supabase
      .from("tasks")
      .select("id, title, project:projects(id, name, title, status, company:companies(name)), task_assignees!inner(profile_id)")
      .eq("task_assignees.profile_id", userId)
      .neq("status", "done"),
    supabase.from("tasks").select("id, title, project:projects(id, name, title, status, company:companies(name))").neq("status", "done").order("title").limit(2000),
  ]);
  const ts = sheet as Timesheet | null;
  const status = ts?.status ?? "open";
  const locked = status === "submitted" || status === "approved";
  const isOwn = userId === me.id;
  const canEdit = (isOwn || isAdmin) && !locked;
  const canDecide = isAdmin || (managed.includes(userId) && !isOwn);
  const expected = Number(person?.weekly_hours ?? 40);
  const notStarted = week > weekStart(todayISO());
  const rows = (data ?? []) as unknown as Row[];
  const total = rows.reduce((s, r) => s + Number(r.hours), 0);
  const billable = rows.filter((r) => r.hour_type === "billable").reduce((s, r) => s + Number(r.hours), 0);
  const timeOff = rows.filter((r) => r.hour_type === "pto").reduce((s, r) => s + Number(r.hours), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const qs = (w: string) => `/time?week=${w}${userId !== me.id ? `&user=${userId}` : ""}`;
  const here = qs(week);
  const mainRole = person?.job_roles?.find((r) => r.is_main)?.role_id ?? null;
  const holidaySet = new Set(holidays.map((h) => h.day));
  const closedDays = days.filter((d) => holidaySet.has(d) && isWorkingDay(d));

  const grid = new Map<string, GridRow>();
  const ensure = (key: string, init: () => Omit<GridRow, "cells">) => {
    if (!grid.has(key)) grid.set(key, { ...init(), cells: {} });
    return grid.get(key)!;
  };
  const taskRow = (t: TaskOption) =>
    ensure(`t:${t.id}`, () => ({
      key: `t:${t.id}`,
      label: t.title,
      href: `/tasks/${t.id}`,
      group: t.project ? projectLabel(t.project) : "Project",
      groupClient: t.project?.company?.name,
      groupTitle: t.project ? t.project.title || t.project.name : undefined,
      groupHref: t.project ? `/projects/${t.project.id}` : undefined,
      projectId: t.project?.id,
      kind: "task",
      roleId: mainRole,
    }));
  for (const r of rows) {
    let row: GridRow;
    if (r.category_id) {
      continue;
    } else if (r.task) {
      row = taskRow({ id: r.task.id, title: r.task.title, project: r.project ? { ...r.project, status: "" } : null });
    } else {
      const p = r.project!;
      row = ensure(`p:${p.id}`, () => ({
        key: `p:${p.id}`,
        label: "Project time (no task)",
        group: projectLabel(p),
        groupClient: p.company?.name,
        groupTitle: p.title || p.name,
        groupHref: `/projects/${p.id}`,
        projectId: p.id,
        kind: "project",
        roleId: mainRole,
      }));
    }
    const c = (row.cells[r.work_date] ??= { hours: 0, note: null, count: 0 });
    c.hours += Number(r.hours);
    c.count += 1;
    c.note = c.count === 1 ? r.note : [c.note, r.note].filter(Boolean).join("; ") || null;
    if (r.job_role_id !== undefined) row.roleId = r.job_role_id;
  }
  for (const t of (assigned ?? []) as unknown as TaskOption[]) {
    if (t.project && !["complete", "cancelled"].includes(t.project.status)) taskRow(t);
  }
  const workRows = [...grid.values()].sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

  const catRows: GridRow[] = categories
    .filter((c) => c.active || rows.some((r) => r.category_id === c.id))
    .map((c) => {
      const cells: GridRow["cells"] = {};
      for (const r of rows.filter((x) => x.category_id === c.id)) {
        const cell = (cells[r.work_date] ??= { hours: 0, note: null, count: 0 });
        cell.hours += Number(r.hours);
        cell.count += 1;
        cell.note = cell.count === 1 ? r.note : [cell.note, r.note].filter(Boolean).join("; ") || null;
      }
      return { key: `c:${c.id}`, label: c.name, group: `General Time: ${c.group_name}`, groupClient: "General Time", groupTitle: c.group_name, kind: "category" as const, roleId: null, cells };
    });
  const holidayCategory = categories.find((c) => c.kind === "holiday" && c.active);

  const addable: AddableTask[] = ((open ?? []) as unknown as TaskOption[])
    .filter((t) => t.project && !["complete", "cancelled"].includes(t.project.status))
    .map((t) => ({
      key: `t:${t.id}`,
      label: t.title,
      group: projectLabel(t.project!),
      groupClient: t.project!.company?.name,
      groupTitle: t.project!.title || t.project!.name,
      groupHref: `/projects/${t.project!.id}`,
      projectId: t.project!.id,
      href: `/tasks/${t.id}`,
      roleId: mainRole,
    }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

  const gridProjectIds = [...new Set(workRows.map((r) => r.projectId).filter((id): id is string => !!id))];
  const budgetData = await Promise.all(
    gridProjectIds.map((id) =>
      Promise.all([
        supabase.from("tasks").select("parent_task_id, estimate_hours").eq("project_id", id),
        supabase.from("time_entries").select("hours, hour_type").eq("project_id", id),
      ]),
    ),
  );
  const budgets: ProjectBudgets = {};
  gridProjectIds.forEach((id, i) => {
    const [{ data: t }, { data: e }] = budgetData[i];
    const b = projectBudget(t ?? [], (e ?? []) as { hours: number; hour_type: HourType }[]);
    budgets[id] = { planned: b.planned, logged: b.logged };
  });

  const timeRows: TimeRow[] = rows.map((r) => ({
    ...r,
    project: r.project ? { id: r.project.id, name: r.project.title || r.project.name } : null,
    personName: nameOf(people, r.user_id),
    dayLabel: formatDay(r.work_date),
  }));
  const agency = categories.filter((c) => c.active && c.group_name === "Agency");
  const nonClient = categories.filter((c) => c.active && c.group_name === "Non-Client");

  return (
    <>
      <PageHeader title="Time" subtitle={isOwn ? "Your timesheet, Sunday to Saturday" : `Viewing ${nameOf(people, userId)}'s timesheet`}>
        {reviewer && (
          <Link href="/time/approvals" className="btn">
            Approvals
            {!!waiting && <span className="ml-2 rounded-full bg-blue-700 px-2 text-xs font-semibold text-white">{waiting}</span>}
          </Link>
        )}
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Week" className="flex items-center gap-1">
          <Link href={qs(addDays(week, -7))} className="btn px-2.5" aria-label="Previous week">←</Link>
          <span className="min-w-44 text-center text-sm font-semibold">
            {formatDate(week)} to {formatDate(saturday)}
          </span>
          <Link href={qs(addDays(week, 7))} className="btn px-2.5" aria-label="Next week">→</Link>
          {week !== weekStart(todayISO()) && (
            <Link href={qs(weekStart(todayISO()))} className="ml-2 text-sm font-medium text-blue-700 hover:underline">
              Back to this week
            </Link>
          )}
        </nav>
        {reviewer && (
          <FilterForm key={userId} className="flex items-center gap-2">
            <input type="hidden" name="week" value={week} />
            <label htmlFor="time_person" className="text-xs font-medium uppercase tracking-wide text-stone-500">Person</label>
            <select id="time_person" name="user" defaultValue={userId} className="input w-72">
              {viewable.map((p) => (
                <option key={p.id} value={p.id}>{personOption(p)}</option>
              ))}
            </select>
          </FilterForm>
        )}
      </div>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <section className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            Timesheet <TimesheetBadge status={status} />
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {status === "submitted" && ts?.submitted_at
              ? `Submitted ${formatTimestamp(ts.submitted_at)} with ${Number(ts.total_hours)} h. Time is locked while it's reviewed.`
              : status === "approved" && ts?.decided_at
                ? `Approved by ${ts.decided_by ? nameOf(people, ts.decided_by) : "an admin"} on ${formatTimestamp(ts.decided_at)}. Time is locked.`
                : notStarted
                  ? "This week hasn't started yet. You can still fill in time off ahead."
                  : `${+total.toFixed(2)} of ${expected} h saved${total >= expected ? ", ready to submit." : `. ${+(expected - total).toFixed(2)} h more to submit.`}`}
          </p>
          {status === "returned" && ts?.return_note && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Returned by {ts.decided_by ? nameOf(people, ts.decided_by) : "an admin"}: {ts.return_note}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwn && (status === "open" || status === "returned") && !notStarted && (
            <form action={submitTimesheet}>
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="redirect_to" value={here} />
              {total >= expected ? (
                <SubmitButton pendingText="Submitting…">Submit for approval</SubmitButton>
              ) : (
                <button type="button" disabled className="btn-primary" title={`Needs ${expected} h saved`}>Submit for approval</button>
              )}
            </form>
          )}
          {isOwn && status === "submitted" && (
            <form action={recallTimesheet}>
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="redirect_to" value={here} />
              <SubmitButton className="btn" pendingText="Recalling…">Recall to edit</SubmitButton>
            </form>
          )}
          {canDecide && status === "submitted" && ts && (
            <>
              <form action={decideTimesheet}>
                <input type="hidden" name="id" value={ts.id} />
                <input type="hidden" name="decision" value="approve" />
                <input type="hidden" name="redirect_to" value={here} />
                <SubmitButton pendingText="Approving…">Approve</SubmitButton>
              </form>
              <form action={decideTimesheet} className="flex gap-2">
                <input type="hidden" name="id" value={ts.id} />
                <input type="hidden" name="decision" value="return" />
                <input type="hidden" name="redirect_to" value={here} />
                <input name="note" required placeholder="What needs fixing?" aria-label="Return note" className="input w-56" />
                <SubmitButton className="btn" pendingText="Returning…">Return</SubmitButton>
              </form>
            </>
          )}
          {canDecide && status === "approved" && ts && (
            <form action={reopenTimesheet}>
              <input type="hidden" name="id" value={ts.id} />
              <input type="hidden" name="redirect_to" value={here} />
              <SubmitButton className="btn" pendingText="Reopening…">Reopen</SubmitButton>
            </form>
          )}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={`${total.toFixed(2)} h`} />
        <Stat label="Billable" value={`${billable.toFixed(2)} h`} />
        <Stat label="Billable share" value={total - timeOff > 0 ? `${Math.round((billable / (total - timeOff)) * 100)}%` : "n/a"} />
        <Stat label="Time off" value={`${timeOff.toFixed(2)} h`} />
      </div>

      <TimesheetGrid
        key={`${userId}-${week}-${rows.map((r) => `${r.id}:${r.hours}:${r.note ?? ""}:${r.job_role_id ?? ""}`).join(",")}`}
        week={week}
        userId={userId}
        redirectTo={here}
        days={days}
        dayLabels={days.map(formatDay)}
        rows={[...workRows, ...catRows]}
        addable={addable}
        roles={roles.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name }))}
        editable={canEdit}
        holidayKey={holidayCategory ? `c:${holidayCategory.id}` : null}
        holidayFill={expected / 5}
        closedDays={closedDays}
        budgets={budgets}
      />
      {canEdit && closedDays.length > 0 && holidayCategory && (
        <p className="-mt-4 mb-6 text-xs text-amber-800">
          Closed {closedDays.map(formatDay).join(", ")}: Holiday hours are filled in. Save the week to keep them.
        </p>
      )}

      {isOwn && !locked && (
        <form action={logTime} className="card mb-6 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Log one entry</p>
          <div className="grid gap-2 md:grid-cols-[1fr_9rem_6rem_1fr_auto]">
            <input type="hidden" name="redirect_to" value={here} />
            <select name="work" required className="input" aria-label="Project or General Time" defaultValue="">
              <option value="" disabled>Project or General Time…</option>
              <optgroup label="Projects">
                {projects.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                ))}
              </optgroup>
              {agency.length > 0 && (
                <optgroup label="General Time: Agency">
                  {agency.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {nonClient.length > 0 && (
                <optgroup label="General Time: Non-Client">
                  {nonClient.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <input name="work_date" type="date" defaultValue={todayISO()} className="input" aria-label="Date" />
            <input name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="Hours" className="input" aria-label="Hours" />
            <input name="note" placeholder="Note (optional)" className="input" aria-label="Note" />
            <SubmitButton pendingText="Logging…">Log time</SubmitButton>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Billable is set for you: time on a billable project is billable, everything else isn&apos;t. To log against a specific task, use the grid,
            the task&apos;s Time section or its timer.
          </p>
        </form>
      )}

      <div className="card">
        <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
          Entries{" "}
          <span className="font-normal text-stone-400">
            · {locked ? "locked while the timesheet is submitted or approved" : "select Edit to change or remove one"}
          </span>
        </h2>
        {timeRows.length === 0 ? (
          <Empty>No time logged this week.</Empty>
        ) : (
          <TimeEntryTable rows={timeRows} meId={me.id} isAdmin={isAdmin} redirectTo={here} second="work" locked={locked} />
        )}
      </div>

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Export to CSV</summary>
        <form action="/export/time" method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="export_from">From</label>
            <input id="export_from" name="from" type="date" defaultValue={week} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="export_to">To</label>
            <input id="export_to" name="to" type="date" defaultValue={saturday} required className="input" />
          </div>
          {isAdmin && (
            <div>
              <label className="label" htmlFor="export_user">Person</label>
              <select id="export_user" name="user" defaultValue={userId} className="input">
                <option value="all">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{personOption(p)}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn-primary">Download CSV</button>
        </form>
        <p className="mt-2 text-xs text-stone-500">
          {isAdmin ? "Up to a year at a time." : "Your own time, up to a year at a time."} Opens in Excel or Google Sheets.
        </p>
      </details>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
