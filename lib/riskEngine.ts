import { UserBaseline } from "@/lib/userBaseline";

export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "low" | "mid" | "high" | "very_high" | "none";

export type TransactionInput = {
  amount: number;
  userId?: string;
  type?: TransactionType;
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
  timestamp: string;
};

export type RiskJudgement = {
  riskLevel: "Low" | "Medium" | "High";
  reason: string;
};

// @고태현 — 여기가 R1~R8 + 콤보(C1~C3) 실제 탐지 로직 들어갈 자리입니다.
// baseline은 getUserBaseline()으로 조회한 값이고, 콜드스타트(베이스라인 없음)면 null입니다.
// 지금은 amount 기준 더미 규칙만 있고 baseline은 아직 안 씁니다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 고태현님 실제 로직에서 사용 예정
export function judgeRisk(transaction: TransactionInput, baseline: UserBaseline | null): RiskJudgement {
  const { amount } = transaction;

  if (amount >= 3000000) {
    return { riskLevel: "High", reason: "평소보다 지나치게 큰 금액의 거래입니다." };
  }
  if (amount >= 500000) {
    return { riskLevel: "Medium", reason: "평소보다 다소 큰 금액의 거래입니다." };
  }
  return { riskLevel: "Low", reason: "평소 소비 패턴과 유사합니다." };
}
