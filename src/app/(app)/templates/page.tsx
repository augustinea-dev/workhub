import Link from "next/link";
import { createTemplate } from "../actions";
import { SubmitButton } from "@/components/client";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { sp } from "@/lib/data";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  template_tasks: { is_milestone: boolean; due_day: number }[];
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_templates")
    .select("id, name, description, updated_at, template_tasks(is_milestone, due_day)")
    .order("name");
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Reusable task lists. Days count working days (Mon to Fri) from the project start."
      />
      <Flash error={sp(params.error)} notice={sp(params.notice)} />

      <details className="card mb-6 p-4" open={rows.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ New template</summary>
        <form action={createTemplate} className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_2fr_auto]">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required className="input w-full" placeholder="Website build" />
          </div>
          <div>
            <label className="label" htmlFor="description">Description (copied to new projects)</label>
            <input id="description" name="description" className="input w-full" placeholder="Optional" />
          </div>
          <SubmitButton pendingText="Creating…">Create template</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-stone-500">
          Tip: you can also open any project and use <span className="font-medium">Save as template</span> to start from real work.
        </p>
      </details>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No templates yet.</Empty>
        ) : (
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <th className="table-head">Template</th>
                <th className="table-head">Tasks</th>
                <th className="table-head">Length</th>
                <th className="table-head">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const milestones = t.template_tasks.filter((x) => x.is_milestone).length;
                const length = t.template_tasks.length ? Math.max(...t.template_tasks.map((x) => x.due_day)) + 1 : 0;
                return (
                  <tr key={t.id} className="hover:bg-stone-50">
                    <td className="table-cell">
                      <Link href={`/templates/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                      {t.description && <p className="truncate text-xs text-stone-500">{t.description}</p>}
                    </td>
                    <td className="table-cell text-stone-600">
                      {t.template_tasks.length - milestones}
                      {milestones > 0 && <span className="text-stone-400"> · {milestones} milestone{milestones === 1 ? "" : "s"}</span>}
                    </td>
                    <td className="table-cell text-stone-600">
                      {length ? `${length} working day${length === 1 ? "" : "s"}` : <span className="text-stone-400">No tasks</span>}
                    </td>
                    <td className="table-cell text-stone-600">{formatTimestamp(t.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
