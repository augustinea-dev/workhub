-- Weekly timesheets: people submit a Monday-to-Sunday week, admins approve or return it.
-- Submitted and approved weeks lock their time entries.

-- Expected hours per week, set by admins (default 40). A week can't be submitted below it.
alter table public.profiles
  add column weekly_hours numeric(4, 1) not null default 40 check (weekly_hours >= 0 and weekly_hours <= 80);

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active
      or new.email is distinct from old.email or new.weekly_hours is distinct from old.weekly_hours)
     and auth.uid() is not null      -- SQL editor / service role (no user) may bootstrap the first admin
     and not public.is_admin() then
    raise exception 'Only an admin can change role, status, email or weekly hours';
  end if;
  return new;
end;
$$;

create type public.timesheet_status as enum ('open', 'submitted', 'approved', 'returned');

create table public.timesheets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  status       public.timesheet_status not null default 'open',
  total_hours  numeric(6, 2),
  submitted_at timestamptz,
  decided_at   timestamptz,
  decided_by   uuid references public.profiles (id) on delete set null,
  return_note  text,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, week_start)
);

create index timesheets_status_idx on public.timesheets (status, week_start);

create trigger timesheets_touch before update on public.timesheets
  for each row execute function public.touch_row();
create trigger audit_timesheets after insert or update or delete on public.timesheets
  for each row execute function public.write_audit();

-- Read your own, admins read all. All changes go through the functions below.
alter table public.timesheets enable row level security;
create policy "read own or admin timesheets" on public.timesheets
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

alter table public.notification_events
  add column timesheet_id uuid references public.timesheets (id) on delete cascade;

create function public.week_monday(d date)
returns date
language sql
immutable
set search_path = ''
as $$
  select d - (extract(isodow from d)::integer - 1);
$$;

create function public.pacific_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Los_Angeles')::date;
$$;

create function public.notify_timesheet(ts public.timesheets, kind text, summary text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_events (recipient_id, actor_id, kind, timesheet_id, summary)
  values (ts.user_id, auth.uid(), kind, ts.id, summary);
$$;

create function public.submit_timesheet(p_week date)
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

create function public.recall_timesheet(p_week date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.timesheets
     set status = 'open', submitted_at = null
   where user_id = auth.uid() and week_start = p_week and status = 'submitted';
  if not found then
    raise exception 'Only a submitted week that hasn''t been decided yet can be recalled.';
  end if;
end;
$$;

create function public.decide_timesheet(p_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.timesheets;
  week text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve or return timesheets.';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note saying what needs fixing.';
  end if;

  update public.timesheets
     set status = case when p_approve then 'approved' else 'returned' end::public.timesheet_status,
         decided_at = now(), decided_by = auth.uid(),
         return_note = case when p_approve then null else trim(p_note) end
   where id = p_id and status = 'submitted'
  returning * into ts;
  if not found then
    raise exception 'That timesheet isn''t waiting for a decision any more.';
  end if;

  week := to_char(ts.week_start, 'Mon FMDD');
  if p_approve then
    perform public.notify_timesheet(ts, 'timesheet_approved', 'Your timesheet for the week of ' || week || ' was approved');
  else
    perform public.notify_timesheet(ts, 'timesheet_returned',
      'Your timesheet for the week of ' || week || ' was returned: ' || ts.return_note);
  end if;
end;
$$;

create function public.reopen_timesheet(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.timesheets;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reopen timesheets.';
  end if;
  update public.timesheets
     set status = 'open', decided_at = now(), decided_by = auth.uid()
   where id = p_id and status = 'approved'
  returning * into ts;
  if not found then
    raise exception 'Only an approved timesheet can be reopened.';
  end if;
  perform public.notify_timesheet(ts, 'timesheet_reopened',
    'Your timesheet for the week of ' || to_char(ts.week_start, 'Mon FMDD') || ' was reopened by an admin');
end;
$$;

-- Time entries in a submitted or approved week can't be added, changed or removed (admins included).
create function public.guard_locked_week()
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

create trigger time_entries_locked_week
  before insert or update or delete on public.time_entries
  for each row execute function public.guard_locked_week();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.timesheets;
  end if;
end;
$$;
