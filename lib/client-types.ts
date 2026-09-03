export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "none" | "low" | "mid" | "high" | "very_high";
export type RiskLevel = "Low" | "Medium" | "High";

export type RiskRecord = {
  id: string;
  amount: number;
  userId?: string;
  type?: TransactionType;
  merchantCategory?: string;
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
  riskLevel: RiskLevel;
  reason: string;
  triggeredRules?: string[];
  timestamp: string;
};

export type RiskRequest = {
  amount: number;
  userId?: string;
  type?: TransactionType;
  merchantCategory?: string;
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
};
