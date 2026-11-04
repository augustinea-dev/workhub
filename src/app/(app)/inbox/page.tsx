import { markAllRead } from "../actions";
import { LiveRefresh, SubmitButton } from "@/components/client";
import { Empty, PageHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { NotificationEvent } from "@/lib/types";

export default async function InboxPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_events")
    .select("id, kind, summary, task_id, project_id, timesheet_id, read_at, created_at")
    .eq("recipient_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as NotificationEvent[];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <LiveRefresh subs={[{ table: "notification_events", filter: `recipient_id=eq.${me.id}` }]} />
      <PageHeader title="Inbox" subtitle={`${unread} unread · opening a notification marks it read`}>
        {unread > 0 && (
          <form action={markAllRead}>
            <SubmitButton className="btn" pendingText="Marking…">Mark all read</SubmitButton>
          </form>
        )}
      </PageHeader>
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <Empty>You&apos;ll see assignments, mentions, new comments and timesheet decisions here.</Empty>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className={`flex items-center gap-3 border-b border-stone-100 px-4 py-3 ${n.read_at ? "" : "bg-blue-50/50"}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-blue-700"}`} />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {n.kind === "mention" && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900">Mention</span>
                  )}
                  {n.kind.startsWith("timesheet_") && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">Timesheet</span>
                  )}
                  {n.task_id || n.timesheet_id ? (
                    <a href={`/inbox/open/${n.id}`} className={`text-sm hover:underline ${n.read_at ? "" : "font-semibold"}`}>{n.summary}</a>
                  ) : (
                    <p className="text-sm font-medium">{n.summary}</p>
                  )}
                </div>
                <span className="text-xs text-stone-500">{formatTimestamp(n.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
