"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGuardianLink } from "@/lib/client-api";
import {
  getCurrentGuardianEmail,
  getCurrentSeniorUserId,
  rememberGuardianEmail,
  rememberSeniorUserId,
} from "@/lib/client-session";
import { PrimaryButton } from "@/components/ui";

export function ConnectionForm({ kind }: { kind: "guardian" | "protected" }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guardian = kind === "guardian";

  async function save() {
    const value = identifier.trim();
    if (!value || busy) return;

    const seniorUserId = guardian ? getCurrentSeniorUserId() : value;
    const guardianEmail = guardian ? value.toLowerCase() : getCurrentGuardianEmail();
    setBusy(true);
    setError("");

    try {
      await createGuardianLink({
        seniorUserId,
        guardianEmail,
        guardianName: guardian ? value.split("@")[0] : undefined,
        relation: guardian ? relation.trim() || "가족" : undefined,
        alertEnabled: true,
      });
      if (guardian) rememberGuardianEmail(guardianEmail);
      else rememberSeniorUserId(seniorUserId);
      router.push(guardian ? "/elder/guardian" : "/guardian/family");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계정을 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="absolute left-[48px] top-[90px] h-[459px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-white px-[38px] py-[36px]">
      <h2 className="m-0 text-[28px] font-semibold">{guardian ? "보호자 정보" : "피보호자 정보"}</h2>
      <label className="mt-[30px] block text-[20px] font-medium">
        {guardian ? "보호자 아이디" : "피보호자 아이디"}
        <input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={guardian ? "보호자 이메일을 입력하세요" : "연결할 피보호자 아이디"}
          className="mt-[10px] block h-[58px] w-full rounded-[7px] border border-[#d9d9d9] px-[16px] text-[20px]"
        />
      </label>
      {guardian && (
        <label className="mt-[28px] block text-[20px] font-medium">
          보호자와의 관계
          <select
            value={relation}
            onChange={(event) => setRelation(event.target.value)}
            className="mt-[10px] block h-[58px] w-full rounded-[7px] border border-[#d9d9d9] bg-white px-[16px] text-[20px]"
          >
            <option value="">선택해주세요</option>
            <option>자녀</option><option>배우자</option><option>형제·자매</option>
            <option>친족</option><option>기타</option>
          </select>
        </label>
      )}
      {error && <p className="mt-[16px] text-[16px] text-[#d11a1a]">{error}</p>}
      <PrimaryButton
        onClick={save}
        disabled={busy}
        className="absolute bottom-[22px] right-[24px] h-[58px] w-[218px] text-white"
      >
        {busy ? "연결 중" : guardian ? "보호자 추가" : "피보호자 연결"}
      </PrimaryButton>
    </section>
  );
}
