-- Project templates: reusable task lists with dates in working days from the project start.

-- Working days are Monday to Friday. Holidays can be added here later.
create function public.add_working_days(d date, n integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  r date := d;
  i integer := 0;
begin
  while extract(isodow from r) > 5 loop
    r := r + 1;
  end loop;
  while i < n loop
    r := r + 1;
    if extract(isodow from r) <= 5 then
      i := i + 1;
    end if;
  end loop;
  return r;
end;
$$;

-- Working days from a to b (0 if b is on or before a).
create function public.working_days_between(a date, b date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
    from generate_series(a + 1, b, interval '1 day') g
   where extract(isodow from g) <= 5;
$$;

create table public.project_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  description  text,
  version      integer not null default 1,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.template_tasks (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.project_templates (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  description     text,
  start_day       integer not null default 0 check (start_day >= 0),
  due_day         integer not null default 0,
  estimate_hours  numeric(6, 2) check (estimate_hours >= 0),
  is_milestone    boolean not null default false,
  milestone_id    uuid references public.template_tasks (id) on delete set null,
  assignee_id     uuid references public.profiles (id) on delete set null,
  sort_order      double precision not null default extract(epoch from now()),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_day >= start_day)
);

create index template_tasks_template_idx on public.template_tasks (template_id, sort_order);

create trigger project_templates_touch before update on public.project_templates
  for each row execute function public.touch_row();
create trigger template_tasks_touch before update on public.template_tasks
  for each row execute function public.touch_row();

create trigger audit_project_templates after insert or update or delete on public.project_templates
  for each row execute function public.write_audit();
create trigger audit_template_tasks after insert or update or delete on public.template_tasks
  for each row execute function public.write_audit();

-- Same milestone rules as tasks: same template, no milestone inside a milestone.
create function public.check_template_milestone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.milestone_id is not null then
    if new.is_milestone then
      raise exception 'A milestone can''t belong to another milestone.';
    end if;
    if not exists (
      select 1 from public.template_tasks m
      where m.id = new.milestone_id and m.is_milestone and m.template_id = new.template_id
    ) then
      raise exception 'Pick a milestone from the same template.';
    end if;
  end if;
  return new;
end;
$$;

create trigger template_tasks_milestone_check
  before insert or update of milestone_id, is_milestone, template_id on public.template_tasks
  for each row execute function public.check_template_milestone();

create function public.release_template_milestone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.template_tasks set milestone_id = null where milestone_id = new.id;
  return null;
end;
$$;

create trigger template_tasks_release_milestone
  after update of is_milestone on public.template_tasks
  for each row
  when (old.is_milestone and not new.is_milestone)
  execute function public.release_template_milestone();

-- Templates are admin-only, reading included.
alter table public.project_templates enable row level security;
alter table public.template_tasks    enable row level security;

create policy "admin manage templates" on public.project_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage template tasks" on public.template_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Create a project and all its tasks in one transaction. Runs as the caller, so RLS applies too.
create function public.create_project_from_template(
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
    insert into public.tasks (id, project_id, title, description, assignee_id, is_milestone, milestone_id,
                              start_date, due_date, estimate_hours, sort_order)
    select (ids ->> tt.id::text)::uuid, pid, tt.title, tt.description,
           (select p.id from public.profiles p where p.id = tt.assignee_id and p.active),
           tt.is_milestone,
           case when tt.is_milestone then null else (ids ->> tt.milestone_id::text)::uuid end,
           public.add_working_days(p_start, tt.start_day),
           public.add_working_days(p_start, tt.due_day),
           tt.estimate_hours, tt.sort_order
      from public.template_tasks tt
     where tt.template_id = p_template and tt.is_milestone = (pass = 1);
  end loop;

  return pid;
end;
$$;

-- Copy a project's top-level tasks into a new template, measuring days from the project start.
create function public.create_template_from_project(p_project uuid, p_name text)
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
                                       is_milestone, milestone_id, assignee_id, sort_order)
    select (ids ->> t.id::text)::uuid, tid, t.title, t.description, s.start_day,
           greatest(s.start_day, public.working_days_between(base, coalesce(t.due_date, t.start_date, base))),
           t.estimate_hours, t.is_milestone,
           case when t.is_milestone then null else (ids ->> t.milestone_id::text)::uuid end,
           t.assignee_id, t.sort_order
      from public.tasks t
     cross join lateral (
       select public.working_days_between(base, coalesce(t.start_date, t.due_date, base)) as start_day
     ) s
     where t.project_id = p_project and t.parent_task_id is null and t.is_milestone = (pass = 1);
  end loop;

  return tid;
end;
$$;
