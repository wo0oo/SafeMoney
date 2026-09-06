// ============================================================
// model/paysimEval.ts
// PaySim(Kaggle "Synthetic Financial Datasets For Fraud Detection") 실데이터로
// judgeRisk()의 콜드스타트(baseline 없음) 절대임계값 경로를 검증합니다.
//
// 왜 콜드스타트만 검증하나: PaySim은 nameOrig(사용자) 635만 명 중 99.85%가 딱 1건만
// 거래합니다(반복 등장 9,283명, 3건 등장 15명 — data/raw/paysim.csv 탐색으로 확인).
// 그래서 "평소 대비 N배"(R1 정상경로), "알려진 수취인"(R2), "10분/30분 내 연속거래"(R4)
// 처럼 개인 히스토리가 필요한 판정은 이 데이터로 검증이 원천적으로 불가능합니다.
// 반대로 baseline=null(신규 사용자) 판정 대상으로는 정확히 들어맞아서, 여기서는 모든
// 거래를 콜드스타트로 취급해 model/config.ts의 coldStart 절대임계값들이 실제 사기
// 분포에 맞게 캘리브레이션돼 있는지를 대량 데이터로 점검합니다.
//
// 실행: npm run eval:paysim  (data/raw/paysim.csv 필요, .gitignore 대상 — README 참고)
// ============================================================

import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import { judgeRisk } from "./judgeRisk";
import { Transaction, RiskLevel } from "./types";

const CSV_PATH = path.join(__dirname, "..", "data", "raw", "paysim.csv");

// PaySim CASH_IN(입금)은 계좌로 돈이 들어오는 방향이라 이 서비스가 막으려는 "사용자
// 몰래 돈이 빠져나가는" 사기 패턴과 무관하고(우리 TransactionType에 대응 항목도 없음),
// 실제로 isFraud가 단 한 건도 없어 평가 대상에서 제외합니다(탐색 결과: awk 집계로 확인).
const TYPE_MAP: Record<string, Transaction["type"] | undefined> = {
  TRANSFER: "transfer",
  CASH_OUT: "withdrawal",
  DEBIT: "withdrawal",
  PAYMENT: "payment",
  CASH_IN: undefined,
};

// step = 시뮬레이션 시작 후 경과 시간(1 step = 1시간, 최대 743). 분 단위 정보가 없어
// R4(10/30분 단위 연속거래)는 애초에 이 데이터로 검증 불가 — 정각(:00:00)으로 고정합니다.
// getUTCHours 등 UTC getter만 써서 실행 머신의 로컬 타임존에 안 흔들리게 만든 뒤, 그
// UTC 필드 숫자를 KST 벽시계 숫자인 것처럼 그대로 씁니다(lib/time.ts nowKstIso와 동일 트릭).
const ANCHOR_UTC = new Date("2026-08-01T00:00:00.000Z").getTime();
function stepToTimestamp(step: number): string {
  const d = new Date(ANCHOR_UTC + step * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00:00+09:00`;
}

interface Counters {
  total: number;
  byType: Record<string, { total: number; fraud: number }>;
  // High 기준 / Medium 이상 기준 두 컷오프로 각각 혼동행렬 집계
  highCM: { tp: number; fp: number; fn: number; tn: number };
  mediumPlusCM: { tp: number; fp: number; fn: number; tn: number };
  ruleHitOnFraud: Record<string, number>; // 실제 사기 건에서 어떤 규칙/콤보가 걸렸는지
  missedFraud: { type: string; amount: number; riskLevel: RiskLevel }[]; // High도 못 잡은 사기(FN, High 기준)
  // R1/R5 콜드스타트 절대임계값(1,000,000)을 기준으로 사기 건을 위/아래로 나눠 recall을 따로 집계.
  // "임계값 미만 소액 사기"는 애초에 이 시스템이 노리는 패턴(평소 대비 과도하게 큰 거래)이
  // 아니라서 분리해서 봐야 진짜 성능을 오독하지 않음.
  fraudAboveThreshold: { total: number; caughtHigh: number };
  fraudBelowThreshold: { total: number; caughtHigh: number };
}

function newCM() {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`데이터 없음: ${CSV_PATH}`);
    console.error("Kaggle PaySim CSV를 data/raw/paysim.csv 로 받아두고 다시 실행하세요.");
    process.exit(1);
  }

  const counters: Counters = {
    total: 0,
    byType: {},
    highCM: newCM(),
    mediumPlusCM: newCM(),
    ruleHitOnFraud: {},
    missedFraud: [],
    fraudAboveThreshold: { total: 0, caughtHigh: 0 },
    fraudBelowThreshold: { total: 0, caughtHigh: 0 },
  };
  const COLD_START_ABSOLUTE_MIN = 1_000_000; // model/config.ts coldStart.r1/r5.absoluteMin

  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });

  let isFirstLine = true;
  let rowIndex = 0;

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false; // 헤더 skip
      continue;
    }
    if (!line) continue;
    rowIndex += 1;

    const cols = line.split(",");
    const step = Number(cols[0]);
    const rawType = cols[1];
    const amount = Number(cols[2]);
    const nameOrig = cols[3];
    const nameDest = cols[6];
    const isFraud = cols[9] === "1";

    const type = TYPE_MAP[rawType];
    if (!type) continue; // CASH_IN 등 매핑 대상 아님

    counters.total += 1;
    counters.byType[rawType] ??= { total: 0, fraud: 0 };
    counters.byType[rawType].total += 1;
    if (isFraud) counters.byType[rawType].fraud += 1;

    const tx: Transaction = {
      id: `paysim-${rowIndex}`,
      userId: nameOrig,
      type,
      amount,
      timestamp: stepToTimestamp(step),
      payeeAccount: type === "transfer" || type === "withdrawal" ? nameDest : undefined,
    };

    // baseline=null(콜드스타트), recentTransactions=[]: 위 설명대로 이 데이터셋에선
    // 사실상 전 사용자가 히스토리 없는 신규 사용자라 이렇게 취급하는 게 맞습니다.
    const result = judgeRisk(tx, null, []);

    updateCM(counters.highCM, isFraud, result.riskLevel === "High");
    updateCM(counters.mediumPlusCM, isFraud, result.riskLevel !== "Low");

    if (isFraud) {
      for (const hit of result.ruleHits) {
        counters.ruleHitOnFraud[hit.id] = (counters.ruleHitOnFraud[hit.id] ?? 0) + 1;
      }
      for (const combo of result.comboHits) {
        counters.ruleHitOnFraud[combo.id] = (counters.ruleHitOnFraud[combo.id] ?? 0) + 1;
      }
      if (result.riskLevel !== "High" && counters.missedFraud.length < 30) {
        counters.missedFraud.push({ type: rawType, amount, riskLevel: result.riskLevel });
      }

      const bucket = amount >= COLD_START_ABSOLUTE_MIN ? counters.fraudAboveThreshold : counters.fraudBelowThreshold;
      bucket.total += 1;
      if (result.riskLevel === "High") bucket.caughtHigh += 1;
    }
  }

  report(counters);
}

function updateCM(cm: { tp: number; fp: number; fn: number; tn: number }, actual: boolean, predicted: boolean) {
  if (actual && predicted) cm.tp += 1;
  else if (!actual && predicted) cm.fp += 1;
  else if (actual && !predicted) cm.fn += 1;
  else cm.tn += 1;
}

function precisionRecallF1(cm: { tp: number; fp: number; fn: number; tn: number }) {
  const precision = cm.tp / (cm.tp + cm.fp) || 0;
  const recall = cm.tp / (cm.tp + cm.fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;
  return { precision, recall, f1 };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function report(c: Counters) {
  console.log(`\n총 평가 대상 거래: ${c.total.toLocaleString()}건 (CASH_IN 제외)\n`);

  console.log("유형별 사기 비율:");
  for (const [type, { total, fraud }] of Object.entries(c.byType)) {
    console.log(`  ${type.padEnd(10)} 총 ${total.toLocaleString()}건 · 사기 ${fraud.toLocaleString()}건 (${pct(fraud / total)})`);
  }

  console.log("\n--- 컷오프: riskLevel=High 만 '위험'으로 판정 ---");
  reportCM(c.highCM);

  console.log("\n--- 컷오프: riskLevel=Medium 이상을 '위험'으로 판정 ---");
  reportCM(c.mediumPlusCM);

  console.log("\n실제 사기 건에서 걸린 규칙/콤보 빈도:");
  const sorted = Object.entries(c.ruleHitOnFraud).sort((a, b) => b[1] - a[1]);
  for (const [id, count] of sorted) {
    console.log(`  ${id}: ${count.toLocaleString()}건`);
  }

  console.log("\n금액대별 High 재현율 (콜드스타트 절대임계값 1,000,000 기준 분리):");
  const above = c.fraudAboveThreshold;
  const below = c.fraudBelowThreshold;
  console.log(
    `  1,000,000 이상 사기: ${above.total.toLocaleString()}건 중 ${above.caughtHigh.toLocaleString()}건 High 포착 (recall ${pct(
      (above.caughtHigh / above.total) || 0
    )})`
  );
  console.log(
    `  1,000,000 미만 사기: ${below.total.toLocaleString()}건 중 ${below.caughtHigh.toLocaleString()}건 High 포착 (recall ${pct(
      (below.caughtHigh / below.total) || 0
    )})`
  );

  console.log(`\nHigh 기준으로도 못 잡은 사기(FN) 샘플 최대 30건:`);
  if (c.missedFraud.length === 0) {
    console.log("  없음 — High 기준 사기 재현율(recall) 100%");
  } else {
    for (const m of c.missedFraud) {
      console.log(`  ${m.type} ${m.amount.toLocaleString()}원 → 판정 ${m.riskLevel}`);
    }
  }
}

function reportCM(cm: { tp: number; fp: number; fn: number; tn: number }) {
  const { precision, recall, f1 } = precisionRecallF1(cm);
  console.log(`  TP=${cm.tp.toLocaleString()} FP=${cm.fp.toLocaleString()} FN=${cm.fn.toLocaleString()} TN=${cm.tn.toLocaleString()}`);
  console.log(`  precision=${pct(precision)} recall=${pct(recall)} f1=${pct(f1)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
