"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addProofVersion, createProof } from "@/app/(app)/proofs/actions";
import { createClient } from "@/lib/supabase/client";
import { PROOF_BUCKET, PROOF_MAX_BYTES, PROOF_TYPES } from "@/lib/proofing";

export function ProofUpload({ taskId, proofId }: { taskId: string; proofId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Pick a PDF or image.");
    const ext = PROOF_TYPES[file.type];
    if (!ext) return setError("Proofs can be PDF, PNG, JPG or WebP files.");
    if (file.size > PROOF_MAX_BYTES) return setError("Proof files can be up to 50 MB.");
    setBusy(true);
    const path = `${taskId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await createClient().storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }
    const uploaded = { path, fileName: file.name, mimeType: file.type, size: file.size };
    const res = proofId ? await addProofVersion(proofId, uploaded) : await createProof(taskId, title, uploaded);
    setBusy(false);
    if (res.error) return setError(res.error);
    setFile(null);
    setTitle("");
    if (input.current) input.current.value = "";
    if (proofId) router.refresh();
    else router.push(`/proofs/${res.proofId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      {!proofId && (
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor={`proof-title-${taskId}`}>Proof name</label>
          <input
            id={`proof-title-${taskId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Defaults to the file name"
            className="input w-full"
          />
        </div>
      )}
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor={`proof-file-${proofId ?? taskId}`}>{proofId ? "New version" : "File"}</label>
        <input
          ref={input}
          id={`proof-file-${proofId ?? taskId}`}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-stone-700 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-stone-50"
        />
      </div>
      <button type="submit" disabled={busy || !file} className="btn-primary disabled:opacity-50">
        {busy ? "Uploading…" : proofId ? "Upload version" : "Add proof"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">{error}</p>
      )}
      <p className="w-full text-xs text-stone-500">PDF, PNG, JPG or WebP, up to 50 MB.</p>
    </form>
  );
}
