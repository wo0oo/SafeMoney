// ============================================================
// model/riskHistory.ts
// 백엔드↔데이터AI 계약: judgeRisk의 3번째 인자(recentTransactions) 공급.
// "오늘, 이 거래 이전"의 같은 사용자 이력을 시간순으로 반환.
// R4(연속거래 건수)·R7(일 소비 합산)·C2(직전 신규계좌 이체) 계산에 사용.
//
// ⚠️ 지금은 in-memory mock 구현. 백엔드에서 실제 DB 쿼리로 교체하면 됨
//    (시그니처만 유지하면 judgeRisk 쪽은 안 바뀜).
// ============================================================

import { Transaction } from "./types";

const store: Transaction[] = [];

/** mock 거래 적재 (실서비스에선 DB insert가 대신함) */
export function recordTransaction(tx: Transaction): void {
  store.push(tx);
}

/** 테스트/데모용 초기화 */
export function resetHistory(): void {
  store.length = 0;
}

/**
 * 같은 날, referenceTimestamp 이전, 같은 사용자 거래를 시간 오름차순 반환.
 * "오늘" 판정은 타임스탬프에 적힌 로컬 날짜(KST 오프셋 그대로) 기준.
 */
export function getTodayTransactions(
  userId: string,
  referenceTimestamp: string
): Transaction[] {
  const refDay = localDateKey(referenceTimestamp);
  const refMs = new Date(referenceTimestamp).getTime();

  return store
    .filter((t) => t.userId === userId)
    .filter((t) => localDateKey(t.timestamp) === refDay)
    .filter((t) => new Date(t.timestamp).getTime() < refMs)
    .sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
}

/** ISO 문자열에서 적힌 그대로의 날짜("2026-08-03") 추출 → 런타임 TZ 영향 회피 */
function localDateKey(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : iso.slice(0, 10);
}
