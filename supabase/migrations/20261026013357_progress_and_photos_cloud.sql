begin;
create table public.pouring_progress (
 site_id uuid primary key references public.sites(id) on delete restrict,
 document jsonb not null check(jsonb_typeof(document)='object'),
 revision integer not null check(revision>0)
);
create table public.site_photos (
 id text primary key,
 site_id uuid not null references public.sites(id) on delete restrict,
 metadata jsonb not null check(jsonb_typeof(metadata)='object' and metadata->>'id'=id and metadata->>'siteId'=site_id::text),
 original_path text not null unique,
 thumbnail_path text not null unique,
 original_hash text not null check(length(original_hash)=64)
);
create index site_photos_site_id_idx on public.site_photos(site_id);
alter table public.pouring_progress enable row level security;
alter table public.site_photos enable row level security;
-- User approved the existing no-login shared access model. No hard delete grants.
grant select,insert,update on public.pouring_progress to anon,authenticated;
grant select,insert on public.site_photos to anon,authenticated;
revoke update on public.site_photos from anon,authenticated;
grant update(metadata) on public.site_photos to anon,authenticated;
create policy shared_progress_select on public.pouring_progress for select to anon,authenticated using(true);
create policy shared_progress_insert on public.pouring_progress for insert to anon,authenticated with check(true);
create policy shared_progress_update on public.pouring_progress for update to anon,authenticated using(true) with check(true);
create policy shared_photos_select on public.site_photos for select to anon,authenticated using(true);
create policy shared_photos_insert on public.site_photos for insert to anon,authenticated with check(true);
create policy shared_photos_update on public.site_photos for update to anon,authenticated using(true) with check(true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('site-photos','site-photos',false,20971520,array['image/jpeg','image/png','image/webp']);
create policy shared_photo_files_read on storage.objects for select to anon,authenticated using(bucket_id='site-photos');
create policy shared_photo_files_insert on storage.objects for insert to anon,authenticated with check(bucket_id='site-photos' and exists(select 1 from public.sites where id::text=(storage.foldername(storage.objects.name))[1]));
-- Original files are immutable; edit/delete/undo change metadata only.
create function public.update_site_photo_metadata(changes jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
declare item jsonb; affected integer;
begin
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)=0 or jsonb_array_length(changes)>1000 then raise exception 'Invalid batch'; end if;
 for item in select value from jsonb_array_elements(changes) order by value->>'id' loop
  update public.site_photos set metadata=item->'next'
   where id=item->>'id' and site_id=(item->>'site_id')::uuid and metadata=item->'expected';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Photo changed elsewhere. Reload before editing.'; end if;
 end loop;
end $$;
revoke all on function public.update_site_photo_metadata(jsonb) from public;
grant execute on function public.update_site_photo_metadata(jsonb) to anon,authenticated;
commit;
