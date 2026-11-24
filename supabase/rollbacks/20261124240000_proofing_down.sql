-- Undoes 20261124240000_proofing. First turn proofing off (unset PROOFING in Vercel) and empty the
-- "proofs" bucket in Supabase (Storage, select the bucket, select all, Delete). Then run this as one script.
begin;

drop policy if exists "proof files read" on storage.objects;
drop policy if exists "proof files upload" on storage.objects;
drop policy if exists "proof files delete" on storage.objects;
delete from storage.buckets where id = 'proofs';

drop table if exists public.proof_comments;
drop table if exists public.proof_versions;
drop table if exists public.proofs;

drop function if exists public.guard_proof_rename();
drop function if exists public.resolve_proof_comment(uuid, boolean);
drop function if exists public.decide_proof(uuid, public.proof_status);
drop function if exists public.number_proof_pin();
drop function if exists public.reopen_proof_on_version();
drop function if exists public.number_proof_version();
drop function if exists public.guard_proof_project();
drop function if exists public.can_decide_proof(uuid);
drop function if exists public.can_upload_proof(uuid);
drop type if exists public.proof_status;

delete from supabase_migrations.schema_migrations where version = '20261124240000';

commit;
