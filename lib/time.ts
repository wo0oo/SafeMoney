// 현재 시각을 KST(+09:00) 오프셋이 박힌 ISO8601 문자열로 반환합니다.
// Date.toISOString()은 항상 UTC(Z)라서, model/rules.ts의 R3(비활동시간 거래)처럼 ISO 문자열의
// 시(hour) 숫자를 그대로 로컬시간으로 읽는 로직과 어긋납니다(실제 KST 낮 거래가 "06시"로 찍혀
// 새벽 거래로 오판됨). +09:00을 명시해서 문자열 숫자와 실제 KST 벽시계 시간이 일치하게 만듭니다.
export function nowKstIso(): string {
  const kstShifted = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstShifted.toISOString().replace("Z", "+09:00");
}
