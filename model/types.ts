// ============================================================
// SafeMoney Senior — 공용 타입 정의
// 프론트(check-risk 응답), 백엔드(judgeRisk), 프롬프트(reason 생성)가
// 모두 참조하는 계약(schema). 여기 필드가 곧 파트 간 인터페이스임.
// ============================================================

export type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
export type ProductRiskGrade = "low" | "mid" | "high" | "very_high" | "none";
export type RiskLevel = "Low" | "Medium" | "High";

/** mock 거래 객체 (규칙 문서 [6]) */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  timestamp: string; // ISO8601, 예: "2026-08-03T02:14:00+09:00"
  payeeAccount?: string;       // 이체/출금 시
  merchantCategory?: string;   // 결제 시
  region?: string;
  productRiskGrade?: ProductRiskGrade | null; // 상품 가입 시
}

/** 사용자 베이스라인 (사전 계산, 규칙 문서 [1]) */
export interface UserBaseline {
  userId: string;
  avgTransfer: number;
  stdTransfer: number;
  avgWithdrawal: number;
  dailySpendAvg: number;
  knownPayees: string[];
  activeHours: [number, number]; // [시작시, 종료시] 예: [8, 21]
  typicalCategories: string[];
  usualRegion: string;
}

/** 위험 판정 결과 스키마 — 프론트 "위험 이력"·보호자 뷰가 소비 (규칙 문서 [6]) */
export interface RiskRecord {
  id: string;
  amount: number;
  riskLevel: RiskLevel;
  reason: string; // 지금은 대표 근거 한 줄. 추후 프롬프트 파트가 채움
  triggeredRules: string[]; // 발동한 규칙/콤보 ID (예: ["R1", "C1"])
  timestamp: string;
}

// ---- 내부(탐지 엔진) 타입 ----

/** 발동한 개별 규칙 1건 */
export interface RuleHit {
  id: string;     // "R1" ...
  name: string;   // "고액 이체"
  weight: number;
  reason: string; // 설명용 근거 텍스트 (규칙 문서 [2] 근거 컬럼)
  meta?: Record<string, unknown>; // combo 판정용 부가정보 (예: { r: 15 })
}

/** 발동한 조합 규칙 1건 */
export interface ComboHit {
  id: string;   // "C1" ...
  bonus: number;
  forceGrade?: RiskLevel;   // 최소 등급 강제 승격
  guardianAlert?: boolean;  // 보호자 즉시 알림 (C2)
  holdRecommended?: boolean;// 거래 보류 권고 (C2/C3)
  reason: string;
}

/** judgeRisk 전체 출력 (RiskRecord보다 상세, 디버깅·알림 트리거용) */
export interface JudgeResult {
  score: number;            // 0~100 (레코드엔 저장 안 함, 등급만 남김)
  riskLevel: RiskLevel;
  ruleHits: RuleHit[];
  comboHits: ComboHit[];
  guardianAlert: boolean;   // 보호자 알림 발송 여부
  holdRecommended: boolean; // 거래 보류 권고 여부
  reason: string;           // 대표 근거 한 줄 → RiskRecord.reason
}
