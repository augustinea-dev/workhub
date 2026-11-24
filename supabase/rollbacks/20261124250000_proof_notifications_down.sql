-- Undoes 20261124250000_proof_notifications. Run before 20261124240000_proofing_down.sql if removing proofing entirely.
begin;

drop trigger if exists proofs_notify_decision on public.proofs;
drop trigger if exists proof_comments_notify on public.proof_comments;
drop trigger if exists proof_versions_notify on public.proof_versions;
drop function if exists public.notify_proof_decision();
drop function if exists public.notify_proof_comment();
drop function if exists public.notify_proof_version();
drop function if exists public.notify_proof(uuid, text, text, uuid);
delete from public.notification_events where kind in ('proof_version', 'proof_comment', 'proof_decision');
alter table public.notification_events drop column if exists proof_id;

delete from supabase_migrations.schema_migrations where version = '20261124250000';

commit;
