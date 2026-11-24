import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProof, renameProof } from "../actions";
import { ConfirmDelete, SubmitButton } from "@/components/client";
import { ProofUpload } from "@/components/proof-upload";
import { ProofViewer } from "@/components/proof-viewer";
import { Flash } from "@/components/ui";
import { getPeople, nameOf, sp } from "@/lib/data";
import { formatDate } from "@/lib/dates";
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

  const isAdmin = me.role === "admin";
  const project = proof.task.project;
  const closed = project.status === "complete" || project.status === "cancelled";
  const canUpload = !closed && (isAdmin || proof.task.task_assignees.some((a) => a.profile_id === me.id));
  const status = proofStatus(proof.status);
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
            <ProofViewer key={version.id} url={signed.signedUrl} mime={version.mime_type} fileName={version.file_name} />
          ) : (
            <p className="p-6 text-sm text-stone-500">This proof has no file yet.</p>
          )}
        </section>

        <div className="space-y-6">
          {canUpload && (
            <section className="card p-4">
              <h2 className="mb-1 text-sm font-semibold">Upload a new version</h2>
              <p className="mb-3 text-xs text-stone-500">Earlier versions and their comments are kept. A new version sets the proof back to In review.</p>
              <ProofUpload taskId={proof.task.id} proofId={proof.id} />
            </section>
          )}
          <section className="card p-4 text-sm text-stone-600">
            <h2 className="mb-2 text-sm font-semibold text-stone-900">Comments and decisions</h2>
            <p>Pinned comments and the Approve or Request changes buttons are coming next in this test.</p>
          </section>
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
