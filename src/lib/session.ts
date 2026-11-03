import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in staff member, or a redirect to /login. Cached per request. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, job_role, active")
    .eq("id", userId)
    .single();

  if (!profile || !profile.active) redirect("/login?error=inactive");
  return profile as Profile;
});

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/?error=" + encodeURIComponent("Admins only."));
  return profile;
}
