import Link from "next/link";
import { notFound } from "next/navigation";
import { createTemplateTask, deleteTemplate, deleteTemplateTask, updateTemplate, updateTemplateTask } from "../../actions";
import { AssigneePicker } from "@/components/assignee-picker";
import { RoleSlotsPicker } from "@/components/role-slots-picker";
import { ConfirmDelete, SubmitButton } from "@/components/client";
import { Empty, Flash } from "@/components/ui";
import { addWorkingDays, formatDay, isValidISODate, todayISO } from "@/lib/dates";
import { pickerOptions } from "@/lib/assignees";
import { getJobRoles, getPeople, sp } from "@/lib/data";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { JobRole, Profile, ProjectTemplate, TemplateTask } from "@/lib/types";

function TaskFields({
  task,
  milestones,
  people,
  roles,
}: {
  task?: TemplateTask;
  milestones: TemplateTask[];
  people: Profile[];
  roles: JobRole[];
}) {
  const kind = task?.is_milestone ? "milestone" : task?.milestone_id ? `in:${task.milestone_id}` : "";
  const suffix = task?.id ?? "new";
  return (
    <>
      <div className="md:col-span-2 xl:col-span-1">
        <label className="label" htmlFor={`title-${suffix}`}>Title</label>
        <input id={`title-${suffix}`} name="title" required defaultValue={task?.title} placeholder="Task title" className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={`start-${suffix}`}>Start day</label>
        <input id={`start-${suffix}`} name="start_day" type="number" min="0" step="1" required defaultValue={task?.start_day ?? 0} className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={`due-${suffix}`}>Due day</label>
        <input id={`due-${suffix}`} name="due_day" type="number" min="0" step="1" required defaultValue={task?.due_day ?? 0} className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={`est-${suffix}`}>Hours</label>
        <input id={`est-${suffix}`} name="estimate_hours" type="number" min="0" step="0.25" defaultValue={task?.estimate_hours ?? ""} className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={`kind-${suffix}`}>Type</label>
        <select id={`kind-${suffix}`} name="kind" defaultValue={kind} className="input w-full">
          <option value="">Task</option>
          <option value="milestone">◆ Milestone</option>
          {milestones.filter((m) => m.id !== task?.id).length > 0 && (
            <optgroup label="Part of milestone">
              {milestones
                .filter((m) => m.id !== task?.id)
                .map((m) => (
                  <option key={m.id} value={`in:${m.id}`}>{m.title}</option>
                ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="md:col-span-2 xl:col-span-1">
        <AssigneePicker
          key={task?.version ?? "new"}
          {...pickerOptions(people, task?.assignee_ids)}
          defaultValue={task?.assignee_ids ?? []}
          label="Default assignees"
        />
      </div>
      <div className="md:col-span-2 xl:col-span-1">
        <RoleSlotsPicker key={task?.version ?? "new"} roles={roles} defaultValue={(task?.open_roles ?? []).map((s) => s.role_id)} />
      </div>
      <details className="md:col-span-full" open={!!task?.description}>
        <summary className="cursor-pointer text-xs font-medium text-stone-500">Description</summary>
        <textarea name="description" rows={2} defaultValue={task?.description ?? ""} className="input mt-1 w-full" />
      </details>
    </>
  );
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: template }, { data: taskData }, people] = await Promise.all([
    supabase.from("project_templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("template_tasks").select("*, template_task_assignees(profile_id), template_task_role_slots(id, role_id)").eq("template_id", id),
    getPeople(),
  ]);
  const jobRoles = await getJobRoles();
  if (!template) notFound();

  const t = template as ProjectTemplate;
  const tasks = (
    (taskData ?? []) as (Omit<TemplateTask, "assignee_ids" | "open_roles"> & {
      template_task_assignees: { profile_id: string }[];
      template_task_role_slots: { id: string; role_id: string }[];
    })[]
  )
    .map(({ template_task_assignees, template_task_role_slots, ...rest }) => ({
      ...rest,
      assignee_ids: template_task_assignees.map((a) => a.profile_id),
      open_roles: template_task_role_slots,
    }))
    .sort(
    (a, b) => a.start_day - b.start_day || a.due_day - b.due_day || a.sort_order - b.sort_order,
  );
  const milestones = tasks.filter((x) => x.is_milestone);
  const requested = sp(query.start);
  const sampleStart = addWorkingDays(requested && isValidISODate(requested) ? requested : todayISO(), 0);
  const length = tasks.length ? Math.max(...tasks.map((x) => x.due_day)) + 1 : 0;
  const milestoneTitle = new Map(milestones.map((m) => [m.id, m.title]));
  const grid = "grid items-end gap-2 md:grid-cols-4 xl:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem_5.5rem_11rem_14rem]";

  return (
    <>
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/templates" className="hover:underline">Templates</Link>
      </p>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {tasks.length - milestones.length} tasks · {milestones.length} milestones
          {length > 0 && ` · ${length} working day${length === 1 ? "" : "s"}`}
        </p>
      </div>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Tasks</h2>
            <form className="flex items-center gap-2 text-xs text-stone-500">
              <label htmlFor="start">Preview dates for a start on</label>
              <input id="start" name="start" type="date" defaultValue={sampleStart} className="input py-1 text-xs" />
              <button className="btn py-1 text-xs">Show</button>
            </form>
          </div>
          <p className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs text-stone-500">
            Day 0 is the project start. Days are working days, so weekends are skipped. Milestones use their due day.
          </p>

          {tasks.length === 0 ? (
            <Empty>No tasks yet. Add the first one below.</Empty>
          ) : (
            <ul>
              {tasks.map((task) => {
                const from = addWorkingDays(sampleStart, task.start_day);
                const to = addWorkingDays(sampleStart, task.due_day);
                return (
                  <li key={task.id} className={`border-b border-stone-100 px-4 py-4 ${task.is_milestone ? "bg-stone-50" : ""}`}>
                    <p className="mb-2 flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
                      {task.is_milestone ? (
                        <span className="font-semibold text-stone-900">◆ Milestone · {formatDay(to)}</span>
                      ) : (
                        <span>
                          {formatDay(from)}
                          {to !== from && ` to ${formatDay(to)}`} · {task.due_day - task.start_day + 1} working day
                          {task.due_day - task.start_day === 0 ? "" : "s"}
                        </span>
                      )}
                      {task.milestone_id && <span>Part of ◆ {milestoneTitle.get(task.milestone_id)}</span>}
                    </p>
                    <div className="flex flex-wrap items-start gap-2">
                      <form action={updateTemplateTask} className={`${grid} min-w-0 flex-1`}>
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="template_id" value={id} />
                        <input type="hidden" name="version" value={task.version} />
                        <TaskFields task={task} milestones={milestones} people={people} roles={jobRoles} />
                        <div className="md:col-span-full">
                          <SubmitButton className="btn">Save</SubmitButton>
                        </div>
                      </form>
                      <form action={deleteTemplateTask} className="ml-auto">
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="template_id" value={id} />
                        <ConfirmDelete question={`Remove “${task.title}”?`}>Remove</ConfirmDelete>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form action={createTemplateTask} className="border-t border-stone-200 bg-stone-50 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Add a task</p>
            <input type="hidden" name="template_id" value={id} />
            <div className={grid}>
              <TaskFields milestones={milestones} people={people} roles={jobRoles} />
              <div className="md:col-span-full">
                <SubmitButton pendingText="Adding…">Add task</SubmitButton>
              </div>
            </div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Template details</h2>
            <form action={updateTemplate} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={t.version} />
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" required defaultValue={t.name} className="input w-full" />
              </div>
              <div>
                <label className="label" htmlFor="description">Description</label>
                <textarea id="description" name="description" rows={4} defaultValue={t.description ?? ""} className="input w-full" />
                <p className="mt-1 text-xs text-stone-500">Copied to each new project.</p>
              </div>
              <SubmitButton>Save template</SubmitButton>
            </form>
          </section>

          <section className="card p-4 text-sm text-stone-600">
            <h2 className="mb-2 text-sm font-semibold text-stone-900">Using this template</h2>
            <p>
              On <Link href="/projects" className="link">Projects</Link>, open <span className="font-medium">+ New project</span>, pick this template
              and a start date. Tasks, milestones, estimates and default assignees are copied; inactive people are left Unassigned.
            </p>
            <p className="mt-2">Changing a template doesn&apos;t change projects already created from it.</p>
          </section>

          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={id} />
            <ConfirmDelete question="Delete this template? Projects already made from it stay as they are.">Delete template</ConfirmDelete>
          </form>
        </div>
      </div>
    </>
  );
}
