-- Supabase refuses UPDATE without WHERE, so taking the next reference number needs one (there is one settings row).

create or replace function public.build_project_name()
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
     where id
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
