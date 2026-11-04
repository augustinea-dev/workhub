-- Project naming: reference number, billing year, name on project, title and project type build
-- the project name, e.g. 973623_2026_The Lanes_Website_TA.

-- Clients are the legal billing entity. They choose the billing year and what name goes on projects.
alter table public.companies
  add column fiscal_year_start_month smallint check (fiscal_year_start_month between 2 and 12),
  add column project_label text;

comment on column public.companies.fiscal_year_start_month is 'Null means calendar years; otherwise the month the fiscal year starts (named for the year it ends).';
comment on column public.companies.project_label is 'Name used in project names when it differs from the client name (a brand).';

create table public.project_types (
  code         text primary key check (code ~ '^[A-Za-z0-9]+$'),
  label        text not null check (length(trim(label)) > 0),
  description  text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.project_types (code, label, description, sort_order) values
  ('TA', 'TA', 'Project type with proof flow A', 1),
  ('TB', 'TB', 'Project type with proof flow B', 2),
  ('HC', 'Hard costs', 'Vendor, media and other hard costs', 3),
  ('Monthly', 'Monthly retainer', 'Ongoing monthly work', 4),
  ('Initial', 'Initial setup', 'One-time setup fee', 5);

alter table public.project_types enable row level security;
create policy "staff read project types" on public.project_types
  for select to authenticated using (public.is_active_user());
create policy "admin manage project types" on public.project_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A single settings row. next_reference_number is what the next new project gets.
create table public.workhub_settings (
  id                     boolean primary key default true check (id),
  next_reference_number  bigint not null default 2000000 check (next_reference_number > 0),
  updated_at             timestamptz not null default now()
);
insert into public.workhub_settings default values;

alter table public.workhub_settings enable row level security;
create policy "staff read settings" on public.workhub_settings
  for select to authenticated using (public.is_active_user());
create policy "admin edit settings" on public.workhub_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.projects
  add column reference_number bigint unique,
  add column billing_year text,
  add column name_on_project text,
  add column title text,
  add column project_type text references public.project_types (code) on update cascade,
  add column cost_code text,
  add column name_locked boolean not null default false;

comment on column public.projects.billing_year is 'Override; null means worked out from the client''s billing year and the start date.';
comment on column public.projects.name_on_project is 'Override; null means the client''s project label, or the client name.';
comment on column public.projects.name_locked is 'Keep the name exactly as typed (projects imported from Workfront).';

create function public.billing_year_label(p_company uuid, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when c.fiscal_year_start_month is null then extract(year from p_date)::integer::text
    else 'FY' || right((extract(year from p_date)::integer
                        + case when extract(month from p_date) >= c.fiscal_year_start_month then 1 else 0 end)::text, 2)
  end
  from (select (select fiscal_year_start_month from public.companies where id = p_company) as fiscal_year_start_month) c;
$$;

-- The next number can be moved, but never to one that's already used.
create function public.guard_next_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  highest bigint;
begin
  select max(reference_number) into highest from public.projects;
  if highest is not null and new.next_reference_number <= highest then
    raise exception 'The next reference number must be above %, the highest one in use.', highest;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger workhub_settings_guard before update on public.workhub_settings
  for each row execute function public.guard_next_reference();

-- Give new projects the next number and build the name from its parts.
create function public.build_project_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text;
begin
  if new.reference_number is null and (tg_op = 'INSERT' or coalesce(trim(new.title), '') <> '') then
    update public.workhub_settings
       set next_reference_number = next_reference_number + 1
     returning next_reference_number - 1 into new.reference_number;
  end if;
  -- Keep the counter ahead of numbers typed or imported by hand.
  if new.reference_number is not null then
    update public.workhub_settings
       set next_reference_number = new.reference_number + 1
     where next_reference_number <= new.reference_number;
  end if;

  if not new.name_locked and coalesce(trim(new.title), '') <> '' then
    select coalesce(nullif(trim(new.name_on_project), ''), nullif(trim(c.project_label), ''), c.name)
      into label
      from public.companies c
     where c.id = new.company_id;
    new.name := concat_ws('_',
      new.reference_number::text,
      coalesce(nullif(trim(new.billing_year), ''),
               public.billing_year_label(new.company_id, coalesce(new.start_date, public.pacific_today()))),
      label,
      trim(new.title),
      new.project_type);
  end if;
  return new;
end;
$$;

create trigger projects_build_name
  before insert or update on public.projects
  for each row execute function public.build_project_name();

-- Renaming a client, or changing its label or billing year, refreshes its projects' names.
create function public.refresh_client_project_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set updated_at = now()
   where company_id = new.id and not name_locked and coalesce(trim(title), '') <> '';
  return null;
end;
$$;

create trigger companies_refresh_project_names
  after update of name, project_label, fiscal_year_start_month on public.companies
  for each row execute function public.refresh_client_project_names();
