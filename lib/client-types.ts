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

export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status?: "pending" | "approved";
  createdAt: string;
};

export type CreateGuardianLinkRequest = {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  initiatedBy: "senior" | "guardian";
};

export type UserRole = "senior" | "guardian";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
};

export type SignupRequest = {
  username: string;
  password: string;
  name: string;
  email: string;
  role: UserRole;
};

export type LoginRequest = {
  username: string;
  password: string;
  role: UserRole;
};
