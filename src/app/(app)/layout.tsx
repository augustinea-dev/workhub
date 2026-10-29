import { NavLink } from "@/components/client";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireProfile();
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", me.id)
    .is("read_at", null);

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-stone-200 bg-stone-100 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <p className="text-lg font-semibold">Workhub</p>
          <p className="hidden text-xs text-stone-500 md:block">Augustine Agency</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:pb-0">
          <NavLink href="/">My Work</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          <NavLink href="/time">Time</NavLink>
          <NavLink href="/clients">Clients</NavLink>
          <NavLink href="/inbox">
            Inbox
            {!!unread && (
              <span className="ml-2 rounded-full bg-blue-700 px-2 text-xs font-semibold text-white">{unread}</span>
            )}
          </NavLink>
          {me.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div className="hidden border-t border-stone-200 px-4 py-4 md:absolute md:bottom-0 md:block md:w-56">
          <p className="truncate text-sm font-medium">{me.full_name}</p>
          <p className="truncate text-xs text-stone-500">{me.email}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs font-medium text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
