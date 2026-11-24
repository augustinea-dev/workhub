"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideProof } from "@/app/(app)/proofs/actions";
import type { ProofStatus } from "@/lib/proofing";

const CHOICES: { value: ProofStatus; label: string; style: string }[] = [
  { value: "approved", label: "Approve", style: "bg-emerald-700 text-white hover:bg-emerald-800" },
  { value: "changes_requested", label: "Request changes", style: "bg-amber-500 text-white hover:bg-amber-600" },
  { value: "in_review", label: "Back to In review", style: "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50" },
];

export function ProofDecision({ proofId, status, openComments }: { proofId: string; status: ProofStatus; openComments: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {CHOICES.filter((c) => c.value !== status).map((c) => (
          <button
            key={c.value}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await decideProof(proofId, c.value);
                if (res.error) setError(res.error);
                else router.refresh();
              })
            }
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${c.style}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {status !== "approved" && openComments > 0 && (
        <p className="mt-2 text-xs text-amber-800">{openComments} comment{openComments === 1 ? " is" : "s are"} still open on the latest version.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
