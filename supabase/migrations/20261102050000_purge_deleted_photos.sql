-- Photos deleted in the app are only marked (metadata.deletedAt) so 최근 삭제 취소 can restore them.
-- Two days after that mark the purge-deleted-photos Edge Function removes the row and both files for good.
-- Only service_role (the Edge Function) can call these; the app's public key still has no hard delete.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- dry_run lists what would go without touching anything.
create function public.purge_deleted_site_photos(dry_run boolean default false)
 returns table(id text, original_path text, thumbnail_path text)
 language plpgsql security definer set search_path='' as $$
declare cutoff bigint := (extract(epoch from now() - interval '2 days') * 1000)::bigint;
begin
 if dry_run then
  return query select p.id,p.original_path,p.thumbnail_path from public.site_photos p
   where jsonb_typeof(p.metadata->'deletedAt')='number' and (p.metadata->>'deletedAt')::bigint < cutoff;
 else
  return query delete from public.site_photos p
   where jsonb_typeof(p.metadata->'deletedAt')='number' and (p.metadata->>'deletedAt')::bigint < cutoff
   returning p.id,p.original_path,p.thumbnail_path;
 end if;
end $$;
revoke all on function public.purge_deleted_site_photos(boolean) from public,anon,authenticated;
grant execute on function public.purge_deleted_site_photos(boolean) to service_role;

-- The scheduler proves itself with a random secret that only lives in Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'photo_purge_secret','pg_cron -> purge-deleted-photos');
create function public.photo_purge_secret_matches(candidate text) returns boolean
 language sql security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='photo_purge_secret' and decrypted_secret=candidate)
$$;
revoke all on function public.photo_purge_secret_matches(text) from public,anon,authenticated;
grant execute on function public.photo_purge_secret_matches(text) to service_role;
commit;
