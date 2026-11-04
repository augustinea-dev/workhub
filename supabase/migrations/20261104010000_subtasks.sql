-- Subtasks: tasks with a parent in the same project, one level deep for now.
-- A parent's start, due and planned hours are calculated from its subtasks (Workfront-style roll-up).

create function public.check_task_parent()
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

create trigger tasks_parent_check
  before insert or update of parent_task_id, project_id, is_milestone on public.tasks
  for each row execute function public.check_task_parent();

-- On a parent, each of start, due and planned hours comes from its subtasks whenever at least one
-- subtask has that value; otherwise the parent keeps its own.
create function public.apply_subtask_rollup()
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

create trigger tasks_rollup_self
  before update on public.tasks
  for each row execute function public.apply_subtask_rollup();

-- When a subtask changes, refresh its parent (and so on up, should deeper levels be allowed later).
-- Security definer so a member's change to their own subtask can still update the parent's totals;
-- the parent update only touches updated_at itself, so guard_task_update lets it through.
create function public.refresh_parent_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.parent_task_id is not null then
    update public.tasks set updated_at = now() where id = new.parent_task_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.parent_task_id is not null
     and old.parent_task_id is distinct from (case when tg_op = 'UPDATE' then new.parent_task_id end) then
    update public.tasks set updated_at = now() where id = old.parent_task_id;
  end if;
  return null;
end;
$$;

create trigger tasks_rollup_parent
  after insert or delete on public.tasks
  for each row execute function public.refresh_parent_rollup();

create trigger tasks_rollup_parent_change
  after update on public.tasks
  for each row
  when (old.parent_task_id is distinct from new.parent_task_id
        or old.start_date is distinct from new.start_date
        or old.due_date is distinct from new.due_date
        or old.estimate_hours is distinct from new.estimate_hours)
  execute function public.refresh_parent_rollup();
