import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/** Bypasses row-level security. Server only, for tables no signed-in user may read. */
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
