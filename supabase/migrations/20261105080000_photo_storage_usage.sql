-- 사진 화면의 '저장 공간' 표시용: site-photos 저장소에 있는 파일 크기의 합계(바이트)와 파일 수만 돌려줍니다(2026-11-05).
-- 공개 키(anon)는 이미 shared_photo_files_read 정책으로 이 저장소의 파일 정보를 읽을 수 있으므로,
-- 호출한 사람 권한으로 실행(security invoker)해 그 이상은 볼 수 없게 합니다. 기존 테이블과 자료는 바꾸지 않습니다.
-- 운영 DB에는 photo_storage_usage(20261105075826)와 photo_storage_usage_invoker(20261105075844) 두 번에 나눠 적용했습니다.
create or replace function public.photo_storage_usage()
 returns table(bytes bigint, files bigint)
 language sql stable security invoker set search_path='' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)::bigint
  from storage.objects o
  where o.bucket_id = 'site-photos';
$$;
revoke all on function public.photo_storage_usage() from public;
grant execute on function public.photo_storage_usage() to anon,authenticated;
