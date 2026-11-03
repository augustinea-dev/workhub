import type { Profile } from "@/lib/types";

/** Who may change a task's status. Must match the tasks RLS update policy and guard_task_update. */
export function canChangeStatus(me: Pick<Profile, "id" | "role">, task: { assignee_id: string | null }): boolean {
  return me.role === "admin" || task.assignee_id === me.id;
}
