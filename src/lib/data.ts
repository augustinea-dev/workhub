import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Company, Profile } from "@/lib/types";

export const getPeople = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, job_role, active")
    .order("full_name");
  return (data ?? []) as Profile[];
});

export const getCompanies = cache(async (): Promise<Company[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name").order("name");
  return (data ?? []) as Company[];
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

/** Next.js search params → first string value. */
export function sp(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
