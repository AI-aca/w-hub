// 저장 중에 창을 닫으려 하면 경고(옛 학원 평가 사이트에 있던 '저장 중 창 닫기 경고'). 서버로 저장하는 호출을 track 으로 감싼다.
let n = 0, on = false;
const guard = (e: BeforeUnloadEvent) => { if (n > 0) { e.preventDefault(); e.returnValue = ""; } };

export async function track<T>(p: Promise<T>): Promise<T> {
  if (!on) { addEventListener("beforeunload", guard); on = true; }
  n++;
  try { return await p; } finally { n--; }
}
export const saving = () => n > 0;
