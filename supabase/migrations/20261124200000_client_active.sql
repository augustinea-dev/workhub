alter table public.companies
  add column active boolean not null default true;

comment on column public.companies.active is 'Inactive clients keep their projects but are hidden from new-project pickers.';
