"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NotificationToggle } from "@/components/notification-toggle";
import { approveGuardianLink, getGuardiansForSenior, getPendingGuardianRequests, removeGuardianLink } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";
import type { GuardianLink } from "@/lib/client-types";

export default function GuardianSettings() {
  const me = useSession();
  const [guardian, setGuardian] = useState<GuardianLink | null>(null);
  const [pending, setPending] = useState<GuardianLink[]>([]);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  function loadPending() {
    getPendingGuardianRequests(me.username)
      .then(setPending)
      .catch(() => setPending([]));
  }

  useEffect(() => {
    getGuardiansForSenior(me.username)
      .then(([first]) => setGuardian(first ?? null))
      .catch(() => setGuardian(null));
    loadPending();
  }, [me.username]);

  async function approve(guardianEmail: string) {
    if (busyEmail) return;
    setBusyEmail(guardianEmail);
    try {
      await approveGuardianLink(me.username, guardianEmail);
      loadPending();
      getGuardiansForSenior(me.username).then(([first]) => setGuardian(first ?? null)).catch(() => {});
    } finally {
      setBusyEmail(null);
    }
  }

  async function reject(guardianEmail: string) {
    if (busyEmail) return;
    setBusyEmail(guardianEmail);
    try {
      await removeGuardianLink(me.username, guardianEmail);
      loadPending();
    } finally {
      setBusyEmail(null);
    }
  }

  // 대기 요청이 있을 때만 그 아래 모든 고정 섹션(등록된 보호자/알림 설정/보호자 추가 버튼)을
  // 이 값만큼 균일하게 아래로 민다. 넉넉하게 잡아서(항목당 74px + 여유 90px) 겹칠 일이 없게 한다 —
  // 정확한 픽셀 맞춤보다 "절대 겹치지 않는 것"이 우선이다.
  const shift = pending.length > 0 ? 90 + pending.length * 74 : 0;

  return <AppShell title="보호자 설정" active="guardian">
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">고위험 거래가 감지되면 등록된 보호자에게 알림을 보냅니다</p>
    {pending.length > 0 && (
      <section className="absolute left-[68px] top-[70px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-[#fffaf0] px-[31px] py-[20px]">
        <h2 className="m-0 text-[20px] font-semibold">대기 중인 연결 요청</h2>
        <div className="mt-[14px] space-y-[10px]">
          {pending.map((request) => (
            <div key={request.id} className="flex h-[64px] items-center rounded-[6px] border border-[#d9d9d9] bg-white px-[20px]">
              <span className="text-[18px]">{request.guardianEmail}</span>
              <div className="ml-auto flex gap-[10px]">
                <button type="button" disabled={busyEmail === request.guardianEmail} onClick={() => approve(request.guardianEmail)} className="h-[40px] rounded-[6px] border-0 bg-[#262626] px-[16px] text-[16px] font-semibold text-white disabled:opacity-60">승인</button>
                <button type="button" disabled={busyEmail === request.guardianEmail} onClick={() => reject(request.guardianEmail)} className="h-[40px] rounded-[6px] border border-[#d9d9d9] bg-white px-[16px] text-[16px] disabled:opacity-60">거부</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}
    <h2 className="absolute left-[68px] m-0 text-[28px]" style={{ top: 96 + shift }}>등록된 보호자</h2>
    <section className="absolute left-[68px] flex h-[132px] w-[1010px] items-center rounded-[8px] border border-[#d9d9d9] bg-white px-[31px]" style={{ top: 144 + shift }}>
      {guardian ? <><div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#d9d9d9] bg-[#f5f5f5] text-[28px]">👨‍💼</div><div className="ml-[28px]"><strong className="text-[22px]">{guardian.guardianName || guardian.guardianEmail}</strong><span className="mt-[7px] block text-[20px] text-[#6b6b6b]">{guardian.relation || "가족"}</span></div><span className="ml-auto text-[30px]">›</span></> : <p className="m-0 text-[20px] text-[#6b6b6b]">등록된 보호자가 없습니다</p>}
    </section>
    <h2 className="absolute left-[68px] m-0 text-[28px]" style={{ top: 326 + shift }}>보호자 알림 설정</h2>
    <section className="absolute left-[68px] h-[250px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-white px-[35px] py-[30px]" style={{ top: 368 + shift }}>
      <strong className="text-[20px] font-medium">고위험 거래 알림</strong><p className="mt-[8px] text-[20px] text-[#6b6b6b]">설정한 위험도 이상인 거래가 감지되면 보호자에게 알려요.</p>
      <div className="absolute right-[62px] top-[29px]">{guardian && <NotificationToggle seniorUserId={guardian.seniorUserId} guardianEmail={guardian.guardianEmail} initial={guardian.alertEnabled !== false} />}</div>
      <div className="mt-[34px] h-px w-[926px] bg-[#d9d9d9]" />
      <label className="mt-[28px] flex items-center text-[20px] font-medium">알림 기준 위험도<select className="ml-auto h-[52px] w-[276px] rounded-[6px] border border-[#d9d9d9] bg-white px-[20px] text-[20px] font-normal"><option>High 이상</option><option>Middle 이상</option><option>모두</option></select></label>
    </section>
    <Link href="/elder/guardian/add" className="absolute left-[860px] flex h-[58px] w-[218px] items-center justify-center rounded-[8px] bg-[#262626] text-[20px] font-semibold text-white no-underline" style={{ top: 674 + shift }}>보호자 추가</Link>
  </AppShell>;
}
