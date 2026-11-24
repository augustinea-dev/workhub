import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader } from "@/components/ui";
import { sp } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { PROOF_STATUSES, proofingOn, proofStatus, type ProofStatus } from "@/lib/proofing";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  title: string;
  status: ProofStatus;
  updated_at: string;
  proof_versions: { id: string; number: number }[];
  task: { id: string; title: string; project: { id: string; name: string; title: string | null; company: { name: string } | null } };
};

const FILTERS = [{ value: "open", label: "Not approved" }, ...PROOF_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: "all", label: "All" }];

export default async function ProofsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireProfile();
  if (!proofingOn(me.role)) notFound();
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === sp(params.status)) ? sp(params.status)! : "open";
  const supabase = await createClient();
  let q = supabase
    .from("proofs")
    .select("id, title, status, updated_at, proof_versions(id, number), task:tasks(id, title, project:projects(id, name, title, company:companies(name)))")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (filter === "open") q = q.neq("status", "approved");
  else if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const latest = rows.map((r) => [...r.proof_versions].sort((a, b) => b.number - a.number)[0]).filter(Boolean);
  const { data: open } = latest.length
    ? await supabase.from("proof_comments").select("version_id").in("version_id", latest.map((v) => v.id)).is("parent_id", null).is("resolved_at", null)
    : { data: [] };
  const openBy = new Map<string, number>();
  for (const c of open ?? []) openBy.set(c.version_id, (openBy.get(c.version_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Proofs" subtitle="Every proof and where it stands. Test feature." />
      <nav aria-label="Filter proofs" className="mb-4 flex flex-wrap gap-1 text-sm font-medium">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "open" ? "/proofs" : `/proofs?status=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={`rounded-md px-3 py-1 ${filter === f.value ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No proofs here yet. Add one from a task&apos;s Proofs card.</Empty>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className="table-head">Proof</th>
                <th className="table-head">Project and task</th>
                <th className="table-head text-right">Version</th>
                <th className="table-head text-right">Open comments</th>
                <th className="table-head">Status</th>
                <th className="table-head">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = [...r.proof_versions].sort((a, b) => b.number - a.number)[0];
                const st = proofStatus(r.status);
                const openCount = v ? (openBy.get(v.id) ?? 0) : 0;
                return (
                  <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="table-cell">
                      <Link href={`/proofs/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                    </td>
                    <td className="table-cell text-stone-600">
                      <Link href={`/projects/${r.task.project.id}`} className="hover:underline">
                        {r.task.project.company?.name ? `${r.task.project.company.name} · ` : ""}
                        {r.task.project.title || r.task.project.name}
                      </Link>
                      <Link href={`/tasks/${r.task.id}`} className="block text-xs text-stone-500 hover:underline">{r.task.title}</Link>
                    </td>
                    <td className="table-cell text-right tabular-nums">{v ? `v${v.number}` : ""}</td>
                    <td className={`table-cell text-right tabular-nums ${openCount ? "font-medium text-amber-800" : "text-stone-400"}`}>{openCount}</td>
                    <td className="table-cell">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="table-cell whitespace-nowrap text-stone-600">{formatDate(r.updated_at.slice(0, 10))}</td>
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
