import { UserBaseline } from "@/lib/userBaseline";
import { judgeRisk as runDetectionModel } from "@/model/judgeRisk";
import { Transaction as ModelTransaction } from "@/model/types";

export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "low" | "mid" | "high" | "very_high" | "none";
export type RiskLevel = "Low" | "Medium" | "High";

export type TransactionInput = {
  amount: number; // 거래 금액(원)
  userId?: string; // 사용자 ID. 베이스라인 조회 키. 없으면 baseline=null(콜드스타트 취급)
  type?: TransactionType; // 거래 유형(이체/출금/결제/상품가입)
  merchantCategory?: string; // R7용 — 소비 업종. baseline.typicalCategories와 비교
  payeeAccount?: string; // 수취 계좌. 이체/출금 시에만 옴
  region?: string; // 거래 발생 지역
  productRiskGrade?: ProductRiskGrade; // 상품 위험등급. type: "product"일 때만 의미 있음
  timestamp: string; // ISO 8601, 이번 거래 시각
};

export type RiskJudgement = {
  riskLevel: RiskLevel; // 위험도 판정 결과. 화면 모달/색상 분기 및 이메일 발송 트리거 기준
  reason: string; // 판정 사유 텍스트. 화면에 그대로 표시됨
  triggeredRules?: string[]; // 걸린 규칙 ID(R1~R7, C1~C3). 이메일 트리거·프롬프트팀 설명 근거로 재사용
};

// check-risk가 기록/조회하는 위험 판정 이력 한 건. lib/riskHistory.ts의 getTodayTransactions()가 이 타입으로 조회해옵니다.
export type RiskRecord = {
  id: string; // 레코드 고유 ID
  amount: number; // 거래 금액(원)
  userId?: string; // 거래한 사용자 ID
  type?: TransactionType; // 거래 유형
  merchantCategory?: string; // 소비 업종
  payeeAccount?: string; // 수취 계좌
  region?: string; // 거래 지역
  productRiskGrade?: ProductRiskGrade; // 상품 위험등급
  riskLevel: RiskLevel; // 이 거래의 위험 판정 결과
  reason: string; // 판정 사유
  triggeredRules?: string[]; // 걸린 규칙 ID 전부
  timestamp: string; // ISO 8601, 판정(저장) 시각
};

// baseline: getUserBaseline()으로 조회한 값, 콜드스타트(베이스라인 없음)면 null.
// recentTransactions: getTodayTransactions()로 조회한 "오늘, 이 거래 이전"의 같은 사용자 이력 (시간순 정렬).
// 태현님(데이터/AI) 실제 탐지 로직(model/judgeRisk.ts)을 호출합니다. model 쪽 Transaction/UserBaseline은
// userId·type을 필수로 요구하고 baseline도 null을 허용하지 않아서(콜드스타트 fallback 미구현),
// 이 정보가 없는 요청은 아직 더미 로직(dummyJudge)으로 우회합니다.
export function judgeRisk(transaction: TransactionInput, baseline: UserBaseline | null, recentTransactions: RiskRecord[]): RiskJudgement {
  const { amount, userId, type } = transaction;

  if (!baseline || !userId || !type) {
    return dummyJudge(amount);
  }

  const modelTransaction: ModelTransaction = {
    // 판정 시점엔 이 거래의 record id가 아직 생성되기 전이라 timestamp로 대체합니다.
    // model/rules.ts의 어떤 규칙도 tx.id를 판정에 쓰지 않아서 안전합니다.
    id: transaction.timestamp,
    userId,
    type,
    amount,
    timestamp: transaction.timestamp,
    payeeAccount: transaction.payeeAccount,
    merchantCategory: transaction.merchantCategory,
    region: transaction.region,
    productRiskGrade: transaction.productRiskGrade,
  };

  const modelRecentTransactions: ModelTransaction[] = recentTransactions
    .filter((r): r is RiskRecord & { userId: string; type: TransactionType } => Boolean(r.userId && r.type))
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      type: r.type,
      amount: r.amount,
      timestamp: r.timestamp,
      payeeAccount: r.payeeAccount,
      merchantCategory: r.merchantCategory,
      region: r.region,
      productRiskGrade: r.productRiskGrade,
    }));

  const result = runDetectionModel(modelTransaction, baseline, modelRecentTransactions);

  return {
    riskLevel: result.riskLevel,
    reason: result.reason,
    triggeredRules: [...result.ruleHits.map((hit) => hit.id), ...result.comboHits.map((combo) => combo.id)],
  };
}

// baseline 없음(콜드스타트) 또는 userId/type 미기재 시 쓰는 금액 기준 더미 판정.
// model 쪽에 콜드스타트 fallback(절대 임계 + 가중치 하향)이 들어오면 이 자리를 대체할 예정입니다.
function dummyJudge(amount: number): RiskJudgement {
  if (amount >= 3000000) {
    return { riskLevel: "High", reason: "평소보다 지나치게 큰 금액의 거래입니다." };
  }
  if (amount >= 500000) {
    return { riskLevel: "Medium", reason: "평소보다 다소 큰 금액의 거래입니다." };
  }
  return { riskLevel: "Low", reason: "평소 소비 패턴과 유사합니다." };
}
