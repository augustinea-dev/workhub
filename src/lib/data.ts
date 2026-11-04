import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Company, Profile, ProjectType } from "@/lib/types";

export const getPeople = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, job_role, active, weekly_hours")
    .order("full_name");
  return (data ?? []) as Profile[];
});

export const getCompanies = cache(async (): Promise<Company[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, project_label, fiscal_year_start_month").order("name");
  return (data ?? []) as Company[];
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
