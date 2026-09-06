// ============================================================
// model/edgeCasesC4C5.ts
// R5 배율 구간화 + C4(R3&R7 t2)/C5(R5 t2) 콤보 전용 엣지케이스 회귀.
// model/demo.ts(A~N)는 전체 규칙 스모크용이라 이번 변경의 경계값(t1/t2 정확히 걸치는 값,
// 콜드스타트 분기, 다른 콤보와의 동시발동 등)까지는 안 짚어서 별도 파일로 분리함.
// 실행: npm run eval:c4c5
// ============================================================

import { judgeRisk } from "./judgeRisk";
import { recordTransaction, getTodayTransactions, resetHistory } from "./riskHistory";
import { Transaction, UserBaseline, RiskLevel } from "./types";

const base: UserBaseline = {
  userId: "u_01",
  avgTransfer: 100_000,
  stdTransfer: 40_000,
  avgWithdrawal: 100_000,
  dailySpendAvg: 50_000,
  knownPayees: ["110-***-0001", "110-***-0002"],
  activeHours: [8, 21],
  typicalCategories: ["grocery", "medical"],
  usualRegion: "KR-Seoul",
};

const D = "2026-08-03";

interface Expectation {
  riskLevel?: RiskLevel;
  ruleIds?: string[];   // 정확히 이 규칙 id 집합이 걸려야 함
  comboIds?: string[];  // 정확히 이 콤보 id 집합이 걸려야 함
  guardianAlert?: boolean;
  holdRecommended?: boolean;
  score?: number;       // bonus=0 검증처럼 riskLevel만으론 못 잡는 경우 정확한 점수 고정
}

let pass = 0;
let fail = 0;

function check(
  label: string,
  tx: Transaction,
  expect: Expectation,
  priors: Transaction[] = [],
  baseline: UserBaseline | null = base
) {
  resetHistory();
  priors.forEach(recordTransaction);
  const recent = getTodayTransactions(tx.userId, tx.timestamp);
  const res = judgeRisk(tx, baseline, recent);

  const actualRuleIds = res.ruleHits.map((h) => h.id).sort();
  const actualComboIds = res.comboHits.map((c) => c.id).sort();
  const problems: string[] = [];

  if (expect.riskLevel !== undefined && res.riskLevel !== expect.riskLevel)
    problems.push(`riskLevel 기대=${expect.riskLevel} 실제=${res.riskLevel}`);
  if (expect.ruleIds !== undefined) {
    const wantSet = [...expect.ruleIds].sort();
    if (JSON.stringify(wantSet) !== JSON.stringify(actualRuleIds))
      problems.push(`ruleIds 기대=[${wantSet}] 실제=[${actualRuleIds}]`);
  }
  if (expect.comboIds !== undefined) {
    const wantSet = [...expect.comboIds].sort();
    if (JSON.stringify(wantSet) !== JSON.stringify(actualComboIds))
      problems.push(`comboIds 기대=[${wantSet}] 실제=[${actualComboIds}]`);
  }
  if (expect.guardianAlert !== undefined && res.guardianAlert !== expect.guardianAlert)
    problems.push(`guardianAlert 기대=${expect.guardianAlert} 실제=${res.guardianAlert}`);
  if (expect.holdRecommended !== undefined && res.holdRecommended !== expect.holdRecommended)
    problems.push(`holdRecommended 기대=${expect.holdRecommended} 실제=${res.holdRecommended}`);
  if (expect.score !== undefined && res.score !== expect.score)
    problems.push(`score 기대=${expect.score} 실제=${res.score}`);

  if (problems.length === 0) {
    pass += 1;
    console.log(`✅ [${label}] score=${res.score} grade=${res.riskLevel} rules=[${actualRuleIds}] combo=[${actualComboIds}]`);
  } else {
    fail += 1;
    console.log(`❌ [${label}] ${problems.join(" | ")}`);
    console.log(`     score=${res.score} rules=[${actualRuleIds}] combo=[${actualComboIds}] guardianAlert=${res.guardianAlert}`);
  }
}

function withdrawal(id: string, amount: number, timestamp = `${D}T14:00:00+09:00`): Transaction {
  return { id, userId: "u_01", type: "withdrawal", amount, timestamp };
}

function payment(id: string, amount: number, merchantCategory: string, timestamp = `${D}T14:00:00+09:00`): Transaction {
  return { id, userId: "u_01", type: "payment", amount, merchantCategory, timestamp };
}

console.log("=== R5 / C5 (고액 현금 인출 배율 구간화) ===");

// 1. 거래유형이 withdrawal이 아니면 R5/C5는 절대 안 걸림(다른 규칙 간섭 없게 평소 금액·기존계좌·낮시간으로 격리)
check("1 transfer 유형은 R5 대상 아님", {
  id: "e1", userId: "u_01", type: "transfer", amount: 100_000,
  timestamp: `${D}T14:00:00+09:00`, payeeAccount: "110-***-0001",
}, { ruleIds: [], comboIds: [] });

// 2. absoluteMin(100만원) 미만이면 배율 100배라도 무시 (오탐 방지 절대선)
check("2 absoluteMin 미만은 배율 무관 무시", withdrawal("e2", 999_999), {
  ruleIds: [], comboIds: [],
}, [], { ...base, avgWithdrawal: 5_000 });

// 3. absoluteMin 이상이지만 배율 t1(5배) 미만 → 무시
check("3 배율 t1 미만은 무시", withdrawal("e3", 1_200_000), {
  ruleIds: [], comboIds: [],
}, [], { ...base, avgWithdrawal: 300_000 }); // r=4

// 4. 배율 정확히 t1(5배) 경계 → w1(25)/Low, C5 없음
check("4 배율=5.0 경계(w1)", withdrawal("e4", 1_000_000), {
  riskLevel: "Low", ruleIds: ["R5"], comboIds: [],
}, [], { ...base, avgWithdrawal: 200_000 }); // r=5

// 5. 배율 t2 바로 아래(9.99배) → 여전히 w1/Low, C5 없음
check("5 배율=9.99(t2 직전, w1 유지)", withdrawal("e5", 1_998_000), {
  riskLevel: "Low", ruleIds: ["R5"], comboIds: [],
}, [], { ...base, avgWithdrawal: 200_000 }); // r=9.99

// 6. 배율 정확히 t2(10배) 경계 → w2(35)/Medium + C5 guardianAlert
check("6 배율=10.0 경계(w2+C5)", withdrawal("e6", 2_000_000), {
  riskLevel: "Medium", ruleIds: ["R5"], comboIds: ["C5"], guardianAlert: true,
}, [], { ...base, avgWithdrawal: 200_000 }); // r=10

// 7. 배율 극단치(50배) → w2/Medium + C5
check("7 배율=50(극단치)", withdrawal("e7", 10_000_000), {
  riskLevel: "Medium", ruleIds: ["R5"], comboIds: ["C5"], guardianAlert: true,
}, [], { ...base, avgWithdrawal: 200_000 }); // r=50

// 8. avgWithdrawal=0 가드 → 나눗셈 회피, R5 무시
check("8 avgWithdrawal=0 가드", withdrawal("e8", 5_000_000), {
  ruleIds: [], comboIds: [],
}, [], { ...base, avgWithdrawal: 0 });

// 9. 콜드스타트, absoluteMin 이상 → w1(25) 고정, meta.r 없어 C5 미발동
check("9 콜드스타트 absoluteMin 이상(w1 고정)", withdrawal("e9", 1_000_000), {
  riskLevel: "Low", ruleIds: ["R5"], comboIds: [],
}, [], null);

// 10. 콜드스타트, absoluteMin 미만 → 무시
check("10 콜드스타트 absoluteMin 미만", withdrawal("e10", 999_999), {
  ruleIds: [], comboIds: [],
}, [], null);

// 11. 콜드스타트, 절대금액 극단치(1억) → 여전히 w1(25) 고정, 배율 구간 자체가 없어 C5 미발동
//     (콜드스타트 사용자의 R5 배율 구간화는 이번 스코프 밖 — 알려진 한계로 남겨둠)
check("11 콜드스타트 극단치도 w1 고정(C5 미발동, 알려진 한계)", withdrawal("e11", 100_000_000), {
  riskLevel: "Low", ruleIds: ["R5"], comboIds: [],
}, [], null);

// 12. C2(신규계좌 이체 후 고액인출)와 C5 동시발동: 배율 t2 이상 인출 + 직전 신규계좌 이체
{
  const priors: Transaction[] = [
    { id: "e12p", userId: "u_01", type: "transfer", amount: 500_000, timestamp: `${D}T13:00:00+09:00`, payeeAccount: "110-***-9999" },
  ];
  check("12 C2+C5 동시발동", withdrawal("e12", 2_000_000, `${D}T13:05:00+09:00`), {
    riskLevel: "High", comboIds: ["C2", "C5"], guardianAlert: true, holdRecommended: true,
  }, priors, { ...base, avgWithdrawal: 200_000 }); // r=10
}

// 13. C5 단독으론 Medium까지만(High 아님) — forceGrade 없다는 것 확인
check("13 C5 단독은 Medium(High 아님)", withdrawal("e13", 2_000_000), {
  riskLevel: "Medium", comboIds: ["C5"],
}, [], { ...base, avgWithdrawal: 200_000 });

// 14. C5 bonus=0 확인: R5(w2=35) 단독 점수와 C5 동반 점수가 같아야 함(가산 없음)
check("14 C5 bonus=0(점수 가산 없음, score=35)", withdrawal("e14", 2_000_000), {
  riskLevel: "Medium", ruleIds: ["R5"], comboIds: ["C5"], score: 35,
}, [], { ...base, avgWithdrawal: 200_000 });

// 15. absoluteMin 경계 바로 아래 + 배율은 극단(false negative 아님을 확인): 소액이면 배율 무관 계속 무시
check("15 absoluteMin 미만은 배율 50배라도 무시(오탐 방지 유지)", withdrawal("e15", 500_000), {
  ruleIds: [], comboIds: [],
}, [], { ...base, avgWithdrawal: 10_000 }); // r=50 이지만 절대금액 미달

// 16. R5 w1 tier(배율=6, t2 미달)에서도 C2는 정상 발동(콤보는 R5 tier와 무관), C5는 미발동
{
  const priors: Transaction[] = [
    { id: "e16p", userId: "u_01", type: "transfer", amount: 500_000, timestamp: `${D}T13:00:00+09:00`, payeeAccount: "110-***-9999" },
  ];
  check("16 R5 w1 tier에서도 C2는 발동(C5는 미발동)", withdrawal("e16", 1_200_000, `${D}T13:05:00+09:00`), {
    riskLevel: "High", ruleIds: ["R5"], comboIds: ["C2"], guardianAlert: true, holdRecommended: true,
  }, priors, { ...base, avgWithdrawal: 200_000 }); // r=6 → w1 tier, C5 미달
}

// 17. meta.r 수치 정확성 간접 확인: t2 바로 위(10.01배)에서도 w2/C5 발동해야 함
check("17 배율=10.01(t2 살짝 초과)", withdrawal("e17", 2_002_000), {
  riskLevel: "Medium", ruleIds: ["R5"], comboIds: ["C5"], guardianAlert: true,
}, [], { ...base, avgWithdrawal: 200_000 });

// 18. R5와 R7은 거래유형이 달라(withdrawal vs payment) 같은 거래에서 절대 동시발동 불가 → C4/C5 동시발동 없음
check("18 R5(withdrawal)와 R7(payment)은 같은 거래에서 공존 불가", withdrawal("e18", 2_000_000), {
  ruleIds: ["R5"], comboIds: ["C5"],
}, [], { ...base, avgWithdrawal: 200_000 });

console.log("\n=== C4 (R3 비활동시간 & R7 t2 신규업종 극단소비) ===");

// 1. R3+R7(t2) 모두 발동 → C4, riskLevel은 점수(40)로 자연 도달한 Medium, forceGrade 아님
check("1 R3+R7(t2) → C4", payment("f1", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: ["C4"], guardianAlert: true, holdRecommended: false,
});

// 2. R7 t2 직전(9.99배)이면 w1만 걸리고 C4는 미발동
check("2 R7 배율 t2 직전(9.99배)은 C4 미발동", payment("f2", 499_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: [],
}); // R3(15)+R7 w1(15)=30 → 자연 Medium이지만 C4는 없어야 함

// 3. R7 t2 이상이어도 활동시간대(R3 미발동)면 C4 없음(R7 단독 25점은 Medium 문턱 30 미달 → Low)
check("3 활동시간대엔 R3 없어서 C4 미발동", payment("f3", 600_000, "luxury", `${D}T14:00:00+09:00`), {
  riskLevel: "Low", ruleIds: ["R7"], comboIds: [],
});

// 4. 심야(R3)여도 소비가 typicalCategories면 R7 자체가 안 걸려 C4 없음
check("4 단골 카테고리는 심야 고액이어도 R7/C4 없음", payment("f4", 5_000_000, "grocery", `${D}T02:00:00+09:00`), {
  riskLevel: "Low", ruleIds: ["R3"], comboIds: [],
});

// 5. 콜드스타트: R3(신규 사용자 야간)는 걸리지만 R7은 meta.r이 없어 C4 미발동
check("5 콜드스타트는 R7 meta.r 없어 C4 미발동", payment("f5", 5_000_000, "luxury", `${D}T02:00:00+09:00`), {
  ruleIds: ["R3", "R7"], comboIds: [],
}, [], null);

// 6. 결제(payment)가 아닌 유형은 R7 자체가 안 걸려 C4 없음(야간 고액 이체)
check("6 payment 아니면 R7/C4 없음(심야 고액 이체는 다른 경로)", {
  id: "f6", userId: "u_01", type: "transfer", amount: 5_000_000,
  timestamp: `${D}T02:00:00+09:00`, payeeAccount: "110-***-0001",
}, { comboIds: [] });

// 7. dailySpendAvg=0 가드 → R7 자체가 안 걸려 C4 없음
check("7 dailySpendAvg=0 가드", payment("f7", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  ruleIds: ["R3"], comboIds: [],
}, [], { ...base, dailySpendAvg: 0 });

// 8. 당일 동일 신규업종 결제 합산으로 t2 도달(개별 결제는 작아도 합산으로 넘김) → C4 발동
{
  const priors: Transaction[] = [
    { id: "f8p", userId: "u_01", type: "payment", amount: 300_000, merchantCategory: "luxury", timestamp: `${D}T01:00:00+09:00` },
  ];
  check("8 당일 합산으로 t2 도달 → C4 발동", payment("f8", 300_000, "luxury", `${D}T02:00:00+09:00`), {
    riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: ["C4"], guardianAlert: true,
  }, priors);
}

// 9. R3 t2 경계에서 정확히 10.0배 → C4 발동(경계 포함 확인)
check("9 R7 배율=10.0 정확한 경계 → C4 발동", payment("f9", 500_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: ["C4"], guardianAlert: true,
});

// 10. C4 bonus=0 확인: R3+R7(t2) 점수(15+25=40)에서 콤보 가산이 없어야 함
check("10 C4 bonus=0(score=40 유지)", payment("f10", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", score: 40,
});

// 11. C4는 holdRecommended를 켜지 않음(guardianAlert만)
check("11 C4는 holdRecommended 미설정", payment("f11", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  comboIds: ["C4"], guardianAlert: true, holdRecommended: false,
});

// 12. C4는 forceGrade가 없어 다른 콤보 없이는 절대 High까지 못 감(구조적 확인)
check("12 C4 단독으론 High 불가", payment("f12", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium",
});

// 13. 신규업종이 여러 개일 때 다른(당일 미결제) 카테고리는 합산에 안 섞임
{
  const priors: Transaction[] = [
    { id: "f13p", userId: "u_01", type: "payment", amount: 5_000_000, merchantCategory: "electronics", timestamp: `${D}T01:00:00+09:00` },
  ];
  check("13 다른 신규업종 소비는 합산에 안 섞임(luxury만 집계)", payment("f13", 300_000, "luxury", `${D}T02:00:00+09:00`), {
    ruleIds: ["R3", "R7"], comboIds: [],
  }, priors); // luxury 단독 30만원은 daySpend=30만, dailySpendAvg=5만 → r=6(t1), t2 미달
}

// 14. R7 t1 tier(배율 5~10 사이)에서 R3 동반해도 C4는 미발동(경계 값 재확인)
check("14 R7 t1(배율=7)+R3 → C4 미발동", payment("f14", 350_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: [],
}); // R3(15)+R7 w1(15)=30 Medium, 배율=7이라 t2 미달

// 15. C4 발동 거래에서도 다른 규칙(R6 등)과 독립적으로 합산됨 — 여긴 product 유형이라 같은 tx 불가하므로
//     대신 R3+R7(t2) 단독 조합의 score가 정확히 40인지 재확인(회귀 고정값)
check("15 C4 케이스 score 고정값 재확인(=40)", payment("f15", 600_000, "luxury", `${D}T02:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: ["C4"], score: 40,
});

// 16. 활동시간 경계(정확히 endHour) 바로 다음 시각이면 R3 발동 → t2 배율과 겹치면 C4 발동
check("16 활동시간 경계 직후(22시)+t2 배율 → C4 발동", payment("f16", 600_000, "luxury", `${D}T22:00:00+09:00`), {
  riskLevel: "Medium", ruleIds: ["R3", "R7"], comboIds: ["C4"], guardianAlert: true,
});

console.log(`\n총 ${pass + fail}건 중 ✅ ${pass} / ❌ ${fail}`);
if (fail > 0) process.exit(1);
