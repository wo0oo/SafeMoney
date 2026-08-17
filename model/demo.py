"""
검증 데모 — 규칙 문서 [7] 시나리오 A~F

기대 등급과 실제 판정이 맞는지 확인.  실행: python demo.py
"""
from __future__ import annotations

from engine import judge_risk, to_risk_record
from history import get_today_transactions, record_transaction, reset_history
from models import RiskLevel, Transaction, UserBaseline

# 공통 베이스라인 (규칙 문서 [6] 예시)
BASE = UserBaseline(
    user_id="u_01",
    avg_transfer=100_000,
    std_transfer=40_000,
    avg_withdrawal=200_000,
    daily_spend_avg=50_000,
    known_payees=["110-***-0001", "110-***-0002"],
    active_hours=(8, 21),
    typical_categories=["grocery", "medical"],
    usual_region="KR-Seoul",
)

D = "2026-08-03"


def run(label: str, tx: Transaction, expected: RiskLevel, priors: list[Transaction] | None = None) -> None:
    reset_history()
    for p in priors or []:
        record_transaction(p)
    recent = get_today_transactions(tx.user_id, tx.timestamp)
    res = judge_risk(tx, BASE, recent)
    ok = "✅" if res.risk_level == expected else "❌"
    rules = "·".join(f"{h.id}(+{h.weight})" for h in res.rule_hits) or "없음"
    combos = "·".join(c.id for c in res.combo_hits) or "-"
    print(f"{ok} [{label}] score={res.score} grade={res.risk_level} (기대 {expected}) | 규칙 {rules} | combo {combos}")
    print(f"     → guardian_alert={res.guardian_alert} hold={res.hold_recommended} | reason=\"{to_risk_record(tx, res).reason}\"")


# A. 단골 마트 3.2만원, 오후 3시 → Low
run("A 정상결제", Transaction(
    id="A", user_id="u_01", type="payment", amount=32_000,
    timestamp=f"{D}T15:00:00+09:00", merchant_category="grocery",
), "Low")

# B. 평균 10만원인데 150만원(15배) 신규계좌 이체 → High
run("B 15배 신규이체", Transaction(
    id="B", user_id="u_01", type="transfer", amount=1_500_000,
    timestamp=f"{D}T14:00:00+09:00", payee_account="110-***-9999",
), "High")

# C. 300만원 신규계좌 송금 → High
run("C 300만원 신규송금", Transaction(
    id="C", user_id="u_01", type="transfer", amount=3_000_000,
    timestamp=f"{D}T14:10:00+09:00", payee_account="110-***-8888",
), "High")

# D. 새벽 2시 소액 이체 3건 연속(기존 계좌) → Medium (3번째 거래 기준)
run("D 심야 연속이체", Transaction(
    id="D3", user_id="u_01", type="transfer", amount=30_000,
    timestamp=f"{D}T02:14:00+09:00", payee_account="110-***-0001",
), "Medium", priors=[
    Transaction(id="D1", user_id="u_01", type="transfer", amount=30_000, timestamp=f"{D}T02:10:00+09:00", payee_account="110-***-0001"),
    Transaction(id="D2", user_id="u_01", type="transfer", amount=30_000, timestamp=f"{D}T02:12:00+09:00", payee_account="110-***-0001"),
])

# E. 원금비보장(high) 상품 2천만원 가입 → Medium
run("E 고위험상품", Transaction(
    id="E", user_id="u_01", type="product", amount=20_000_000,
    timestamp=f"{D}T11:00:00+09:00", product_risk_grade="high",
), "Medium")

# F. 신규계좌 이체 후 고액 현금인출 → High (인출 거래 기준, C2)
run("F 이체후 고액인출", Transaction(
    id="F2", user_id="u_01", type="withdrawal", amount=1_500_000,
    timestamp=f"{D}T13:05:00+09:00",
), "High", priors=[
    Transaction(id="F1", user_id="u_01", type="transfer", amount=500_000, timestamp=f"{D}T13:00:00+09:00", payee_account="110-***-7777"),
])
