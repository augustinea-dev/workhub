-- Proofing test: notices for new versions, comments and decisions, linked to the proof.

alter table public.notification_events
  add column proof_id uuid references public.proofs (id) on delete cascade;

create function public.notify_proof(p_proof uuid, p_kind text, p_summary text, p_extra uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, proof_id, summary)
  select distinct r.id, auth.uid(), p_kind, t.id, t.project_id, pf.id, p_summary
    from public.proofs pf
    join public.tasks t on t.id = pf.task_id
    join public.projects pr on pr.id = t.project_id
    cross join lateral (
      select a.profile_id as id from public.task_assignees a where a.task_id = t.id
      union select pr.owner_id
      union select pf.created_by
      union select p_extra
    ) r
    join public.profiles p on p.id = r.id and p.active
   where pf.id = p_proof
     and r.id is distinct from auth.uid();
end;
$$;

create function public.notify_proof_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number > 1 then
    perform public.notify_proof(new.proof_id, 'proof_version',
      'New version v' || new.number || ' of ' || (select title from public.proofs where id = new.proof_id), null);
  end if;
  return null;
end;
$$;

create trigger proof_versions_notify
  after insert on public.proof_versions
  for each row execute function public.notify_proof_version();

create function public.notify_proof_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
  who text;
begin
  select v.proof_id into pid from public.proof_versions v where v.id = new.version_id;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = new.author_id;
  perform public.notify_proof(pid, 'proof_comment',
    who || case when new.parent_id is null then ' commented on ' else ' replied on ' end
        || (select title from public.proofs where id = pid) || ': ' || left(new.body, 80),
    case when new.parent_id is null then null else (select author_id from public.proof_comments where id = new.parent_id) end);
  return null;
end;
$$;

create trigger proof_comments_notify
  after insert on public.proof_comments
  for each row execute function public.notify_proof_comment();

create function public.notify_proof_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decided_at is not null and new.decided_at is distinct from old.decided_at then
    perform public.notify_proof(new.id, 'proof_decision',
      case new.status when 'approved' then 'Approved: ' else 'Changes requested: ' end || new.title, null);
  end if;
  return null;
end;
$$;

create trigger proofs_notify_decision
  after update of status, decided_at on public.proofs
  for each row execute function public.notify_proof_decision();
