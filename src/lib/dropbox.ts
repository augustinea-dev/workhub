import { createServiceClient } from "@/lib/supabase/service";

const API = "https://api.dropboxapi.com/2";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export type DropboxStatus =
  | { state: "missing_setup"; missing: string[] }
  | { state: "disconnected" }
  | { state: "connected"; account_name: string; account_email: string | null; connected_at: string };

function appCredentials() {
  return { key: process.env.DROPBOX_APP_KEY ?? "", secret: process.env.DROPBOX_APP_SECRET ?? "" };
}

function basicAuth() {
  const { key, secret } = appCredentials();
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appCredentials().key,
    response_type: "code",
    token_access_type: "offline",
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

export async function dropboxStatus(): Promise<DropboxStatus> {
  const { key, secret } = appCredentials();
  const service = createServiceClient();
  const missing = [
    ...(key ? [] : ["DROPBOX_APP_KEY"]),
    ...(secret ? [] : ["DROPBOX_APP_SECRET"]),
    ...(service ? [] : ["SUPABASE_SECRET_KEY"]),
  ];
  if (missing.length || !service) return { state: "missing_setup", missing };
  const { data } = await service
    .from("dropbox_connection")
    .select("account_name, account_email, connected_at")
    .eq("id", true)
    .maybeSingle();
  return data ? { state: "connected", ...data } : { state: "disconnected" };
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? `Dropbox sign-in failed (${res.status}).`);
  return json as { access_token: string; refresh_token?: string };
}

async function rpc<T>(token: string, path: string, args: unknown): Promise<{ ok: true; data: T } | { ok: false; summary: string }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.ok) return { ok: true, data: json as T };
  return { ok: false, summary: String(json.error_summary ?? (text || res.status)) };
}

/** Swaps the code from Dropbox's approval page for a refresh token and saves the connection. */
export async function saveConnection(code: string, redirectUri: string, profileId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Add SUPABASE_SECRET_KEY to .env.local first.");
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!tokens.refresh_token) throw new Error("Dropbox didn't return a long-lived token. Try connecting again.");
  const account = await rpc<{ name: { display_name: string }; email: string }>(tokens.access_token, "/users/get_current_account", null);
  if (!account.ok) throw new Error(`Couldn't read the Dropbox account: ${account.summary}`);
  const { error } = await service.from("dropbox_connection").upsert({
    id: true,
    account_name: account.data.name.display_name,
    account_email: account.data.email,
    refresh_token: tokens.refresh_token,
    connected_by: profileId,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function removeConnection() {
  const service = createServiceClient();
  if (!service) throw new Error("Add SUPABASE_SECRET_KEY to .env.local first.");
  const { data } = await service.from("dropbox_connection").select("refresh_token").eq("id", true).maybeSingle();
  if (data) {
    try {
      const { access_token } = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
      await fetch(`${API}/auth/token/revoke`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` } });
    } catch {}
  }
  const { error } = await service.from("dropbox_connection").delete().eq("id", true);
  if (error) throw new Error(error.message);
}

async function accessToken(): Promise<string> {
  const service = createServiceClient();
  if (!service) throw new Error("Dropbox isn't set up.");
  const { data } = await service.from("dropbox_connection").select("refresh_token").eq("id", true).maybeSingle();
  if (!data) throw new Error("Dropbox isn't connected.");
  const { access_token } = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  return access_token;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/[\s.]+$/, "").trim() || "Untitled";
}

/**
 * Creates `/<client>/<project name>` (inside the app folder for an App folder app), reusing it if it
 * already exists, and returns a share link to it.
 */
export async function createProjectFolder(projectName: string, clientName: string | null): Promise<string> {
  const token = await accessToken();
  const path = `/${safeName(clientName ?? "No client")}/${safeName(projectName)}`;
  const made = await rpc(token, "/files/create_folder_v2", { path, autorename: false });
  if (!made.ok && !made.summary.startsWith("path/conflict/folder")) throw new Error(made.summary);

  const link = await rpc<{ url: string }>(token, "/sharing/create_shared_link_with_settings", { path });
  if (link.ok) return link.data.url;
  if (!link.summary.startsWith("shared_link_already_exists")) throw new Error(link.summary);
  const existing = await rpc<{ links: { url: string }[] }>(token, "/sharing/list_shared_links", { path, direct_only: true });
  if (existing.ok && existing.data.links[0]) return existing.data.links[0].url;
  throw new Error("The folder was made, but its share link couldn't be found.");
}
