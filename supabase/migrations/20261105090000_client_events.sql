-- 작업 기록(오류 자동 기록, 2026-11-05): 앱이 저장·수정·삭제·사진 올리기의 성공과 실패, 입력 확인에 막힌 일,
-- 예상하지 못한 오류를 한 줄씩 남깁니다. "어제 저장이 안 됐다"는 말을 들었을 때 원인을 찾는 용도입니다.
-- 입력 값(온도·물량 등)과 이름·계정 같은 개인 정보는 남기지 않고, 어느 기록인지 찾을 식별값(ID·일자·동·층)만 남깁니다.
-- 공개 키(anon)는 넣기만 할 수 있고 읽기·고치기·지우기는 못 합니다. 대시보드나 SQL로만 읽습니다. 90일이 지나면 지웁니다.
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),          -- 서버가 받은 시각
  happened_at timestamptz,                         -- 기기에서 일어난 시각 (연결이 끊긴 동안 모아 두었다가 늦게 올 수 있음)
  device text not null check (char_length(device) between 8 and 40),  -- 기기마다 무작위 번호
  site_id text check (char_length(site_id) <= 80),
  page text not null check (char_length(page) between 1 and 20),      -- 일지 / 타설현황 / 사진
  action text not null check (char_length(action) between 1 and 60), -- 일지 추가, 사진 올리기 …
  outcome text not null check (outcome in ('ok', 'warn', 'error')),
  target text check (char_length(target) <= 200),                     -- 일지 ID·일자·동·층 같은 식별값
  message text check (char_length(message) <= 500),                   -- 사용자에게 보인 안내
  code text check (char_length(code) <= 40),                          -- 서버 오류 코드, TIMEOUT 등
  detail text check (char_length(detail) <= 1000),                    -- 원래 오류 내용
  duration_ms integer check (duration_ms between 0 and 600000),
  online boolean,
  app_version text check (char_length(app_version) <= 40),
  client text check (char_length(client) <= 160),                      -- 브라우저 정보
  trail jsonb check (trail is null or (jsonb_typeof(trail) = 'array' and jsonb_array_length(trail) <= 10 and pg_column_size(trail) <= 2000))
);
create index if not exists client_events_at_idx on public.client_events (at desc);
create index if not exists client_events_site_at_idx on public.client_events (site_id, at desc);

alter table public.client_events enable row level security;
create policy client_events_insert on public.client_events for insert to anon, authenticated
  with check (char_length(device) >= 8 and outcome in ('ok', 'warn', 'error'));
grant insert on public.client_events to anon, authenticated;
revoke select, update, delete, truncate, references, trigger on public.client_events from anon, authenticated;

-- 매일 03:17 UTC(한국 12:17)에 90일 지난 기록을 지웁니다.
-- 운영 DB에는 client_events, client_events_insert_only, client_events_purge_schedule 세 번에 나눠 적용했습니다(2026-11-05).
select cron.schedule('purge-client-events', '17 3 * * *', $$delete from public.client_events where at < now() - interval '90 days'$$);
