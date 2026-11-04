import type { JobRole, Profile, RoleSlot } from "@/lib/types";

/** The embeds to select alongside a task: its people and its open role slots. */
export const ASSIGNEES = "task_assignees(profile_id), task_role_slots(id, role_id)";

type Embedded = {
  task_assignees?: { profile_id: string }[] | null;
  task_role_slots?: RoleSlot[] | null;
};

/** Turns the embedded rows into `assignee_ids` and `open_roles`. */
export function withAssignees<T extends Embedded>(
  row: T,
): Omit<T, "task_assignees" | "task_role_slots"> & { assignee_ids: string[]; open_roles: RoleSlot[] } {
  const { task_assignees, task_role_slots, ...rest } = row;
  return {
    ...rest,
    assignee_ids: (task_assignees ?? []).map((a) => a.profile_id),
    open_roles: task_role_slots ?? [],
  };
}

/** "Designer (open)" for each open slot. */
export function openRoleNames(slots: RoleSlot[] | undefined, roles: JobRole[]): string[] {
  return (slots ?? []).map((s) => `${roles.find((r) => r.id === s.role_id)?.name ?? "Role"} (open)`);
}

/** "You" first, then names A to Z. */
function names(ids: string[], people: Profile[], meId: string): string[] {
  const others = ids
    .filter((id) => id !== meId)
    .map((id) => people.find((p) => p.id === id)?.full_name ?? "Former user")
    .sort((a, b) => a.localeCompare(b));
  return ids.includes(meId) ? ["You", ...others] : others;
}

/** "You, Jeremy Jones, Designer (open)" or "Unassigned". */
export function assigneeLabel(ids: string[], people: Profile[], meId: string, open: string[] = []): string {
  const all = [...names(ids, people, meId), ...open];
  return all.length ? all.join(", ") : "Unassigned";
}

/** "Cathy +2" for tight spaces. */
export function shortAssigneeLabel(ids: string[], people: Profile[], meId: string, open: string[] = []): string {
  const all = [...names(ids, people, meId), ...open];
  if (!all.length) return "Unassigned";
  return all.length > 2 ? `${all[0]} +${all.length - 1}` : all.join(", ");
}

/** Role ids a person holds, main role first. */
export function roleIdsOf(person: Profile | undefined): string[] {
  return [...(person?.job_roles ?? [])].sort((a, b) => Number(b.is_main) - Number(a.is_main)).map((r) => r.role_id);
}

/** Picker options: active people, plus any inactive ones already on the task so they can be removed. */
export function pickerOptions(people: Profile[], current: string[] = []) {
  const toPick = (p: Profile) => ({ id: p.id, name: p.full_name, email: p.email });
  return {
    people: people.filter((p) => p.active).map(toPick),
    inactive: people.filter((p) => !p.active && current.includes(p.id)).map(toPick),
  };
}
