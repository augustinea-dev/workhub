alter table public.notification_preferences drop constraint notification_preferences_kind_check;
alter table public.notification_preferences add constraint notification_preferences_kind_check
  check (kind in ('task_assigned', 'task_comment', 'mention', 'timesheet_approved', 'timesheet_reopened', 'budget_alert'));

create table public.project_budget_alerts (
  project_id uuid not null references public.projects (id) on delete cascade,
  level      smallint not null check (level in (75, 90, 100)),
  sent_at    timestamptz not null default now(),
  primary key (project_id, level)
);

alter table public.project_budget_alerts enable row level security;

create function public.check_project_budget(p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  proj    record;
  planned numeric;
  logged  numeric;
  pct     numeric;
  crossed smallint;
  msg     text;
begin
  select id, owner_id, coalesce(nullif(title, ''), name) as label into proj
    from public.projects where id = p_project;
  if not found then
    return;
  end if;

  select sum(estimate_hours) into planned
    from public.tasks
   where project_id = p_project and parent_task_id is null and estimate_hours is not null;
  select coalesce(sum(hours), 0) into logged
    from public.time_entries
   where project_id = p_project and hour_type <> 'pto';

  if planned is null or planned <= 0 then
    delete from public.project_budget_alerts where project_id = p_project;
    return;
  end if;

  pct := logged / planned * 100;
  delete from public.project_budget_alerts where project_id = p_project and level > pct;

  select max(l) into crossed
    from unnest(array[75, 90, 100]::smallint[]) as l
   where pct >= l
     and not exists (select 1 from public.project_budget_alerts a where a.project_id = p_project and a.level = l);
  if crossed is null then
    return;
  end if;

  insert into public.project_budget_alerts (project_id, level)
  select p_project, l from unnest(array[75, 90, 100]::smallint[]) as l where l <= crossed
  on conflict do nothing;

  msg := case
    when crossed = 100 then proj.label || ' is over its estimated hours: ' || trim_scale(round(logged, 1)) || ' of '
         || trim_scale(round(planned, 1)) || ' h (' || round(pct) || '%)'
    else proj.label || ' has used ' || round(pct) || '% of its estimated hours (' || trim_scale(round(logged, 1)) || ' of '
         || trim_scale(round(planned, 1)) || ' h)'
  end;

  insert into public.notification_events (recipient_id, actor_id, kind, project_id, summary)
  select r.id, auth.uid(), 'budget_alert', p_project, msg
    from public.profiles r
   where r.active and (r.role = 'admin' or r.id = proj.owner_id);
end;
$$;

create function public.time_entries_check_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.check_project_budget(new.project_id);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.project_id is distinct from new.project_id) then
    perform public.check_project_budget(old.project_id);
  end if;
  return null;
end;
$$;

create trigger time_entries_check_budget
  after insert or update of hours, hour_type, project_id or delete on public.time_entries
  for each row execute function public.time_entries_check_budget();

create function public.tasks_check_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.check_project_budget(new.project_id);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.project_id is distinct from new.project_id) then
    perform public.check_project_budget(old.project_id);
  end if;
  return null;
end;
$$;

create trigger tasks_check_budget
  after insert or update of estimate_hours, parent_task_id, project_id or delete on public.tasks
  for each row execute function public.tasks_check_budget();

insert into public.project_budget_alerts (project_id, level)
select b.project_id, l
  from (
    select p.id as project_id,
           (select coalesce(sum(e.hours), 0) from public.time_entries e where e.project_id = p.id and e.hour_type <> 'pto')
             / nullif((select sum(t.estimate_hours) from public.tasks t
                        where t.project_id = p.id and t.parent_task_id is null and t.estimate_hours is not null), 0) * 100 as pct
      from public.projects p
  ) b
  cross join unnest(array[75, 90, 100]::smallint[]) as l
 where b.pct >= l;

revoke execute on function public.check_project_budget(uuid) from public, anon, authenticated;
