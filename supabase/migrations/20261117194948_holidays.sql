create table public.holidays (
  id         uuid primary key default gen_random_uuid(),
  day        date not null unique,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;

create policy "staff read holidays" on public.holidays
  for select to authenticated using (public.is_active_user());
create policy "admin add holidays" on public.holidays
  for insert to authenticated with check (public.is_admin());
create policy "admin edit holidays" on public.holidays
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete holidays" on public.holidays
  for delete to authenticated using (public.is_admin());

create trigger audit_holidays after insert or update or delete on public.holidays
  for each row execute function public.write_audit();

create function public.is_working_day(d date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from d) <= 5 and not exists (select 1 from public.holidays h where h.day = d);
$$;

create or replace function public.add_working_days(d date, n integer)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  r date := d;
  i integer := 0;
begin
  while not public.is_working_day(r) loop
    r := r + 1;
  end loop;
  while i < n loop
    r := r + 1;
    if public.is_working_day(r) then
      i := i + 1;
    end if;
  end loop;
  return r;
end;
$$;

create or replace function public.working_days_between(a date, b date)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from generate_series(a + 1, b, interval '1 day') g
   where public.is_working_day(g::date);
$$;
