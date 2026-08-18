import { readJSON } from "@/lib/db";
import { RiskRecord } from "@/lib/riskEngine";

// R4(단기 연속 거래)·R7(일 소비 이상)이 참조할 "오늘, 이 거래 이전"의 같은 사용자 거래 이력.
// "오늘" = referenceTimestamp와 UTC 날짜(yyyy-mm-dd)가 같은 기록으로 단순화했습니다(타임존 보정 없음).
// 판정 대상 거래 자체는 아직 risk-history.json에 기록되기 전이므로 포함되지 않습니다.
export async function getTodayTransactions(userId: string, referenceTimestamp: string): Promise<RiskRecord[]> {
  const history = await readJSON<RiskRecord[]>("risk-history.json");
  const today = referenceTimestamp.slice(0, 10);

  return history
    .filter((r) => r.userId === userId && r.timestamp.slice(0, 10) === today && r.timestamp < referenceTimestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
