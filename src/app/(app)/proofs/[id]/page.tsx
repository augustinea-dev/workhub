import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProof, renameProof } from "../actions";
import { ConfirmDelete, SubmitButton } from "@/components/client";
import { ProofUpload } from "@/components/proof-upload";
import { ProofDecision } from "@/components/proof-decision";
import { ProofReview, type ReviewComment } from "@/components/proof-review";
import { Flash } from "@/components/ui";
import { getPeople, nameOf, sp } from "@/lib/data";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { PROOF_BUCKET, proofingOn, proofStatus, sizeLabel, type Proof, type ProofVersion } from "@/lib/proofing";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Row = Proof & {
  proof_versions: ProofVersion[];
  task: {
    id: string;
    title: string;
    task_assignees: { profile_id: string }[];
    project: { id: string; name: string; title: string | null; status: string; owner_id: string | null };
  };
};

export default async function ProofPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const me = await requireProfile();
  if (!proofingOn(me.role)) notFound();
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase
      .from("proofs")
      .select("*, proof_versions(*), task:tasks(id, title, task_assignees(profile_id), project:projects(id, name, title, status, owner_id))")
      .eq("id", id)
      .maybeSingle(),
    getPeople(),
  ]);
  if (!data) notFound();
  const proof = data as unknown as Row;
  const versions = [...proof.proof_versions].sort((a, b) => b.number - a.number);
  const wanted = Number.parseInt(sp(query.v) ?? "", 10);
  const version = versions.find((v) => v.number === wanted) ?? versions[0];
  const { data: signed } = version ? await supabase.storage.from(PROOF_BUCKET).createSignedUrl(version.storage_path, 60 * 60) : { data: null };

  const { data: commentData } = version
    ? await supabase.from("proof_comments").select("*").eq("version_id", version.id).order("created_at")
    : { data: [] };
  const latestId = versions[0]?.id;
  const { data: latestOpen } = latestId
    ? await supabase.from("proof_comments").select("id", { count: "exact" }).eq("version_id", latestId).is("parent_id", null).is("resolved_at", null)
    : { data: [] };
  const isAdmin = me.role === "admin";
  const project = proof.task.project;
  const closed = project.status === "complete" || project.status === "cancelled";
  const canUpload = !closed && (isAdmin || proof.task.task_assignees.some((a) => a.profile_id === me.id));
  const status = proofStatus(proof.status);
  const canDecide = !closed && (isAdmin || project.owner_id === me.id);
  const comments: ReviewComment[] = (
    (commentData ?? []) as { id: string; parent_id: string | null; author_id: string; body: string; page: number | null; x: number | null; y: number | null; pin: number | null; resolved_at: string | null; created_at: string }[]
  ).map((c) => ({
    id: c.id,
    parent_id: c.parent_id,
    author: c.author_id === me.id ? "You" : nameOf(people, c.author_id),
    mine: c.author_id === me.id,
    body: c.body,
    page: c.page,
    x: c.x == null ? null : Number(c.x),
    y: c.y == null ? null : Number(c.y),
    pin: c.pin,
    resolved: !!c.resolved_at,
    when: formatTimestamp(c.created_at),
  }));
  const here = `/proofs/${id}`;

  return (
    <>
      <p className="mb-2 text-sm text-stone-500">
        <Link href={`/projects/${project.id}`} className="hover:underline">{project.title || project.name}</Link>
        {" · "}
        <Link href={`/tasks/${proof.task.id}`} className="hover:underline">{proof.task.title}</Link>
        {" · Proofs"}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{proof.title}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
        {proof.decided_at && (
          <span className="text-xs text-stone-500">
            by {nameOf(people, proof.decided_by ?? "")} on {formatDate(proof.decided_at.slice(0, 10))}
          </span>
        )}
      </div>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      <div className="space-y-6">
        <section className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 py-3">
            <span className="text-sm font-semibold">Version</span>
            <nav aria-label="Versions" className="flex flex-wrap gap-1">
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={v.number === versions[0].number ? here : `${here}?v=${v.number}`}
                  aria-current={v.id === version?.id ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1 text-sm font-medium ${v.id === version?.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
                >
                  v{v.number}
                  {v.number === versions[0].number && <span className="ml-1 text-xs opacity-70">latest</span>}
                </Link>
              ))}
            </nav>
            {version && (
              <span className="ml-auto text-xs text-stone-500">
                {version.file_name} · {sizeLabel(version.size_bytes)} · {nameOf(people, version.created_by ?? "")}, {formatDate(version.created_at.slice(0, 10))}
              </span>
            )}
          </div>
          {version && signed?.signedUrl ? (
            <ProofReview
              key={version.id}
              versionId={version.id}
              url={signed.signedUrl}
              mime={version.mime_type}
              fileName={version.file_name}
              comments={comments}
              canDeleteAny={isAdmin}
              latest={version.id === latestId}
            />
          ) : (
            <p className="p-6 text-sm text-stone-500">This proof has no file yet.</p>
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-3">
          {canDecide && (
            <section className="card p-4">
              <h2 className="mb-1 text-sm font-semibold">Decision</h2>
              <p className="mb-3 text-xs text-stone-500">Admins and the project owner decide. A new version sets it back to In review.</p>
              <ProofDecision proofId={proof.id} status={proof.status} openComments={(latestOpen ?? []).length} />
            </section>
          )}
          {canUpload && (
            <section className="card p-4">
              <h2 className="mb-1 text-sm font-semibold">Upload a new version</h2>
              <p className="mb-3 text-xs text-stone-500">Earlier versions and their comments are kept. A new version sets the proof back to In review.</p>
              <ProofUpload taskId={proof.task.id} proofId={proof.id} />
            </section>
          )}
          {canUpload && (
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">Proof details</h2>
              <form action={renameProof} className="flex items-end gap-2">
                <input type="hidden" name="id" value={proof.id} />
                <div className="flex-1">
                  <label className="label" htmlFor="proof_title">Name</label>
                  <input id="proof_title" name="title" defaultValue={proof.title} required className="input w-full" />
                </div>
                <SubmitButton className="btn">Save</SubmitButton>
              </form>
              {isAdmin && (
                <form action={deleteProof} className="mt-4 border-t border-stone-100 pt-3">
                  <input type="hidden" name="id" value={proof.id} />
                  <ConfirmDelete question={`Delete “${proof.title}” with all ${versions.length} version${versions.length === 1 ? "" : "s"} and comments? This can't be undone.`}>
                    Delete proof
                  </ConfirmDelete>
                </form>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
