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

  // 콜드스타트(베이스라인 없는 신규 사용자) 전용 절대 임계값.
  // R1/R5/R7은 원래 "평소 대비 N배"를 보는데, 신규 사용자는 평소값(avgTransfer 등)이
  // 없어 배수를 계산할 수 없다. 그 대신 이 절대 금액 기준으로만 판단한다.
  coldStart: {
    r1: { absoluteMin: 1_000_000, weight: 20 }, // 신규 사용자 100만원 이상 이체
    r7: { absoluteMin: 500_000, weight: 10 }, // 신규 사용자 당일 신규업종 50만원 이상 소비
    activeHours: [7, 23] as [number, number], // activeHours 모를 때 쓰는 시스템 기본 활동시간
    // C1(고액이체+신규수취인)은 원래 배수(r≥10)로 판단하지만 콜드스타트는 배수를 못 구하므로
    // 이 절대 금액 이상이면 동일하게 콤보 발동(즉시 High). 신규 계좌로 보내는 고액 이체는
    // 베이스라인 유무와 무관하게 전형적 사기 패턴이라 콜드스타트라고 약하게 볼 이유가 없음.
    combo1AbsoluteMin: 3_000_000,
  },
} as const;
