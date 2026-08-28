// ============================================================
// 탐지 규칙 구현 (규칙 문서 [2] 개별 규칙, [3] 조합 규칙)
// 각 규칙 = (조건 + 임계값) → RuleHit | null
// 임계값/가중치는 config.ts에서 주입.
// ============================================================

import { RISK_CONFIG as CFG } from "./config";
import { Transaction, UserBaseline, RuleHit, ComboHit } from "./types";

// ---------- 개별 규칙 ----------

/** R1 고액 이체: r = amount / avgTransfer */
export function ruleR1(tx: Transaction, base: UserBaseline): RuleHit | null {
  if (tx.type !== "transfer") return null;
  if (base.avgTransfer <= 0) return null;
  const r = tx.amount / base.avgTransfer;
  const c = CFG.r1;
  let weight = 0;
  let reason = "";
  if (r >= c.t3) { weight = c.w3; reason = "평소 대비 극단적 고액 이체 (사기 전형)"; }
  else if (r >= c.t2) { weight = c.w2; reason = "평소 이체액의 7배 이상"; }
  else if (r >= c.t1) { weight = c.w1; reason = "평소보다 큰 금액 이체"; }
  else return null;
  return { id: "R1", name: "고액 이체", weight, reason, meta: { r } };
}

/** R2 신규 수취인: 이체 수취계좌가 knownPayees에 없음 */
export function ruleR2(tx: Transaction, base: UserBaseline): RuleHit | null {
  if (tx.type !== "transfer") return null;
  if (!tx.payeeAccount) return null;
  if (base.knownPayees.includes(tx.payeeAccount)) return null;
  return { id: "R2", name: "신규 수취인", weight: CFG.r2.weight, reason: "처음 거래하는 계좌" };
}

/** R3 비활동시간 거래: 거래 시각이 activeHours 밖 */
export function ruleR3(tx: Transaction, base: UserBaseline): RuleHit | null {
  const hour = localHour(tx.timestamp);
  const [start, end] = base.activeHours;
  const active =
    start <= end ? hour >= start && hour <= end : hour >= start || hour <= end;
  if (active) return null;
  return { id: "R3", name: "비활동시간 거래", weight: CFG.r3.weight, reason: "평소 거래하지 않는 시간대" };
}

/** R4 단기 연속 거래: 이체/출금 반복. 최댓값 1건만 적용 */
export function ruleR4(tx: Transaction, recent: Transaction[]): RuleHit | null {
  const isSend = (t: Transaction) => t.type === "transfer" || t.type === "withdrawal";
  if (!isSend(tx)) return null;

  const now = new Date(tx.timestamp).getTime();
  const priorMs = recent.filter(isSend).map((t) => new Date(t.timestamp).getTime());
  // 현재 거래 포함 카운트 (recent는 현재 거래 미포함이므로 +1)
  const countWithin = (min: number) =>
    priorMs.filter((t) => now - t >= 0 && now - t <= min * 60_000).length + 1;

  const c = CFG.r4;
  if (countWithin(c.long.windowMin) >= c.long.count)
    return { id: "R4", name: "단기 연속 거래", weight: c.long.weight, reason: "30분 내 5건 이상 반복 송·출금" };
  if (countWithin(c.short.windowMin) >= c.short.count)
    return { id: "R4", name: "단기 연속 거래", weight: c.short.weight, reason: "10분 내 3건 이상 반복 송·출금" };
  return null;
}

/** R5 고액 현금 인출: 출금 ≥ 5×avgWithdrawal AND ≥ 100만원 */
export function ruleR5(tx: Transaction, base: UserBaseline): RuleHit | null {
  if (tx.type !== "withdrawal") return null;
  const c = CFG.r5;
  if (tx.amount >= c.multiplier * base.avgWithdrawal && tx.amount >= c.absoluteMin)
    return { id: "R5", name: "고액 현금 인출", weight: c.weight, reason: "평소보다 큰 현금 인출 (전달책 패턴)" };
  return null;
}

/** R6 고위험 상품 가입: productRiskGrade 기준 */
export function ruleR6(tx: Transaction): RuleHit | null {
  if (tx.type !== "product") return null;
  const g = tx.productRiskGrade;
  if (!g || g === "low" || g === "none") return null;
  const weight = CFG.r6[g];
  if (weight == null) return null;
  const reasonMap: Record<string, string> = {
    mid: "원금 손실 가능성이 있는 상품",
    high: "원금 손실 위험이 큰 상품",
    very_high: "구조가 복잡한 초고위험 상품 (ELS·레버리지 등)",
  };
  return { id: "R6", name: "고위험 상품 가입", weight, reason: reasonMap[g] };
}

/** R7 소비 카테고리 이상: 신규 업종에서 당일 소비 ≥ 5×dailySpendAvg */
export function ruleR7(tx: Transaction, base: UserBaseline, recent: Transaction[]): RuleHit | null {
  if (tx.type !== "payment") return null;
  if (!tx.merchantCategory) return null;
  if (base.typicalCategories.includes(tx.merchantCategory)) return null;

  // 당일 같은 신규 업종 결제 합산 (+ 현재 거래)
  const daySpend =
    recent
      .filter((t) => t.type === "payment" && t.merchantCategory === tx.merchantCategory)
      .reduce((s, t) => s + t.amount, 0) + tx.amount;

  if (daySpend >= CFG.r7.multiplier * base.dailySpendAvg)
    return { id: "R7", name: "소비 카테고리 이상", weight: CFG.r7.weight, reason: "평소와 다른 소비 패턴" };
  return null;
}

/** 개별 규칙 전체 평가 */
export function evaluateRules(
  tx: Transaction,
  base: UserBaseline,
  recent: Transaction[]
): RuleHit[] {
  return [
    ruleR1(tx, base),
    ruleR2(tx, base),
    ruleR3(tx, base),
    ruleR4(tx, recent),
    ruleR5(tx, base),
    ruleR6(tx),
    ruleR7(tx, base, recent),
  ].filter((h): h is RuleHit => h !== null);
}

// ---------- 조합 규칙 ----------

/** C1: R1(r≥10) & R2 → +25, 최소 High */
function comboC1(hits: RuleHit[]): ComboHit | null {
  const r1 = hits.find((h) => h.id === "R1");
  const r2 = hits.find((h) => h.id === "R2");
  const r = (r1?.meta?.r as number) ?? 0;
  if (r1 && r2 && r >= CFG.combo.c1.rThreshold)
    return { id: "C1", bonus: CFG.combo.c1.bonus, forceGrade: "High", reason: "고액 이체 + 신규 수취인 (전형적 사기 패턴)" };
  return null;
}

/**
 * C2: R2(신규계좌 이체) & R5(고액 현금인출) → 즉시 High + 보호자 즉시 알림.
 * 두 신호는 보통 서로 다른 거래에 걸림(이체 후 인출). 현재 거래가 고액 인출(R5)이고,
 * 오늘 앞선 이력에 신규계좌 이체가 있으면 발동.
 */
function comboC2(hits: RuleHit[], tx: Transaction, base: UserBaseline, recent: Transaction[]): ComboHit | null {
  const r5 = hits.find((h) => h.id === "R5");
  if (!r5) return null;
  const recentNewPayeeTransfer = recent.some(
    (t) => t.type === "transfer" && !!t.payeeAccount && !base.knownPayees.includes(t.payeeAccount)
  );
  if (recentNewPayeeTransfer)
    return { id: "C2", bonus: CFG.combo.c2.bonus, forceGrade: "High", guardianAlert: true, holdRecommended: true, reason: "신규 계좌 이체 후 고액 현금인출 (인출·전달책 패턴)" };
  return null;
}

/** C3: R3 & R1 & R2 → 즉시 High (심야 원격 조작 정황) */
function comboC3(hits: RuleHit[]): ComboHit | null {
  const has = (id: string) => hits.some((h) => h.id === id);
  if (has("R3") && has("R1") && has("R2"))
    return { id: "C3", bonus: CFG.combo.c3.bonus, forceGrade: "High", holdRecommended: true, reason: "심야 시간대 신규 계좌 고액 이체 (원격 조작 정황)" };
  return null;
}

/** 조합 규칙 전체 평가 */
export function evaluateCombos(
  hits: RuleHit[],
  tx: Transaction,
  base: UserBaseline,
  recent: Transaction[]
): ComboHit[] {
  return [comboC1(hits), comboC2(hits, tx, base, recent), comboC3(hits)].filter(
    (c): c is ComboHit => c !== null
  );
}

// ---------- 유틸 ----------

/** ISO 문자열에 적힌 그대로의 '시(hour)' 추출 → 런타임 TZ 영향 회피 */
function localHour(iso: string): number {
  const m = iso.match(/T(\d{2}):/);
  return m ? parseInt(m[1], 10) : new Date(iso).getHours();
}
