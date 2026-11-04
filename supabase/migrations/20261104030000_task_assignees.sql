-- Several people per task (and per template task), replacing the single assignee_id.

create table public.task_assignees (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (task_id, profile_id)
);

create index task_assignees_profile_idx on public.task_assignees (profile_id);

insert into public.task_assignees (task_id, profile_id, created_by)
select id, assignee_id, null from public.tasks where assignee_id is not null;

create table public.template_task_assignees (
  id                uuid primary key default gen_random_uuid(),
  template_task_id  uuid not null references public.template_tasks (id) on delete cascade,
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  unique (template_task_id, profile_id)
);

insert into public.template_task_assignees (template_task_id, profile_id)
select id, assignee_id from public.template_tasks where assignee_id is not null;

create trigger audit_task_assignees after insert or update or delete on public.task_assignees
  for each row execute function public.write_audit();
create trigger audit_template_task_assignees after insert or update or delete on public.template_task_assignees
  for each row execute function public.write_audit();

alter table public.task_assignees enable row level security;
create policy "staff read task assignees" on public.task_assignees
  for select to authenticated using (public.is_active_user());
create policy "admin add task assignees" on public.task_assignees
  for insert to authenticated with check (public.is_admin());
create policy "admin remove task assignees" on public.task_assignees
  for delete to authenticated using (public.is_admin());

alter table public.template_task_assignees enable row level security;
create policy "admin manage template task assignees" on public.template_task_assignees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.is_task_assignee(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_assignees where task_id = p_task and profile_id = (select auth.uid())
  );
$$;

-- Any of a task's assignees may update it (status only, enforced by guard_task_update).
drop policy if exists "admin or assignee edit tasks" on public.tasks;
create policy "admin or assignee edit tasks" on public.tasks
  for update to authenticated
  using (public.is_admin() or public.is_task_assignee(id))
  with check (public.is_admin() or public.is_task_assignee(id));

-- Tell each person when they're added to a task (not when they add themselves).
drop trigger if exists tasks_notify_assigned on public.tasks;
drop function if exists public.notify_task_assigned();

create function public.notify_task_assignee_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is distinct from auth.uid() then
    insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
    select new.profile_id, auth.uid(), 'task_assigned', t.id, t.project_id, 'You were assigned: ' || t.title
      from public.tasks t
     where t.id = new.task_id;
  end if;
  return null;
end;
$$;

create trigger task_assignees_notify
  after insert on public.task_assignees
  for each row execute function public.notify_task_assignee_added();

-- Comment notices now go to every assignee.
create or replace function public.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  actor text;
begin
  select tk.id, tk.title, tk.project_id, p.owner_id
    into t
    from public.tasks tk join public.projects p on p.id = tk.project_id
   where tk.id = new.task_id;

  select full_name into actor from public.profiles where id = new.author_id;

  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
  select m, new.author_id, 'mention', t.id, t.project_id,
         coalesce(actor, 'Someone') || ' mentioned you on: ' || t.title
    from unnest(new.mentions) m;

  -- Tell the assignees, the project owner, and anyone who already commented. Never the author,
  -- and not people who were just mentioned (they already got a mention).
  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
  select distinct r.uid, new.author_id, 'task_comment', t.id, t.project_id,
         'New comment on: ' || t.title
    from (
      select ta.profile_id as uid from public.task_assignees ta where ta.task_id = t.id
      union select t.owner_id
      union select c.author_id from public.comments c where c.task_id = new.task_id
    ) r
   where r.uid is not null and r.uid <> new.author_id and r.uid <> all (new.mentions);
  return new;
end;
$$;

-- Templates copy assignees in both directions.
create or replace function public.create_project_from_template(
  p_template uuid,
  p_name text,
  p_company uuid,
  p_owner uuid,
  p_start date,
  p_due date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
  ids jsonb;
  last_day integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create projects.';
  end if;
  if not exists (select 1 from public.project_templates where id = p_template) then
    raise exception 'That template no longer exists.';
  end if;

  select coalesce(max(due_day), 0) into last_day from public.template_tasks where template_id = p_template;

  insert into public.projects (name, company_id, owner_id, status, start_date, due_date, description)
  select p_name, p_company, p_owner, 'active', p_start,
         coalesce(p_due, public.add_working_days(p_start, last_day)), t.description
    from public.project_templates t
   where t.id = p_template
  returning id into pid;

  select coalesce(jsonb_object_agg(id, gen_random_uuid()), '{}') into ids
    from public.template_tasks where template_id = p_template;

  -- Milestones first, so tasks can point at them.
  for pass in 1..2 loop
    insert into public.tasks (id, project_id, title, description, is_milestone, milestone_id,
                              start_date, due_date, estimate_hours, sort_order)
    select (ids ->> tt.id::text)::uuid, pid, tt.title, tt.description,
           tt.is_milestone,
           case when tt.is_milestone then null else (ids ->> tt.milestone_id::text)::uuid end,
           public.add_working_days(p_start, tt.start_day),
           public.add_working_days(p_start, tt.due_day),
           tt.estimate_hours, tt.sort_order
      from public.template_tasks tt
     where tt.template_id = p_template and tt.is_milestone = (pass = 1);
  end loop;

  -- Default assignees who are no longer active are left off.
  insert into public.task_assignees (task_id, profile_id)
  select (ids ->> tt.id::text)::uuid, a.profile_id
    from public.template_tasks tt
    join public.template_task_assignees a on a.template_task_id = tt.id
    join public.profiles p on p.id = a.profile_id and p.active
   where tt.template_id = p_template;

  return pid;
end;
$$;

create or replace function public.create_template_from_project(p_project uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  tid uuid;
  base date;
  ids jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create templates.';
  end if;

  select coalesce(p.start_date,
                  (select min(coalesce(t.start_date, t.due_date)) from public.tasks t where t.project_id = p.id),
                  current_date)
    into base
    from public.projects p
   where p.id = p_project;
  if base is null then
    raise exception 'That project no longer exists.';
  end if;

  insert into public.project_templates (name, description)
  select p_name, p.description from public.projects p where p.id = p_project
  returning id into tid;

  select coalesce(jsonb_object_agg(id, gen_random_uuid()), '{}') into ids
    from public.tasks where project_id = p_project and parent_task_id is null;

  -- Milestones first, so tasks can point at them.
  for pass in 1..2 loop
    insert into public.template_tasks (id, template_id, title, description, start_day, due_day, estimate_hours,
                                       is_milestone, milestone_id, sort_order)
    select (ids ->> t.id::text)::uuid, tid, t.title, t.description, s.start_day,
           greatest(s.start_day, public.working_days_between(base, coalesce(t.due_date, t.start_date, base))),
           t.estimate_hours, t.is_milestone,
           case when t.is_milestone then null else (ids ->> t.milestone_id::text)::uuid end,
           t.sort_order
      from public.tasks t
     cross join lateral (
       select public.working_days_between(base, coalesce(t.start_date, t.due_date, base)) as start_day
     ) s
     where t.project_id = p_project and t.parent_task_id is null and t.is_milestone = (pass = 1);
  end loop;

  insert into public.template_task_assignees (template_task_id, profile_id)
  select (ids ->> t.id::text)::uuid, a.profile_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
   where t.project_id = p_project and t.parent_task_id is null;

  return tid;
end;
$$;

drop index if exists public.tasks_assignee_idx;
alter table public.tasks drop column assignee_id;
alter table public.template_tasks drop column assignee_id;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.task_assignees;
  end if;
end;
$$;
