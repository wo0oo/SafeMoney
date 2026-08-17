"""
탐지 규칙 (규칙 문서 [2] 개별 규칙, [3] 조합 규칙)

각 규칙 = (조건 + 임계값) → RuleHit | None
임계값/가중치는 config.py에서 주입.

"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from config import RISK_CONFIG as CFG
from models import ComboHit, RuleHit, Transaction, UserBaseline

# ---------- each rules ----------

def rule_r1(tx: Transaction, base: UserBaseline) -> Optional[RuleHit]:
    """R1 고액 이체: r = amount / avg_transfer"""
    if tx.type != "transfer" or base.avg_transfer <= 0:
        return None
    r = tx.amount / base.avg_transfer
    c = CFG["r1"]
    if r >= c["t3"]:
        weight, reason = c["w3"], "평소 대비 극단적 고액 이체 (사기 전형)"
    elif r >= c["t2"]:
        weight, reason = c["w2"], "평소 이체액의 7배 이상"
    elif r >= c["t1"]:
        weight, reason = c["w1"], "평소보다 큰 금액 이체"
    else:
        return None
    return RuleHit("R1", "고액 이체", weight, reason, {"r": r})


def rule_r2(tx: Transaction, base: UserBaseline) -> Optional[RuleHit]:
    """R2 신규 수취인: 이체 수취계좌가 known_payees에 없음"""
    if tx.type != "transfer" or not tx.payee_account:
        return None
    if tx.payee_account in base.known_payees:
        return None
    return RuleHit("R2", "신규 수취인", CFG["r2"]["weight"], "처음 거래하는 계좌")


def rule_r3(tx: Transaction, base: UserBaseline) -> Optional[RuleHit]:
    """R3 비활동시간 거래: 거래 시각이 active_hours 밖"""
    hour = _local_hour(tx.timestamp)
    start, end = base.active_hours
    active = (start <= hour <= end) if start <= end else (hour >= start or hour <= end)
    if active:
        return None
    return RuleHit("R3", "비활동시간 거래", CFG["r3"]["weight"], "평소 거래하지 않는 시간대")


def rule_r4(tx: Transaction, recent: list[Transaction]) -> Optional[RuleHit]:
    """R4 단기 연속 거래: 이체/출금 반복. 최댓값 1건만 적용"""
    def is_send(t: Transaction) -> bool:
        return t.type in ("transfer", "withdrawal")

    if not is_send(tx):
        return None

    now = _epoch(tx.timestamp)
    prior = [_epoch(t.timestamp) for t in recent if is_send(t)]

    def count_within(minutes: int) -> int:
        # recent는 현재 거래 미포함 → +1
        return sum(1 for t in prior if 0 <= now - t <= minutes * 60) + 1

    c = CFG["r4"]
    if count_within(c["long"]["window_min"]) >= c["long"]["count"]:
        return RuleHit("R4", "단기 연속 거래", c["long"]["weight"], "30분 내 5건 이상 반복 송·출금")
    if count_within(c["short"]["window_min"]) >= c["short"]["count"]:
        return RuleHit("R4", "단기 연속 거래", c["short"]["weight"], "10분 내 3건 이상 반복 송·출금")
    return None


def rule_r5(tx: Transaction, base: UserBaseline) -> Optional[RuleHit]:
    """R5 고액 현금 인출: 출금 ≥ 5×avg_withdrawal AND ≥ 100만원"""
    if tx.type != "withdrawal":
        return None
    c = CFG["r5"]
    if tx.amount >= c["multiplier"] * base.avg_withdrawal and tx.amount >= c["absolute_min"]:
        return RuleHit("R5", "고액 현금 인출", c["weight"], "평소보다 큰 현금 인출 (전달책 패턴)")
    return None


def rule_r6(tx: Transaction) -> Optional[RuleHit]:
    """R6 고위험 상품 가입: product_risk_grade 기준"""
    if tx.type != "product":
        return None
    g = tx.product_risk_grade
    if g not in ("mid", "high", "very_high"):
        return None
    reason_map = {
        "mid": "원금 손실 가능성이 있는 상품",
        "high": "원금 손실 위험이 큰 상품",
        "very_high": "구조가 복잡한 초고위험 상품 (ELS·레버리지 등)",
    }
    return RuleHit("R6", "고위험 상품 가입", CFG["r6"][g], reason_map[g])


def rule_r8(tx: Transaction, base: UserBaseline, recent: list[Transaction]) -> Optional[RuleHit]:
    """R8 소비 카테고리 이상: 신규 업종에서 당일 소비 ≥ 5×daily_spend_avg"""
    if tx.type != "payment" or not tx.merchant_category:
        return None
    if tx.merchant_category in base.typical_categories:
        return None
    # 당일 같은 신규 업종 결제 합산 (+ 현재 거래)
    day_spend = sum(
        t.amount for t in recent
        if t.type == "payment" and t.merchant_category == tx.merchant_category
    ) + tx.amount
    if day_spend >= CFG["r8"]["multiplier"] * base.daily_spend_avg:
        return RuleHit("R8", "소비 카테고리 이상", CFG["r8"]["weight"], "평소와 다른 소비 패턴")
    return None


def evaluate_rules(tx: Transaction, base: UserBaseline, recent: list[Transaction]) -> list[RuleHit]:
    """개별 규칙 전체 평가"""
    hits = [
        rule_r1(tx, base),
        rule_r2(tx, base),
        rule_r3(tx, base),
        rule_r4(tx, recent),
        rule_r5(tx, base),
        rule_r6(tx),
        rule_r8(tx, base, recent),
    ]
    return [h for h in hits if h is not None]


# ---------- combo rules ----------


def _combo_c1(hits: list[RuleHit]) -> Optional[ComboHit]:
    """C1: R1(r≥10) & R2 → +25, 최소 High"""
    r1 = _find(hits, "R1")
    r2 = _find(hits, "R2")
    r = r1.meta.get("r", 0) if r1 else 0
    if r1 and r2 and r >= CFG["combo"]["c1"]["r_threshold"]:
        return ComboHit("C1", CFG["combo"]["c1"]["bonus"], "고액 이체 + 신규 수취인 (전형적 사기 패턴)", force_grade="High")
    return None


def _combo_c2(hits: list[RuleHit], base: UserBaseline, recent: list[Transaction]) -> Optional[ComboHit]:
    """
    C2: R2(신규계좌 이체) & R5(고액 현금인출) → 즉시 High + 보호자 즉시 알림.
    두 신호는 보통 서로 다른 거래(이체 후 인출). 현재 거래가 고액 인출(R5)이고
    오늘 앞선 이력에 신규계좌 이체가 있으면 발동.
    """
    if not _find(hits, "R5"):
        return None
    recent_new_payee = any(
        t.type == "transfer" and t.payee_account and t.payee_account not in base.known_payees
        for t in recent
    )
    if recent_new_payee:
        return ComboHit("C2", CFG["combo"]["c2"]["bonus"], "신규 계좌 이체 후 고액 현금인출 (인출·전달책 패턴)",
                        force_grade="High", guardian_alert=True, hold_recommended=True)
    return None


def _combo_c3(hits: list[RuleHit]) -> Optional[ComboHit]:
    """C3: R3 & R1 & R2 → 즉시 High (심야 원격 조작 정황)"""
    if _find(hits, "R3") and _find(hits, "R1") and _find(hits, "R2"):
        return ComboHit("C3", CFG["combo"]["c3"]["bonus"], "심야 시간대 신규 계좌 고액 이체 (원격 조작 정황)",
                        force_grade="High", hold_recommended=True)
    return None


def evaluate_combos(hits: list[RuleHit], tx: Transaction, base: UserBaseline, recent: list[Transaction]) -> list[ComboHit]:
    """조합 규칙 전체 평가"""
    combos = [_combo_c1(hits), _combo_c2(hits, base, recent), _combo_c3(hits)]
    return [c for c in combos if c is not None]


# ---------- utils ----------


def _find(hits: list[RuleHit], rule_id: str) -> Optional[RuleHit]:
    return next((h for h in hits if h.id == rule_id), None)


def _local_hour(iso: str) -> int:
    """ISO 문자열에 적힌 그대로의 '시(hour)' 추출 → 런타임 TZ 영향 회피"""
    m = re.search(r"T(\d{2}):", iso)
    return int(m.group(1)) if m else datetime.fromisoformat(iso).hour


def _epoch(iso: str) -> float:
    return datetime.fromisoformat(iso).timestamp()
