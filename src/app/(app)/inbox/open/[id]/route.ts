import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opening a notification marks it read, then goes to the task it's about.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("task_id")
    .maybeSingle();
  const target = data?.task_id ? `/tasks/${data.task_id}` : "/inbox";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), { status: 303 });
}
