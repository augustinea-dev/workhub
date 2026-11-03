-- Tasks can belong to a milestone (another task in the same project with is_milestone).
alter table public.tasks
  add column milestone_id uuid references public.tasks (id) on delete set null;

create index tasks_milestone_idx on public.tasks (milestone_id);

create function public.check_task_milestone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.milestone_id is not null then
    if new.is_milestone then
      raise exception 'A milestone can''t belong to another milestone.';
    end if;
    if not exists (
      select 1 from public.tasks m
      where m.id = new.milestone_id and m.is_milestone and m.project_id = new.project_id
    ) then
      raise exception 'Pick a milestone from the same project.';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_milestone_check
  before insert or update of milestone_id, is_milestone, project_id on public.tasks
  for each row execute function public.check_task_milestone();

-- When a task stops being a milestone, its tasks become ungrouped.
create function public.release_milestone_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks set milestone_id = null where milestone_id = new.id;
  return null;
end;
$$;

create trigger tasks_release_milestone
  after update of is_milestone on public.tasks
  for each row
  when (old.is_milestone and not new.is_milestone)
  execute function public.release_milestone_tasks();
