"""
위험도 산정 엔진 (규칙 문서 4 ~ 위험도 산정 로직 참고 바람) + 메인 진입점 judge_risk()

base_score  = Σ(발동한 개별 규칙 가중치)   # R4는 최댓값 1건만 반환
combo_score = base_score + Σ(combo 보너스)
total_score = min(100, combo_score)
C1/C2/C3 발동 시 grade = max(grade, "High")

"""
from __future__ import annotations

from config import RISK_CONFIG as CFG
from models import ComboHit, JudgeResult, RiskLevel, RiskRecord, RuleHit, Transaction, UserBaseline
from rules import evaluate_combos, evaluate_rules

_GRADE_ORDER: list[RiskLevel] = ["Low", "Medium", "High"]

# 점수를 등급으로 전환
def _score_to_grade(score: int) -> RiskLevel:
    if score >= CFG["grade"]["high"]: # 60 이상 ~ 고위험
        return "High"
    if score >= CFG["grade"]["medium"]: # 30 이상 ~ 주의
        return "Medium"
    return "Low" # 정상 범위

# 최고 등급
def _max_grade(a: RiskLevel, b: RiskLevel) -> RiskLevel:
    return a if _GRADE_ORDER.index(a) >= _GRADE_ORDER.index(b) else b


def _build_reason(hits: list[RuleHit], combos: list[ComboHit]) -> str:
    """대표 근거 한 줄 (RiskRecord.reason). combo 우선, 없으면 최고 가중 규칙"""
    if combos:
        return combos[0].reason
    if not hits:
        return "정상 범위 거래"
    return max(hits, key=lambda h: h.weight).reason


def judge_risk(
    tx: Transaction,
    baseline: UserBaseline,
    recent_transactions: list[Transaction] | None = None,
) -> JudgeResult:
    """
    메인 진입점.
      judge_risk(transaction, baseline, recent_transactions)
    recent_transactions는 history.get_today_transactions()의 반환값.
    """
    recent = recent_transactions or []
    rule_hits = evaluate_rules(tx, baseline, recent)
    combo_hits = evaluate_combos(rule_hits, tx, baseline, recent)

    base = sum(h.weight for h in rule_hits)
    bonus = sum(c.bonus for c in combo_hits)
    score = min(CFG["score_cap"], base + bonus)

    risk_level = _score_to_grade(score)
    for c in combo_hits:
        if c.force_grade:
            risk_level = _max_grade(risk_level, c.force_grade)

    guardian_alert = risk_level == "High" or any(c.guardian_alert for c in combo_hits)
    hold_recommended = any(c.hold_recommended for c in combo_hits)

    return JudgeResult(
        score=score,
        risk_level=risk_level,
        rule_hits=rule_hits,
        combo_hits=combo_hits,
        guardian_alert=guardian_alert,
        hold_recommended=hold_recommended,
        reason=_build_reason(rule_hits, combo_hits),
    )


def to_risk_record(tx: Transaction, result: JudgeResult) -> RiskRecord:
    """JudgeResult → 프론트가 소비하는 RiskRecord (내부 score는 버리고 등급만 남김)"""
    return RiskRecord(
        id=tx.id,
        amount=tx.amount,
        risk_level=result.risk_level,
        reason=result.reason,
        timestamp=tx.timestamp,
    )
