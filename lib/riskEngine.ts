import { UserBaseline } from "@/lib/userBaseline";

export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "low" | "mid" | "high" | "very_high" | "none";
export type RiskLevel = "Low" | "Medium" | "High";

export type TransactionInput = {
  amount: number; // 거래 금액(원)
  userId?: string; // 사용자 ID. 베이스라인 조회 키. 없으면 baseline=null(콜드스타트 취급)
  type?: TransactionType; // 거래 유형(이체/출금/결제/상품가입)
  category?: string; // R8용 — 소비 업종. baseline.typicalCategories와 비교
  payeeAccount?: string; // 수취 계좌. 이체/출금 시에만 옴
  region?: string; // 거래 발생 지역
  productRiskGrade?: ProductRiskGrade; // 상품 위험등급. type: "product"일 때만 의미 있음
  timestamp: string; // ISO 8601, 이번 거래 시각
};

export type RiskJudgement = {
  riskLevel: RiskLevel; // 위험도 판정 결과. 화면 모달/색상 분기 및 이메일 발송 트리거 기준
  reason: string; // 판정 사유 텍스트. 화면에 그대로 표시됨
  triggeredRules?: string[]; // 걸린 규칙 ID(R1~R8, C1~C3). 이메일 트리거·프롬프트팀 설명 근거로 재사용
};

// check-risk가 기록/조회하는 위험 판정 이력 한 건. lib/riskHistory.ts의 getTodayTransactions()가 이 타입으로 조회해옵니다.
export type RiskRecord = {
  id: string; // 레코드 고유 ID
  amount: number; // 거래 금액(원)
  userId?: string; // 거래한 사용자 ID
  type?: TransactionType; // 거래 유형
  category?: string; // 소비 업종
  payeeAccount?: string; // 수취 계좌
  region?: string; // 거래 지역
  productRiskGrade?: ProductRiskGrade; // 상품 위험등급
  riskLevel: RiskLevel; // 이 거래의 위험 판정 결과
  reason: string; // 판정 사유
  triggeredRules?: string[]; // 걸린 규칙 ID 전부
  timestamp: string; // ISO 8601, 판정(저장) 시각
};

// @고태현 — 여기가 R1~R8 + 콤보(C1~C3) 실제 탐지 로직 들어갈 자리입니다.
// baseline: getUserBaseline()으로 조회한 값, 콜드스타트(베이스라인 없음)면 null.
// recentTransactions: getTodayTransactions()로 조회한 "오늘, 이 거래 이전"의 같은 사용자 이력 (시간순 정렬).
//   - R4(10분/30분 내 연속거래): 여기서 timestamp로 원하는 시간창을 걸러서 건수를 세시면 됩니다.
//   - R8(일 소비 5배): 여기 record들의 amount를 합산하면 오늘 누적 소비액이 됩니다.
//   - "오늘" 기준은 timestamp의 UTC 날짜(yyyy-mm-dd)로 단순화했습니다. KST 자정 경계 보정이 필요하면 riskHistory.ts를 고쳐주세요.
// triggeredRules: 걸린 규칙 ID를 다 담아주세요(예: ["R4", "C1"]). 콤보(C1~C3)는 riskLevel을 항상 "High"로 반환하기로
//   확인했습니다 — 백엔드 이메일 발송 트리거가 riskLevel=High 기준 하나로만 동작합니다.
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
