create schema if not exists backup_timesheet_grid;
revoke all on schema backup_timesheet_grid from public, anon, authenticated;
create table backup_timesheet_grid.time_entries as table public.time_entries;
create table backup_timesheet_grid.timesheets as table public.timesheets;
create table backup_timesheet_grid.projects as select id, company_id from public.projects;

create function public.week_sunday(d date)
returns date
language sql
immutable
set search_path = ''
as $$
  select d - (extract(dow from d)::integer);
$$;

alter table public.timesheets drop constraint timesheets_week_start_check;
update public.timesheets
   set week_start = public.week_sunday(week_start), status = 'open', submitted_at = null,
       decided_at = null, decided_by = null, return_note = null;
alter table public.timesheets add constraint timesheets_week_start_check check (extract(dow from week_start) = 0);

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
  if p_week is distinct from public.week_sunday(p_week) then
    raise exception 'A timesheet week starts on a Sunday.';
  end if;
  if p_week > public.week_sunday(public.pacific_today()) then
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
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'hour_type') = (to_jsonb(old) - 'hour_type') then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.timesheets
     where user_id = old.user_id and week_start = public.week_sunday(old.work_date)
       and status in ('submitted', 'approved')
  ) or tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.timesheets
     where user_id = new.user_id and week_start = public.week_sunday(new.work_date)
       and status in ('submitted', 'approved')
  ) then
    raise exception 'That week''s timesheet is submitted or approved, so its time is locked. Recall it, or ask an admin to reopen it.';
  end if;
  return coalesce(new, old);
end;
$$;

create type public.time_category_kind as enum ('work', 'time_off', 'holiday');

create table public.time_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  group_name text not null check (group_name in ('Agency', 'Non-Client')),
  kind       public.time_category_kind not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.time_categories enable row level security;
create policy "staff read time categories" on public.time_categories
  for select to authenticated using (public.is_active_user());
create policy "admin add time categories" on public.time_categories
  for insert to authenticated with check (public.is_admin());
create policy "admin edit time categories" on public.time_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete time categories" on public.time_categories
  for delete to authenticated using (public.is_admin());
create trigger audit_time_categories after insert or update or delete on public.time_categories
  for each row execute function public.write_audit();

insert into public.time_categories (name, group_name, kind, sort_order) values
  ('General Time', 'Agency', 'work', 1),
  ('IT Tasks', 'Agency', 'work', 2),
  ('Management Time', 'Agency', 'work', 3),
  ('Traffic', 'Agency', 'work', 4),
  ('Training & Conferences', 'Agency', 'work', 5),
  ('Visioneer Liftoff Meeting', 'Agency', 'work', 6),
  ('Bereavement Leave', 'Non-Client', 'time_off', 11),
  ('Flex Day', 'Non-Client', 'time_off', 12),
  ('Holiday', 'Non-Client', 'holiday', 13),
  ('Jury Duty', 'Non-Client', 'time_off', 14),
  ('Sick Leave', 'Non-Client', 'time_off', 15),
  ('Summer Fridays', 'Non-Client', 'time_off', 16),
  ('Unpaid Time Off', 'Non-Client', 'time_off', 17),
  ('Vacation', 'Non-Client', 'time_off', 18);

alter table public.projects add column billable boolean not null default true;
update public.projects set billable = (company_id is not null);

alter table public.time_entries
  alter column project_id drop not null,
  add column category_id uuid references public.time_categories (id) on delete restrict,
  add column job_role_id uuid references public.job_roles (id) on delete set null,
  add constraint time_entries_project_or_category check (
    (category_id is null and project_id is not null)
    or (category_id is not null and project_id is null and task_id is null)
  );
create index time_entries_category_idx on public.time_entries (category_id) where category_id is not null;

create function public.time_entry_set_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.time_category_kind;
begin
  if new.category_id is not null then
    select kind into k from public.time_categories where id = new.category_id;
    new.hour_type := case when k = 'work' then 'admin'::public.hour_type else 'pto'::public.hour_type end;
  else
    new.hour_type := case when (select billable from public.projects where id = new.project_id)
                          then 'billable'::public.hour_type else 'non_billable'::public.hour_type end;
    if tg_op = 'INSERT' and new.job_role_id is null then
      select role_id into new.job_role_id from public.profile_job_roles where profile_id = new.user_id and is_main;
    end if;
  end if;
  return new;
end;
$$;

create trigger time_entries_set_type
  before insert or update of project_id, task_id, category_id, hour_type on public.time_entries
  for each row execute function public.time_entry_set_type();

create function public.projects_billable_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.time_entries
     set hour_type = case when new.billable then 'billable'::public.hour_type else 'non_billable'::public.hour_type end
   where project_id = new.id;
  return null;
end;
$$;

create trigger projects_billable_changed
  after update of billable on public.projects
  for each row when (old.billable is distinct from new.billable)
  execute function public.projects_billable_changed();

update public.time_entries
   set hour_type = case when (select billable from public.projects p where p.id = time_entries.project_id)
                        then 'billable'::public.hour_type else 'non_billable'::public.hour_type end
 where category_id is null;
