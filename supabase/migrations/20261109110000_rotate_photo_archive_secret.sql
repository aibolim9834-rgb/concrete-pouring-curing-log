-- 알폼핀 원본 보관: new secret for the archive PC (2026-11-09). The first config was written from a sandboxed shell
-- that real Windows processes (Task Scheduler) could not see, so it was recreated on the PC and the old secret dropped.
create or replace function public.photo_archive_secret_matches(candidate text) returns boolean
 language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(candidate,'sha256'),'hex') = '0979906437a0fc439c1f20cd7c942121ad38cdf31dc0004472e6dc5884e403a7'
$$;
revoke all on function public.photo_archive_secret_matches(text) from public,anon,authenticated;
grant execute on function public.photo_archive_secret_matches(text) to service_role;
