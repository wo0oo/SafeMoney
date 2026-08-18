// ============================================================
// 검증 데모 — 규칙 문서 [7] 시나리오 A~F
// 기대 등급과 실제 판정이 맞는지 확인. 루트에서 `npm run demo`로 실행.
// ============================================================

import { judgeRisk, toRiskRecord } from "./judgeRisk";
import {
  recordTransaction,
  getTodayTransactions,
  resetHistory,
} from "./riskHistory";
import { Transaction, UserBaseline, RiskLevel } from "./types";

// 공통 베이스라인 (규칙 문서 [6] 예시)
const base: UserBaseline = {
  userId: "u_01",
  avgTransfer: 100_000,
  stdTransfer: 40_000,
  avgWithdrawal: 200_000,
  dailySpendAvg: 50_000,
  knownPayees: ["110-***-0001", "110-***-0002"],
  activeHours: [8, 21],
  typicalCategories: ["grocery", "medical"],
  usualRegion: "KR-Seoul",
};

/** 단건 시나리오 실행 헬퍼 */
function run(label: string, tx: Transaction, expected: RiskLevel, priors: Transaction[] = []) {
  resetHistory();
  priors.forEach(recordTransaction);
  const recent = getTodayTransactions(tx.userId, tx.timestamp);
  const res = judgeRisk(tx, base, recent);
  const ok = res.riskLevel === expected ? "✅" : "❌";
  const rules = res.ruleHits.map((h) => `${h.id}(+${h.weight})`).join("·") || "없음";
  const combos = res.comboHits.map((c) => c.id).join("·") || "-";
  console.log(
    `${ok} [${label}] score=${res.score} grade=${res.riskLevel} (기대 ${expected}) | 규칙 ${rules} | combo ${combos}`
  );
  console.log(
    `     → guardianAlert=${res.guardianAlert} hold=${res.holdRecommended} | RiskRecord.reason="${toRiskRecord(tx, res).reason}"`
  );
}

const D = "2026-08-03";

// A. 단골 마트 3.2만원, 오후 3시 → Low
run("A 정상결제", {
  id: "A", userId: "u_01", type: "payment", amount: 32_000,
  timestamp: `${D}T15:00:00+09:00`, merchantCategory: "grocery",
}, "Low");

// B. 평균 10만원인데 150만원(15배) 신규계좌 이체 → High
run("B 15배 신규이체", {
  id: "B", userId: "u_01", type: "transfer", amount: 1_500_000,
  timestamp: `${D}T14:00:00+09:00`, payeeAccount: "110-***-9999",
}, "High");

// C. 300만원 신규계좌 송금 → High
run("C 300만원 신규송금", {
  id: "C", userId: "u_01", type: "transfer", amount: 3_000_000,
  timestamp: `${D}T14:10:00+09:00`, payeeAccount: "110-***-8888",
}, "High");

// D. 새벽 2시 소액 이체 3건 연속(기존 계좌) → Medium (3번째 거래 기준)
{
  const priors: Transaction[] = [
    { id: "D1", userId: "u_01", type: "transfer", amount: 30_000, timestamp: `${D}T02:10:00+09:00`, payeeAccount: "110-***-0001" },
    { id: "D2", userId: "u_01", type: "transfer", amount: 30_000, timestamp: `${D}T02:12:00+09:00`, payeeAccount: "110-***-0001" },
  ];
  run("D 심야 연속이체", {
    id: "D3", userId: "u_01", type: "transfer", amount: 30_000,
    timestamp: `${D}T02:14:00+09:00`, payeeAccount: "110-***-0001",
  }, "Medium", priors);
}

// E. 원금비보장(high) 상품 2천만원 가입 → Medium
run("E 고위험상품", {
  id: "E", userId: "u_01", type: "product", amount: 20_000_000,
  timestamp: `${D}T11:00:00+09:00`, productRiskGrade: "high",
}, "Medium");

// F. 신규계좌 이체 후 고액 현금인출 → High (인출 거래 기준, C2)
{
  const priors: Transaction[] = [
    { id: "F1", userId: "u_01", type: "transfer", amount: 500_000, timestamp: `${D}T13:00:00+09:00`, payeeAccount: "110-***-7777" },
  ];
  run("F 이체후 고액인출", {
    id: "F2", userId: "u_01", type: "withdrawal", amount: 1_500_000,
    timestamp: `${D}T13:05:00+09:00`,
  }, "High", priors);
}
