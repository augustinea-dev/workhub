"use client";

import { useId, useRef, useState } from "react";
import { addComment } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/client";

export type MentionPerson = { id: string; name: string; email: string };
/** A team that can be mentioned; mentioning it notifies every member. */
export type MentionTeam = { id: string; name: string; memberIds: string[] };

type Option = { kind: "person"; id: string; name: string; email: string } | ({ kind: "team" } & MentionTeam);

const MAX_SUGGESTIONS = 6;

/** The "@query" being typed right before the caret, if any. */
function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]{0,40})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null;
}

export function MentionComposer({
  taskId,
  people,
  teams = [],
}: {
  taskId: string;
  people: MentionPerson[];
  teams?: MentionTeam[];
}) {
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Option[]>([]);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const options: Option[] = [
    ...teams.map((t) => ({ kind: "team" as const, ...t })),
    ...people.map((p) => ({ kind: "person" as const, ...p })),
  ];
  const matches = query
    ? options
        .filter((o) => {
          const q = query.query;
          const words = o.name.toLowerCase().split(/\s+/);
          return !q || words.some((w) => w.startsWith(q)) || (o.kind === "person" && o.email.toLowerCase().startsWith(q));
        })
        .slice(0, MAX_SUGGESTIONS)
    : [];
  const open = matches.length > 0;

  function update(value: string, caret: number) {
    setText(value);
    setQuery(activeQuery(value, caret));
    setActive(0);
  }

  function pick(p: Option) {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart;
    const insert = `@${p.name} `;
    const next = text.slice(0, query.start) + insert + text.slice(caret);
    const pos = query.start + insert.length;
    setText(next);
    setQuery(null);
    setPicked((prev) => (prev.some((x) => x.kind === p.kind && x.id === p.id) ? prev : [...prev, p]));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <form action={addComment} className="space-y-2 p-4">
      <input type="hidden" name="task_id" value={taskId} />
      {[
        ...new Set(
          picked
            .filter((p) => text.includes(`@${p.name}`))
            .flatMap((p) => (p.kind === "team" ? p.memberIds : [p.id])),
        ),
      ].map((id) => (
        <input key={id} type="hidden" name="mention" value={id} />
      ))}
      <div className="relative">
        <textarea
          ref={ref}
          name="body"
          required
          rows={3}
          value={text}
          placeholder="Post a progress note, question or handoff… Type @ to mention someone."
          aria-label="Update"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          className="input w-full"
          onChange={(e) => update(e.target.value, e.target.selectionStart)}
          onSelect={(e) => setQuery(activeQuery(e.currentTarget.value, e.currentTarget.selectionStart))}
          onBlur={() => setQuery(null)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setQuery(null);
            }
          }}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="People to mention"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-w-sm overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            {matches.map((p, i) => (
              <li
                key={`${p.kind}-${p.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${i === active ? "bg-stone-100" : ""}`}
              >
                <p className="text-sm font-medium text-stone-900">{p.name}</p>
                <p className="text-xs text-stone-500">
                  {p.kind === "team" ? `Team · ${p.memberIds.length} ${p.memberIds.length === 1 ? "person" : "people"}` : p.email}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SubmitButton pendingText="Posting…">Post update</SubmitButton>
    </form>
  );
}
