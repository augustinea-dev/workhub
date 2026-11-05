-- Each person chooses which notices they get in Workhub. Everything is on unless turned off;
-- "timesheet returned" can't be turned off so a returned week isn't missed.

create table public.notification_preferences (
  profile_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('task_assigned', 'task_comment', 'mention', 'timesheet_approved', 'timesheet_reopened')),
  in_app      boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, kind)
);

alter table public.notification_preferences enable row level security;
create policy "read own notification settings" on public.notification_preferences
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "add own notification settings" on public.notification_preferences
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "change own notification settings" on public.notification_preferences
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Notices someone has turned off are simply not created.
create function public.skip_muted_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notification_preferences
     where profile_id = new.recipient_id and kind = new.kind and not in_app
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger notification_events_skip_muted
  before insert on public.notification_events
  for each row execute function public.skip_muted_notification();
