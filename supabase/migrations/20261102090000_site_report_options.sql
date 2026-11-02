-- 일일 보고 문구 창에서 현장마다 마지막으로 고른 형식(A/B)과 넣을 항목을 기억합니다(2026-11-02).
-- NULL이면 앱의 기본 항목을 씁니다. 기존 현장·일지 자료는 바꾸지 않습니다.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS report_options jsonb;

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_report_options_check,
  ADD CONSTRAINT sites_report_options_check CHECK (
    report_options IS NULL
    OR (jsonb_typeof(report_options) = 'object'
      AND report_options->>'format' IN ('A', 'B')
      AND jsonb_typeof(report_options->'items') = 'object')
  );
