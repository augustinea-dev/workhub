import { saveNotificationSettings } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader } from "@/components/ui";
import { sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_KINDS } from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("notification_preferences").select("kind, in_app").eq("profile_id", me.id);
  const off = new Set((data ?? []).filter((p) => !p.in_app).map((p) => p.kind as string));

  return (
    <>
      <PageHeader title="Notification settings" subtitle="Choose which notices show up in your Inbox." />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <form action={saveNotificationSettings} className="card max-w-2xl">
        <ul>
          {NOTIFICATION_KINDS.map((k) => (
            <li key={k.kind} className="flex items-start justify-between gap-4 border-b border-stone-100 px-4 py-4 last:border-0">
              <div>
                <label htmlFor={`n_${k.kind}`} className="text-sm font-medium text-stone-900">{k.label}</label>
                <p className="text-xs text-stone-500">{k.help}</p>
              </div>
              <input
                id={`n_${k.kind}`}
                type="checkbox"
                name={k.kind}
                defaultChecked={k.locked || !off.has(k.kind)}
                disabled={k.locked}
                className="mt-1 h-4 w-4"
              />
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-stone-200 px-4 py-3">
          <SubmitButton>Save settings</SubmitButton>
          <p className="text-xs text-stone-500">Email notices will get their own switches once email is set up.</p>
        </div>
      </form>
    </>
  );
}
