import Link from "next/link";
import { LiveRefresh, TaskStatusSelect } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { addDays, formatDate, todayISO, weekStart } from "@/lib/dates";
import { sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  version: number;
  is_milestone: boolean;
  project: { id: string; name: string; company: { name: string } | null } | null;
};

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const today = todayISO();
  const monday = weekStart(today);

  const [{ data: tasks }, { data: hours }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, version, is_milestone, project:projects(id, name, company:companies(name))")
      .eq("assignee_id", me.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("time_entries")
      .select("hours")
      .eq("user_id", me.id)
      .gte("work_date", monday)
      .lte("work_date", addDays(monday, 6)),
  ]);

  const rows = (tasks ?? []) as unknown as Row[];
  const weekHours = (hours ?? []).reduce((s, h) => s + Number(h.hours), 0);
  const endOfWeek = addDays(monday, 6);

  const groups = [
    { label: "Overdue", items: rows.filter((t) => t.due_date && t.due_date < today), tone: "text-red-700" },
    { label: "Due this week", items: rows.filter((t) => t.due_date && t.due_date >= today && t.due_date <= endOfWeek), tone: "text-stone-900" },
    { label: "Later", items: rows.filter((t) => t.due_date && t.due_date > endOfWeek), tone: "text-stone-900" },
    { label: "No due date", items: rows.filter((t) => !t.due_date), tone: "text-stone-500" },
  ];

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks", filter: `assignee_id=eq.${me.id}` }]} />
      <PageHeader title={`Hi, ${me.full_name.split(" ")[0]}`} subtitle={`${rows.length} open tasks assigned to you`}>
        <Link href="/time" className="card px-4 py-3 text-right hover:bg-stone-50">
          <span className="block text-xs uppercase tracking-wide text-stone-500">Logged this week</span>
          <span className="text-xl font-semibold">{weekHours.toFixed(1)} h</span>
        </Link>
      </PageHeader>
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      {rows.length === 0 ? (
        <div className="card">
          <Empty>
            Nothing assigned to you. <Link href="/projects" className="link">Browse projects</Link>
          </Empty>
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.label} className="card overflow-hidden">
                <h2 className={`border-b border-stone-200 px-4 py-3 text-sm font-semibold ${g.tone}`}>
                  {g.label} <span className="font-normal text-stone-400">· {g.items.length}</span>
                </h2>
                <ul>
                  {g.items.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.is_milestone && <span title="Milestone">◆ </span>}
                          {t.title}
                        </Link>
                        <p className="truncate text-xs text-stone-500">
                          {t.project?.company?.name ? `${t.project.company.name} · ` : ""}
                          {t.project?.name}
                        </p>
                      </div>
                      <span className={`w-16 text-right text-sm ${g.label === "Overdue" ? "text-red-700" : "text-stone-600"}`}>
                        {formatDate(t.due_date)}
                      </span>
                      <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo="/" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
