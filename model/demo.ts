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
function run(
  label: string,
  tx: Transaction,
  expected: RiskLevel,
  priors: Transaction[] = [],
  baseline: UserBaseline | null = base
) {
  resetHistory();
  priors.forEach(recordTransaction);
  const recent = getTodayTransactions(tx.userId, tx.timestamp);
  const res = judgeRisk(tx, baseline, recent);
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

// G. 콜드스타트(베이스라인 없음): 300만원 신규계좌 이체 → High (절대 임계값 fallback)
run("G 콜드스타트 고액이체", {
  id: "G", userId: "u_02", type: "transfer", amount: 3_000_000,
  timestamp: `${D}T14:00:00+09:00`, payeeAccount: "110-***-5555",
}, "High", [], null);

// H. 콜드스타트: 새벽 2시 소액 결제(1.5만원) → Low, 크래시 없이 정상 처리 (R3만 걸리고 임계값 미달)
run("H 콜드스타트 새벽소액", {
  id: "H", userId: "u_02", type: "payment", amount: 15_000,
  timestamp: `${D}T02:00:00+09:00`, merchantCategory: "grocery",
}, "Low", [], null);

// ============================================================
// I~N: 탐지 정확도 최종 점검 — A~H가 커버 못 하던 경로 보강
// (R7·C3·R4 장기창 미검증, R1 경계값·score cap·grade 경계 미검증 — PaySim 실데이터
// 검증 중 발견한 구멍들. model/paysimEval.ts, 팀 대화 참고)
// ============================================================

// I. R7 t1 발동: 평소 안 사던 업종(luxury)에서 낮 시간에 30만원 결제
//    (dailySpendAvg 5만원 × 6배) → R7만 걸림(weight=15, t1 구간). 낮 시간이라 R3은 안 걸려서
//    15점 단독으론 여전히 Low — "일상적인 시간대의 다소 큰 결제"는 여전히 정상 범위 취급.
run("I R7 신규업종 소비", {
  id: "I", userId: "u_01", type: "payment", amount: 300_000,
  timestamp: `${D}T14:00:00+09:00`, merchantCategory: "luxury",
}, "Low");

// J. 결제(payment) 유형 grade 상한 보강 확인: 심야 + 신규업종 + 500만원(t2 구간, 100배)
//    조합 → R3(15)+R7(25, t2)=40점으로 Medium 문턱(30) 돌파. 원래는 R7 weight가 배율과
//    무관하게 고정(10)이라 이 조합도 Low에 묶여있었는데(공모전 제출 전 발견), R1처럼 배율
//    구간을 나눠 심야와 겹치면 최소 Medium은 받도록 model/config.ts r7 보강함. 결제 유형에
//    걸리는 콤보가 여전히 없어서 High까지는 못 감 — 그건 별도 논의 대상으로 남겨둠.
run("J 결제유형 grade 상한", {
  id: "J", userId: "u_01", type: "payment", amount: 5_000_000,
  timestamp: `${D}T02:00:00+09:00`, merchantCategory: "luxury",
}, "Medium");

// K. C3 콤보(R1+R2+R3 동시 발동, 심야 원격조작 정황): 심야(2시) + 신규계좌 + 평소의 4배(40만원,
//    r=4 → C1 발동 기준 r≥10엔 못 미침) 이체. C1은 안 걸리지만 C3(R1&R2&R3)가 독립적으로 발동해
//    score=50(Medium대)인데도 forceGrade로 High까지 끌어올려짐 — C1과 별개 경로 검증.
run("K 심야 신규계좌 4배이체(C3)", {
  id: "K", userId: "u_01", type: "transfer", amount: 400_000,
  timestamp: `${D}T02:00:00+09:00`, payeeAccount: "110-***-9999",
}, "High");

// L. R4 장기창(30분 내 5건) 단독 발동: 기존 계좌·소액으로 7분 간격 5건 반복 → 10분 내 3건
//    조건(단기창)은 못 채우지만(연속 2건뿐) 30분 내 5건(장기창)은 채움. D 시나리오(단기창)와
//    다른 경로로 Medium 도달하는지 검증.
{
  const priors: Transaction[] = [
    { id: "L1", userId: "u_01", type: "transfer", amount: 20_000, timestamp: `${D}T15:00:00+09:00`, payeeAccount: "110-***-0001" },
    { id: "L2", userId: "u_01", type: "transfer", amount: 20_000, timestamp: `${D}T15:07:00+09:00`, payeeAccount: "110-***-0001" },
    { id: "L3", userId: "u_01", type: "transfer", amount: 20_000, timestamp: `${D}T15:14:00+09:00`, payeeAccount: "110-***-0001" },
    { id: "L4", userId: "u_01", type: "transfer", amount: 20_000, timestamp: `${D}T15:21:00+09:00`, payeeAccount: "110-***-0001" },
  ];
  run("L 30분 내 5건(장기창)", {
    id: "L5", userId: "u_01", type: "transfer", amount: 20_000,
    timestamp: `${D}T15:28:00+09:00`, payeeAccount: "110-***-0001",
  }, "Medium", priors);
}

// M. R1 t2 경계값(정확히 7배) + grade medium 경계(정확히 30점) 동시 검증: 70만원(avgTransfer의
//    정확히 7배) 기존계좌·낮시간 이체 → R1만 weight=30(w2)으로 걸려 score=30 → ">=" 경계라
//    Medium이 나와야 함(29점이면 Low여야 하는 것과 대비).
run("M R1 7배 경계값", {
  id: "M", userId: "u_01", type: "transfer", amount: 700_000,
  timestamp: `${D}T14:00:00+09:00`, payeeAccount: "110-***-0001",
}, "Medium");

// N. score cap(100) 확인: 평소의 20배(200만원, R1 t3) + 신규계좌(R2) + 심야(R3) → base
//    45+20+15=80점에 C1(+25, r≥10)·C3(+0)가 동시 발동해 105점 나와야 하는데 scoreCap=100에서
//    잘리는지 확인. C1·C3가 같은 거래에서 동시에 발동 가능하다는 것도 이 케이스로 같이 검증.
run("N score cap + C1·C3 동시발동", {
  id: "N", userId: "u_01", type: "transfer", amount: 2_000_000,
  timestamp: `${D}T02:00:00+09:00`, payeeAccount: "110-***-8888",
}, "High");
