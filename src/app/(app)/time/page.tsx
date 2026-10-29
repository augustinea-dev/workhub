import Link from "next/link";
import { deleteTime, logTime } from "../actions";
import { SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { addDays, formatDate, formatDay, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { getPeople, getProjectOptions, nameOf, sp } from "@/lib/data";
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
  const people = await getPeople();

  const requestedWeek = sp(params.week);
  const monday = weekStart(requestedWeek && isValidISODate(requestedWeek) ? requestedWeek : todayISO());
  const sunday = addDays(monday, 6);
  // Admins can look at anyone's week; members see their own.
  const requestedUser = sp(params.user);
  const userId = me.role === "admin" && requestedUser && people.some((p) => p.id === requestedUser) ? requestedUser : me.id;

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

  return (
    <>
      <PageHeader
        title="Time"
        subtitle={`Week of ${formatDate(monday)} – ${formatDate(sunday)} · ${nameOf(people, userId)}`}
      >
        <div className="flex items-center gap-2">
          <Link href={qs(addDays(monday, -7))} className="btn" aria-label="Previous week">←</Link>
          <Link href={qs(weekStart(todayISO()))} className="btn">This week</Link>
          <Link href={qs(addDays(monday, 7))} className="btn" aria-label="Next week">→</Link>
          {me.role === "admin" && (
            <form className="flex gap-2">
              <input type="hidden" name="week" value={monday} />
              <select name="user" defaultValue={userId} className="input" aria-label="Person">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <button className="btn">View</button>
            </form>
          )}
        </div>
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={`${total.toFixed(1)} h`} />
        <Stat label="Billable" value={`${billable.toFixed(1)} h`} />
        <Stat label="Billable share" value={total ? `${Math.round((billable / total) * 100)}%` : "—"} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>

      {userId === me.id && (
        <form action={logTime} className="card mb-6 grid gap-2 p-4 md:grid-cols-7">
          <input type="hidden" name="redirect_to" value={here} />
          <select name="project_id" required className="input md:col-span-2" aria-label="Project" defaultValue="">
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
          <input name="note" placeholder="Note" className="input" aria-label="Note" />
          <SubmitButton pendingText="Logging…">Log time</SubmitButton>
        </form>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No time logged this week.</Empty>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-head">Day</th>
                <th className="table-head">Project / task</th>
                <th className="table-head">Type</th>
                <th className="table-head">Note</th>
                <th className="table-head text-right">Hours</th>
                <th className="table-head" />
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const dayRows = rows.filter((r) => r.work_date === d);
                if (!dayRows.length) return null;
                const dayTotal = dayRows.reduce((s, r) => s + Number(r.hours), 0);
                return dayRows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="table-cell text-stone-600">
                      {i === 0 && (
                        <>
                          {formatDay(d)} <span className="text-stone-400">· {dayTotal.toFixed(1)} h</span>
                        </>
                      )}
                    </td>
                    <td className="table-cell">
                      {r.project && <Link href={`/projects/${r.project.id}`} className="hover:underline">{r.project.name}</Link>}
                      {r.task && (
                        <>
                          {" / "}
                          <Link href={`/tasks/${r.task.id}`} className="text-stone-600 hover:underline">{r.task.title}</Link>
                        </>
                      )}
                    </td>
                    <td className="table-cell text-stone-600">{HOUR_TYPES.find((h) => h.value === r.hour_type)?.label}</td>
                    <td className="table-cell text-stone-500">{r.note}</td>
                    <td className="table-cell text-right font-medium">{Number(r.hours).toFixed(2)}</td>
                    <td className="table-cell text-right">
                      {me.role === "admin" && (
                        <form action={deleteTime}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={here} />
                          <button className="btn-danger">Remove</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
