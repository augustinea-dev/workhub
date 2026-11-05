import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Company, JobRole, Profile, ProjectType, Team } from "@/lib/types";

export const getPeople = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, weekly_hours, job_roles:profile_job_roles(role_id, is_main)")
    .order("full_name");
  return (data ?? []) as Profile[];
});

export const getCompanies = cache(async (): Promise<Company[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, project_label, fiscal_year_start_month").order("name");
  return (data ?? []) as Company[];
});

export const getTeams = cache(async (): Promise<Team[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("id, name, manager_id, active, team_members(profile_id)").order("name");
  return (data ?? []).map(({ team_members, ...t }) => ({
    ...t,
    member_ids: ((team_members ?? []) as { profile_id: string }[]).map((m) => m.profile_id),
  })) as Team[];
});

/** People in active teams this person manages (not including themselves). */
export function managedIds(teams: Team[], meId: string): string[] {
  return [...new Set(teams.filter((t) => t.active && t.manager_id === meId).flatMap((t) => t.member_ids))].filter(
    (id) => id !== meId,
  );
}

export const getJobRoles = cache(async (): Promise<JobRole[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("job_roles").select("*").order("sort_order").order("name");
  return (data ?? []) as JobRole[];
});

export const getProjectTypes = cache(async (): Promise<ProjectType[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("project_types").select("*").order("sort_order").order("code");
  return (data ?? []) as ProjectType[];
});

export const getNextReference = cache(async (): Promise<number | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("workhub_settings").select("next_reference_number").maybeSingle();
  return data ? Number(data.next_reference_number) : null;
});

export const getProjectOptions = cache(async (): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .not("status", "in", "(complete,cancelled)")
    .order("name");
  return data ?? [];
});

export function nameOf(people: Profile[], id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return people.find((p) => p.id === id)?.full_name ?? "Former user";
}

/** Name plus email, for pickers, so people with similar names can't be confused. */
export function personOption(p: Profile): string {
  return `${p.full_name} (${p.email})`;
}

/** Next.js search params → first string value. */
export function sp(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
