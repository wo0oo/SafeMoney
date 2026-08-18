import { readJSON, writeJSON } from "@/lib/db";

// R1~R7 탐지 규칙(회의록 "이상 금융행동 탐지 규칙 초안" 섹션 1)이 참조하는
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

export async function listUserBaselines(): Promise<UserBaseline[]> {
  return readJSON<UserBaseline[]>("user-baseline.json");
}

// userId가 이미 있으면 덮어쓰고, 없으면 새로 추가합니다.
export async function upsertUserBaseline(baseline: UserBaseline): Promise<UserBaseline> {
  const baselines = await readJSON<UserBaseline[]>("user-baseline.json");
  const index = baselines.findIndex((b) => b.userId === baseline.userId);

  if (index >= 0) {
    baselines[index] = baseline;
  } else {
    baselines.push(baseline);
  }

  await writeJSON("user-baseline.json", baselines);
  return baseline;
}

export async function deleteUserBaseline(userId: string): Promise<boolean> {
  const baselines = await readJSON<UserBaseline[]>("user-baseline.json");
  const next = baselines.filter((b) => b.userId !== userId);

  if (next.length === baselines.length) {
    return false;
  }

  await writeJSON("user-baseline.json", next);
  return true;
}
