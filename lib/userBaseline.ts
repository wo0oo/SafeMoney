import { readJSON } from "@/lib/db";

// R1~R8 탐지 규칙(회의록 "이상 금융행동 탐지 규칙 초안" 섹션 1)이 참조하는
// 사용자별 평소 거래 패턴 통계. 고태현님이 실제 계산 로직으로 값을 채워 넣기 전까지는
// data/user-baseline.json에 미리 계산된 값을 넣어두고 그대로 읽어옵니다.
export type UserBaseline = {
  userId: string;
  avgTransfer: number;
  stdTransfer: number;
  avgWithdrawal: number;
  dailySpendAvg: number;
  knownPayees: string[];
  activeHours: [number, number];
  typicalCategories: string[];
  usualRegion: string;
};

// 베이스라인이 없는 사용자(콜드스타트)는 null을 반환합니다.
// 절대 임계값 fallback 처리는 탐지 로직(lib/riskEngine.ts) 쪽 책임입니다.
export async function getUserBaseline(userId: string): Promise<UserBaseline | null> {
  const baselines = await readJSON<UserBaseline[]>("user-baseline.json");
  return baselines.find((b) => b.userId === userId) ?? null;
}
