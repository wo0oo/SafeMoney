"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GuardianShell } from "@/components/guardian-shell";
import { RiskBadge, Surface } from "@/components/ui";
import { getRiskHistory } from "@/lib/client-api";
import {
  DEFAULT_SENIOR_USER_ID,
  getCurrentGuardianEmail,
  getCurrentSeniorUserId,
} from "@/lib/client-session";
import type { RiskRecord } from "@/lib/client-types";
import { typeLabel } from "@/components/history-list";

export default function GuardianHome() {
  const [items, setItems] = useState<RiskRecord[]>([]);
  const seniorUserId = items[0]?.userId ?? DEFAULT_SENIOR_USER_ID;

  useEffect(() => {
    getRiskHistory({
      seniorUserId: getCurrentSeniorUserId(),
      guardianEmail: getCurrentGuardianEmail(),
    }).then((history) => {
      const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setItems(history.filter((item) => new Date(item.timestamp).getTime() >= since));
    }).catch(() => setItems([]));
  }, []);

  const recentHigh = useMemo(() => {
    return items
      .filter((item) => item.riskLevel === "High")
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [items]);
  const recentActivities = recentHigh.slice(0, 2);

  return (
    <GuardianShell title="홈" active="home" bell unreadCount={recentHigh.length}>
      <h2 className="absolute left-[68px] top-[34px] m-0 text-[28px]">안녕하세요, 보호자 OOO님!</h2>
      <p className="absolute left-[68px] top-[74px] m-0 text-[20px] text-[#6b6b6b]">연결된 가족의 금융 위험 활동을 확인할 수 있습니다.</p>
      <Surface className="absolute left-[68px] top-[132px] h-[154px] w-[1010px] px-[35px] py-[24px]">
        <span className="text-[20px] text-[#6b6b6b]">연결된 가족</span>
        <strong className="mt-[8px] block text-[24px]">{seniorUserId}님</strong>
        <span className="mt-[6px] block text-[20px] text-[#6b6b6b]">가족 · 알림 연결됨</span>
        <span className="absolute right-[78px] top-[65px] text-[20px]">최근 상태: {recentHigh.length ? "주의" : "안전"}</span>
      </Surface>
      <Surface className="absolute left-[68px] top-[332px] h-[176px] w-[492px] px-[32px] py-[25px]">
        <span className="text-[20px]">최근 30일 고위험 거래</span>
        <strong className="mt-[6px] block text-[40px]">{recentHigh.length}건</strong>
        {recentHigh[0] && <span className="text-[20px] text-[#6b6b6b]">마지막 감지: {new Date(recentHigh[0].timestamp).toLocaleString("ko-KR")}</span>}
      </Surface>
      <Surface className="absolute left-[586px] top-[332px] h-[176px] w-[492px] px-[32px] py-[25px]">
        <span className="text-[28px] font-medium">확인이 필요한 알림</span>
        <strong className="mt-[6px] block text-[40px]">{recentHigh.length}건</strong>
        <span className="text-[20px] text-[#6b6b6b]">{recentHigh.length ? "위험 거래 알림을 확인해주세요." : "확인이 필요한 알림이 없습니다."}</span>
      </Surface>
      <h2 className="absolute left-[68px] top-[552px] m-0 text-[28px]">최근 위험 활동</h2>
      <div className="absolute left-[68px] top-[606px] space-y-[12px]">
        {recentActivities.length ? recentActivities.map((item) => (
          <Link key={item.id} href={`/elder/history/${item.id}`} className="flex h-[100px] w-[1010px] items-center rounded-[8px] border border-[#d9d9d9] bg-white px-[24px] no-underline">
            <span className="mr-[20px] text-[26px]">⚠️</span><RiskBadge level={item.riskLevel} />
            <div className="ml-[30px]"><strong className="text-[20px]">{item.amount.toLocaleString()}원</strong><span className="mt-[5px] block text-[20px] text-[#6b6b6b]">{typeLabel(item.type)}</span></div>
            <time className="ml-auto text-[20px] text-[#6b6b6b]">{new Date(item.timestamp).toLocaleString("ko-KR")}</time><span className="ml-[24px] text-[30px]">›</span>
          </Link>
        )) : <div className="flex h-[100px] w-[1010px] items-center justify-center rounded-[8px] border border-[#d9d9d9] bg-white text-[20px] text-[#6b6b6b]">없음</div>}
      </div>
    </GuardianShell>
  );
}
