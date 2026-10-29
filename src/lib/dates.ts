// The agency works in Pacific time; servers (Vercel) run in UTC.
const TZ = "America/Los_Angeles";

/** Today's date in Pacific time as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(iso, -dow);
}

/** "Oct 28" for a date-only string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Mon, Oct 28" */
export function formatDay(iso: string): string {
  return parse(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Oct 28, 3:41 PM" for a timestamp, in Pacific time. */
export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function isValidISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime());
}
