"use client";

import { useEffect, useState } from "react";

type TransactionType = "transfer" | "withdrawal" | "payment" | "product";
type ProductRiskGrade = "none" | "low" | "mid" | "high" | "very_high";
type RiskLevel = "Low" | "Medium" | "High";

type RiskRecord = {
  id: string;
  amount: number;
  userId?: string;
  type?: TransactionType;
  merchantCategory?: string;
  payeeAccount?: string;
  region?: string;
  productRiskGrade?: ProductRiskGrade;
  riskLevel: RiskLevel;
  reason: string;
  timestamp: string;
};

type UserBaseline = {
  userId: string;
  avgTransfer: number;
  stdTransfer: number;
  avgWithdrawal: number;
  dailySpendAvg: number;
  knownPayees: string[];
  activeHours: [number, number];
  typicalCategories: string[];
  usualRegion: string;
};

const riskStyles: Record<RiskLevel, string> = {
  Low: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  Medium:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  High: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

export default function DemoPage() {
  const [amount, setAmount] = useState("3500000");
  const [userId, setUserId] = useState("u_01");
  const [type, setType] = useState<TransactionType>("transfer");
  const [payeeAccount, setPayeeAccount] = useState("999-***-9999");
  const [region, setRegion] = useState("KR-Seoul");
  const [category, setCategory] = useState("");
  const [productRiskGrade, setProductRiskGrade] = useState<ProductRiskGrade>("none");

  const [baseline, setBaseline] = useState<UserBaseline | null | "loading">(null);
  const [history, setHistory] = useState<RiskRecord[]>([]);
  const [lastResult, setLastResult] = useState<RiskRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    const res = await fetch("/api/check-risk");
    const data: RiskRecord[] = await res.json();
    setHistory(data.slice().reverse());
  }

  async function loadBaseline(id: string) {
    if (!id.trim()) {
      setBaseline(null);
      return;
    }
    setBaseline("loading");
    const res = await fetch(`/api/user-baseline?userId=${encodeURIComponent(id)}`);
    if (res.status === 404) {
      setBaseline(null);
      return;
    }
    setBaseline(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 최초 이력 로드 (setHistory는 fetch 완료 후 비동기로 실행됨)
    loadHistory();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadBaseline(userId), 300);
    return () => clearTimeout(timer);
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      setError("금액은 숫자여야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/check-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          userId: userId.trim() || undefined,
          type,
          merchantCategory: category.trim() || undefined,
          payeeAccount: payeeAccount.trim() || undefined,
          region: region.trim() || undefined,
          productRiskGrade,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "요청 실패");
        return;
      }
      const record: RiskRecord = await res.json();
      setLastResult(record);
      await loadHistory();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-8">
      <div className="w-full max-w-3xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            SafeMoney 내부 데모 — check-risk 테스트
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            시니어/보호자용 실제 화면은 아니고, 백엔드 API(check-risk, user-baseline) 동작을 눈으로 확인하기 위한
            임시 테스트 페이지입니다.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">금액 (amount)</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">userId</span>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="비워두면 콜드스타트 없이 미지정"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">거래 유형 (type)</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="transfer">이체 (transfer)</option>
                <option value="withdrawal">출금 (withdrawal)</option>
                <option value="payment">결제 (payment)</option>
                <option value="product">상품가입 (product)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">상품 위험등급</span>
              <select
                value={productRiskGrade}
                onChange={(e) => setProductRiskGrade(e.target.value as ProductRiskGrade)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="none">해당없음 (none)</option>
                <option value="low">저위험 (low)</option>
                <option value="mid">중위험 (mid)</option>
                <option value="high">고위험 (high)</option>
                <option value="very_high">초고위험 (very_high)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">수취 계좌 (payeeAccount)</span>
              <input
                type="text"
                value={payeeAccount}
                onChange={(e) => setPayeeAccount(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">지역 (region)</span>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">소비 카테고리 (merchantCategory)</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="예: grocery, luxury, crypto (R8용)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>

          {baseline === "loading" && (
            <p className="text-xs text-zinc-400">베이스라인 조회 중...</p>
          )}
          {baseline === null && userId.trim() && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              이 userId는 베이스라인이 없습니다 (콜드스타트).
            </p>
          )}
          {baseline && baseline !== "loading" && (
            <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              베이스라인 — 평균이체 {baseline.avgTransfer.toLocaleString()}원 · 평균출금{" "}
              {baseline.avgWithdrawal.toLocaleString()}원 · 활동시간 {baseline.activeHours[0]}~
              {baseline.activeHours[1]}시 · 알려진 수취인 {baseline.knownPayees.length}개
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {submitting ? "판정 중..." : "check-risk 호출"}
          </button>
        </form>

        {lastResult && (
          <div className={`rounded-xl border p-6 ${riskStyles[lastResult.riskLevel]}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{lastResult.riskLevel}</span>
              <span className="text-xs opacity-70">
                {new Date(lastResult.timestamp).toLocaleString("ko-KR")}
              </span>
            </div>
            <p className="mt-1 text-sm">{lastResult.reason}</p>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              위험 판정 이력 (risk-history)
            </h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-2 font-medium">시각</th>
                  <th className="px-4 py-2 font-medium">userId</th>
                  <th className="px-4 py-2 font-medium">금액</th>
                  <th className="px-4 py-2 font-medium">등급</th>
                  <th className="px-6 py-2 font-medium">사유</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="whitespace-nowrap px-6 py-2 text-zinc-500 dark:text-zinc-400">
                      {new Date(r.timestamp).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{r.userId ?? "-"}</td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {r.amount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${riskStyles[r.riskLevel]}`}
                      >
                        {r.riskLevel}
                      </span>
                    </td>
                    <td className="px-6 py-2 text-zinc-500 dark:text-zinc-400">{r.reason}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-zinc-400">
                      아직 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
