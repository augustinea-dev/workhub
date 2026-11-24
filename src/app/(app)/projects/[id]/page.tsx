import Link from "next/link";
import { notFound } from "next/navigation";
import { createTask, deleteProject, makeDropboxFolder, moveTaskInList, saveProjectAsTemplate, updateProject } from "../../actions";
import { AssigneePicker } from "@/components/assignee-picker";
import { RoleSlotsPicker } from "@/components/role-slots-picker";
import { Board, type BoardCard } from "@/components/board";
import { ConfirmDelete, FilterForm, LiveRefresh, SubmitButton, TaskStatusSelect } from "@/components/client";
import { CustomNameInput, ProjectNameFields } from "@/components/project-name-fields";
import { BudgetBar, Empty, Flash, HealthBadge, PageHeader, ProjectBadge, ProjectDot, TaskBadge } from "@/components/ui";
import { linkify } from "@/components/linkify";
import { ASSIGNEES, assigneeLabel, openRoleNames, pickerOptions, shortAssigneeLabel, withAssignees } from "@/lib/assignees";
import { projectBudget } from "@/lib/budget";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";
import { dropboxStatus } from "@/lib/dropbox";
import { compareTasks, hasTaskFilters, parseTaskFilters, taskFiltersQS, taskMatches, type TaskSort } from "@/lib/list-filters";
import { groupByMilestone } from "@/lib/milestones";
import { canChangeStatus } from "@/lib/permissions";
import { getCompanies, getJobRoles, getPeople, getProjectTypes, getTeams, nameOf, personOption, sp } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUSES, TASK_STATUSES, type Project, type Task } from "@/lib/types";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const me = await requireProfile();
  const isAdmin = me.role === "admin";
  const supabase = await createClient();

  const [{ data: project }, { data: tasks }, { data: time }, people, companies] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("tasks").select(`*, ${ASSIGNEES}`).eq("project_id", id).order("sort_order"),
    supabase.from("time_entries").select("task_id, hours, hour_type").eq("project_id", id),
    getPeople(),
    getCompanies(),
  ]);
  const [projectTypes, jobRoles, teams, dropbox] = await Promise.all([
    getProjectTypes(),
    getJobRoles(),
    getTeams(),
    isAdmin ? dropboxStatus() : null,
  ]);
  const activeTeams = teams.filter((x) => x.active);
  const teamMembers = Object.fromEntries(teams.map((x) => [x.id, x.member_ids]));
  if (!project) notFound();

  const p = project as Project;
  const closedProject = p.status === "complete" || p.status === "cancelled";
  const list = ((tasks ?? []) as (Omit<Task, "assignee_ids" | "open_roles"> & { task_assignees: { profile_id: string }[] })[]).map(
    withAssignees,
  ) as Task[];
  const open = list.filter((t) => t.status !== "done");
  const totalHours = (time ?? []).reduce((s, t) => s + Number(t.hours), 0);
  const billable = (time ?? []).filter((t) => t.hour_type === "billable").reduce((s, t) => s + Number(t.hours), 0);
  const budget = projectBudget(list, time ?? []);
  const company = companies.find((c) => c.id === p.company_id);
  const today = todayISO();
  const here = `/projects/${id}`;
  const editing = isAdmin && sp(query.edit) === "1";
  const activePeople = people.filter((x) => x.active);
  const milestoneGroups = groupByMilestone(list, today);
  const next = milestoneGroups.find((g) => g.milestone.status !== "done");
  const tf = parseTaskFilters(query);
  const tFiltered = hasTaskFilters(tf);
  const matches = (t: Task) => taskMatches(t, tf, me.id, today, teamMembers);
  const byColumn = compareTasks(tf, people);
  const kids = new Map<string, Task[]>();
  for (const t of list) if (t.parent_task_id) kids.set(t.parent_task_id, [...(kids.get(t.parent_task_id) ?? []), t]);
  const showsUp = (t: Task): boolean => matches(t) || (kids.get(t.id) ?? []).some(showsUp);
  const shownKids = (t: Task) => (kids.get(t.id) ?? []).filter(showsUp).sort(byColumn);
  const ungrouped = list.filter((t) => !t.is_milestone && !t.milestone_id && !t.parent_task_id && showsUp(t)).sort(byColumn);
  const listGroups = milestoneGroups
    .map((g) => ({ ...g, shown: g.tasks.filter(showsUp).sort(byColumn) }))
    .filter((g) => !tFiltered || g.shown.length > 0 || matches(g.milestone));
  const listHref = (override: Parameters<typeof taskFiltersQS>[1]) => `${here}${taskFiltersQS(tf, override)}`;
  const sortHead = (key: TaskSort, label: string) => {
    const active = tf.sort === key;
    const dir = active && tf.dir === "asc" ? "desc" : "asc";
    return (
      <th className="table-head" aria-sort={active ? (tf.dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={listHref({ sort: key, dir })} scroll={false} className="inline-flex items-center gap-1 hover:text-stone-900">
          {label}
          {active && <span aria-hidden="true">{tf.dir === "asc" ? "▲" : "▼"}</span>}
        </Link>
      </th>
    );
  };

  const view = sp(query.view) === "board" ? "board" : "list";
  const who = sp(query.who) === "mine" ? "mine" : "all";
  const msFilter = sp(query.milestone);
  const viewHref = (next: { view?: string; who?: string; milestone?: string | null }) => {
    const qs = new URLSearchParams();
    const v = next.view ?? view;
    if (v === "board") qs.set("view", "board");
    if (v === "board") {
      const w = next.who ?? who;
      const m = next.milestone === undefined ? msFilter : next.milestone;
      if (w === "mine") qs.set("who", "mine");
      if (m) qs.set("milestone", m);
    }
    const s = qs.toString();
    return s ? `${here}?${s}` : here;
  };
  const loggedByTask = new Map<string, number>();
  for (const e of time ?? []) {
    if (e.task_id) loggedByTask.set(e.task_id, (loggedByTask.get(e.task_id) ?? 0) + Number(e.hours));
  }
  const milestoneTitle = new Map(milestoneGroups.map((g) => [g.milestone.id, g.milestone.title]));
  const byId = new Map(list.map((t) => [t.id, t]));
  const milestoneOf = (t: Task): string | null => t.milestone_id ?? (t.parent_task_id && byId.get(t.parent_task_id) ? milestoneOf(byId.get(t.parent_task_id)!) : null);
  const byDue = (a: Task, b: Task) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.sort_order - b.sort_order;
  const byFinished = (a: Task, b: Task) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
  const boardCards: BoardCard[] = list
    .filter((t) => who === "all" || t.assignee_ids.includes(me.id))
    .filter((t) =>
      !msFilter ? true : msFilter === "none" ? !t.is_milestone && !milestoneOf(t) : milestoneOf(t) === msFilter || t.id === msFilter,
    )
    .sort((a, b) => (a.status === "done" && b.status === "done" ? byFinished(a, b) : byDue(a, b)))
    .map((t) => {
      const logged = loggedByTask.get(t.id) ?? 0;
      const est = t.estimate_hours != null ? Number(t.estimate_hours) : null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        version: t.version,
        isMilestone: t.is_milestone,
        milestone: milestoneOf(t) ? milestoneTitle.get(milestoneOf(t)!) ?? null : null,
        parent: t.parent_task_id ? byId.get(t.parent_task_id)?.title ?? null : null,
        assignee: shortAssigneeLabel(t.assignee_ids, people, me.id, openRoleNames(t.open_roles, jobRoles)),
        isMine: t.assignee_ids.includes(me.id),
        due: t.due_date ? formatDate(t.due_date) : null,
        late: !!t.due_date && t.due_date < today && t.status !== "done",
        hours: est != null ? `${+logged.toFixed(2)} / ${+est.toFixed(2)} h` : logged ? `${+logged.toFixed(2)} h` : null,
        canMove: !closedProject && !kids.has(t.id) && canChangeStatus(me, t),
      };
    });
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`;

  const canReorder = isAdmin && !closedProject && tf.sort === "order" && tf.dir === "asc" && !tFiltered;
  type Pos = { first: boolean; last: boolean };
  const posOf = (i: number, n: number): Pos => ({ first: i === 0, last: i === n - 1 });
  const taskRows = (t: Task, indent: boolean, depth = 0, pos: Pos = { first: true, last: true }): React.ReactNode[] => {
    const ks = shownKids(t);
    return [taskRow(t, indent, depth, pos), ...ks.flatMap((k, i) => taskRows(k, indent, depth + 1, posOf(i, ks.length)))];
  };
  const moveButton = (t: Task, direction: "up" | "down", disabled: boolean) => (
    <form action={moveTaskInList}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="redirect_to" value={here} />
      <button
        disabled={disabled}
        aria-label={`Move ${t.title} ${direction}`}
        className="grid h-6 w-6 place-items-center rounded text-stone-500 hover:bg-stone-200 hover:text-stone-900 disabled:pointer-events-none disabled:opacity-25"
      >
        <svg viewBox="0 0 16 16" className={`h-3 w-3 ${direction === "down" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
    </form>
  );
  const taskRow = (t: Task, indent: boolean, depth: number, pos: Pos = { first: true, last: true }) => {
    const sub = depth > 0;
    const late = t.due_date && t.due_date < today && t.status !== "done";
    const all = kids.get(t.id) ?? [];
    const canChange = !closedProject && all.length === 0 && canChangeStatus(me, t);
    return (
      <tr key={t.id} className="group hover:bg-stone-50">
        <td className="table-cell" style={{ paddingLeft: `${(indent ? 2 : 1) + depth * 1.25}rem` }}>
          {canReorder && !t.is_milestone && (
            <span className="float-right ml-2 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {moveButton(t, "up", pos.first)}
              {moveButton(t, "down", pos.last)}
            </span>
          )}
          {sub && <span aria-hidden="true" className="mr-1.5 text-stone-400">↳</span>}
          <Link
            href={`/tasks/${t.id}`}
            className={`hover:underline ${sub ? "" : "font-medium"} ${t.status === "done" ? "text-stone-400 line-through" : ""}`}
          >
            {t.is_milestone && <span title="Milestone">◆ </span>}
            {t.title}
          </Link>
          {all.length > 0 && (
            <span className="ml-2 text-xs text-stone-400">
              {all.filter((k) => k.status === "done").length}/{all.length} subtasks
            </span>
          )}
        </td>
        <td className={`table-cell ${all.length ? "text-stone-400" : t.assignee_ids.includes(me.id) ? "font-medium" : "text-stone-600"}`}>
          {all.length ? "On subtasks" : assigneeLabel(t.assignee_ids, people, me.id, openRoleNames(t.open_roles, jobRoles))}
        </td>
        <td className={`table-cell whitespace-nowrap ${late ? "font-medium text-red-700" : "text-stone-600"}`}>
          {formatDate(t.due_date)}
        </td>
        <td className="table-cell">
          {canChange ? (
            <TaskStatusSelect id={t.id} version={t.version} status={t.status} redirectTo={here} />
          ) : (
            <TaskBadge status={t.status} />
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <LiveRefresh subs={[{ table: "tasks", filter: `project_id=eq.${id}` }, { table: "task_assignees" }, { table: "task_role_slots" }, { table: "time_entries", filter: `project_id=eq.${id}` }]} />
      <p className="mb-2 text-sm text-stone-500">
        <Link href="/projects" className="hover:underline">Projects</Link>
        {company && <> · {company.name}</>}
      </p>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <ProjectDot id={p.id} size="lg" />
            {p.title || p.name}
          </span>
        }
        subtitle={
          <>
            {p.title && p.title !== p.name && <span className="mb-2 block text-sm text-stone-500">{p.name}</span>}
            <span className="flex flex-wrap items-center gap-3">
              <ProjectBadge status={p.status} />
              <span>Owner: {nameOf(people, p.owner_id)}</span>
              <span>Due {formatDate(p.due_date)}</span>
              {next && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>
                    Next milestone:{" "}
                    <Link href={`/tasks/${next.milestone.id}`} className="font-medium text-stone-900 hover:underline">
                      ◆ {next.milestone.title}
                    </Link>
                    {next.milestone.due_date &&
                      `, ${formatDate(next.milestone.due_date)} (${relativeDay(next.milestone.due_date, today)})`}
                  </span>
                  <HealthBadge health={next.health} />
                </span>
              )}
              <span>{totalHours.toFixed(1)} h logged ({billable.toFixed(1)} billable)</span>
              <BudgetBar budget={budget} />
            </span>
          </>
        }
      >
        {p.dropbox_url && (
          <a href={p.dropbox_url} target="_blank" rel="noopener noreferrer" className="btn">Open Dropbox folder</a>
        )}
      </PageHeader>
      <Flash error={sp(query.error)} notice={sp(query.notice)} />
      {(p.status === "planning" || closedProject) && (
        <div role="status" className={`mb-4 rounded-lg border px-4 py-3 text-sm ${p.status === "planning" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-stone-200 bg-stone-100 text-stone-700"}`}>
          {p.status === "planning" ? (
            <>
              <span className="font-semibold">Planning.</span> Notifications are paused while it&apos;s set up, it&apos;s off people&apos;s My Work, and time can&apos;t be logged yet. When you set it to Active, each person gets one notice listing their tasks.
            </>
          ) : (
            <>
              <span className="font-semibold">{p.status === "complete" ? "Complete" : "Cancelled"}: read only.</span> Updates can still be posted. Only the status and custom name can change; set it back to Active to edit anything else or log time.
            </>
          )}
        </div>
      )}

      <div className={view === "board" ? "space-y-6" : "grid gap-6 lg:grid-cols-3"}>
        <section className={`card overflow-hidden ${view === "board" ? "" : "lg:col-span-2"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold">
              Tasks <span className="font-normal text-stone-400">· {open.length} open</span>
            </h2>
            <div className="flex items-center gap-2">
              <a href={`/export/projects/${id}/tasks${view === "list" ? taskFiltersQS(tf) : ""}`} className="rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100">
                Export CSV
              </a>
              <nav aria-label="Task view" className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs font-medium">
                {(["list", "board"] as const).map((v) => (
                  <Link
                    key={v}
                    href={viewHref({ view: v })}
                    aria-current={view === v ? "page" : undefined}
                    className={`rounded-md px-3 py-1 ${view === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    {v === "list" ? "List" : "Board"}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
          {list.length === 0 ? (
            <Empty>No tasks yet.{isAdmin && " Add the first one below."}</Empty>
          ) : view === "board" ? (
            <div className="p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Link href={viewHref({ who: "all" })} className={chip(who === "all")}>Everyone</Link>
                <Link href={viewHref({ who: "mine" })} className={chip(who === "mine")}>Mine</Link>
                {milestoneGroups.length > 0 && (
                  <>
                    <span className="mx-1 h-4 w-px bg-stone-200" aria-hidden="true" />
                    <Link href={viewHref({ milestone: null })} className={chip(!msFilter)}>All milestones</Link>
                    {milestoneGroups.map((g) => (
                      <Link key={g.milestone.id} href={viewHref({ milestone: g.milestone.id })} className={chip(msFilter === g.milestone.id)}>
                        ◆ {g.milestone.title}
                      </Link>
                    ))}
                    <Link href={viewHref({ milestone: "none" })} className={chip(msFilter === "none")}>No milestone</Link>
                  </>
                )}
              </div>
              <Board key={`${who}-${msFilter ?? ""}`} cards={boardCards} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <FilterForm key={taskFiltersQS(tf)} className="flex flex-wrap items-end gap-2 border-b border-stone-100 px-4 py-3">
                {tf.sort !== "due" && <input type="hidden" name="sort" value={tf.sort} />}
                {tf.dir !== "asc" && <input type="hidden" name="dir" value={tf.dir} />}
                <div>
                  <label className="label" htmlFor="f_assignee">Assignee</label>
                  <select id="f_assignee" name="assignee" defaultValue={tf.assignee} className="input py-1.5">
                    <option value="">Everyone</option>
                    <option value="me">Mine</option>
                    <option value="none">Unassigned</option>
                    {people
                      .filter((x) => x.id !== me.id && list.some((t) => t.assignee_ids.includes(x.id)))
                      .map((x) => (
                        <option key={x.id} value={x.id}>{x.full_name}</option>
                      ))}
                    {activeTeams.length > 0 && (
                      <optgroup label="Teams">
                        {activeTeams.map((x) => (
                          <option key={x.id} value={`team:${x.id}`}>{x.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="f_task_status">Status</label>
                  <select id="f_task_status" name="status" defaultValue={tf.status} className="input py-1.5">
                    <option value="">Any status</option>
                    {TASK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-stone-700">
                  <input type="checkbox" name="overdue" value="1" defaultChecked={tf.overdue} /> Overdue only
                </label>
                {tFiltered && (
                  <Link href={listHref({ assignee: "", status: "", overdue: false })} scroll={false} className="btn py-1.5">
                    Clear filters
                  </Link>
                )}
              </FilterForm>
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    {sortHead("order", "Task")}
                    {sortHead("assignee", "Assignee")}
                    {sortHead("due", "Due")}
                    {sortHead("status", "Status")}
                  </tr>
                </thead>
                {tFiltered && listGroups.length === 0 && ungrouped.length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-stone-500">
                        No tasks match these filters.{" "}
                        <Link href={listHref({ assignee: "", status: "", overdue: false })} scroll={false} className="link">Clear filters</Link>
                      </td>
                    </tr>
                  </tbody>
                )}
                {listGroups.map((g) => {
                  const m = g.milestone;
                  const canChange = !closedProject && canChangeStatus(me, m);
                  return (
                    <tbody key={m.id}>
                      <tr className="bg-stone-50">
                        <td colSpan={3} className="border-b border-stone-200 px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link
                              href={`/tasks/${m.id}`}
                              className={`text-sm font-semibold hover:underline ${m.status === "done" ? "text-stone-400 line-through" : ""}`}
                            >
                              ◆ {m.title}
                            </Link>
                            <span className="text-xs text-stone-500">
                              {m.due_date ? `Due ${formatDate(m.due_date)}` : "No date"}
                              {" · "}
                              {g.tasks.length ? `${g.done} of ${g.tasks.length} done` : "No tasks yet"}
                            </span>
                            <HealthBadge health={g.health} showReason />
                          </div>
                        </td>
                        <td className="border-b border-stone-200 px-4 py-2.5">
                          {canChange ? (
                            <TaskStatusSelect id={m.id} version={m.version} status={m.status} redirectTo={here} />
                          ) : (
                            <TaskBadge status={m.status} />
                          )}
                        </td>
                      </tr>
                      {g.shown.flatMap((t, i) => taskRows(t, true, 0, posOf(i, g.shown.length)))}
                    </tbody>
                  );
                })}
                {ungrouped.length > 0 && (
                  <tbody>
                    {milestoneGroups.length > 0 && (
                      <tr className="bg-stone-50">
                        <td colSpan={4} className="border-b border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-500">
                          Not in a milestone
                        </td>
                      </tr>
                    )}
                    {ungrouped.flatMap((t, i) => taskRows(t, milestoneGroups.length > 0, 0, posOf(i, ungrouped.length)))}
                  </tbody>
                )}
              </table>
            </div>
          )}

          {isAdmin && !closedProject && (
            <form action={createTask} className="border-t border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Add a task</p>
              <div className="grid items-end gap-2 md:grid-cols-6">
                <input type="hidden" name="project_id" value={id} />
                <div className="md:col-span-2">
                  <label className="label" htmlFor="new_task_title">Title</label>
                  <input id="new_task_title" name="title" required placeholder="Task title" className="input w-full" />
                </div>
                <div className="md:col-span-2">
                  <AssigneePicker {...pickerOptions(people)} />
                </div>
                <div>
                  <label className="label" htmlFor="new_task_start">Start</label>
                  <input id="new_task_start" name="start_date" type="date" className="input w-full" />
                </div>
                <div>
                  <label className="label" htmlFor="new_task_due">Due</label>
                  <input id="new_task_due" name="due_date" type="date" className="input w-full" />
                </div>
                <div className="md:col-span-3">
                  <RoleSlotsPicker roles={jobRoles} />
                </div>
                <div>
                  <label className="label" htmlFor="new_task_estimate">Estimate (hours)</label>
                  <input id="new_task_estimate" name="estimate_hours" type="number" step="0.25" min="0" className="input w-full" />
                </div>
                {milestoneGroups.length > 0 && (
                  <div className="md:col-span-3">
                    <label className="label" htmlFor="new_task_milestone">Milestone</label>
                    <select id="new_task_milestone" name="milestone_id" className="input w-full" defaultValue="">
                      <option value="">Not in a milestone</option>
                      {milestoneGroups.map((g) => (
                        <option key={g.milestone.id} value={g.milestone.id}>
                          {g.milestone.title}
                          {g.milestone.due_date ? ` (${formatDate(g.milestone.due_date)})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 py-2 text-xs text-stone-600 md:col-span-5">
                  <input type="checkbox" name="is_milestone" /> This task is a milestone
                </label>
                <SubmitButton pendingText="Adding…">Add task</SubmitButton>
              </div>
            </form>
          )}
        </section>

        <section className="card h-fit p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{editing ? "Edit project" : "Project details"}</h2>
            {isAdmin &&
              (editing ? (
                <Link href={here} className="text-xs font-medium text-stone-500 hover:text-stone-900">Cancel</Link>
              ) : (
                <Link href={`${here}?edit=1`} className="btn px-2.5 py-1 text-xs">Edit project</Link>
              ))}
          </div>
          {editing ? (
            <>
              <form action={updateProject} className="space-y-3">
                {closedProject && (
                  <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-700">
                    While it&apos;s {p.status === "complete" ? "Complete" : "Cancelled"}, only the status and custom name are saved. Set it to Active to change the rest.
                  </p>
                )}
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={p.version} />
                <ProjectNameFields
                  key={p.version}
                  clients={companies.filter((c) => c.active || c.id === p.company_id)}
                  types={projectTypes.filter((t) => t.active || t.code === p.project_type)}
                  reference={p.reference_number}
                  today={today}
                  idPrefix="edit"
                  titleRequired={false}
                  defaults={{
                    company_id: p.company_id,
                    title: p.title ?? (p.name_locked ? "" : p.name),
                    project_type: p.project_type,
                    start_date: p.start_date,
                    name_on_project: p.name_on_project,
                    billing_year: p.billing_year,
                  }}
                />
                <details className="rounded-md border border-stone-200 px-3 py-2" open={p.name_locked}>
                  <summary className="cursor-pointer text-xs font-medium text-stone-600">Reference number and custom name</summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="label" htmlFor="reference_number">Reference #</label>
                      <input id="reference_number" name="reference_number" inputMode="numeric" defaultValue={p.reference_number ?? ""} className="input w-full" />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-stone-700">
                      <input type="checkbox" name="name_locked" defaultChecked={p.name_locked} className="mt-1" />
                      <span>Use a custom name instead of building it (for example, shorter for QuickBooks, or a Workfront import). It stays exactly as typed until you untick this.</span>
                    </label>
                    <CustomNameInput defaultValue={p.name} />
                  </div>
                </details>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="status">Status</label>
                    <select id="status" name="status" defaultValue={p.status} className="input w-full">
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="owner_id">Owner</label>
                    <select id="owner_id" name="owner_id" defaultValue={p.owner_id ?? ""} className="input w-full">
                      <option value="">—</option>
                      {activePeople.map((x) => (
                        <option key={x.id} value={x.id}>{personOption(x)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="due_date">Due</label>
                    <input id="due_date" name="due_date" type="date" defaultValue={p.due_date ?? ""} className="input w-full" />
                  </div>
                  <div>
                    <label className="label" htmlFor="cost_code">Cost code</label>
                    <input id="cost_code" name="cost_code" defaultValue={p.cost_code ?? ""} className="input w-full" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="description">Description</label>
                  <textarea id="description" name="description" rows={4} defaultValue={p.description ?? ""} className="input w-full" />
                </div>
                <div>
                  <label className="label" htmlFor="dropbox_url">Dropbox folder</label>
                  <input id="dropbox_url" name="dropbox_url" type="url" defaultValue={p.dropbox_url ?? ""} placeholder="Paste the folder link" className="input w-full" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="billable" defaultChecked={p.billable} className="mt-0.5" />
                  <span>
                    Billable
                    <span className="block text-xs text-stone-500">Time on this project counts as billable. Changing this updates its logged time too.</span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <SubmitButton>Save project</SubmitButton>
                  <Link href={here} className="btn">Cancel</Link>
                </div>
              </form>
              <form action={saveProjectAsTemplate} className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                <input type="hidden" name="project_id" value={id} />
                <label className="label" htmlFor="template_name">Save as template</label>
                <div className="flex gap-2">
                  <input id="template_name" name="name" required defaultValue={`${p.name} template`} className="input min-w-0 flex-1" />
                  <SubmitButton className="btn" pendingText="Saving…">Save</SubmitButton>
                </div>
                <p className="text-xs text-stone-500">Copies tasks, milestones, estimates and assignees. Days are counted from the project start.</p>
              </form>
              <form action={deleteProject} className="mt-4 border-t border-stone-100 pt-3">
                <input type="hidden" name="id" value={id} />
                <ConfirmDelete question={`Delete this project and its ${list.length} task${list.length === 1 ? "" : "s"}? This can't be undone.`}>
                  Delete project and its tasks
                </ConfirmDelete>
              </form>
            </>
          ) : (
            <dl className="space-y-3 text-sm">
              <div><dt className="label">Status</dt><dd><ProjectBadge status={p.status} /></dd></div>
              <div><dt className="label">Owner</dt><dd>{nameOf(people, p.owner_id)}</dd></div>
              <div><dt className="label">Client</dt><dd>{company?.name ?? "No client"}</dd></div>
              <div className="grid grid-cols-2 gap-3">
                <div><dt className="label">Reference #</dt><dd>{p.reference_number ?? "Not set"}</dd></div>
                <div>
                  <dt className="label">Type</dt>
                  <dd>{p.project_type ? projectTypes.find((t) => t.code === p.project_type)?.label ?? p.project_type : "Not set"}</dd>
                </div>
              </div>
              {p.cost_code && <div><dt className="label">Cost code</dt><dd>{p.cost_code}</dd></div>}
              <div><dt className="label">Billing</dt><dd>{p.billable ? "Billable" : "Internal, not billable"}</dd></div>
              <div>
                <dt className="label">Dropbox folder</dt>
                <dd>
                  {p.dropbox_url ? (
                    <a href={p.dropbox_url} target="_blank" rel="noopener noreferrer" className="link">Open in Dropbox</a>
                  ) : dropbox?.state === "connected" ? (
                    <form action={makeDropboxFolder}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton className="btn px-2.5 py-1 text-xs" pendingText="Creating…">Create Dropbox folder</SubmitButton>
                    </form>
                  ) : (
                    <span className="text-stone-500">Not linked yet</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><dt className="label">Start</dt><dd>{formatDate(p.start_date)}</dd></div>
                <div><dt className="label">Due</dt><dd>{formatDate(p.due_date)}</dd></div>
              </div>
              <div><dt className="label">Description</dt><dd className="whitespace-pre-wrap text-stone-700">{p.description ? linkify(p.description) : <span className="text-stone-500">No description</span>}</dd></div>
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
