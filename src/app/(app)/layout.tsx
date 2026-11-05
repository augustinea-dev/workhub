import Link from "next/link";
import Image from "next/image";
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
      <aside className="bg-sidebar text-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
            <Image src="/augustine-mark.png" alt="" width={26} height={26} priority />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">Workhub</p>
            <p className="hidden text-xs text-white/60 md:block">Augustine Agency</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:pb-0">
          <NavLink href="/">My Work</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          <NavLink href="/time">Time</NavLink>
          <NavLink href="/clients">Clients</NavLink>
          <NavLink href="/inbox">
            Inbox
            {!!unread && (
              <span className="ml-2 rounded-full bg-blue-500 px-2 text-xs font-semibold text-white">{unread}</span>
            )}
          </NavLink>
          {me.role === "admin" && <NavLink href="/templates">Templates</NavLink>}
          {me.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div className="hidden border-t border-white/10 px-4 py-4 md:absolute md:bottom-0 md:block md:w-56">
          <p className="truncate text-sm font-medium">{me.full_name}</p>
          <p className="truncate text-xs text-white/60">{me.email}</p>
          <Link href="/settings" className="mt-2 block text-xs font-medium text-white/70 hover:text-white">
            Notification settings
          </Link>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs font-medium text-white/70 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
