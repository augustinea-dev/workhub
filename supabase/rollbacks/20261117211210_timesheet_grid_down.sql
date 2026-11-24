-- Undoes 20261117211210_timesheet_grid. Run as one script in the SQL editor, then deploy the before-timesheet-grid tag. Once sure, drop schema backup_timesheet_grid cascade.

drop trigger if exists projects_billable_changed on public.projects;
drop function if exists public.projects_billable_changed();
drop trigger if exists time_entries_set_type on public.time_entries;
drop function if exists public.time_entry_set_type();

delete from public.time_entries where category_id is not null;
alter table public.time_entries
  drop constraint if exists time_entries_project_or_category,
  drop column if exists category_id,
  drop column if exists job_role_id,
  alter column project_id set not null;

update public.time_entries e
   set hour_type = b.hour_type
  from backup_timesheet_grid.time_entries b
 where b.id = e.id;

alter table public.projects drop column if exists billable;
drop table if exists public.time_categories;
drop type if exists public.time_category_kind;

create or replace function public.guard_locked_week()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.timesheets
     where user_id = old.user_id and week_start = public.week_monday(old.work_date)
       and status in ('submitted', 'approved')
  ) or tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.timesheets
     where user_id = new.user_id and week_start = public.week_monday(new.work_date)
       and status in ('submitted', 'approved')
  ) then
    raise exception 'That week''s timesheet is submitted or approved, so its time is locked. Recall it, or ask an admin to reopen it.';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.submit_timesheet(p_week date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  expected numeric;
  total numeric;
  ts public.timesheets;
begin
  if not public.is_active_user() then
    raise exception 'Sign in to submit a timesheet.';
  end if;
  if p_week is distinct from public.week_monday(p_week) then
    raise exception 'A timesheet week starts on a Monday.';
  end if;
  if p_week > public.week_monday(public.pacific_today()) then
    raise exception 'You can''t submit a week that hasn''t started yet.';
  end if;

  select weekly_hours into expected from public.profiles where id = me;
  select coalesce(sum(hours), 0) into total
    from public.time_entries
   where user_id = me and work_date between p_week and p_week + 6;
  if total < expected then
    raise exception 'This week has % h logged. You need % h to submit.',
      rtrim(to_char(total, 'FM990.99'), '.'), rtrim(to_char(expected, 'FM990.9'), '.');
  end if;

  select * into ts from public.timesheets where user_id = me and week_start = p_week for update;
  if found and ts.status in ('submitted', 'approved') then
    raise exception 'This week is already %.', ts.status;
  end if;

  insert into public.timesheets (user_id, week_start, status, total_hours, submitted_at, decided_at, decided_by)
  values (me, p_week, 'submitted', total, now(), null, null)
  on conflict (user_id, week_start) do update
    set status = 'submitted', total_hours = excluded.total_hours, submitted_at = now(),
        decided_at = null, decided_by = null
  returning * into ts;
  return ts.id;
end;
$$;

alter table public.timesheets drop constraint if exists timesheets_week_start_check;
delete from public.timesheets;
insert into public.timesheets select * from backup_timesheet_grid.timesheets;
alter table public.timesheets add constraint timesheets_week_start_check check (extract(isodow from week_start) = 1);

drop function if exists public.week_sunday(date);

delete from supabase_migrations.schema_migrations where name = 'timesheet_grid';
