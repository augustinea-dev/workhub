-- Subtasks up to 4 levels below a top-level task. Tasks with subtasks are containers: their people,
-- open roles and time live on their subtasks, and their dates, hours and status roll up from them.

create or replace function public.check_task_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.tasks;
  depth integer;
  height integer := 0;
begin
  if new.parent_task_id is not null then
    select * into p from public.tasks where id = new.parent_task_id;
    if not found or p.project_id <> new.project_id then
      raise exception 'A subtask''s parent must be a task in the same project.';
    end if;
    if new.parent_task_id = new.id then
      raise exception 'A task can''t be its own subtask.';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, parent_task_id from public.tasks where id = new.parent_task_id
        union all
        select t.id, t.parent_task_id from public.tasks t join up on t.id = up.parent_task_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'A task can''t move under one of its own subtasks.';
    end if;
    with recursive up as (
      select id, parent_task_id, 1 as n from public.tasks where id = new.parent_task_id
      union all
      select t.id, t.parent_task_id, up.n + 1 from public.tasks t join up on t.id = up.parent_task_id
    )
    select max(n) into depth from up;
    if tg_op = 'UPDATE' then
      with recursive down as (
        select id, 1 as n from public.tasks where parent_task_id = new.id
        union all
        select t.id, down.n + 1 from public.tasks t join down on t.parent_task_id = down.id
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
         count(start_date) as ns, count(due_date) as nd, count(estimate_hours) as ne,
         count(*) as n, bool_and(status = 'done') as all_done, bool_or(status <> 'todo') as started
    into r
    from public.tasks
   where parent_task_id = new.id;
  if r.ns > 0 then new.start_date := r.s; end if;
  if r.nd > 0 then new.due_date := r.d; end if;
  if r.ne > 0 then new.estimate_hours := r.e; end if;
  if r.n > 0 then
    new.status := case when r.all_done then 'done' when r.started then 'in_progress' else 'todo' end;
  end if;
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
        or old.estimate_hours is distinct from new.estimate_hours
        or old.status is distinct from new.status)
  execute function public.refresh_parent_rollup();

-- Existing parents: people move onto subtasks that have nobody, open roles and time onto the first subtask.
insert into public.task_assignees (task_id, profile_id, created_by, as_role_id)
select c.id, a.profile_id, a.created_by, a.as_role_id
  from public.task_assignees a
  join public.tasks c on c.parent_task_id = a.task_id
 where not exists (select 1 from public.task_assignees x where x.task_id = c.id)
on conflict do nothing;

delete from public.task_assignees a
 where exists (select 1 from public.tasks c where c.parent_task_id = a.task_id);

update public.task_role_slots s
   set task_id = (select c.id from public.tasks c where c.parent_task_id = s.task_id order by c.sort_order, c.created_at limit 1)
 where exists (select 1 from public.tasks c where c.parent_task_id = s.task_id);

update public.time_entries e
   set task_id = (select c.id from public.tasks c where c.parent_task_id = e.task_id order by c.sort_order, c.created_at limit 1)
 where exists (select 1 from public.tasks c where c.parent_task_id = e.task_id);

update public.running_timers r
   set task_id = (select c.id from public.tasks c where c.parent_task_id = r.task_id order by c.sort_order, c.created_at limit 1)
 where exists (select 1 from public.tasks c where c.parent_task_id = r.task_id);

update public.tasks set updated_at = now()
 where id in (select distinct parent_task_id from public.tasks where parent_task_id is not null);

-- When a task gets a subtask, its people, open roles, time and running timers move down to it.
create function public.move_work_to_subtask()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := new.parent_task_id;
begin
  if pid is null or (tg_op = 'UPDATE' and old.parent_task_id is not distinct from new.parent_task_id) then
    return null;
  end if;
  insert into public.task_assignees (task_id, profile_id, created_by, as_role_id)
  select new.id, a.profile_id, a.created_by, a.as_role_id from public.task_assignees a where a.task_id = pid
  on conflict do nothing;
  delete from public.task_assignees where task_id = pid;
  update public.task_role_slots set task_id = new.id where task_id = pid;
  update public.time_entries set task_id = new.id where task_id = pid;
  update public.running_timers set task_id = new.id where task_id = pid;
  return null;
end;
$$;

create trigger tasks_move_work_down
  after insert or update of parent_task_id on public.tasks
  for each row execute function public.move_work_to_subtask();

create function public.guard_parent_task_work()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_id is not null and exists (select 1 from public.tasks where parent_task_id = new.task_id) then
    raise exception '%', case tg_table_name
      when 'time_entries' then 'That task has subtasks, so log time on one of its subtasks.'
      when 'running_timers' then 'That task has subtasks, so start the timer on one of its subtasks.'
      else 'That task has subtasks, so people and open roles go on its subtasks.'
    end;
  end if;
  return new;
end;
$$;

create trigger task_assignees_parent_guard
  before insert or update of task_id on public.task_assignees
  for each row execute function public.guard_parent_task_work();

create trigger task_role_slots_parent_guard
  before insert or update of task_id on public.task_role_slots
  for each row execute function public.guard_parent_task_work();

create trigger time_entries_parent_guard
  before insert or update of task_id on public.time_entries
  for each row execute function public.guard_parent_task_work();

create trigger running_timers_parent_guard
  before insert or update of task_id on public.running_timers
  for each row execute function public.guard_parent_task_work();
