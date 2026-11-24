-- W-HUB 0007: 평가 대시보드(3-2 B1) — 최종 점수의 수학:과학 비율(참고사이트 60:40)을 과정 설정으로.
-- 모의 종합 200점 = 같은 비율 × 2 (원본 수학×1.2 + 과학×0.8).
alter table class.rules add column if not exists cat_weights jsonb not null default '{"수학":60,"과학":40}'::jsonb;
