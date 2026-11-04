import type { Profile } from "@/lib/types";

/** The embed to select alongside a task: `task_assignees(profile_id)`. */
export const ASSIGNEES = "task_assignees(profile_id)";

type Embedded = { task_assignees?: { profile_id: string }[] | null };

/** Turns the embedded assignee rows into `assignee_ids`. */
export function withAssignees<T extends Embedded>(row: T): Omit<T, "task_assignees"> & { assignee_ids: string[] } {
  const { task_assignees, ...rest } = row;
  return { ...rest, assignee_ids: (task_assignees ?? []).map((a) => a.profile_id) };
}

/** "You" first, then names A to Z. */
function names(ids: string[], people: Profile[], meId: string): string[] {
  const others = ids
    .filter((id) => id !== meId)
    .map((id) => people.find((p) => p.id === id)?.full_name ?? "Former user")
    .sort((a, b) => a.localeCompare(b));
  return ids.includes(meId) ? ["You", ...others] : others;
}

/** "You, Jeremy Jones" or "Unassigned". */
export function assigneeLabel(ids: string[], people: Profile[], meId: string): string {
  return ids.length ? names(ids, people, meId).join(", ") : "Unassigned";
}

/** "Cathy +2" for tight spaces. */
export function shortAssigneeLabel(ids: string[], people: Profile[], meId: string): string {
  if (!ids.length) return "Unassigned";
  const all = names(ids, people, meId);
  return all.length > 2 ? `${all[0]} +${all.length - 1}` : all.join(", ");
}

/** Picker options: active people, plus any inactive ones already on the task so they can be removed. */
export function pickerOptions(people: Profile[], current: string[] = []) {
  const toPick = (p: Profile) => ({ id: p.id, name: p.full_name, email: p.email });
  return {
    people: people.filter((p) => p.active).map(toPick),
    inactive: people.filter((p) => !p.active && current.includes(p.id)).map(toPick),
  };
}
