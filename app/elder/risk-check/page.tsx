"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RiskResultModal } from "@/components/risk-result-modal";
import { Field, PrimaryButton, Surface } from "@/components/ui";
import { checkRisk } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";
import type { RiskRecord, TransactionType } from "@/lib/client-types";

export default function RiskCheckPage() {
  const me = useSession();
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("transfer");
  const [payee, setPayee] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [now, setNow] = useState("");
  const [result, setResult] = useState<RiskRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const update = () => setNow(new Date().toLocaleString("ko-KR"));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  function changePayee(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPayee([digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join("-"));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      setResult(await checkRisk({ amount: Number(amount), userId: me.username, type, payeeAccount: payee || undefined, region: region || undefined, merchantCategory: category || undefined, productRiskGrade: "none" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청에 실패했습니다.");
    } finally { setBusy(false); }
  }

  return <AppShell title="거래 위험 확인" active="risk">
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">거래 정보를 입력하면 AI가 위험도를 확인합니다</p>
    <Surface className="absolute left-[68px] top-[90px] h-[690px] w-[1010px] px-[37px] py-[31px]">
      <h2 className="m-0 text-[28px] font-semibold">거래 정보</h2>
      <form onSubmit={submit} className="mt-[28px] grid grid-cols-2 gap-x-[30px] gap-y-[26px]">
        <Field label="거래 금액" type="number" required placeholder="예) 3,500,000" value={amount} onChange={e => setAmount(e.target.value)} />
        <Field label="거래 유형" select={{ value: type, onChange: e => setType(e.target.value as TransactionType) }}><option value="transfer">이체</option><option value="withdrawal">출금</option><option value="payment">결제</option><option value="product">상품 가입</option></Field>
        <Field label="수취 계좌" inputMode="numeric" placeholder="예) 110-123-1234" value={payee} onChange={e => changePayee(e.target.value)} />
        <Field label="거래 지역" select={{ value: region, onChange: e => setRegion(e.target.value) }}><option value="">선택해주세요</option><option value="KR-Seoul">서울</option><option value="KR-Gyeonggi">경기</option><option value="KR-Incheon">인천</option><option value="KR-Busan">부산</option><option value="KR-Daegu">대구</option><option value="KR-Daejeon">대전</option><option value="KR-Gwangju">광주</option><option value="KR-Ulsan">울산</option><option value="KR-Sejong">세종</option><option value="KR-Other">기타</option></Field>
        <Field label="거래 시간" readOnly value={now} />
        <Field label="소비 카테고리" placeholder="예) grocary, luxury, crypto" value={category} onChange={e => setCategory(e.target.value)} />
        <p className="col-span-2 m-0 text-[20px] text-[#6b6b6b]">입력한 정보는 위험도 분석에만 사용됩니다.</p>
        {error && <p className="col-span-2 m-0 text-[16px] text-[#d11a1a]">{error}</p>}
        <PrimaryButton disabled={busy} className="col-start-2 ml-auto mt-[78px] h-[64px] w-[228px] !text-white">{busy ? "확인 중" : "위험도 확인하기"}</PrimaryButton>
      </form>
    </Surface>
    {result && <RiskResultModal result={result} onClose={() => setResult(null)} />}
  </AppShell>;
}
