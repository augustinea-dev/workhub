-- Proofing test: proofs on tasks, numbered versions (PDF or image files in a private bucket),
-- pin comments on a version, and a decision (In review, Changes requested, Approved).
-- Self-contained so it can be removed with supabase/rollbacks/20261124240000_proofing_down.sql.

create type public.proof_status as enum ('in_review', 'changes_requested', 'approved');

create table public.proofs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  status      public.proof_status not null default 'in_review',
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index proofs_task_idx on public.proofs (task_id);

create table public.proof_versions (
  id            uuid primary key default gen_random_uuid(),
  proof_id      uuid not null references public.proofs (id) on delete cascade,
  number        integer not null,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes    bigint not null check (size_bytes > 0),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (proof_id, number)
);

create table public.proof_comments (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.proof_versions (id) on delete cascade,
  parent_id    uuid references public.proof_comments (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body         text not null check (length(trim(body)) > 0),
  page         integer check (page >= 1),
  x            numeric(6, 5) check (x between 0 and 1),
  y            numeric(6, 5) check (y between 0 and 1),
  pin          integer,
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((parent_id is null) = (page is not null and x is not null and y is not null))
);

create index proof_comments_version_idx on public.proof_comments (version_id);

create function public.can_upload_proof(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or exists (select 1 from public.task_assignees where task_id = p_task and profile_id = (select auth.uid()));
$$;

create function public.can_decide_proof(p_proof uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or exists (
        select 1 from public.proofs pf
          join public.tasks t on t.id = pf.task_id
          join public.projects p on p.id = t.project_id
         where pf.id = p_proof and p.owner_id = (select auth.uid())
      );
$$;

create function public.guard_proof_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st public.project_status;
  tid uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'proofs' then
    tid := new.task_id;
  else
    select task_id into tid from public.proofs where id = new.proof_id;
  end if;
  select p.status into st
    from public.tasks t join public.projects p on p.id = t.project_id
   where t.id = tid;
  if st in ('complete', 'cancelled') then
    raise exception 'This project is %, so its proofs can''t change. Set it back to Active first.', initcap(st::text);
  end if;
  return new;
end;
$$;

create trigger proofs_guard_project
  before insert on public.proofs
  for each row execute function public.guard_proof_project();

create trigger proof_versions_guard_project
  before insert on public.proof_versions
  for each row execute function public.guard_proof_project();

create function public.number_proof_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.proofs where id = new.proof_id for update;
  select coalesce(max(number), 0) + 1 into new.number from public.proof_versions where proof_id = new.proof_id;
  return new;
end;
$$;

create trigger proof_versions_number
  before insert on public.proof_versions
  for each row execute function public.number_proof_version();

create function public.reopen_proof_on_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('workhub.proof_status_change', 'on', true);
  update public.proofs
     set status = 'in_review', decided_by = null, decided_at = null, updated_at = now()
   where id = new.proof_id;
  perform set_config('workhub.proof_status_change', '', true);
  return null;
end;
$$;

create trigger proof_versions_reopen
  after insert on public.proof_versions
  for each row execute function public.reopen_proof_on_version();

create function public.number_proof_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  new.resolved_at := null;
  new.resolved_by := null;
  if new.parent_id is null then
    perform 1 from public.proof_versions where id = new.version_id for update;
    select coalesce(max(pin), 0) + 1 into new.pin from public.proof_comments where version_id = new.version_id and parent_id is null;
  else
    new.pin := null;
    if not exists (
      select 1 from public.proof_comments c
       where c.id = new.parent_id and c.version_id = new.version_id and c.parent_id is null
    ) then
      raise exception 'Replies go on a pin on the same version.';
    end if;
  end if;
  return new;
end;
$$;

create trigger proof_comments_number
  before insert on public.proof_comments
  for each row execute function public.number_proof_pin();

create function public.decide_proof(p_proof uuid, p_status public.proof_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.project_status;
begin
  if not public.can_decide_proof(p_proof) then
    raise exception 'Only an Admin or the project owner can decide on a proof.';
  end if;
  select p.status into st
    from public.proofs pf join public.tasks t on t.id = pf.task_id join public.projects p on p.id = t.project_id
   where pf.id = p_proof;
  if st in ('complete', 'cancelled') then
    raise exception 'This project is %, so its proofs can''t change. Set it back to Active first.', initcap(st::text);
  end if;
  perform set_config('workhub.proof_status_change', 'on', true);
  update public.proofs
     set status = p_status,
         decided_by = case when p_status = 'in_review' then null else auth.uid() end,
         decided_at = case when p_status = 'in_review' then null else now() end,
         updated_at = now()
   where id = p_proof;
  perform set_config('workhub.proof_status_change', '', true);
end;
$$;

create function public.resolve_proof_comment(p_comment uuid, p_resolved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Sign in to resolve comments.';
  end if;
  update public.proof_comments
     set resolved_at = case when p_resolved then now() end,
         resolved_by = case when p_resolved then auth.uid() end
   where id = p_comment and parent_id is null;
end;
$$;

alter table public.proofs enable row level security;
alter table public.proof_versions enable row level security;
alter table public.proof_comments enable row level security;

create policy "proofs read" on public.proofs for select to authenticated using (public.is_active_user());
create policy "proofs add" on public.proofs for insert to authenticated
  with check (public.can_upload_proof(task_id) and created_by = (select auth.uid()));
create policy "proofs rename" on public.proofs for update to authenticated
  using (public.can_upload_proof(task_id)) with check (public.can_upload_proof(task_id));
create policy "proofs delete" on public.proofs for delete to authenticated using (public.is_admin());

create policy "proof versions read" on public.proof_versions for select to authenticated using (public.is_active_user());
create policy "proof versions add" on public.proof_versions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_upload_proof((select task_id from public.proofs where id = proof_id))
  );
create policy "proof versions delete" on public.proof_versions for delete to authenticated using (public.is_admin());

create policy "proof comments read" on public.proof_comments for select to authenticated using (public.is_active_user());
create policy "proof comments add" on public.proof_comments for insert to authenticated
  with check (public.is_active_user() and author_id = (select auth.uid()));
create policy "proof comments delete" on public.proof_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create or replace function public.guard_proof_rename()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('workhub.proof_status_change', true), '') <> 'on'
     and (to_jsonb(new) - array['title', 'updated_at']) is distinct from (to_jsonb(old) - array['title', 'updated_at']) then
    raise exception 'Use the decision buttons to change a proof''s status.';
  end if;
  return new;
end;
$$;

create trigger proofs_guard_rename
  before update on public.proofs
  for each row execute function public.guard_proof_rename();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

create policy "proof files read" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.is_active_user());
create policy "proof files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and public.is_active_user());
create policy "proof files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_admin());
