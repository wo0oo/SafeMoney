"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RiskBadge } from "@/components/ui";
import { getRiskHistory } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";
import type { RiskRecord, RiskLevel } from "@/lib/client-types";

type Filter = "all" | RiskLevel;
export function HistoryList() {
  const me = useSession();
  const [items, setItems] = useState<RiskRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  useEffect(() => { getRiskHistory({ seniorUserId: me.username }).then(v => setItems(v.slice().reverse())).catch(e => setError(e instanceof Error ? e.message : "내역을 불러오지 못했습니다.")); }, [me.username]);
  const visible = useMemo(() => items.filter(x => filter === "all" || x.riskLevel === filter).slice(0, 5), [items, filter]);
  return <>
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">총 {items.length}건의 거래 위험 확인 내역이 있습니다.</p>
    <select aria-label="위험도 필터" value={filter} onChange={e => setFilter(e.target.value as Filter)} className="absolute left-[914px] top-[38px] h-[40px] w-[164px] rounded-[8px] border border-[#d9d9d9] bg-white px-[16px] text-[18px]"><option value="all">전체 보기</option><option value="High">High만</option><option value="Medium">Middle만</option><option value="Low">Low만</option></select>
    <div className="absolute left-[68px] top-[114px] space-y-[20px]">
      {error && <p className="text-[#d11a1a]">{error}</p>}
      {visible.map(r => <Link key={r.id} href={`/elder/history/${r.id}`} className="flex h-[104px] w-[1010px] items-center rounded-[10px] border border-[#d9d9d9] bg-white px-[24px] no-underline"><span className="mr-[17px] text-[33px]">⚠️</span><RiskBadge level={r.riskLevel} /><div className="ml-[42px] w-[140px]"><strong className="block text-[20px]">{r.amount.toLocaleString()}원</strong><span className="mt-[6px] block text-[20px] text-[#6b6b6b]">{typeLabel(r.type)}</span></div><time className="text-[20px] text-[#6b6b6b]">{new Date(r.timestamp).toLocaleString("ko-KR")}</time><span className="ml-auto text-[30px] text-[#6b6b6b]">›</span></Link>)}
      {!error && visible.length === 0 && <div className="flex h-[104px] w-[1010px] items-center justify-center rounded-[10px] border border-[#d9d9d9] bg-white text-[20px] text-[#6b6b6b]">거래 내역이 없습니다.</div>}
    </div><div className="absolute left-[498px] top-[766px] text-[20px]">‹&nbsp;&nbsp;1&nbsp;&nbsp;›</div>
  </>;
}
export function typeLabel(type?: string) { return ({ transfer: "이체", withdrawal: "출금", payment: "결제", product: "상품 가입" } as Record<string, string>)[type ?? ""] ?? "거래"; }
