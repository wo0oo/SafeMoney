"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GuardianShell } from "@/components/guardian-shell";
import { Surface } from "@/components/ui";
import { getSeniorsForGuardian } from "@/lib/client-api";
import { CURRENT_GUARDIAN_EMAIL } from "@/lib/client-identity";
import type { GuardianLink } from "@/lib/client-types";

export default function FamilyPage() {
  const [person, setPerson] = useState<GuardianLink | null>(null);

  useEffect(() => {
    getSeniorsForGuardian(CURRENT_GUARDIAN_EMAIL)
      .then(([first]) => setPerson(first ?? null))
      .catch(() => setPerson(null));
  }, []);

  return <GuardianShell title="연결된 가족" active="family" bell>
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">연결된 가족의 금융 안전 상태를 확인합니다.</p>
    {person ? <Surface className="absolute left-[68px] top-[102px] flex h-[156px] w-[1010px] items-center px-[32px]"><div className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-[#f5f5f5] text-[30px]">👤</div><div className="ml-[32px]"><strong className="text-[24px]">{person.seniorUserId}</strong><span className="mt-[6px] block text-[20px] text-[#6b6b6b]">피보호자</span><span className="mt-[6px] block text-[20px]">위험 거래 알림 {person.alertEnabled === false ? "꺼짐" : "연결됨"}</span></div><span className="ml-auto text-[30px]">›</span></Surface> : <Surface className="absolute left-[68px] top-[102px] flex h-[156px] w-[1010px] items-center justify-center text-[20px] text-[#6b6b6b]">등록된 피보호자가 없습니다</Surface>}
    <Link href="/guardian/family/add" className="absolute left-[68px] top-[302px] flex h-[72px] w-[1010px] items-center rounded-[10px] border border-[#d9d9d9] bg-white px-[34px] text-[20px] no-underline"><span className="mr-[22px] text-[28px]">＋</span>가족 계정 연결하기</Link>
  </GuardianShell>;
}
