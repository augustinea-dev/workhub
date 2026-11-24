alter table public.projects
  add column status_changed_at timestamptz not null default now();

comment on column public.projects.status_changed_at is 'When the status last changed; Complete and Cancelled projects leave timesheets two weeks after this.';

create function public.stamp_project_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_stamp_status
  before update on public.projects
  for each row execute function public.stamp_project_status();

create function public.project_status_of(p_project uuid)
returns public.project_status
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.projects where id = p_project;
$$;

create function public.guard_closed_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  keep text[] := array['name', 'name_locked', 'status', 'status_changed_at', 'updated_at', 'version'];
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.status in ('complete', 'cancelled') and new.status in ('complete', 'cancelled')
     and (to_jsonb(new) - keep) <> (to_jsonb(old) - keep) then
    raise exception 'This project is %, so only its status and custom name can change. Set it back to Active to edit it.',
      initcap(old.status::text);
  end if;
  return new;
end;
$$;

create trigger projects_guard_closed
  before update on public.projects
  for each row execute function public.guard_closed_project();

create function public.guard_closed_project_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.project_status;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  st := public.project_status_of(case when tg_op = 'DELETE' then old.project_id else new.project_id end);
  if st in ('complete', 'cancelled') then
    raise exception 'This project is %, so its tasks can''t be changed. Set it back to Active first.', initcap(st::text);
  end if;
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    st := public.project_status_of(old.project_id);
    if st in ('complete', 'cancelled') then
      raise exception 'This project is %, so its tasks can''t be changed. Set it back to Active first.', initcap(st::text);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tasks_guard_closed
  before insert or update or delete on public.tasks
  for each row execute function public.guard_closed_project_tasks();

create function public.guard_closed_task_people()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.project_status;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select p.status into st
    from public.tasks t join public.projects p on p.id = t.project_id
   where t.id = case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  if st in ('complete', 'cancelled') then
    raise exception 'This project is %, so people on its tasks can''t change. Set it back to Active first.', initcap(st::text);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger task_assignees_guard_closed
  before insert or update or delete on public.task_assignees
  for each row execute function public.guard_closed_task_people();

create trigger task_role_slots_guard_closed
  before insert or update or delete on public.task_role_slots
  for each row execute function public.guard_closed_task_people();

create function public.guard_project_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.project_status;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'hour_type') = (to_jsonb(old) - 'hour_type') then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.project_id is not null then
    st := public.project_status_of(old.project_id);
    if st in ('planning', 'complete', 'cancelled') then
      raise exception 'That project is %, so its time can''t be changed.%', initcap(st::text),
        case when st = 'planning' then ' Time can be logged once it''s Active.' else ' Set it back to Active first.' end;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.project_id is not null then
    st := public.project_status_of(new.project_id);
    if st in ('planning', 'complete', 'cancelled') then
      raise exception 'That project is %, so time can''t be logged on it.%', initcap(st::text),
        case when st = 'planning' then ' Time can be logged once it''s Active.' else ' Set it back to Active first.' end;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger time_entries_status_guard
  before insert or update or delete on public.time_entries
  for each row execute function public.guard_project_time();

create function public.skip_planning_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := new.project_id;
begin
  if pid is null and new.task_id is not null then
    select project_id into pid from public.tasks where id = new.task_id;
  end if;
  if pid is not null and public.project_status_of(pid) = 'planning' then
    return null;
  end if;
  return new;
end;
$$;

create trigger notification_events_skip_planning
  before insert on public.notification_events
  for each row execute function public.skip_planning_notification();

create function public.notify_project_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'planning' and new.status in ('active', 'on_hold') then
    insert into public.notification_events (recipient_id, actor_id, kind, project_id, summary)
    select a.profile_id, auth.uid(), 'task_assigned', new.id,
           'You''re on ' || count(*) || case when count(*) = 1 then ' task in ' else ' tasks in ' end
             || coalesce(nullif(trim(new.title), ''), new.name)
      from public.task_assignees a
      join public.tasks t on t.id = a.task_id
      join public.profiles pr on pr.id = a.profile_id
     where t.project_id = new.id and t.status <> 'done' and pr.active
       and a.profile_id is distinct from auth.uid()
     group by a.profile_id;
  end if;
  return null;
end;
$$;

create trigger projects_notify_started
  after update of status on public.projects
  for each row execute function public.notify_project_started();
