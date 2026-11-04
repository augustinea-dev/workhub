import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { getPeople, nameOf } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { nextMilestone } from "@/lib/milestones";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUSES, type ProjectStatus, type TaskStatus } from "@/lib/types";

type Row = {
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  company: { name: string } | null;
  tasks: { id: string; title: string; status: TaskStatus; due_date: string | null; is_milestone: boolean; milestone_id: string | null }[];
  time_entries: { hours: number; hour_type: string }[];
};

export async function GET(request: NextRequest) {
  await requireProfile();
  const show = request.nextUrl.searchParams.get("show") === "all" ? "all" : "open";
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(
      "name, status, start_date, due_date, owner_id, company:companies(name), tasks(id, title, status, due_date, is_milestone, milestone_id), time_entries(hours, hour_type)",
    )
    .order("due_date", { ascending: true, nullsFirst: false });
  if (show === "open") query = query.not("status", "in", "(complete,cancelled)");
  const [{ data }, people] = await Promise.all([query, getPeople()]);
  const today = todayISO();

  const rows = ((data ?? []) as unknown as Row[]).map((p) => {
    const next = nextMilestone(p.tasks, today);
    const hours = p.time_entries.reduce((s, t) => s + Number(t.hours), 0);
    const billable = p.time_entries.filter((t) => t.hour_type === "billable").reduce((s, t) => s + Number(t.hours), 0);
    return [
      p.name,
      p.company?.name ?? "",
      p.owner_id ? nameOf(people, p.owner_id) : "",
      PROJECT_STATUSES.find((s) => s.value === p.status)?.label ?? p.status,
      p.start_date ?? "",
      p.due_date ?? "",
      next?.milestone.title ?? "",
      next?.milestone.due_date ?? "",
      p.tasks.filter((t) => t.status !== "done").length,
      p.tasks.length,
      +hours.toFixed(2),
      +billable.toFixed(2),
    ];
  });

  return csvResponse(
    `workhub-projects-${show}-${today}.csv`,
    ["Project", "Client", "Owner", "Status", "Start", "Due", "Next milestone", "Next milestone date", "Open tasks", "Total tasks", "Hours logged", "Billable hours"],
    rows,
  );
}
