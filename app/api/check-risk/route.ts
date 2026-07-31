import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";

type RiskRecord = {
  id: string; // 레코드 고유 ID
  amount: number; // 거래 금액
  riskLevel: "Low" | "Medium" | "High";
  reason: string; // 위험 판정 사유 (지금은 더미 문자열 하나)
  timestamp: string;
};

// 실제로는 4번(데이터/AI)이 만드는 탐지 로직을 이 자리에서 호출하게 됩니다.
// 지금은 금액 기준으로만 판정하는 더미 규칙입니다.
function judgeRisk(amount: number): { riskLevel: RiskRecord["riskLevel"]; reason: string } {
  if (amount >= 3000000) {
    return { riskLevel: "High", reason: "평소보다 지나치게 큰 금액의 거래입니다." };
  }
  if (amount >= 500000) {
    return { riskLevel: "Medium", reason: "평소보다 다소 큰 금액의 거래입니다." };
  }
  return { riskLevel: "Low", reason: "평소 소비 패턴과 유사합니다." };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const amount = Number(body.amount);

  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount는 숫자여야 합니다." }, { status: 400 });
  }

  const { riskLevel, reason } = judgeRisk(amount);

  const record: RiskRecord = {
    id: crypto.randomUUID(),
    amount,
    riskLevel,
    reason,
    timestamp: new Date().toISOString(),
  };

  const history = await readJSON<RiskRecord[]>("risk-history.json");
  history.push(record);
  await writeJSON("risk-history.json", history);

  return NextResponse.json(record);
}

export async function GET() {
  const history = await readJSON<RiskRecord[]>("risk-history.json");
  return NextResponse.json(history);
}
