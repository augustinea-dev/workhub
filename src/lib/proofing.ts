import type { UserRole } from "@/lib/types";

export const PROOF_BUCKET = "proofs";
export const PROOF_MAX_BYTES = 50 * 1024 * 1024;
export const PROOF_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ProofStatus = "in_review" | "changes_requested" | "approved";

export const PROOF_STATUSES: { value: ProofStatus; label: string; tone: string }[] = [
  { value: "in_review", label: "In review", tone: "bg-sky-100 text-sky-900" },
  { value: "changes_requested", label: "Changes requested", tone: "bg-amber-100 text-amber-900" },
  { value: "approved", label: "Approved", tone: "bg-emerald-100 text-emerald-900" },
];

export const proofStatus = (s: ProofStatus) => PROOF_STATUSES.find((x) => x.value === s) ?? PROOF_STATUSES[0];

export function proofingOn(role: UserRole): boolean {
  const mode = process.env.PROOFING;
  return mode === "all" || (mode === "admins" && role === "admin");
}

export type ProofVersion = {
  id: string;
  proof_id: string;
  number: number;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
};

export type Proof = {
  id: string;
  task_id: string;
  title: string;
  status: ProofStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
