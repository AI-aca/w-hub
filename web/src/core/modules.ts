// 모듈 화면 정보(강조색·단계·기존 사이트). 권한·이름은 서버(core.workspace_modules)가 기준이다.
export interface ModuleMeta { accent: string; stage: string; legacy?: { label: string; url: string }; desc: string }

export const MODULE_META: Record<string, ModuleMeta> = {
  weekend: { accent: "#0f766e", stage: "2단계", desc: "학기 운영 · 시간표 · 진도 · 학생·반편성 · 성적 · 평가·리포트 · 집중관리",
    legacy: { label: "2028 주말반 사이트", url: "https://ai-aca.github.io/2028win/" } },
  mock: { accent: "#b45309", stage: "3단계", desc: "시험 설정 · 성적 입력 · 종합성적 · 순위별 정리 · 성적표 출력",
    legacy: { label: "영재학교 모의고사 사이트", url: "https://ai-aca.github.io/wmock/" } },
  naesin: { accent: "#6d28d9", stage: "4단계", desc: "학교별 문항분석 · 학생별 내신성적 · 통계 · 우수자 이미지",
    legacy: { label: "학교 내신분석 사이트", url: "https://ai-aca.github.io/wnaesin/" } },
  record: { accent: "#1d4ed8", stage: "5단계", desc: "생기부 업로드 · 400점 진단 · 내신 관문 · 보고서",
    legacy: { label: "생기부 진단 사이트", url: "https://ai-aca.github.io/School-Record/" } },
  ydiag: { accent: "#be123c", stage: "연세국제 단계", desc: "학생 온라인 영어 진단 · AI 채점 · 코멘트" },
  flhs: { accent: "#9333ea", stage: "연세국제 단계", desc: "외고·국제고 생기부 채점 · 자소서 첨삭 · 면접 질문" },
};

export const metaOf = (key: string): ModuleMeta => MODULE_META[key] ?? { accent: "#475569", stage: "", desc: "" };
