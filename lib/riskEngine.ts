import { UserBaseline } from "@/lib/userBaseline";

export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "low" | "mid" | "high" | "very_high" | "none";
export type RiskLevel = "Low" | "Medium" | "High";

export type TransactionInput = {
  amount: number;
  userId?: string;
  type?: TransactionType;
  category?: string; // R8(소비 카테고리 이상)이 baseline.typicalCategories와 비교할 업종
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
  timestamp: string;
};

export type RiskJudgement = {
  riskLevel: RiskLevel;
  reason: string;
};

// check-risk가 기록/조회하는 위험 판정 이력 한 건. lib/riskHistory.ts의 getTodayTransactions()가 이 타입으로 조회해옵니다.
export type RiskRecord = {
  id: string;
  amount: number;
  userId?: string;
  type?: TransactionType;
  category?: string;
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
  riskLevel: RiskLevel;
  reason: string;
  timestamp: string;
};

// @고태현 — 여기가 R1~R8 + 콤보(C1~C3) 실제 탐지 로직 들어갈 자리입니다.
// baseline: getUserBaseline()으로 조회한 값, 콜드스타트(베이스라인 없음)면 null.
// recentTransactions: getTodayTransactions()로 조회한 "오늘, 이 거래 이전"의 같은 사용자 이력 (시간순 정렬).
//   - R4(10분/30분 내 연속거래): 여기서 timestamp로 원하는 시간창을 걸러서 건수를 세시면 됩니다.
//   - R8(일 소비 5배): 여기 record들의 amount를 합산하면 오늘 누적 소비액이 됩니다.
//   - "오늘" 기준은 timestamp의 UTC 날짜(yyyy-mm-dd)로 단순화했습니다. KST 자정 경계 보정이 필요하면 riskHistory.ts를 고쳐주세요.
// 지금은 amount 기준 더미 규칙만 있고 baseline/recentTransactions은 아직 안 씁니다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 고태현님 실제 로직에서 사용 예정
export function judgeRisk(transaction: TransactionInput, baseline: UserBaseline | null, recentTransactions: RiskRecord[]): RiskJudgement {
  const { amount } = transaction;

  if (amount >= 3000000) {
    return { riskLevel: "High", reason: "평소보다 지나치게 큰 금액의 거래입니다." };
  }
  if (amount >= 500000) {
    return { riskLevel: "Medium", reason: "평소보다 다소 큰 금액의 거래입니다." };
  }
  return { riskLevel: "Low", reason: "평소 소비 패턴과 유사합니다." };
}
