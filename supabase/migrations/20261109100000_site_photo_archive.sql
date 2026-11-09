-- 알폼핀 원본 보관 (2026-11-09): the office PC (tools/photo-archive) copies each original to D:\이도형\알폼핀 체결 사진,
-- then the archive-site-photo Edge Function points the row at a 2048px copy and removes the original file.
-- All columns are additive and nullable, so app builds that do not know them keep working.
--   archived_at               when the original moved to the PC (null = original still on the server)
--   archive_name              full path of the original on the archive PC, shown in the photo viewer
--   reduced_hash              SHA-256 of the 2048px copy now at original_path (original_hash stays the original's)
--   original_removal_pending  original file still to remove after a failed removal; retried on the next run
-- Rollback: drop the function and the four columns (rows already archived then keep pointing at their 2048px copy).
begin;
alter table public.site_photos
 add column archived_at timestamptz,
 add column archive_name text,
 add column reduced_hash text,
 add column original_removal_pending text;

-- The archive PC proves itself with a secret that exists only in that PC's config; the database keeps its SHA-256 only.
create function public.photo_archive_secret_matches(candidate text) returns boolean
 language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(candidate,'sha256'),'hex') = '84f192e1c2b375e4ca3d12da3959344ba127308da733a51220dfa999b99c4642'
$$;
revoke all on function public.photo_archive_secret_matches(text) from public,anon,authenticated;
grant execute on function public.photo_archive_secret_matches(text) to service_role;
commit;
