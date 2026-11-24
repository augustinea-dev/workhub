-- Undoes 20261124210000_project_status_rules. Run as one script in the SQL editor, then deploy the commit before it.
begin;

drop trigger if exists projects_notify_started on public.projects;
drop trigger if exists notification_events_skip_planning on public.notification_events;
drop trigger if exists time_entries_status_guard on public.time_entries;
drop trigger if exists task_role_slots_guard_closed on public.task_role_slots;
drop trigger if exists task_assignees_guard_closed on public.task_assignees;
drop trigger if exists tasks_guard_closed on public.tasks;
drop trigger if exists projects_guard_closed on public.projects;
drop trigger if exists projects_stamp_status on public.projects;

drop function if exists public.notify_project_started();
drop function if exists public.skip_planning_notification();
drop function if exists public.guard_project_time();
drop function if exists public.guard_closed_task_people();
drop function if exists public.guard_closed_project_tasks();
drop function if exists public.guard_closed_project();
drop function if exists public.project_status_of(uuid);
drop function if exists public.stamp_project_status();

alter table public.projects drop column if exists status_changed_at;

delete from supabase_migrations.schema_migrations where version = '20261124210000';

commit;
