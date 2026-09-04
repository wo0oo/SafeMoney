"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NotificationToggle } from "@/components/notification-toggle";
import { getGuardiansForSenior } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";
import type { GuardianLink } from "@/lib/client-types";

export default function GuardianSettings() {
  const me = useSession();
  const [guardian, setGuardian] = useState<GuardianLink | null>(null);

  useEffect(() => {
    getGuardiansForSenior(me.username)
      .then(([first]) => setGuardian(first ?? null))
      .catch(() => setGuardian(null));
  }, [me.username]);

  return <AppShell title="보호자 설정" active="guardian">
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">고위험 거래가 감지되면 등록된 보호자에게 알림을 보냅니다</p>
    <h2 className="absolute left-[68px] top-[96px] m-0 text-[28px]">등록된 보호자</h2>
    <section className="absolute left-[68px] top-[144px] flex h-[132px] w-[1010px] items-center rounded-[8px] border border-[#d9d9d9] bg-white px-[31px]">
      {guardian ? <><div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#d9d9d9] bg-[#f5f5f5] text-[28px]">👨‍💼</div><div className="ml-[28px]"><strong className="text-[22px]">{guardian.guardianName || guardian.guardianEmail}</strong><span className="mt-[7px] block text-[20px] text-[#6b6b6b]">{guardian.relation || "가족"}</span></div><span className="ml-auto text-[30px]">›</span></> : <p className="m-0 text-[20px] text-[#6b6b6b]">등록된 보호자가 없습니다</p>}
    </section>
    <h2 className="absolute left-[68px] top-[326px] m-0 text-[28px]">보호자 알림 설정</h2>
    <section className="absolute left-[68px] top-[368px] h-[250px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-white px-[35px] py-[30px]">
      <strong className="text-[20px] font-medium">고위험 거래 알림</strong><p className="mt-[8px] text-[20px] text-[#6b6b6b]">설정한 위험도 이상인 거래가 감지되면 보호자에게 알려요.</p>
      <div className="absolute right-[62px] top-[29px]">{guardian && <NotificationToggle seniorUserId={guardian.seniorUserId} guardianEmail={guardian.guardianEmail} initial={guardian.alertEnabled !== false} />}</div>
      <div className="mt-[34px] h-px w-[926px] bg-[#d9d9d9]" />
      <label className="mt-[28px] flex items-center text-[20px] font-medium">알림 기준 위험도<select className="ml-auto h-[52px] w-[276px] rounded-[6px] border border-[#d9d9d9] bg-white px-[20px] text-[20px] font-normal"><option>High 이상</option><option>Middle 이상</option><option>모두</option></select></label>
    </section>
    <Link href="/elder/guardian/add" className="absolute left-[860px] top-[674px] flex h-[58px] w-[218px] items-center justify-center rounded-[8px] bg-[#262626] text-[20px] font-semibold text-white no-underline">보호자 추가</Link>
  </AppShell>;
}
