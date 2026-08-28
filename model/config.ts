// ============================================================
// 임계값 · 가중치 설정
// 규칙 문서 [8] "열린 이슈"의 캘리브레이션 대상은 전부 여기 모음.
// mock 데이터 분포 확정되면 이 파일만 손대면 됨.
// ============================================================

export const RISK_CONFIG = {
  // R1 고액 이체: r = amount / avgTransfer
  r1: { t1: 3, t2: 7, t3: 15, w1: 15, w2: 30, w3: 45 },

  // R2 신규 수취인
  r2: { weight: 20 },

  // R3 비활동시간
  r3: { weight: 15 },

  // R4 단기 연속 거래 (최댓값 1건만 적용)
  r4: {
    short: { windowMin: 10, count: 3, weight: 20 },
    long: { windowMin: 30, count: 5, weight: 30 },
  },

  // R5 고액 현금 인출
  r5: { multiplier: 5, absoluteMin: 1_000_000, weight: 25 },

  // R6 고위험 상품 가입 (productRiskGrade 기준)
  r6: { mid: 10, high: 30, very_high: 40 } as Record<string, number>,

  // R7 소비 카테고리 이상
  r7: { multiplier: 5, weight: 10 },

  // 조합 규칙
  combo: {
    c1: { rThreshold: 10, bonus: 25 },
    c2: { bonus: 0 }, // 즉시 High
    c3: { bonus: 0 }, // 즉시 High
  },

  // 점수 → 등급 매핑 경계 (규칙 문서 §4)
  grade: { medium: 30, high: 60 },

  scoreCap: 100,
} as const;
