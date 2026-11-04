"use client";

import { useId, useState } from "react";

export type PickerPerson = { id: string; name: string; email: string };

/** Pick several people. Each choice is posted as a hidden `name` input. */
export function AssigneePicker({
  people,
  defaultValue = [],
  name = "assignee_ids",
  label = "Assignees",
  inactive = [],
}: {
  people: PickerPerson[];
  defaultValue?: string[];
  name?: string;
  label?: string;
  /** Already-assigned people who are no longer active, shown so they can be removed. */
  inactive?: PickerPerson[];
}) {
  const listId = useId();
  const inputId = useId();
  const [picked, setPicked] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const everyone = [...people, ...inactive];
  const byId = (id: string) => everyone.find((p) => p.id === id);
  const q = query.trim().toLowerCase();
  const matches = people
    .filter((p) => !picked.includes(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .slice(0, 8);
  const showList = open && matches.length > 0;

  const add = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
    setActive(0);
  };
  const remove = (id: string) => setPicked((prev) => prev.filter((x) => x !== id));

  return (
    <div className="relative">
      <label className="label" htmlFor={inputId}>{label}</label>
      {picked.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="input flex min-h-10 w-full flex-wrap items-center gap-1.5 py-1.5 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
        {picked.map((id) => {
          const p = byId(id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-stone-800">
              {p?.name ?? "Former user"}
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label={`Remove ${p?.name ?? "person"}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-stone-500 hover:bg-stone-300 hover:text-stone-900"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          id={inputId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && picked.length) remove(picked[picked.length - 1]);
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(matches[active].id);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={picked.length ? "Add someone" : "Add people"}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-stone-400"
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(p.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-stone-100" : ""}`}
            >
              <p className="text-sm font-medium text-stone-900">{p.name}</p>
              <p className="text-xs text-stone-500">{p.email}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
