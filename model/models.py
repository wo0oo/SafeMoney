"""
SafeMoney Senior — 데이터 스키마

내부 모델은 파이썬 관례대로 snake_case.
단, 파트 간 JSON 계약(프론트·백엔드·프롬프트)은 규칙 문서의 camelCase를 그대로
유지해야 하므로 경계에서 from_dict / to_dict로 매핑한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

TransactionType = Literal["transfer", "withdrawal", "payment", "product"]
ProductRiskGrade = Literal["low", "mid", "high", "very_high", "none"]
RiskLevel = Literal["Low", "Medium", "High"]


@dataclass
class Transaction:
    """거래 객체 (규칙 문서 [6])"""
    id: str
    user_id: str
    type: TransactionType
    amount: float
    timestamp: str  # ISO8601, 예: "2026-08-03T02:14:00+09:00"
    payee_account: Optional[str] = None       # 이체/출금 시
    merchant_category: Optional[str] = None   # 결제 시
    region: Optional[str] = None
    product_risk_grade: Optional[ProductRiskGrade] = None  # 상품 가입 시

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Transaction":
        """백엔드가 보내는 camelCase JSON → Transaction"""
        return cls(
            id=d["id"],
            user_id=d["userId"],
            type=d["type"],
            amount=d["amount"],
            timestamp=d["timestamp"],
            payee_account=d.get("payeeAccount"),
            merchant_category=d.get("merchantCategory"),
            region=d.get("region"),
            product_risk_grade=d.get("productRiskGrade"),
        )


@dataclass
class UserBaseline:
    """사용자 베이스라인 (사전 계산, 규칙 문서 1)"""
    user_id: str
    avg_transfer: float
    std_transfer: float
    avg_withdrawal: float
    daily_spend_avg: float
    known_payees: list[str]
    active_hours: tuple[int, int]  # (시작시, 종료시) 예: (8, 21)
    typical_categories: list[str]
    usual_region: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "UserBaseline":
        return cls(
            user_id=d["userId"],
            avg_transfer=d["avgTransfer"],
            std_transfer=d.get("stdTransfer", 0),
            avg_withdrawal=d["avgWithdrawal"],
            daily_spend_avg=d["dailySpendAvg"],
            known_payees=d["knownPayees"],
            active_hours=tuple(d["activeHours"]),
            typical_categories=d["typicalCategories"],
            usual_region=d["usualRegion"],
        )


@dataclass
class RiskRecord:
    """위험 판정 결과 — 프론트 '위험 이력'·보호자 뷰가 소비 (규칙 문서 [6])"""
    id: str
    amount: float
    risk_level: RiskLevel
    reason: str  # 지금은 대표 근거 한 줄. 추후 프롬프트 파트가 채움
    timestamp: str

    def to_dict(self) -> dict[str, Any]:
        """프론트/프롬프트 계약(camelCase) JSON으로 직렬화"""
        return {
            "id": self.id,
            "amount": self.amount,
            "riskLevel": self.risk_level,
            "reason": self.reason,
            "timestamp": self.timestamp,
        }


# ---- 내부(탐지 엔진) 타입 ----

@dataclass
class RuleHit:
    """발동한 개별 규칙 1건"""
    id: str        # "R1" ...
    name: str      # "고액 이체"
    weight: int
    reason: str    # 설명용 근거 (규칙 문서 [2] 근거 컬럼)
    meta: dict[str, Any] = field(default_factory=dict)  # combo 판정용 (예: {"r": 15})


@dataclass
class ComboHit:
    """발동한 조합 규칙 1건"""
    id: str        # "C1" ...
    bonus: int
    reason: str
    force_grade: Optional[RiskLevel] = None   # 최소 등급 강제 승격
    guardian_alert: bool = False              # 보호자 즉시 알림 (C2)
    hold_recommended: bool = False            # 거래 보류 권고 (C2/C3)


@dataclass
class JudgeResult:
    """judge_risk 전체 출력 (RiskRecord보다 상세, 알림 트리거·디버깅용)"""
    score: int                 # 0~100 (레코드엔 저장 안 함, 등급만 남김)
    risk_level: RiskLevel
    rule_hits: list[RuleHit]
    combo_hits: list[ComboHit]
    guardian_alert: bool       # 보호자 알림 발송 여부 (이메일 트리거 기준)
    hold_recommended: bool     # 거래 보류 권고 여부
    reason: str                # 대표 근거 한 줄 → RiskRecord.reason
