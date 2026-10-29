-- Workhub starter schema: Workfront replacement, Phase 1 foundation.
-- Run once in a new Supabase project (SQL editor or `supabase db push`).
-- Two roles to start: admin and member. Everyone is staff; no client access.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'complete', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'done');
create type public.hour_type as enum ('billable', 'non_billable', 'admin', 'meeting', 'pto');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        public.user_role not null default 'member',
  job_role    text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- A profile is created automatically when a user is invited / signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'admin'
  );
$$;

-- Members may edit their own name/job role, but only admins change role or active.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active
      or new.email is distinct from old.email)
     and auth.uid() is not null      -- SQL editor / service role (no user) may bootstrap the first admin
     and not public.is_admin() then
    raise exception 'Only an admin can change role, status or email';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Work
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  company_id     uuid references public.companies (id) on delete restrict,
  owner_id       uuid references public.profiles (id) on delete set null,
  status         public.project_status not null default 'active',
  start_date     date,
  due_date       date,
  description    text,
  custom_fields  jsonb not null default '{}'::jsonb,
  version        integer not null default 1,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  parent_task_id  uuid references public.tasks (id) on delete cascade,
  title           text not null,
  description     text,
  assignee_id     uuid references public.profiles (id) on delete set null,
  status          public.task_status not null default 'todo',
  is_milestone    boolean not null default false,
  start_date      date,
  due_date        date,
  estimate_hours  numeric(6, 2),
  sort_order      double precision not null default extract(epoch from now()),
  custom_fields   jsonb not null default '{}'::jsonb,
  version         integer not null default 1,
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id, sort_order);
create index tasks_assignee_idx on public.tasks (assignee_id, status);

-- Comments are append-only (no updates) so two people commenting never collide.
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index comments_task_idx on public.comments (task_id, created_at);

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks (id) on delete set null,
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  work_date   date not null default current_date,
  hours       numeric(5, 2) not null check (hours > 0 and hours <= 24),
  hour_type   public.hour_type not null default 'billable',
  note        text,
  created_at  timestamptz not null default now()
);

create index time_entries_user_date_idx on public.time_entries (user_id, work_date);
create index time_entries_project_idx on public.time_entries (project_id);

-- Keep project_id in step with the task, so hours always roll up correctly.
create function public.time_entry_set_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_id is not null then
    select t.project_id into new.project_id from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end;
$$;

create trigger time_entries_set_project
  before insert or update on public.time_entries
  for each row execute function public.time_entry_set_project();

-- updated_at, version bump, completed_at
create function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  if tg_table_name = 'tasks' then
    if new.status = 'done' and old.status <> 'done' then
      new.completed_at := now();
    elsif new.status <> 'done' then
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_row();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- Notifications (in-app inbox now; the same rows feed email/Teams later)
-- ---------------------------------------------------------------------------
create table public.notification_events (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  kind          text not null,  -- 'task_assigned' | 'task_comment'
  task_id       uuid references public.tasks (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  summary       text not null,
  read_at       timestamptz,
  emailed_at    timestamptz,    -- set by the future email worker
  created_at    timestamptz not null default now()
);

create index notification_events_recipient_idx
  on public.notification_events (recipient_id, read_at, created_at desc);

create function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from auth.uid() then
    insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
    values (new.assignee_id, auth.uid(), 'task_assigned', new.id, new.project_id,
            'You were assigned: ' || new.title);
  end if;
  return new;
end;
$$;

create trigger tasks_notify_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

create function public.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select tk.id, tk.title, tk.project_id, tk.assignee_id, p.owner_id
    into t
    from public.tasks tk join public.projects p on p.id = tk.project_id
   where tk.id = new.task_id;

  -- Tell the assignee, the project owner, and anyone who already commented — never the author.
  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
  select distinct r.uid, new.author_id, 'task_comment', t.id, t.project_id,
         'New comment on: ' || t.title
    from (
      select t.assignee_id as uid
      union select t.owner_id
      union select c.author_id from public.comments c where c.task_id = new.task_id
    ) r
   where r.uid is not null and r.uid <> new.author_id;
  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_task_comment();

-- ---------------------------------------------------------------------------
-- Audit trail: who changed what, and when
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  changed_by  uuid default auth.uid(),
  old_row     jsonb,
  new_row     jsonb,
  changed_at  timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);

create function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_row, new_row)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.write_audit();
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.write_audit();
create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function public.write_audit();
create trigger audit_time_entries after insert or update or delete on public.time_entries
  for each row execute function public.write_audit();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- Every active staff member can see all work; admins can delete and manage people.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.projects            enable row level security;
alter table public.tasks               enable row level security;
alter table public.comments            enable row level security;
alter table public.time_entries        enable row level security;
alter table public.notification_events enable row level security;
alter table public.audit_log           enable row level security;

-- profiles
create policy "staff read profiles" on public.profiles
  for select to authenticated using (public.is_active_user());
create policy "edit own profile or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- companies
create policy "staff read companies" on public.companies
  for select to authenticated using (public.is_active_user());
create policy "staff add companies" on public.companies
  for insert to authenticated with check (public.is_active_user());
create policy "staff edit companies" on public.companies
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "admin delete companies" on public.companies
  for delete to authenticated using (public.is_admin());

-- projects
create policy "staff read projects" on public.projects
  for select to authenticated using (public.is_active_user());
create policy "staff add projects" on public.projects
  for insert to authenticated with check (public.is_active_user());
create policy "staff edit projects" on public.projects
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "admin delete projects" on public.projects
  for delete to authenticated using (public.is_admin());

-- tasks
create policy "staff read tasks" on public.tasks
  for select to authenticated using (public.is_active_user());
create policy "staff add tasks" on public.tasks
  for insert to authenticated with check (public.is_active_user());
create policy "staff edit tasks" on public.tasks
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "creator or admin delete tasks" on public.tasks
  for delete to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));

-- comments (no update policy: append-only)
create policy "staff read comments" on public.comments
  for select to authenticated using (public.is_active_user());
create policy "staff add own comments" on public.comments
  for insert to authenticated
  with check (public.is_active_user() and author_id = (select auth.uid()));
create policy "author or admin delete comments" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- time entries: everyone sees totals; you edit your own, admins edit anyone's
create policy "staff read time" on public.time_entries
  for select to authenticated using (public.is_active_user());
create policy "log own time" on public.time_entries
  for insert to authenticated
  with check (public.is_active_user() and (user_id = (select auth.uid()) or public.is_admin()));
create policy "edit own time" on public.time_entries
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy "delete own time" on public.time_entries
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- notifications: only your own inbox
create policy "read own notifications" on public.notification_events
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy "mark own notifications read" on public.notification_events
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- audit log: admins only
create policy "admin read audit" on public.audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Live updates (Supabase Realtime) for boards and comment threads
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.comments, public.notification_events;
  end if;
end;
$$;
