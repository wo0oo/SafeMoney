import { readJSON, writeJSON } from "@/lib/db";

// R1~R8 탐지 규칙(회의록 "이상 금융행동 탐지 규칙 초안" 섹션 1)이 참조하는
// 사용자별 평소 거래 패턴 통계. 고태현님이 실제 계산 로직으로 값을 채워 넣기 전까지는
// data/user-baseline.json에 미리 계산된 값을 넣어두고 그대로 읽어옵니다.
export type UserBaseline = {
  userId: string; // 베이스라인 소유자(사용자) ID
  avgTransfer: number; // 평소 이체 평균 금액(원)
  stdTransfer: number; // 이체 금액 표준편차 — 평소 대비 얼마나 벗어났는지 판단 기준
  avgWithdrawal: number; // 평소 출금 평균 금액(원)
  dailySpendAvg: number; // 일 평균 소비액(원). R8(일 소비 5배) 비교 기준
  knownPayees: string[]; // 평소 자주 거래하던 수취 계좌 목록
  activeHours: [number, number]; // 평소 활동 시간대 [시작 시, 종료 시]. 새벽 거래 등 이상 시간 판단용
  typicalCategories: string[]; // 평소 소비 업종 목록. R8(신규 업종 여부) 비교 기준
  usualRegion: string; // 평소 거래 지역
  guardianEmail?: string; // 위험 알림 이메일 수신자. 보호자 동의/등록 화면이 아직 없어 임시로 baseline에 둠 — 화면 나오면 그쪽 데이터로 옮길 예정
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
