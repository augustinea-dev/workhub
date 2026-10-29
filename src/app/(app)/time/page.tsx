import Link from "next/link";
import { logTime } from "../actions";
import { SubmitButton } from "@/components/client";
import { TimeEntryTable, type TimeRow } from "@/components/time-entries";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { addDays, formatDate, formatDay, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { getPeople, getProjectOptions, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, type HourType } from "@/lib/types";

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
  const people = await getPeople();

  const requestedWeek = sp(params.week);
  const monday = weekStart(requestedWeek && isValidISODate(requestedWeek) ? requestedWeek : todayISO());
  const sunday = addDays(monday, 6);
  // Admins can look at anyone's week; members see their own.
  const requestedUser = sp(params.user);
  const userId = isAdmin && requestedUser && people.some((p) => p.id === requestedUser) ? requestedUser : me.id;

  const supabase = await createClient();
  const [{ data }, projects] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, user_id, work_date, hours, hour_type, note, project:projects(id, name), task:tasks(id, title)")
      .eq("user_id", userId)
      .gte("work_date", monday)
      .lte("work_date", sunday)
      .order("work_date")
      .order("created_at"),
    getProjectOptions(),
  ]);
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
      <PageHeader
        title="Time"
        subtitle={`Week of ${formatDate(monday)} – ${formatDate(sunday)} · ${userId === me.id ? "You" : nameOf(people, userId)}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs(addDays(monday, -7))} className="btn" aria-label="Previous week">←</Link>
          <Link href={qs(weekStart(todayISO()))} className="btn">This week</Link>
          <Link href={qs(addDays(monday, 7))} className="btn" aria-label="Next week">→</Link>
          {isAdmin && (
            <form className="flex gap-2">
              <input type="hidden" name="week" value={monday} />
              <select name="user" defaultValue={userId} className="input" aria-label="Person">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{personOption(p)}</option>
                ))}
              </select>
              <button className="btn">View</button>
            </form>
          )}
        </div>
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

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

      {userId === me.id && (
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
          Entries <span className="font-normal text-stone-400">· select Edit to change or remove one</span>
        </h2>
        {timeRows.length === 0 ? (
          <Empty>No time logged this week.</Empty>
        ) : (
          <TimeEntryTable rows={timeRows} meId={me.id} isAdmin={isAdmin} redirectTo={here} second="work" />
        )}
      </div>
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
