-- Job roles: people hold one or more roles (one main), and tasks can have open role slots that
-- someone with that role takes ("Work on it"), replacing the slot with themselves.

create table public.job_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.job_roles (name, sort_order) values
  ('Designer', 1), ('Copywriter', 2), ('Web Ops', 3), ('Client Partnership', 4), ('Digital Strategist', 5);

create table public.profile_job_roles (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.job_roles (id) on delete cascade,
  is_main     boolean not null default false,
  unique (profile_id, role_id)
);

create unique index profile_job_roles_one_main on public.profile_job_roles (profile_id) where is_main;

-- Open slots: the same role can be added more than once when several people are needed.
create table public.task_role_slots (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  role_id     uuid not null references public.job_roles (id) on delete restrict,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index task_role_slots_task_idx on public.task_role_slots (task_id);
create index task_role_slots_role_idx on public.task_role_slots (role_id);

create table public.template_task_role_slots (
  id                uuid primary key default gen_random_uuid(),
  template_task_id  uuid not null references public.template_tasks (id) on delete cascade,
  role_id           uuid not null references public.job_roles (id) on delete restrict
);

-- Which role someone is doing the work as (set when they take or are given a role slot).
alter table public.task_assignees
  add column as_role_id uuid references public.job_roles (id) on delete set null;

-- Every staff member's job role was free text and is replaced by the tables above.
alter table public.profiles drop column job_role;

create trigger audit_job_roles after insert or update or delete on public.job_roles
  for each row execute function public.write_audit();
create trigger audit_profile_job_roles after insert or update or delete on public.profile_job_roles
  for each row execute function public.write_audit();
create trigger audit_task_role_slots after insert or update or delete on public.task_role_slots
  for each row execute function public.write_audit();
create trigger audit_template_task_role_slots after insert or update or delete on public.template_task_role_slots
  for each row execute function public.write_audit();

alter table public.job_roles enable row level security;
create policy "staff read job roles" on public.job_roles
  for select to authenticated using (public.is_active_user());
create policy "admin manage job roles" on public.job_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.profile_job_roles enable row level security;
create policy "staff read people's roles" on public.profile_job_roles
  for select to authenticated using (public.is_active_user());
create policy "admin manage people's roles" on public.profile_job_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.task_role_slots enable row level security;
create policy "staff read role slots" on public.task_role_slots
  for select to authenticated using (public.is_active_user());
create policy "admin add role slots" on public.task_role_slots
  for insert to authenticated with check (public.is_admin());
create policy "admin remove role slots" on public.task_role_slots
  for delete to authenticated using (public.is_admin());

create policy "admin update task assignees" on public.task_assignees
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.template_task_role_slots enable row level security;
create policy "admin manage template role slots" on public.template_task_role_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Take open work for one of your roles: you go on the task as that role and the slot is removed.
create function public.take_role_task(p_slot uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.task_role_slots;
  task_status public.task_status;
begin
  if not public.is_active_user() then
    raise exception 'Sign in to take work.';
  end if;
  select * into s from public.task_role_slots where id = p_slot for update;
  if not found then
    raise exception 'Someone has already taken that work.';
  end if;
  if not exists (select 1 from public.profile_job_roles where profile_id = me and role_id = s.role_id) then
    raise exception 'You can only take work for roles you hold.';
  end if;
  select status into task_status from public.tasks where id = s.task_id;
  if task_status = 'done' then
    raise exception 'That task is already done.';
  end if;
  if exists (select 1 from public.task_assignees where task_id = s.task_id and profile_id = me) then
    raise exception 'You''re already on that task.';
  end if;
  insert into public.task_assignees (task_id, profile_id, created_by, as_role_id) values (s.task_id, me, me, s.role_id);
  delete from public.task_role_slots where id = p_slot;
  return s.task_id;
end;
$$;

-- An admin fills an open role slot with a person (who is notified as usual).
create function public.assign_role_slot(p_slot uuid, p_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.task_role_slots;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign work.';
  end if;
  select * into s from public.task_role_slots where id = p_slot for update;
  if not found then
    raise exception 'That role has already been filled.';
  end if;
  if exists (select 1 from public.task_assignees where task_id = s.task_id and profile_id = p_profile) then
    update public.task_assignees set as_role_id = s.role_id where task_id = s.task_id and profile_id = p_profile;
  else
    insert into public.task_assignees (task_id, profile_id, as_role_id) values (s.task_id, p_profile, s.role_id);
  end if;
  delete from public.task_role_slots where id = p_slot;
  return s.task_id;
end;
$$;

-- Templates now also carry open role slots, both ways.
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

  insert into public.task_role_slots (task_id, role_id)
  select (ids ->> tt.id::text)::uuid, r.role_id
    from public.template_tasks tt
    join public.template_task_role_slots r on r.template_task_id = tt.id
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

  insert into public.template_task_role_slots (template_task_id, role_id)
  select (ids ->> t.id::text)::uuid, r.role_id
    from public.tasks t
    join public.task_role_slots r on r.task_id = t.id
   where t.project_id = p_project and t.parent_task_id is null;

  return tid;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.task_role_slots;
  end if;
end;
$$;
