"use client";

import { useEffect, useState } from "react";
import { getGuardiansForSenior, updateGuardianAlert } from "@/lib/client-api";
import { CURRENT_SENIOR_USER_ID } from "@/lib/client-identity";

type Target = { seniorUserId: string; guardianEmail: string };

export function NotificationToggle({
  seniorUserId = CURRENT_SENIOR_USER_ID,
  guardianEmail,
  initial = true,
}: {
  seniorUserId?: string;
  guardianEmail?: string;
  initial?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [target, setTarget] = useState<Target | null>(
    guardianEmail ? { seniorUserId, guardianEmail } : null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (guardianEmail) return;
    getGuardiansForSenior(seniorUserId)
      .then(([link]) => {
        if (!link) return;
        setTarget({ seniorUserId: link.seniorUserId, guardianEmail: link.guardianEmail });
        setOn(link.alertEnabled !== false);
      })
      .catch(() => setTarget(null));
  }, [guardianEmail, seniorUserId]);

  async function toggle() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const updated = await updateGuardianAlert({ ...target, alertEnabled: !on });
      setOn(updated.alertEnabled !== false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="고위험 거래 알림"
      disabled={!target || busy}
      onClick={toggle}
      className={`relative h-[40px] w-[82px] rounded-[20px] border-0 disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-[#262626]" : "bg-[#d9d9d9]"}`}
    >
      <span className={`absolute top-[5px] h-[30px] w-[30px] rounded-full bg-white ${on ? "left-[44px]" : "left-[8px]"}`} />
    </button>
  );
}
