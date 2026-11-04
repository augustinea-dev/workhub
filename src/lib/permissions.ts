import type { Profile } from "@/lib/types";

/** Who may change a task's status: admins, or any of its assignees. Must match the tasks RLS update policy. */
export function canChangeStatus(me: Pick<Profile, "id" | "role">, task: { assignee_ids: string[] }): boolean {
  return me.role === "admin" || task.assignee_ids.includes(me.id);
}
