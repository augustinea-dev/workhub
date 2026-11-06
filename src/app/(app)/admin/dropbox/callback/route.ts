import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { saveConnection } from "@/lib/dropbox";
import { dropboxRedirectUri } from "@/lib/dropbox-redirect";
import { requireAdmin } from "@/lib/session";

export async function GET(request: NextRequest) {
  const me = await requireAdmin();
  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const expected = store.get("dropbox_state")?.value;
  store.delete("dropbox_state");
  const back = (key: "error" | "notice", msg: string) =>
    NextResponse.redirect(new URL(`/admin?${key}=${encodeURIComponent(msg)}#dropbox`, request.url));

  if (params.get("error")) return back("error", "Dropbox wasn't connected (the request was cancelled).");
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected) return back("error", "That Dropbox sign-in expired. Try Connect Dropbox again.");
  try {
    await saveConnection(code, await dropboxRedirectUri(), me.id);
  } catch (e) {
    return back("error", e instanceof Error ? e.message : "Couldn't connect Dropbox.");
  }
  return back("notice", "Dropbox connected. New projects will get a folder automatically.");
}
