"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RiskBadge } from "@/components/ui";
import { typeLabel } from "@/components/history-list";
import { getRiskHistory } from "@/lib/client-api";
import { CURRENT_GUARDIAN_EMAIL, CURRENT_SENIOR_USER_ID } from "@/lib/client-identity";
import type { RiskRecord } from "@/lib/client-types";

function formatAlertDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}.${value("month")}.${value("day")} ${value("hour")}:${value("minute")}`;
}

export function GuardianRecords({ mode }: { mode: "activities" | "notifications" }) {
  const [items, setItems] = useState<RiskRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getRiskHistory({
      seniorUserId: CURRENT_SENIOR_USER_ID,
      guardianEmail: CURRENT_GUARDIAN_EMAIL,
    })
      .then((history) => {
        const visible = mode === "notifications"
          ? history.filter((record) => record.riskLevel === "High")
          : history;
        setItems(visible.slice().reverse().slice(0, mode === "notifications" ? 3 : 5));
      })
      .catch((caught) => {
        setItems([]);
        setError(caught instanceof Error ? caught.message : "내역을 불러오지 못했습니다.");
      });
  }, [mode]);

  return (
    <div className={`absolute left-[68px] ${mode === "notifications" ? "top-[172px]" : "top-[100px]"} space-y-[20px]`}>
      {items.map((record) => (
        <Link href={`/elder/history/${record.id}`} key={record.id} className={`flex w-[1010px] items-center rounded-[8px] border border-[#d9d9d9] bg-white px-[32px] no-underline ${mode === "notifications" ? "h-[136px]" : "h-[104px]"}`}>
          <span className="mr-[28px] text-[29px] text-[#d11a1a]">⚠️</span>
          {mode === "notifications" ? <div>
            <strong className="block text-[20px] font-semibold text-[#141414]">{record.userId ?? CURRENT_SENIOR_USER_ID}님의 고위험 거래가 감지되었습니다</strong>
            <span className="mt-[8px] block text-[20px] text-[#d92e21]">{record.amount.toLocaleString("ko-KR")}원 · High</span>
          </div> : <div>
            <strong className="block text-[20px]">{record.amount.toLocaleString("ko-KR")}원</strong>
            <span className="mt-[8px] block text-[20px] text-[#6b6b6b]">{typeLabel(record.type)} · {record.reason}</span>
          </div>}
          <div className="ml-auto flex items-center gap-[24px]">
            {mode === "activities" && <RiskBadge level={record.riskLevel} />}
            <time className="text-[20px] text-[#6b6b6b]">{mode === "notifications" ? formatAlertDate(record.timestamp) : new Date(record.timestamp).toLocaleString("ko-KR")}</time>
            <span className="text-[30px] text-[#6b6b6b]">›</span>
          </div>
        </Link>
      ))}
      {error && <div className="flex h-[136px] w-[1010px] items-center justify-center rounded-[8px] border border-[#d9d9d9] bg-white text-[20px] text-[#d11a1a]">{error}</div>}
      {!error && items.length === 0 && <div className="flex h-[136px] w-[1010px] items-center justify-center rounded-[8px] border border-[#d9d9d9] bg-white text-[20px] text-[#6b6b6b]">표시할 {mode === "notifications" ? "알림" : "내역"}이 없습니다.</div>}
    </div>
  );
}
