-- 수파베이스(Supabase) 콘크리트 타설 및 양생 관리 일지 DB 스키마

-- 1. 현장 (Sites) 테이블
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 콘크리트 타설 및 양생 기록 (Pouring Logs) 테이블
CREATE TABLE IF NOT EXISTS pouring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  category TEXT DEFAULT '1', -- 구분
  date DATE NOT NULL, -- 일자
  building TEXT NOT NULL, -- 동(구역)
  floor TEXT NOT NULL, -- 층
  member_type TEXT NOT NULL, -- 벽/슬라브
  min_temp NUMERIC(4, 1), -- 최저온도 (°C)
  max_temp NUMERIC(4, 1), -- 최고온도 (°C)
  weather TEXT DEFAULT '맑음', -- 기상 (눈/비/맑음 등)
  remicon_company TEXT, -- 레미콘사
  strength TEXT, -- 타설강도 (e.g. 24MPa, 24-24-150 등)
  volume NUMERIC(10, 2), -- 타설물량 (m³)
  curing_watering TEXT, -- 양생방법: 살수
  curing_protection TEXT, -- 양생방법: 보양
  remarks TEXT, -- 비고
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_pouring_logs_site_id ON pouring_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_pouring_logs_date ON pouring_logs(date);

-- RLS (Row Level Security) 설정 (필요 시 사용자별 권한 설정 가능)
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE pouring_logs ENABLE ROW LEVEL SECURITY;

-- 읽기 및 쓰기 기본 허용 정책 (익명 / 인증 사용자)
CREATE POLICY "Allow public read for sites" ON sites FOR SELECT USING (true);
CREATE POLICY "Allow public insert for sites" ON sites FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update for sites" ON sites FOR UPDATE USING (true);
CREATE POLICY "Allow public delete for sites" ON sites FOR DELETE USING (true);

CREATE POLICY "Allow public read for pouring_logs" ON sites FOR SELECT USING (true);
CREATE POLICY "Allow public all for pouring_logs" ON pouring_logs FOR ALL USING (true);

-- 초기 샘플 현장 데이터 삽입
INSERT INTO sites (name) VALUES
  ('대구 범어 자이 S&D'),
  ('평택역 센트럴시티 현대 (2공구)'),
  ('용인 SK FAB 지원 부속시설'),
  ('탕정자이 GS'),
  ('신반포 22차 현대ENG'),
  ('평촌 자이 퍼스니티(1공구)'),
  ('대우 고덕 민간참여(1공구)'),
  ('포항데이터 센터 현대'),
  ('하남교산 대우')
ON CONFLICT (name) DO NOTHING;
