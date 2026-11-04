import type { NextRequest } from "next/server";
import { csvResponse, slug } from "@/lib/csv";
import { getPeople, nameOf } from "@/lib/data";
import { addDays, daysBetween, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HOUR_TYPES, type HourType, type TimesheetStatus } from "@/lib/types";

type Row = {
  user_id: string;
  work_date: string;
  hours: number;
  hour_type: HourType;
  note: string | null;
  project: { name: string; company: { name: string } | null } | null;
  task: { title: string } | null;
};

const MAX_DAYS = 366;

export async function GET(request: NextRequest) {
  const me = await requireProfile();
  const q = request.nextUrl.searchParams;
  const thisMonday = weekStart(todayISO());
  const fromParam = q.get("from") ?? "";
  const from = isValidISODate(fromParam) ? fromParam : thisMonday;
  const toParam = q.get("to") ?? "";
  const to = isValidISODate(toParam) && toParam >= from ? toParam : addDays(from, 6);
  if (daysBetween(from, to) > MAX_DAYS) {
    return new Response("Pick a range of a year or less.", { status: 400 });
  }
  // Users only ever get their own time.
  const requested = q.get("user") ?? me.id;
  const userId = me.role === "admin" ? requested : me.id;

  const supabase = await createClient();
  let query = supabase
    .from("time_entries")
    .select("user_id, work_date, hours, hour_type, note, project:projects(name, company:companies(name)), task:tasks(title)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date")
    .order("created_at");
  if (userId !== "all") query = query.eq("user_id", userId);

  let sheets = supabase
    .from("timesheets")
    .select("user_id, week_start, status")
    .gte("week_start", weekStart(from))
    .lte("week_start", to);
  if (userId !== "all") sheets = sheets.eq("user_id", userId);

  const [{ data }, { data: sheetData }, people] = await Promise.all([query, sheets, getPeople()]);
  const status = new Map(
    (sheetData ?? []).map((s) => [`${s.user_id}:${s.week_start}`, s.status as TimesheetStatus]),
  );
  const rows = ((data ?? []) as unknown as Row[]).map((r) => [
    r.work_date,
    nameOf(people, r.user_id),
    r.project?.company?.name ?? "",
    r.project?.name ?? "",
    r.task?.title ?? "",
    Number(r.hours),
    HOUR_TYPES.find((h) => h.value === r.hour_type)?.label ?? r.hour_type,
    r.hour_type === "billable" ? "Yes" : "No",
    r.note ?? "",
    status.get(`${r.user_id}:${weekStart(r.work_date)}`) ?? "open",
  ]);

  const who = userId === "all" ? "everyone" : slug(nameOf(people, userId));
  return csvResponse(
    `workhub-time-${who}-${from}-to-${to}.csv`,
    ["Date", "Person", "Client", "Project", "Task", "Hours", "Hour type", "Billable", "Note", "Timesheet"],
    rows,
  );
}
