import Link from "next/link";
import { discardTimer, logTimer } from "../actions";
import { SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { sp } from "@/lib/data";
import { dateOf, formatTimestamp, todayISO } from "@/lib/dates";
import { requireProfile } from "@/lib/session";
import { elapsedHours, getMyTimer, LONG_TIMER_HOURS, roundedHours } from "@/lib/timer";

export default async function TimerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requireProfile();
  const timer = await getMyTimer();

  if (!timer?.task) {
    return (
      <>
        <PageHeader title="Timer" />
        <Flash error={sp(params.error)} notice={sp(params.notice)} />
        <div className="card">
          <Empty>
            No timer running. Start one from a task, or from a task on <Link href="/" className="link">My Work</Link>.
          </Empty>
        </div>
      </>
    );
  }

  const ran = elapsedHours(timer.started_at);
  const hours = roundedHours(ran);
  const long = ran > LONG_TIMER_HOURS;
  const project = timer.task.project;
  const ranMins = Math.floor(ran * 60);
  const ranText = ranMins < 1 ? "under a minute" : ranMins < 60 ? `${ranMins} min` : `${Math.floor(ranMins / 60)} h ${ranMins % 60} min`;

  return (
    <>
      <PageHeader title="Stop timer" subtitle="Check the time, then log it or discard it." />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />
      <section className="card max-w-2xl">
        <div className="border-b border-stone-200 px-4 py-3">
          <Link href={`/tasks/${timer.task.id}`} className="font-medium hover:underline">{timer.task.title}</Link>
          {project && <p className="text-xs text-stone-500">{project.title || project.name}</p>}
          <p className="mt-1 text-sm text-stone-600">
            Started {formatTimestamp(timer.started_at)} · ran {ranText}
          </p>
        </div>
        {long && (
          <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This timer ran for more than {LONG_TIMER_HOURS} hours. It may have been left on by mistake, so check the hours before logging.
          </p>
        )}
        <form action={logTimer} className="grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="timer_date">Date</label>
            <input id="timer_date" name="work_date" type="date" defaultValue={dateOf(timer.started_at)} max={todayISO()} className="input w-full" />
          </div>
          <div>
            <label className="label" htmlFor="timer_hours">Hours</label>
            <input id="timer_hours" name="hours" type="number" step="0.25" min="0.25" max="24" required defaultValue={hours} className="input w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="timer_note">Note</label>
            <input id="timer_note" name="note" placeholder={`What you did on ${timer.task.title}`} className="input w-full" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <p className="text-xs text-stone-500">Hours are rounded to the nearest quarter hour.</p>
            <SubmitButton pendingText="Logging…">Log time and stop</SubmitButton>
          </div>
        </form>
        <form action={discardTimer} className="border-t border-stone-200 px-4 py-3">
          <SubmitButton pendingText="Discarding…" className="text-sm font-medium text-stone-600 hover:text-red-700">
            Discard timer without logging
          </SubmitButton>
        </form>
      </section>
    </>
  );
}
