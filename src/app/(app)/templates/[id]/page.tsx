import Link from "next/link";
import { notFound } from "next/navigation";
import { createTemplateTask, deleteTemplate, deleteTemplateTask, updateTemplate, updateTemplateTask } from "../../actions";
import { AssigneePicker } from "@/components/assignee-picker";
import { RoleSlotsPicker } from "@/components/role-slots-picker";
import { ConfirmDelete, SubmitButton } from "@/components/client";
import { Empty, Flash } from "@/components/ui";
import { addWorkingDays, formatDay, isValidISODate, todayISO } from "@/lib/dates";
import { pickerOptions } from "@/lib/assignees";
import { getHolidays, getJobRoles, getPeople, sp } from "@/lib/data";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { JobRole, Profile, ProjectTemplate, TemplateTask } from "@/lib/types";

type Choice = { id: string; label: string };

function TaskFields({
  task,
  milestones,
  people,
  roles,
  parentChoices,
  isParent = false,
  defaultParent = "",
}: {
  task?: TemplateTask;
  milestones: TemplateTask[];
  people: Profile[];
  roles: JobRole[];
  parentChoices: Choice[];
  isParent?: boolean;
  defaultParent?: string;
}) {
  const kind = task?.is_milestone ? "milestone" : task?.milestone_id ? `in:${task.milestone_id}` : "";
  const suffix = task?.id ?? "new";
  const locked = "input w-full disabled:bg-stone-50 disabled:text-stone-500";
  return (
    <>
      <div className="md:col-span-2">
        <label className="label" htmlFor={`title-${suffix}`}>Title</label>
        <input id={`title-${suffix}`} name="title" required defaultValue={task?.title} placeholder="Task title" className="input w-full" />
      </div>
      {!task?.is_milestone && (
        <div className="md:col-span-2">
          <label className="label" htmlFor={`parent-${suffix}`}>Parent task</label>
          <select id={`parent-${suffix}`} name="parent_id" defaultValue={task?.parent_id ?? defaultParent} className="input w-full">
            <option value="">None (top level)</option>
            {parentChoices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor={`start-${suffix}`}>Starts on day</label>
        <input id={`start-${suffix}`} name="start_day" type="number" min="0" step="1" required disabled={isParent} defaultValue={task?.start_day ?? 0} aria-describedby={`start-help-${suffix}`} className={`${locked} no-spin`} />
        <p id={`start-help-${suffix}`} className="mt-1 text-xs text-stone-500">Working days after the project starts (0 = first day)</p>
      </div>
      <div>
        <label className="label" htmlFor={`dur-${suffix}`}>Planned Duration (days)</label>
        <input id={`dur-${suffix}`} name="duration_days" type="number" min="0" step="0.5" required disabled={isParent} defaultValue={task?.duration_days ?? 1} aria-describedby={`dur-help-${suffix}`} className={`${locked} no-spin`} />
        <p id={`dur-help-${suffix}`} className="mt-1 text-xs text-stone-500">Half days allowed, like 0.5</p>
      </div>
      <div>
        <label className="label" htmlFor={`est-${suffix}`}>Planned Hours</label>
        <input id={`est-${suffix}`} name="estimate_hours" type="number" min="0" step="0.25" disabled={isParent} defaultValue={task?.estimate_hours ?? ""} className={`${locked} no-spin`} />
      </div>
      <div>
        <label className="label" htmlFor={`kind-${suffix}`}>Type</label>
        <select id={`kind-${suffix}`} name="kind" defaultValue={kind} className="input w-full">
          <option value="">Task</option>
          {!isParent && <option value="milestone">◆ Milestone</option>}
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
      {isParent ? (
        <p className="rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600 md:col-span-full">
          This task has subtasks, so its start day, duration and hours are calculated from them, and people and open roles go on the subtasks.
        </p>
      ) : (
        <>
          <div className="md:col-span-2">
            <AssigneePicker key={task?.version ?? "new"} {...pickerOptions(people, task?.assignee_ids)} defaultValue={task?.assignee_ids ?? []} label="Default assignees" />
          </div>
          <div className="md:col-span-2">
            <RoleSlotsPicker key={task?.version ?? "new"} roles={roles} defaultValue={(task?.open_roles ?? []).map((s) => s.role_id)} />
          </div>
        </>
      )}
      <details className="md:col-span-full" open={!!task?.description}>
        <summary className="cursor-pointer text-xs font-medium text-stone-500">Description</summary>
        <textarea name="description" rows={2} defaultValue={task?.description ?? ""} className="input mt-1 w-full" />
      </details>
    </>
  );
}

const dur = (n: number) => `${+Number(n).toFixed(1)} ${Number(n) === 1 ? "Day" : "Days"}`;
const hrs = (n: number | null) => (n == null ? "" : `${+Number(n).toFixed(2)} ${Number(n) === 1 ? "Hour" : "Hours"}`);

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
  const tasks: TemplateTask[] = (
    (taskData ?? []) as (Omit<TemplateTask, "assignee_ids" | "open_roles"> & {
      template_task_assignees: { profile_id: string }[];
      template_task_role_slots: { id: string; role_id: string }[];
    })[]
  ).map(({ template_task_assignees, template_task_role_slots, ...rest }) => ({
    ...rest,
    assignee_ids: template_task_assignees.map((a) => a.profile_id),
    open_roles: template_task_role_slots,
  }));
  const byOrder = (a: TemplateTask, b: TemplateTask) => a.start_day - b.start_day || a.sort_order - b.sort_order;
  const kids = new Map<string, TemplateTask[]>();
  for (const x of tasks) if (x.parent_id) kids.set(x.parent_id, [...(kids.get(x.parent_id) ?? []), x]);
  const rows: { task: TemplateTask; depth: number; n: number }[] = [];
  const walk = (x: TemplateTask, depth: number) => {
    rows.push({ task: x, depth, n: rows.length + 1 });
    for (const k of (kids.get(x.id) ?? []).sort(byOrder)) walk(k, depth + 1);
  };
  for (const x of tasks.filter((x) => !x.parent_id).sort(byOrder)) walk(x, 0);

  const byId = new Map(tasks.map((x) => [x.id, x]));
  const levelOf = (x: TemplateTask) => {
    let n = 0;
    for (let up = x.parent_id ? byId.get(x.parent_id) : undefined; up && n < 6; up = up.parent_id ? byId.get(up.parent_id) : undefined) n++;
    return n;
  };
  const below = (x: TemplateTask): TemplateTask[] => (kids.get(x.id) ?? []).flatMap((k) => [k, ...below(k)]);
  const heightOf = (x: TemplateTask): number => Math.max(0, ...(kids.get(x.id) ?? []).map((k) => 1 + heightOf(k)));
  const pathOf = (x: TemplateTask): string => (x.parent_id && byId.get(x.parent_id) ? `${pathOf(byId.get(x.parent_id)!)} › ${x.title}` : x.title);
  const choicesFor = (self?: TemplateTask): Choice[] => {
    const skip = new Set(self ? [self.id, ...below(self).map((x) => x.id)] : []);
    const h = self ? heightOf(self) : 0;
    return rows
      .map((r) => r.task)
      .filter(
        (x) =>
          !skip.has(x.id) &&
          !x.is_milestone &&
          levelOf(x) + 1 + h <= 4 &&
          !(h > 0 && !kids.has(x.id) && (x.assignee_ids.length > 0 || x.open_roles.length > 0)),
      )
      .map((x) => ({ id: x.id, label: pathOf(x) }));
  };

  const milestones = tasks.filter((x) => x.is_milestone).sort(byOrder);
  const requested = sp(query.start);
  const editId = sp(query.edit);
  const addUnder = sp(query.under);
  const holidays = new Set((await getHolidays()).map((h) => h.day));
  const sampleStart = addWorkingDays(requested && isValidISODate(requested) ? requested : todayISO(), 0, holidays);
  const length = tasks.length ? Math.max(...tasks.map((x) => x.due_day)) + 1 : 0;
  const totalHours = tasks.filter((x) => !x.parent_id && !x.is_milestone).reduce((s, x) => s + Number(x.estimate_hours ?? 0), 0);
  const milestoneTitle = new Map(milestones.map((m) => [m.id, m.title]));
  const roleName = (rid: string) => jobRoles.find((r) => r.id === rid)?.name ?? "Role";
  const here = `/templates/${id}${requested ? `?start=${requested}` : ""}`;
  const withQ = (k: string, v: string) => `/templates/${id}?${new URLSearchParams({ ...(requested ? { start: requested } : {}), [k]: v })}`;
  const grid = "grid items-end gap-2 md:grid-cols-4";

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
          {totalHours > 0 && ` · ${hrs(totalHours)}`}
        </p>
      </div>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
            Day 0 is the project start. Days are working days, so weekends and holidays are skipped. Parent tasks add up their subtasks.
          </p>

          {tasks.length === 0 ? (
            <Empty>No tasks yet. Add the first one below.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr>
                    <th className="table-head w-10">#</th>
                    <th className="table-head">Name</th>
                    <th className="table-head">Assignments</th>
                    <th className="table-head text-right">Planned Duration</th>
                    <th className="table-head text-right">Planned Hours</th>
                    <th className="table-head">Dates</th>
                    <th className="table-head"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap(({ task, depth, n }) => {
                    const parent = kids.has(task.id);
                    const from = addWorkingDays(sampleStart, task.start_day, holidays);
                    const to = addWorkingDays(sampleStart, task.due_day, holidays);
                    const who = [
                      ...task.assignee_ids.map((pid) => people.find((p) => p.id === pid)?.full_name ?? "Someone"),
                      ...task.open_roles.map((r) => `Role: ${roleName(r.role_id)}`),
                    ];
                    const editing = editId === task.id;
                    const out = [
                      <tr id={`t-${task.id}`} key={task.id} className={`border-b border-stone-100 ${task.is_milestone ? "bg-stone-50" : ""} ${editing ? "bg-blue-50/40" : ""}`}>
                        <td className="table-cell text-stone-400 tabular-nums">{n}</td>
                        <td className="table-cell" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
                          <span className={parent || task.is_milestone ? "font-semibold text-stone-900" : "text-stone-800"}>
                            {task.is_milestone && "◆ "}
                            {task.title}
                          </span>
                          {task.milestone_id && <span className="block text-xs text-stone-500">Part of ◆ {milestoneTitle.get(task.milestone_id)}</span>}
                        </td>
                        <td className="table-cell text-stone-600">{parent ? <span className="text-stone-400">On subtasks</span> : who.join(", ")}</td>
                        <td className={`table-cell whitespace-nowrap text-right tabular-nums ${parent ? "font-semibold" : ""}`}>{task.is_milestone ? "" : dur(task.duration_days)}</td>
                        <td className={`table-cell whitespace-nowrap text-right tabular-nums ${parent ? "font-semibold" : ""}`}>{task.is_milestone ? "" : hrs(task.estimate_hours)}</td>
                        <td className="table-cell whitespace-nowrap text-xs text-stone-500">
                          {task.is_milestone ? formatDay(to) : `${formatDay(from)}${to !== from ? ` to ${formatDay(to)}` : ""}`}
                        </td>
                        <td className="table-cell whitespace-nowrap text-right">
                          <Link href={editing ? here : `${withQ("edit", task.id)}#t-${task.id}`} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
                            {editing ? "Close" : "Edit"}
                          </Link>
                          {!task.is_milestone && levelOf(task) < 4 && (
                            <Link href={`${withQ("under", task.id)}#add-task`} className="ml-3 text-xs font-medium text-blue-700 hover:underline">
                              + Subtask
                            </Link>
                          )}
                        </td>
                      </tr>,
                    ];
                    if (editing) {
                      out.push(
                        <tr key={`${task.id}-edit`} className="border-b border-stone-200 bg-blue-50/40">
                          <td colSpan={7} className="px-4 pb-4 pt-1">
                            <div className="flex flex-wrap items-start gap-2">
                              <form action={updateTemplateTask} className={`${grid} min-w-0 flex-1`}>
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="template_id" value={id} />
                                <input type="hidden" name="version" value={task.version} />
                                <TaskFields task={task} milestones={milestones} people={people} roles={jobRoles} parentChoices={choicesFor(task)} isParent={parent} />
                                <div className="flex items-center gap-2 md:col-span-full">
                                  <SubmitButton className="btn-primary">Save</SubmitButton>
                                  <Link href={here} className="btn">Cancel</Link>
                                </div>
                              </form>
                              <form action={deleteTemplateTask} className="ml-auto">
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="template_id" value={id} />
                                <ConfirmDelete question={parent ? `Remove “${task.title}” and its ${below(task).length} subtasks?` : `Remove “${task.title}”?`}>Remove</ConfirmDelete>
                              </form>
                            </div>
                          </td>
                        </tr>,
                      );
                    }
                    return out;
                  })}
                </tbody>
              </table>
            </div>
          )}

          <form id="add-task" action={createTemplateTask} className="border-t border-stone-200 bg-stone-50 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
              {addUnder && byId.get(addUnder) ? `Add a subtask to “${byId.get(addUnder)!.title}”` : "Add a task"}
            </p>
            <input type="hidden" name="template_id" value={id} />
            <div className={grid}>
              <TaskFields key={addUnder ?? "top"} milestones={milestones} people={people} roles={jobRoles} parentChoices={choicesFor()} defaultParent={addUnder && byId.get(addUnder) ? addUnder : ""} />
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
