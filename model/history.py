"""
거래 이력 조회

judge_risk의 3번째 인자(recent_transactions)를 공급.
"오늘, 이 거래 이전"의 같은 사용자 이력을 시간순으로 반환.
R4(연속거래 건수)·R8(일 소비 합산)·C2(직전 신규계좌 이체) 계산에 사용.

⚠️ 지금은 in-memory mock. 실서비스에선 DB 쿼리로 교체하되 시그니처만 유지하면
   judge_risk 쪽은 안 바뀜.
"""
from __future__ import annotations

from datetime import datetime

from models import Transaction

_store: list[Transaction] = []


def record_transaction(tx: Transaction) -> None:
    """mock 거래 적재 (실제 서비스에선 DB insert)"""
    _store.append(tx)


def reset_history() -> None:
    """테스트/데모용 초기화"""
    _store.clear()


def get_today_transactions(user_id: str, reference_timestamp: str) -> list[Transaction]:
    """
    같은 날, reference_timestamp 이전, 같은 사용자 거래를 시간 오름차순 반환.
    '오늘' 판정은 타임스탬프에 적힌 로컬 날짜(KST 오프셋 그대로) 기준.
    """
    ref_day = _date_key(reference_timestamp)
    ref = datetime.fromisoformat(reference_timestamp)

    result = [
        t for t in _store
        if t.user_id == user_id
        and _date_key(t.timestamp) == ref_day
        and datetime.fromisoformat(t.timestamp) < ref
    ]
    result.sort(key=lambda t: datetime.fromisoformat(t.timestamp))
    return result


def _date_key(iso: str) -> str:
    """ISO 문자열에서 적힌 그대로의 날짜('2026-08-03') 추출 → 런타임 TZ 영향 회피"""
    return iso[:10]
