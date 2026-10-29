-- Members are contributors: they update the status of tasks assigned to them,
-- comment, and log / edit / remove their own time. Setting up clients, projects
-- and tasks (and changing their details) is admin-only.

-- Clients
drop policy if exists "staff add companies" on public.companies;
drop policy if exists "staff edit companies" on public.companies;
create policy "admin add companies" on public.companies
  for insert to authenticated with check (public.is_admin());
create policy "admin edit companies" on public.companies
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Projects
drop policy if exists "staff add projects" on public.projects;
drop policy if exists "staff edit projects" on public.projects;
create policy "admin add projects" on public.projects
  for insert to authenticated with check (public.is_admin());
create policy "admin edit projects" on public.projects
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tasks: admins add and edit; the assignee may update their own task (status only, see trigger)
drop policy if exists "staff add tasks" on public.tasks;
drop policy if exists "staff edit tasks" on public.tasks;
create policy "admin add tasks" on public.tasks
  for insert to authenticated with check (public.is_admin());
create policy "admin or assignee edit tasks" on public.tasks
  for update to authenticated
  using (public.is_admin() or assignee_id = (select auth.uid()))
  with check (public.is_admin() or assignee_id = (select auth.uid()));

create or replace function public.guard_task_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  skip text[] := array['status', 'version', 'updated_at', 'completed_at'];
begin
  if auth.uid() is not null
     and not public.is_admin()
     and (to_jsonb(new) - skip) is distinct from (to_jsonb(old) - skip) then
    raise exception 'Only an admin can change task details. You can update the status of tasks assigned to you.';
  end if;
  return new;
end;
$$;

-- Runs before tasks_touch (triggers fire in name order), so it sees the member's change only.
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard
  before update on public.tasks
  for each row execute function public.guard_task_update();

-- Time: people may remove their own entries again (admins can remove anyone's)
drop policy if exists "admin delete time" on public.time_entries;
drop policy if exists "delete own time" on public.time_entries;
create policy "delete own time" on public.time_entries
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
