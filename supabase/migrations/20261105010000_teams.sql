-- Teams: admins group people into teams with an optional manager. A team's manager can see,
-- approve, return and reopen their members' timesheets (but never their own).

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  manager_id  uuid references public.profiles (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  unique (team_id, profile_id)
);

create index team_members_profile_idx on public.team_members (profile_id);

create trigger audit_teams after insert or update or delete on public.teams
  for each row execute function public.write_audit();
create trigger audit_team_members after insert or update or delete on public.team_members
  for each row execute function public.write_audit();

alter table public.teams enable row level security;
create policy "staff read teams" on public.teams
  for select to authenticated using (public.is_active_user());
create policy "admin manage teams" on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.team_members enable row level security;
create policy "staff read team members" on public.team_members
  for select to authenticated using (public.is_active_user());
create policy "admin manage team members" on public.team_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- True when the caller manages an active team that this person belongs to.
create function public.manages(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.teams t
      join public.team_members m on m.team_id = t.id
     where t.active and t.manager_id = (select auth.uid()) and m.profile_id = p_profile
  );
$$;

drop policy if exists "read own or admin timesheets" on public.timesheets;
create policy "read own, managed or admin timesheets" on public.timesheets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin() or public.manages(user_id));

create or replace function public.decide_timesheet(p_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.timesheets;
  week text;
begin
  select * into ts from public.timesheets where id = p_id;
  if not found then
    raise exception 'That timesheet no longer exists.';
  end if;
  if not (public.is_admin() or (public.manages(ts.user_id) and ts.user_id <> auth.uid())) then
    raise exception 'Only an admin or the person''s team manager can approve or return their timesheet.';
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

create or replace function public.reopen_timesheet(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.timesheets;
begin
  select * into ts from public.timesheets where id = p_id;
  if not found then
    raise exception 'That timesheet no longer exists.';
  end if;
  if not (public.is_admin() or (public.manages(ts.user_id) and ts.user_id <> auth.uid())) then
    raise exception 'Only an admin or the person''s team manager can reopen their timesheet.';
  end if;
  update public.timesheets
     set status = 'open', decided_at = now(), decided_by = auth.uid()
   where id = p_id and status = 'approved'
  returning * into ts;
  if not found then
    raise exception 'Only an approved timesheet can be reopened.';
  end if;
  perform public.notify_timesheet(ts, 'timesheet_reopened',
    'Your timesheet for the week of ' || to_char(ts.week_start, 'Mon FMDD') || ' was reopened');
end;
$$;
