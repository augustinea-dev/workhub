import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type RunningTimer = {
  task_id: string;
  started_at: string;
  task: { id: string; title: string; project: { id: string; name: string; title: string | null } | null } | null;
};

export const LONG_TIMER_HOURS = 10;

export const getMyTimer = cache(async (): Promise<RunningTimer | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("running_timers")
    .select("task_id, started_at, task:tasks(id, title, project:projects(id, name, title))")
    .maybeSingle();
  return (data as unknown as RunningTimer | null) ?? null;
});

export function elapsedHours(startedAt: string, now = Date.now()): number {
  return Math.max(0, (now - new Date(startedAt).getTime()) / 3_600_000);
}

export function roundedHours(hours: number): number {
  return Math.min(24, Math.max(0.25, Math.round(hours * 4) / 4));
}
