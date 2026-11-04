"use client";

import { useId, useState } from "react";

/**
 * Open roles on a task: each chip is one slot (the same role can appear more than once).
 * Posted as repeated hidden `name` inputs holding role ids.
 */
export function RoleSlotsPicker({
  roles,
  defaultValue = [],
  name = "role_slot_ids",
  label = "Open roles",
}: {
  roles: { id: string; name: string; active: boolean }[];
  defaultValue?: string[];
  name?: string;
  label?: string;
}) {
  const selectId = useId();
  const [slots, setSlots] = useState<string[]>(defaultValue);
  const nameOf = (id: string) => roles.find((r) => r.id === id)?.name ?? "Role";

  return (
    <div>
      <label className="label" htmlFor={selectId}>{label}</label>
      {slots.map((id, i) => (
        <input key={`${id}-${i}`} type="hidden" name={name} value={id} />
      ))}
      <div className="input flex min-h-10 w-full flex-wrap items-center gap-1.5 py-1.5">
        {slots.map((id, i) => (
          <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-amber-900">
            {nameOf(id)}
            <button
              type="button"
              onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Remove ${nameOf(id)}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-amber-700 hover:bg-amber-200 hover:text-amber-950"
            >
              ×
            </button>
          </span>
        ))}
        <select
          id={selectId}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) setSlots((prev) => [...prev, v]);
          }}
          className="min-w-32 flex-1 border-0 bg-transparent py-0.5 pl-0 text-sm text-stone-500 focus:outline-none focus:ring-0"
        >
          <option value="">{slots.length ? "Add another role" : "None. Add a role"}</option>
          {roles
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
        </select>
      </div>
    </div>
  );
}
