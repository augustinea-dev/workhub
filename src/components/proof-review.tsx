"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addProofComment, deleteProofComment, replyProofComment, resolveProofComment } from "@/app/(app)/proofs/actions";
import { ProofViewer } from "@/components/proof-viewer";

export type ReviewComment = {
  id: string;
  parent_id: string | null;
  author: string;
  mine: boolean;
  body: string;
  page: number | null;
  x: number | null;
  y: number | null;
  pin: number | null;
  resolved: boolean;
  when: string;
};

type Draft = { page: number; x: number; y: number };

export function ProofReview({
  versionId,
  url,
  mime,
  fileName,
  comments,
  canDeleteAny,
  latest,
}: {
  versionId: string;
  url: string;
  mime: string;
  fileName: string;
  comments: ReviewComment[];
  canDeleteAny: boolean;
  latest: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pins = comments.filter((c) => !c.parent_id).sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0));
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);
  const shown = pins.filter((p) => showResolved || !p.resolved || p.id === selected);
  const openCount = pins.filter((p) => !p.resolved).length;

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      router.refresh();
    });

  const select = (id: string) => {
    setSelected(id);
    document.querySelector(`[data-pin-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const overlay = (page: number) => (
    <>
      {shown
        .filter((p) => p.page === page)
        .map((p) => (
          <button
            key={p.id}
            type="button"
            data-proof-pin
            data-pin-id={p.id}
            onClick={() => {
              setSelected(p.id);
              document.getElementById(`comment-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
            aria-label={`Comment ${p.pin}`}
            className={`absolute z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-none border-2 border-white text-xs font-bold text-white shadow-md transition-transform hover:scale-110 ${
              p.resolved ? "bg-stone-400" : "bg-blue-600"
            } ${selected === p.id ? "scale-110 ring-2 ring-blue-300" : ""}`}
            style={{ left: `${(p.x ?? 0) * 100}%`, top: `${(p.y ?? 0) * 100}%` }}
          >
            {p.pin}
          </button>
        ))}
      {draft?.page === page && (
        <div data-proof-pin className="absolute z-20" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>
          <span className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-none border-2 border-white bg-amber-500 text-xs font-bold text-white shadow-md">
            +
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addProofComment(versionId, draft.page, draft.x, draft.y, text), () => {
                setDraft(null);
                setText("");
              });
            }}
            className={`absolute top-2 w-72 rounded-lg border border-stone-200 bg-white p-3 shadow-lg ${draft.x > 0.6 ? "right-0" : "left-0"}`}
          >
            <label className="label" htmlFor="pin-text">Comment</label>
            <textarea
              id="pin-text"
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDraft(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              className="input w-full"
              placeholder="What should change here?"
            />
            <div className="mt-2 flex items-center gap-2">
              <button type="submit" disabled={pending || !text.trim()} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">
                {pending ? "Saving…" : "Add comment"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="btn px-3 py-1.5 text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );

  return (
    <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 border-stone-200 lg:border-r">
        <ProofViewer
          url={url}
          mime={mime}
          fileName={fileName}
          overlay={overlay}
          onPageClick={(page, x, y) => {
            setSelected(null);
            setDraft({ page, x, y });
            setText("");
          }}
        />
      </div>
      <aside className="flex max-h-[calc(100vh-11rem)] min-w-0 flex-col">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="text-sm font-semibold">
            Comments <span className="font-normal text-stone-400">· {openCount} open</span>
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {latest ? "Click anywhere on the proof to pin a comment." : "This is an earlier version. Comments here stay with it."}
          </p>
          {pins.some((p) => p.resolved) && (
            <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
              Show resolved ({pins.filter((p) => p.resolved).length})
            </label>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
        <ol className="flex-1 overflow-y-auto">
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-stone-500">No comments yet.</li>}
          {shown.map((p) => (
            <li
              key={p.id}
              id={`comment-${p.id}`}
              className={`border-b border-stone-100 px-4 py-3 ${selected === p.id ? "bg-blue-50" : ""} ${p.resolved ? "opacity-70" : ""}`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  aria-label={`Show comment ${p.pin} on the proof`}
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${p.resolved ? "bg-stone-400" : "bg-blue-600"}`}
                >
                  {p.pin}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-stone-500">
                    <span className="font-medium text-stone-800">{p.author}</span> · {p.when} · page {p.page}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-stone-900">{p.body}</p>
                  {replies(p.id).map((r) => (
                    <div key={r.id} className="mt-2 border-l-2 border-stone-200 pl-2">
                      <p className="text-xs text-stone-500">
                        <span className="font-medium text-stone-800">{r.author}</span> · {r.when}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm text-stone-800">{r.body}</p>
                      {(r.mine || canDeleteAny) && (
                        <button type="button" onClick={() => run(() => deleteProofComment(r.id))} className="text-xs text-stone-500 hover:text-red-700">
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                  <ReplyBox onSend={(body, done) => run(() => replyProofComment(versionId, p.id, body), done)} pending={pending} />
                  <div className="mt-1 flex gap-3 text-xs">
                    <button type="button" onClick={() => run(() => resolveProofComment(p.id, !p.resolved))} className="font-medium text-blue-700 hover:underline">
                      {p.resolved ? "Reopen" : "Resolve"}
                    </button>
                    {(p.mine || canDeleteAny) && (
                      <button type="button" onClick={() => run(() => deleteProofComment(p.id))} className="text-stone-500 hover:text-red-700">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function ReplyBox({ onSend, pending }: { onSend: (body: string, done: () => void) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-stone-600 hover:text-stone-900">
        Reply
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(body, () => {
          setBody("");
          setOpen(false);
        });
      }}
      className="mt-2"
    >
      <textarea autoFocus rows={2} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply" className="input w-full text-sm" />
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={pending || !body.trim()} className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50">Reply</button>
        <button type="button" onClick={() => setOpen(false)} className="btn px-2.5 py-1 text-xs">Cancel</button>
      </div>
    </form>
  );
}
