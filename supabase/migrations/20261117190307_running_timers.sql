create table public.running_timers (
  user_id    uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.running_timers enable row level security;

create policy "read own timer" on public.running_timers
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "start own timer" on public.running_timers
  for insert to authenticated
  with check (public.is_active_user() and user_id = (select auth.uid()));
create policy "change own timer" on public.running_timers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (public.is_active_user() and user_id = (select auth.uid()));
create policy "stop own timer" on public.running_timers
  for delete to authenticated
  using (user_id = (select auth.uid()));
