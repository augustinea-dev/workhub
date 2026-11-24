-- Undoes 20261124230000_template_hierarchy. Template subtasks become top-level tasks (their parent link is
-- dropped) and duration goes back to start day and due day.
begin;

drop trigger if exists template_task_role_slots_parent_guard on public.template_task_role_slots;
drop trigger if exists template_task_assignees_parent_guard on public.template_task_assignees;
drop trigger if exists template_tasks_move_work_down on public.template_tasks;
drop trigger if exists template_tasks_rollup_parent_change on public.template_tasks;
drop trigger if exists template_tasks_rollup_parent on public.template_tasks;
drop trigger if exists template_tasks_rollup_self on public.template_tasks;
drop trigger if exists template_tasks_parent_check on public.template_tasks;
drop trigger if exists template_tasks_days on public.template_tasks;

drop function if exists public.guard_template_parent_work();
drop function if exists public.move_template_work_down();
drop function if exists public.refresh_template_parent();
drop function if exists public.apply_template_rollup();
drop function if exists public.check_template_parent();
drop function if exists public.set_template_task_days();

alter table public.template_tasks drop column if exists parent_id;
alter table public.template_tasks drop column if exists duration_days;

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

  -- Milestones first, so tasks can point at them.
  for pass in 1..2 loop
    insert into public.tasks (id, project_id, title, description, is_milestone, milestone_id,
                              start_date, due_date, estimate_hours, sort_order)
    select (ids ->> tt.id::text)::uuid, pid, tt.title, tt.description,
           tt.is_milestone,
           case when tt.is_milestone then null else (ids ->> tt.milestone_id::text)::uuid end,
           public.add_working_days(p_start, tt.start_day),
           public.add_working_days(p_start, tt.due_day),
           tt.estimate_hours, tt.sort_order
      from public.template_tasks tt
     where tt.template_id = p_template and tt.is_milestone = (pass = 1);
  end loop;

  -- Default assignees who are no longer active are left off.
  insert into public.task_assignees (task_id, profile_id)
  select (ids ->> tt.id::text)::uuid, a.profile_id
    from public.template_tasks tt
    join public.template_task_assignees a on a.template_task_id = tt.id
    join public.profiles p on p.id = a.profile_id and p.active
   where tt.template_id = p_template;

  insert into public.task_role_slots (task_id, role_id)
  select (ids ->> tt.id::text)::uuid, r.role_id
    from public.template_tasks tt
    join public.template_task_role_slots r on r.template_task_id = tt.id
   where tt.template_id = p_template;

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
    from public.tasks where project_id = p_project and parent_task_id is null;

  -- Milestones first, so tasks can point at them.
  for pass in 1..2 loop
    insert into public.template_tasks (id, template_id, title, description, start_day, due_day, estimate_hours,
                                       is_milestone, milestone_id, sort_order)
    select (ids ->> t.id::text)::uuid, tid, t.title, t.description, s.start_day,
           greatest(s.start_day, public.working_days_between(base, coalesce(t.due_date, t.start_date, base))),
           t.estimate_hours, t.is_milestone,
           case when t.is_milestone then null else (ids ->> t.milestone_id::text)::uuid end,
           t.sort_order
      from public.tasks t
     cross join lateral (
       select public.working_days_between(base, coalesce(t.start_date, t.due_date, base)) as start_day
     ) s
     where t.project_id = p_project and t.parent_task_id is null and t.is_milestone = (pass = 1);
  end loop;

  insert into public.template_task_assignees (template_task_id, profile_id)
  select (ids ->> t.id::text)::uuid, a.profile_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
   where t.project_id = p_project and t.parent_task_id is null;

  insert into public.template_task_role_slots (template_task_id, role_id)
  select (ids ->> t.id::text)::uuid, r.role_id
    from public.tasks t
    join public.task_role_slots r on r.task_id = t.id
   where t.project_id = p_project and t.parent_task_id is null;

  return tid;
end;
$$;

delete from supabase_migrations.schema_migrations where version = '20261124230000';

commit;
