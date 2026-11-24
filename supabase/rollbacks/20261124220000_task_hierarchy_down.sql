-- Undoes 20261124220000_task_hierarchy (back to one level of subtasks). People, roles and time it moved onto
-- subtasks stay where they are. Fails if any task is more than one level deep; move those up first.
begin;

do $$
begin
  if exists (select 1 from public.tasks c join public.tasks p on p.id = c.parent_task_id where p.parent_task_id is not null) then
    raise exception 'Some subtasks have their own subtasks. Move them up a level first.';
  end if;
end;
$$;

drop trigger if exists running_timers_parent_guard on public.running_timers;
drop trigger if exists time_entries_parent_guard on public.time_entries;
drop trigger if exists task_role_slots_parent_guard on public.task_role_slots;
drop trigger if exists task_assignees_parent_guard on public.task_assignees;
drop trigger if exists tasks_move_work_down on public.tasks;
drop function if exists public.guard_parent_task_work();
drop function if exists public.move_work_to_subtask();

create or replace function public.check_task_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.tasks;
begin
  if new.parent_task_id is not null then
    select * into p from public.tasks where id = new.parent_task_id;
    if not found or p.project_id <> new.project_id then
      raise exception 'A subtask''s parent must be a task in the same project.';
    end if;
    if new.parent_task_id = new.id then
      raise exception 'A task can''t be its own subtask.';
    end if;
    -- One level deep: the parent must be a top-level task, and a subtask can't have subtasks.
    if p.parent_task_id is not null then
      raise exception 'Subtasks can''t have their own subtasks yet.';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.tasks c where c.parent_task_id = new.id) then
      raise exception 'A task that has subtasks can''t become a subtask.';
    end if;
    if new.is_milestone or p.is_milestone then
      raise exception 'Milestones can''t have subtasks or be subtasks.';
    end if;
    -- Subtasks follow their parent's milestone instead of having their own.
    new.milestone_id := null;
  elsif new.is_milestone and tg_op = 'UPDATE'
        and exists (select 1 from public.tasks c where c.parent_task_id = new.id) then
    raise exception 'A task with subtasks can''t be a milestone.';
  end if;
  return new;
end;
$$;

create or replace function public.apply_subtask_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select min(start_date) as s, max(due_date) as d, sum(estimate_hours) as e,
         count(start_date) as ns, count(due_date) as nd, count(estimate_hours) as ne
    into r
    from public.tasks
   where parent_task_id = new.id;
  if r.ns > 0 then new.start_date := r.s; end if;
  if r.nd > 0 then new.due_date := r.d; end if;
  if r.ne > 0 then new.estimate_hours := r.e; end if;
  return new;
end;
$$;

drop trigger tasks_rollup_parent_change on public.tasks;
create trigger tasks_rollup_parent_change
  after update on public.tasks
  for each row
  when (old.parent_task_id is distinct from new.parent_task_id
        or old.start_date is distinct from new.start_date
        or old.due_date is distinct from new.due_date
        or old.estimate_hours is distinct from new.estimate_hours)
  execute function public.refresh_parent_rollup();

delete from supabase_migrations.schema_migrations where version = '20261124220000';

commit;
