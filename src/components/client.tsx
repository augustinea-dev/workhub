"use client";

import { useEffect, useRef, useState } from "react";
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
      className={`flex items-center justify-between rounded-md border-l-[3px] px-3 py-2 text-sm font-medium ${
        active ? "border-blue-500 bg-white/10 text-white" : "border-transparent text-white/75 hover:bg-white/5 hover:text-white"
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

/**
 * A GET filter form: selects and checkboxes apply as soon as they change, text applies on Enter.
 * Empty fields are left out of the address so links stay short.
 */
export function FilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const go = () => {
    const form = formRef.current;
    if (!form) return;
    const qs = new URLSearchParams();
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
    });
    const s = qs.toString();
    router.push(s ? `${path}?${s}` : path, { scroll: false });
  };
  return (
    <form
      ref={formRef}
      method="get"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        if (el.tagName === "SELECT" || el.type === "checkbox") go();
      }}
    >
      {children}
    </form>
  );
}

/**
 * A delete button that asks in place before submitting its form (no browser dialog).
 * Put it inside the delete form.
 */
export function ConfirmDelete({
  children = "Delete",
  question,
  className = "btn-danger",
}: {
  children?: React.ReactNode;
  question: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={className}>
        {children}
      </button>
    );
  }
  return (
    <span role="group" aria-label="Confirm delete" className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-stone-800">{question}</span>
      <SubmitButton
        pendingText="Deleting…"
        className="inline-flex items-center rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
      >
        Yes, delete
      </SubmitButton>
      <button
        type="button"
        autoFocus
        onClick={() => setAsking(false)}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
      >
        Cancel
      </button>
    </span>
  );
}

/**
 * The ?notice= / ?error= message as a toast in the corner. Notices fade after a few seconds;
 * errors stay until closed. The parameter is then taken out of the address so a refresh doesn't repeat it.
 */
export function Toast({ error, notice }: { error?: string; notice?: string }) {
  const message = error ?? notice;
  const [open, setOpen] = useState(!!message);
  useEffect(() => {
    setOpen(!!message);
    if (!message) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (error) return;
    const t = setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(t);
  }, [message, error]);
  if (!open || !message) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
        error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="-mr-1 rounded px-1 text-base leading-none opacity-60 hover:opacity-100">
        ×
      </button>
    </div>
  );
}
