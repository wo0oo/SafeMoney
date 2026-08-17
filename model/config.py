"""
임계값 & 가중치 설정

규칙 문서 [8] "열린 이슈"의 캘리브레이션 대상은 전부 여기 모음.
mock 데이터 분포 확정되면 이 파일만 손대면 됨.
"""

RISK_CONFIG = {
    # R1 고액 이체: r = amount / avg_transfer
    "r1": {"t1": 3, "t2": 7, "t3": 15, "w1": 15, "w2": 30, "w3": 45},

    # R2 신규 수취인
    "r2": {"weight": 20},

    # R3 비활동시간
    "r3": {"weight": 15},

    # R4 단기 연속 거래 (최댓값 1건만 적용)
    # short: 10분 내 이체, 출금 3건 이상
    # long: 30분 내 5건 이상
    "r4": {
        "short": {"window_min": 10, "count": 3, "weight": 20},
        "long": {"window_min": 30, "count": 5, "weight": 30},
    },

    # R5 고액 현금 인출
    "r5": {"multiplier": 5, "absolute_min": 1_000_000, "weight": 25},

    # R6 고위험 상품 가입 (product_risk_grade 기준)
    # mid: 중위험 / 원금 손실 가능성 있는 상품
    # high: 고위험 / 원금 손실 위험이 큰 상품
    # very_high: 초고위험 / 구조가 복잡한 초고위험 상품... ex) ELS, 레버리지
    "r6": {"mid": 10, "high": 30, "very_high": 40},

    # R8 소비 카테고리 이상 (평소와 다른 소비 패턴)
    "r8": {"multiplier": 5, "weight": 10},

    # 조합 규칙 (사기 전형 패턴: 즉시 high로)
    "combo": {
        "c1": {"r_threshold": 10, "bonus": 25},
        "c2": {"bonus": 0},  # 즉시 High
        "c3": {"bonus": 0},  # 즉시 High
    },

    # 점수 → 등급 매핑 경계 (규칙 문서 4)
    "grade": {"medium": 30, "high": 60},

    "score_cap": 100,
}
