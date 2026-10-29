"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { setTaskStatus } from "@/app/(app)/actions";
import { TASK_STATUSES, type TaskStatus } from "@/lib/types";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200/60"
      }`}
    >
      {children}
    </Link>
  );
}

/** Status dropdown that saves as soon as it changes (version-checked on the server). */
export function TaskStatusSelect({
  id,
  version,
  status,
  redirectTo,
}: {
  id: string;
  version: number;
  status: TaskStatus;
  redirectTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setTaskStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <select
        name="status"
        defaultValue={status}
        key={`${id}-${version}`}
        aria-label="Task status"
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}

/**
 * Re-renders the page when someone else changes these tables, so two people
 * looking at the same project or task see each other's updates without refreshing.
 */
export function LiveRefresh({
  subs,
}: {
  /** e.g. [{ table: "tasks", filter: "project_id=eq.<uuid>" }, { table: "comments" }] */
  subs: { table: string; filter?: string }[];
}) {
  const router = useRouter();
  const key = JSON.stringify(subs);

  useEffect(() => {
    const parsed = JSON.parse(key) as { table: string; filter?: string }[];
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300); // batch bursts of changes
    };
    const channel = supabase.channel(`live:${key}`);
    for (const s of parsed) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        refresh,
      );
    }
    channel.subscribe();
    const onOnline = () => router.refresh(); // catch anything missed while asleep/offline
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
