-- Template tasks get the same structure as project tasks: subtasks up to 4 levels below a top-level task,
-- parents as containers whose days and hours roll up, and a duration in days (half days allowed).

alter table public.template_tasks
  add column parent_id uuid references public.template_tasks (id) on delete cascade,
  add column duration_days numeric(5, 1) check (duration_days >= 0);

update public.template_tasks set duration_days = due_day - start_day + 1;

alter table public.template_tasks alter column duration_days set not null;

comment on column public.template_tasks.duration_days is 'Planned duration in working days (Pln Dur). due_day is derived from it.';

create function public.set_template_task_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.duration_days is null then
    new.duration_days := new.due_day - new.start_day + 1;
  else
    new.due_day := new.start_day + greatest(ceil(new.duration_days)::integer, 1) - 1;
  end if;
  return new;
end;
$$;

create trigger template_tasks_days
  before insert or update on public.template_tasks
  for each row execute function public.set_template_task_days();

create function public.check_template_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.template_tasks;
  depth integer;
  height integer := 0;
begin
  if new.parent_id is not null then
    select * into p from public.template_tasks where id = new.parent_id;
    if not found or p.template_id <> new.template_id then
      raise exception 'A subtask''s parent must be a task in the same template.';
    end if;
    if new.parent_id = new.id then
      raise exception 'A task can''t be its own subtask.';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, parent_id from public.template_tasks where id = new.parent_id
        union all
        select t.id, t.parent_id from public.template_tasks t join up on t.id = up.parent_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'A task can''t move under one of its own subtasks.';
    end if;
    with recursive up as (
      select id, parent_id, 1 as n from public.template_tasks where id = new.parent_id
      union all
      select t.id, t.parent_id, up.n + 1 from public.template_tasks t join up on t.id = up.parent_id
    )
    select max(n) into depth from up;
    if tg_op = 'UPDATE' then
      with recursive down as (
        select id, 1 as n from public.template_tasks where parent_id = new.id
        union all
        select t.id, down.n + 1 from public.template_tasks t join down on t.parent_id = down.id
      )
      select coalesce(max(n), 0) into height from down;
    end if;
    if depth + height > 4 then
      raise exception 'Subtasks can go 4 levels below a top-level task, no deeper.';
    end if;
    if new.is_milestone or p.is_milestone then
      raise exception 'Milestones can''t have subtasks or be subtasks.';
    end if;
    new.milestone_id := null;
  elsif new.is_milestone and tg_op = 'UPDATE'
        and exists (select 1 from public.template_tasks c where c.parent_id = new.id) then
    raise exception 'A task with subtasks can''t be a milestone.';
  end if;
  return new;
end;
$$;

create trigger template_tasks_parent_check
  before insert or update of parent_id, template_id, is_milestone on public.template_tasks
  for each row execute function public.check_template_parent();

create function public.apply_template_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select min(start_day) as s, max(due_day) as d, sum(estimate_hours) as e, count(estimate_hours) as ne, count(*) as n
    into r
    from public.template_tasks
   where parent_id = new.id;
  if r.n > 0 then
    new.start_day := r.s;
    new.due_day := r.d;
    new.duration_days := r.d - r.s + 1;
    if r.ne > 0 then new.estimate_hours := r.e; end if;
  end if;
  return new;
end;
$$;

create trigger template_tasks_rollup_self
  before update on public.template_tasks
  for each row execute function public.apply_template_rollup();

create function public.refresh_template_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.parent_id is not null then
    update public.template_tasks set updated_at = now() where id = new.parent_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.parent_id is not null
     and old.parent_id is distinct from (case when tg_op = 'UPDATE' then new.parent_id end) then
    update public.template_tasks set updated_at = now() where id = old.parent_id;
  end if;
  return null;
end;
$$;

create trigger template_tasks_rollup_parent
  after insert or delete on public.template_tasks
  for each row execute function public.refresh_template_parent();

create trigger template_tasks_rollup_parent_change
  after update on public.template_tasks
  for each row
  when (old.parent_id is distinct from new.parent_id
        or old.start_day is distinct from new.start_day
        or old.due_day is distinct from new.due_day
        or old.estimate_hours is distinct from new.estimate_hours)
  execute function public.refresh_template_parent();

create function public.move_template_work_down()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := new.parent_id;
begin
  if pid is null or (tg_op = 'UPDATE' and old.parent_id is not distinct from new.parent_id) then
    return null;
  end if;
  insert into public.template_task_assignees (template_task_id, profile_id)
  select new.id, a.profile_id from public.template_task_assignees a where a.template_task_id = pid
  on conflict do nothing;
  delete from public.template_task_assignees where template_task_id = pid;
  update public.template_task_role_slots set template_task_id = new.id where template_task_id = pid;
  return null;
end;
$$;

create trigger template_tasks_move_work_down
  after insert or update of parent_id on public.template_tasks
  for each row execute function public.move_template_work_down();

create function public.guard_template_parent_work()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.template_tasks where parent_id = new.template_task_id) then
    raise exception 'That task has subtasks, so people and open roles go on its subtasks.';
  end if;
  return new;
end;
$$;

create trigger template_task_assignees_parent_guard
  before insert or update of template_task_id on public.template_task_assignees
  for each row execute function public.guard_template_parent_work();

create trigger template_task_role_slots_parent_guard
  before insert or update of template_task_id on public.template_task_role_slots
  for each row execute function public.guard_template_parent_work();

create or replace function public.create_project_from_template(
  p_template uuid,
  p_name text,
  p_company uuid,
  p_owner uuid,
  p_start date,
  p_due date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
  ids jsonb;
  last_day integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create projects.';
  end if;
  if not exists (select 1 from public.project_templates where id = p_template) then
    raise exception 'That template no longer exists.';
  end if;

  select coalesce(max(due_day), 0) into last_day from public.template_tasks where template_id = p_template;

  insert into public.projects (name, company_id, owner_id, status, start_date, due_date, description)
  select p_name, p_company, p_owner, 'active', p_start,
         coalesce(p_due, public.add_working_days(p_start, last_day)), t.description
    from public.project_templates t
   where t.id = p_template
  returning id into pid;

  select coalesce(jsonb_object_agg(id, gen_random_uuid()), '{}') into ids
    from public.template_tasks where template_id = p_template;

  insert into public.tasks (id, project_id, title, description, is_milestone, milestone_id,
                            start_date, due_date, estimate_hours, sort_order)
  select (ids ->> tt.id::text)::uuid, pid, tt.title, tt.description, true, null,
         public.add_working_days(p_start, tt.start_day), public.add_working_days(p_start, tt.due_day),
         tt.estimate_hours, tt.sort_order
    from public.template_tasks tt
   where tt.template_id = p_template and tt.is_milestone;

  for d in 0..4 loop
    with recursive tree as (
      select id, 0 as depth from public.template_tasks where template_id = p_template and parent_id is null
      union all
      select t.id, tree.depth + 1 from public.template_tasks t join tree on t.parent_id = tree.id
    )
    insert into public.tasks (id, project_id, parent_task_id, title, description, is_milestone, milestone_id,
                              start_date, due_date, estimate_hours, sort_order)
    select (ids ->> tt.id::text)::uuid, pid, (ids ->> tt.parent_id::text)::uuid, tt.title, tt.description, false,
           (ids ->> tt.milestone_id::text)::uuid,
           public.add_working_days(p_start, tt.start_day), public.add_working_days(p_start, tt.due_day),
           tt.estimate_hours, tt.sort_order
      from public.template_tasks tt
      join tree on tree.id = tt.id and tree.depth = d
     where not tt.is_milestone;
  end loop;

  insert into public.task_assignees (task_id, profile_id)
  select (ids ->> tt.id::text)::uuid, a.profile_id
    from public.template_tasks tt
    join public.template_task_assignees a on a.template_task_id = tt.id
    join public.profiles p on p.id = a.profile_id and p.active
   where tt.template_id = p_template
     and not exists (select 1 from public.template_tasks c where c.parent_id = tt.id);

  insert into public.task_role_slots (task_id, role_id)
  select (ids ->> tt.id::text)::uuid, r.role_id
    from public.template_tasks tt
    join public.template_task_role_slots r on r.template_task_id = tt.id
   where tt.template_id = p_template
     and not exists (select 1 from public.template_tasks c where c.parent_id = tt.id);

  return pid;
end;
$$;

create or replace function public.create_template_from_project(p_project uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  tid uuid;
  base date;
  ids jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create templates.';
  end if;

  select coalesce(p.start_date,
                  (select min(coalesce(t.start_date, t.due_date)) from public.tasks t where t.project_id = p.id),
                  current_date)
    into base
    from public.projects p
   where p.id = p_project;
  if base is null then
    raise exception 'That project no longer exists.';
  end if;

  insert into public.project_templates (name, description)
  select p_name, p.description from public.projects p where p.id = p_project
  returning id into tid;

  select coalesce(jsonb_object_agg(id, gen_random_uuid()), '{}') into ids
    from public.tasks where project_id = p_project;

  insert into public.template_tasks (id, template_id, title, description, start_day, due_day, estimate_hours,
                                     is_milestone, milestone_id, sort_order)
  select (ids ->> t.id::text)::uuid, tid, t.title, t.description, s.start_day,
         greatest(s.start_day, public.working_days_between(base, coalesce(t.due_date, t.start_date, base))),
         t.estimate_hours, true, null, t.sort_order
    from public.tasks t
   cross join lateral (
     select public.working_days_between(base, coalesce(t.start_date, t.due_date, base)) as start_day
   ) s
   where t.project_id = p_project and t.is_milestone;

  for d in 0..4 loop
    with recursive tree as (
      select id, 0 as depth from public.tasks where project_id = p_project and parent_task_id is null
      union all
      select t.id, tree.depth + 1 from public.tasks t join tree on t.parent_task_id = tree.id
    )
    insert into public.template_tasks (id, template_id, parent_id, title, description, start_day, due_day, estimate_hours,
                                       is_milestone, milestone_id, sort_order)
    select (ids ->> t.id::text)::uuid, tid, (ids ->> t.parent_task_id::text)::uuid, t.title, t.description, s.start_day,
           greatest(s.start_day, public.working_days_between(base, coalesce(t.due_date, t.start_date, base))),
           t.estimate_hours, false, (ids ->> t.milestone_id::text)::uuid, t.sort_order
      from public.tasks t
      join tree on tree.id = t.id and tree.depth = d
     cross join lateral (
       select public.working_days_between(base, coalesce(t.start_date, t.due_date, base)) as start_day
     ) s
     where not t.is_milestone;
  end loop;

  insert into public.template_task_assignees (template_task_id, profile_id)
  select (ids ->> t.id::text)::uuid, a.profile_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
   where t.project_id = p_project;

  insert into public.template_task_role_slots (template_task_id, role_id)
  select (ids ->> t.id::text)::uuid, r.role_id
    from public.tasks t
    join public.task_role_slots r on r.task_id = t.id
   where t.project_id = p_project;

  return tid;
end;
$$;
