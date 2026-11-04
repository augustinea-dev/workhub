import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/csv";
import { getPeople, nameOf } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { filterAndSortProjects, parseProjectFilters } from "@/lib/list-filters";
import { nextMilestone } from "@/lib/milestones";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUSES, type ProjectStatus, type TaskStatus } from "@/lib/types";

type Row = {
  name: string;
  reference_number: number | null;
  billing_year: string | null;
  title: string | null;
  project_type: string | null;
  cost_code: string | null;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  company_id: string | null;
  company: { name: string } | null;
  tasks: { id: string; title: string; status: TaskStatus; due_date: string | null; is_milestone: boolean; milestone_id: string | null }[];
  time_entries: { hours: number; hour_type: string }[];
};

export async function GET(request: NextRequest) {
  await requireProfile();
  const f = parseProjectFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const query = supabase
    .from("projects")
    .select(
      "name, reference_number, billing_year, title, project_type, cost_code, description, status, start_date, due_date, owner_id, company_id, company:companies(name), tasks(id, title, status, due_date, is_milestone, milestone_id), time_entries(hours, hour_type)",
    );
  const [{ data }, people] = await Promise.all([query, getPeople()]);
  const today = todayISO();

  const rows = filterAndSortProjects((data ?? []) as unknown as Row[], f, today).map((p) => {
    const next = nextMilestone(p.tasks, today);
    const hours = p.time_entries.reduce((s, t) => s + Number(t.hours), 0);
    const billable = p.time_entries.filter((t) => t.hour_type === "billable").reduce((s, t) => s + Number(t.hours), 0);
    return [
      p.reference_number ?? "",
      p.name,
      p.title ?? "",
      p.project_type ?? "",
      p.billing_year ?? "",
      p.cost_code ?? "",
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
      p.description ?? "",
    ];
  });

  return csvResponse(
    `workhub-projects-${f.status}-${today}.csv`,
    [
      "Reference #", "Project", "Title", "Type", "Billing year (override)", "Cost code", "Client", "Owner", "Status", "Start", "Due",
      "Next milestone", "Next milestone date", "Open tasks", "Total tasks", "Hours logged", "Billable hours", "Description",
    ],
    rows,
  );
}
