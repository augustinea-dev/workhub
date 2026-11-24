"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROOF_BUCKET, PROOF_MAX_BYTES, PROOF_TYPES, proofingOn } from "@/lib/proofing";

type Uploaded = { path: string; fileName: string; mimeType: string; size: number };
type Result = { error?: string; proofId?: string };

function checkFile(f: Uploaded, folder: string): string | null {
  if (!PROOF_TYPES[f.mimeType]) return "Proofs can be PDF, PNG, JPG or WebP files.";
  if (!(f.size > 0 && f.size <= PROOF_MAX_BYTES)) return "Proof files can be up to 50 MB.";
  if (!f.path.startsWith(`${folder}/`) || f.path.includes("..")) return "That upload doesn't belong to this task.";
  if (!f.fileName.trim()) return "The file needs a name.";
  return null;
}

async function gate() {
  const me = await requireProfile();
  if (!proofingOn(me.role)) throw new Error("Proofing isn't turned on.");
  return me;
}

export async function createProof(taskId: string, title: string, file: Uploaded): Promise<Result> {
  await gate();
  const name = title.trim() || file.fileName.replace(/\.[^.]+$/, "");
  const bad = checkFile(file, taskId);
  if (bad) return { error: bad };
  const supabase = await createClient();
  const { data: proof, error } = await supabase.from("proofs").insert({ task_id: taskId, title: name }).select("id").single();
  if (error || !proof) {
    await supabase.storage.from(PROOF_BUCKET).remove([file.path]);
    return { error: error?.message ?? "Couldn't create the proof." };
  }
  const { error: vErr } = await supabase
    .from("proof_versions")
    .insert({ proof_id: proof.id, storage_path: file.path, file_name: file.fileName.trim(), mime_type: file.mimeType, size_bytes: file.size });
  if (vErr) return { error: vErr.message, proofId: proof.id };
  revalidatePath(`/tasks/${taskId}`);
  return { proofId: proof.id };
}

export async function addProofVersion(proofId: string, file: Uploaded): Promise<Result> {
  await gate();
  const supabase = await createClient();
  const { data: proof } = await supabase.from("proofs").select("task_id").eq("id", proofId).maybeSingle();
  if (!proof) return { error: "That proof no longer exists." };
  const bad = checkFile(file, proof.task_id);
  if (bad) return { error: bad };
  const { error } = await supabase
    .from("proof_versions")
    .insert({ proof_id: proofId, storage_path: file.path, file_name: file.fileName.trim(), mime_type: file.mimeType, size_bytes: file.size });
  if (error) {
    await supabase.storage.from(PROOF_BUCKET).remove([file.path]);
    return { error: error.message };
  }
  revalidatePath(`/proofs/${proofId}`);
  revalidatePath(`/tasks/${proof.task_id}`);
  return { proofId };
}

export async function renameProof(fd: FormData) {
  await gate();
  const id = String(fd.get("id") ?? "");
  const title = String(fd.get("title") ?? "").trim();
  const back = `/proofs/${id}`;
  if (!title) redirect(`${back}?error=${encodeURIComponent("Give the proof a name.")}`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("proofs").update({ title, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  if (!data?.length) redirect(`${back}?error=${encodeURIComponent("Only Admins and the task's people can rename a proof.")}`);
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Proof renamed.")}`);
}

export async function deleteProof(fd: FormData) {
  await requireAdmin();
  await gate();
  const id = String(fd.get("id") ?? "");
  const supabase = await createClient();
  const { data: proof } = await supabase.from("proofs").select("task_id, proof_versions(storage_path)").eq("id", id).maybeSingle();
  if (!proof) redirect("/");
  const paths = ((proof.proof_versions ?? []) as { storage_path: string }[]).map((v) => v.storage_path);
  const { error } = await supabase.from("proofs").delete().eq("id", id);
  if (error) redirect(`/proofs/${id}?error=${encodeURIComponent(error.message)}`);
  if (paths.length) await supabase.storage.from(PROOF_BUCKET).remove(paths);
  revalidatePath(`/tasks/${proof.task_id}`);
  redirect(`/tasks/${proof.task_id}?notice=${encodeURIComponent("Proof deleted, with all its versions and comments.")}`);
}

type Done = { error?: string };

async function proofPathFor(supabase: Awaited<ReturnType<typeof createClient>>, versionId: string) {
  const { data } = await supabase.from("proof_versions").select("proof_id").eq("id", versionId).maybeSingle();
  return data ? `/proofs/${data.proof_id}` : null;
}

export async function addProofComment(versionId: string, page: number, x: number, y: number, body: string): Promise<Done> {
  await gate();
  const text = body.trim();
  if (!text) return { error: "Write a comment first." };
  if (!(page >= 1 && x >= 0 && x <= 1 && y >= 0 && y <= 1)) return { error: "Place the pin on the proof." };
  const supabase = await createClient();
  const me = await requireProfile();
  const { error } = await supabase
    .from("proof_comments")
    .insert({ version_id: versionId, page, x: +x.toFixed(5), y: +y.toFixed(5), body: text, author_id: me.id });
  if (error) return { error: error.message };
  const path = await proofPathFor(supabase, versionId);
  if (path) revalidatePath(path);
  return {};
}

export async function replyProofComment(versionId: string, parentId: string, body: string): Promise<Done> {
  await gate();
  const text = body.trim();
  if (!text) return { error: "Write a reply first." };
  const supabase = await createClient();
  const me = await requireProfile();
  const { error } = await supabase.from("proof_comments").insert({ version_id: versionId, parent_id: parentId, body: text, author_id: me.id });
  if (error) return { error: error.message };
  const path = await proofPathFor(supabase, versionId);
  if (path) revalidatePath(path);
  return {};
}

export async function resolveProofComment(commentId: string, resolved: boolean): Promise<Done> {
  await gate();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_proof_comment", { p_comment: commentId, p_resolved: resolved });
  return error ? { error: error.message } : {};
}

export async function deleteProofComment(commentId: string): Promise<Done> {
  await gate();
  const supabase = await createClient();
  const { data, error } = await supabase.from("proof_comments").delete().eq("id", commentId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can only delete your own comments." };
  return {};
}

export async function decideProof(proofId: string, status: "in_review" | "changes_requested" | "approved"): Promise<Done> {
  await gate();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_proof", { p_proof: proofId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath(`/proofs/${proofId}`);
  return {};
}
