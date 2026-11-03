-- @mentions: people tagged in a comment get a 'mention' notification instead of 'task_comment'.
alter table public.comments
  add column mentions uuid[] not null default '{}';

-- Keep only active people other than the author, once each.
create function public.clean_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.mentions := coalesce(
    (select array_agg(p.id order by p.id)
       from public.profiles p
      where p.id = any (new.mentions) and p.active and p.id <> new.author_id),
    '{}'
  );
  return new;
end;
$$;

create trigger comments_clean_mentions
  before insert on public.comments
  for each row execute function public.clean_comment_mentions();

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
  select tk.id, tk.title, tk.project_id, tk.assignee_id, p.owner_id
    into t
    from public.tasks tk join public.projects p on p.id = tk.project_id
   where tk.id = new.task_id;

  select full_name into actor from public.profiles where id = new.author_id;

  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
  select m, new.author_id, 'mention', t.id, t.project_id,
         coalesce(actor, 'Someone') || ' mentioned you on: ' || t.title
    from unnest(new.mentions) m;

  -- Tell the assignee, the project owner, and anyone who already commented. Never the author,
  -- and not people who were just mentioned (they already got a mention).
  insert into public.notification_events (recipient_id, actor_id, kind, task_id, project_id, summary)
  select distinct r.uid, new.author_id, 'task_comment', t.id, t.project_id,
         'New comment on: ' || t.title
    from (
      select t.assignee_id as uid
      union select t.owner_id
      union select c.author_id from public.comments c where c.task_id = new.task_id
    ) r
   where r.uid is not null and r.uid <> new.author_id and r.uid <> all (new.mentions);
  return new;
end;
$$;
