import Link from "next/link";
import { decideTimesheet, logTime, recallTimesheet, reopenTimesheet, submitTimesheet } from "../actions";
import { FilterForm, SubmitButton } from "@/components/client";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { Empty, Flash, PageHeader, TimesheetBadge } from "@/components/ui";
import { addDays, formatDate, formatDay, formatTimestamp, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { getPeople, getProjectOptions, getTeams, managedIds, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, type HourType, type Timesheet } from "@/lib/types";

type Row = {
  id: string;
  user_id: string;
  work_date: string;
  hours: number;
  hour_type: HourType;
  note: string | null;
  project: { id: string; name: string } | null;
  task: { id: string; title: string } | null;
};

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const [people, teams] = await Promise.all([getPeople(), getTeams()]);
  const managed = managedIds(teams, me.id);
  const reviewer = isAdmin || managed.length > 0;

  const requestedWeek = sp(params.week);
  const monday = weekStart(requestedWeek && isValidISODate(requestedWeek) ? requestedWeek : todayISO());
  const sunday = addDays(monday, 6);
  // Admins can look at anyone's week, team managers at their team's; everyone else sees their own.
  const requestedUser = sp(params.user);
  const canView = (id: string) => isAdmin || id === me.id || managed.includes(id);
  const userId = requestedUser && people.some((p) => p.id === requestedUser) && canView(requestedUser) ? requestedUser : me.id;
  const viewable = isAdmin ? people : people.filter((p) => p.id === me.id || managed.includes(p.id));

  const supabase = await createClient();
  const [{ data }, projects, { data: sheet }, { count: waiting }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, user_id, work_date, hours, hour_type, note, project:projects(id, name), task:tasks(id, title)")
      .eq("user_id", userId)
      .gte("work_date", monday)
      .lte("work_date", sunday)
      .order("work_date")
      .order("created_at"),
    getProjectOptions(),
    supabase.from("timesheets").select("*").eq("user_id", userId).eq("week_start", monday).maybeSingle(),
    isAdmin
      ? supabase.from("timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted")
      : managed.length
        ? supabase.from("timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted").in("user_id", managed)
        : Promise.resolve({ count: 0 }),
  ]);
  const ts = sheet as Timesheet | null;
  const status = ts?.status ?? "open";
  const locked = status === "submitted" || status === "approved";
  const isOwn = userId === me.id;
  const canDecide = isAdmin || (managed.includes(userId) && !isOwn);
  const expected = Number(people.find((p) => p.id === userId)?.weekly_hours ?? 40);
  const notStarted = monday > weekStart(todayISO());
  const rows = (data ?? []) as unknown as Row[];
  const total = rows.reduce((s, r) => s + Number(r.hours), 0);
  const billable = rows.filter((r) => r.hour_type === "billable").reduce((s, r) => s + Number(r.hours), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const qs = (week: string) => `/time?week=${week}${userId !== me.id ? `&user=${userId}` : ""}`;
  const here = qs(monday);
  const timeRows: TimeRow[] = rows.map((r) => ({
    ...r,
    personName: nameOf(people, r.user_id),
    dayLabel: formatDay(r.work_date),
  }));

  return (
    <>
      <PageHeader title="Time" subtitle={userId === me.id ? "Your hours, week by week" : `Viewing ${nameOf(people, userId)}'s hours`}>
        {reviewer && (
          <Link href="/time/approvals" className="btn">
            Approvals
            {!!waiting && <span className="ml-2 rounded-full bg-blue-700 px-2 text-xs font-semibold text-white">{waiting}</span>}
          </Link>
        )}
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Week" className="flex items-center gap-1">
          <Link href={qs(addDays(monday, -7))} className="btn px-2.5" aria-label="Previous week">←</Link>
          <span className="min-w-44 text-center text-sm font-semibold">
            {formatDate(monday)} to {formatDate(sunday)}
          </span>
          <Link href={qs(addDays(monday, 7))} className="btn px-2.5" aria-label="Next week">→</Link>
          {monday !== weekStart(todayISO()) && (
            <Link href={qs(weekStart(todayISO()))} className="ml-2 text-sm font-medium text-blue-700 hover:underline">
              Back to this week
            </Link>
          )}
        </nav>
        {reviewer && (
          <FilterForm key={userId} className="flex items-center gap-2">
            <input type="hidden" name="week" value={monday} />
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
                  ? "This week hasn't started yet."
                  : `${+total.toFixed(2)} of ${expected} h logged${total >= expected ? ", ready to submit." : `. Log ${+(expected - total).toFixed(2)} h more to submit.`}`}
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
              <input type="hidden" name="week" value={monday} />
              <input type="hidden" name="redirect_to" value={here} />
              {total >= expected ? (
                <SubmitButton pendingText="Submitting…">Submit week</SubmitButton>
              ) : (
                <button type="button" disabled className="btn-primary" title={`Needs ${expected} h`}>Submit week</button>
              )}
            </form>
          )}
          {isOwn && status === "submitted" && (
            <form action={recallTimesheet}>
              <input type="hidden" name="week" value={monday} />
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
        <Stat label="Billable share" value={total ? `${Math.round((billable / total) * 100)}%` : "—"} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>

      <div className="card mb-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-center">
          <thead>
            <tr>
              {days.map((d) => (
                <th key={d} className="table-head text-center">{formatDay(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {days.map((d) => {
                const h = rows.filter((r) => r.work_date === d).reduce((s, r) => s + Number(r.hours), 0);
                return (
                  <td key={d} className={`table-cell tabular-nums ${h ? "font-medium" : "text-stone-300"}`}>
                    {h ? h.toFixed(2) : "0"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {isOwn && !locked && (
        <form action={logTime} className="card mb-6 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Log time</p>
          <div className="grid gap-2 md:grid-cols-[1fr_9rem_6rem_9rem_1fr_auto]">
            <input type="hidden" name="redirect_to" value={here} />
            <select name="project_id" required className="input" aria-label="Project" defaultValue="">
              <option value="" disabled>Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input name="work_date" type="date" defaultValue={todayISO()} className="input" aria-label="Date" />
            <input name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="Hours" className="input" aria-label="Hours" />
            <select name="hour_type" defaultValue="billable" className="input" aria-label="Hour type">
              {HOUR_TYPES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            <input name="note" placeholder="Note (optional)" className="input" aria-label="Note" />
            <SubmitButton pendingText="Logging…">Log time</SubmitButton>
          </div>
          <p className="mt-2 text-xs text-stone-500">To log against a specific task, open the task and use its Time section.</p>
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
            <input id="export_from" name="from" type="date" defaultValue={monday} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="export_to">To</label>
            <input id="export_to" name="to" type="date" defaultValue={sunday} required className="input" />
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
