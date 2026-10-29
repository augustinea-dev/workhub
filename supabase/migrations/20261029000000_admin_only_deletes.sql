-- Deleting anything is an admin-only action.
-- Members can still create and edit tasks, comments and time; only admins can delete.

drop policy if exists "creator or admin delete tasks" on public.tasks;
create policy "admin delete tasks" on public.tasks
  for delete to authenticated using (public.is_admin());

drop policy if exists "author or admin delete comments" on public.comments;
create policy "admin delete comments" on public.comments
  for delete to authenticated using (public.is_admin());

drop policy if exists "delete own time" on public.time_entries;
create policy "admin delete time" on public.time_entries
  for delete to authenticated using (public.is_admin());
