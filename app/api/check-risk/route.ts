import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";
import { getUserBaseline } from "@/lib/userBaseline";
import { getTodayTransactions } from "@/lib/riskHistory";
import { judgeRisk, TransactionInput, RiskRecord } from "@/lib/riskEngine";

// userId/type/merchantCategory/payeeAccount/region/productRiskGrade는 태현님(데이터/AI) 탐지 규칙(R1~R8)이
// 필요로 하는 거래 필드. judgeRisk()가 실제 로직으로 바뀌기 전까지는 값만 받아서
// 기록에 같이 저장해두고, 판정 자체는 아직 amount 더미 규칙만 사용합니다.
// POST /api/check-risk → 거래 하나를 판정하고 위험 이력(risk-history.json)에 기록
export async function POST(request: NextRequest) {
  const body = await request.json();
  const amount = Number(body.amount);

  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount는 숫자여야 합니다." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const transaction: TransactionInput = {
    amount,
    userId: body.userId,
    type: body.type,
    merchantCategory: body.merchantCategory,
    payeeAccount: body.payeeAccount,
    region: body.region,
    productRiskGrade: body.productRiskGrade,
    timestamp,
  };

  // userId가 없으면(콜드스타트 처리 대상과 별개로, 아예 안 보낸 경우) 베이스라인/이력 조회를 건너뜁니다.
  const baseline = body.userId ? await getUserBaseline(body.userId) : null;
  const recentTransactions = body.userId ? await getTodayTransactions(body.userId, timestamp) : [];
  const { riskLevel, reason, triggeredRules } = judgeRisk(transaction, baseline, recentTransactions);

  const record: RiskRecord = {
    id: crypto.randomUUID(),
    amount,
    userId: body.userId,
    type: body.type,
    merchantCategory: body.merchantCategory,
    payeeAccount: body.payeeAccount,
    region: body.region,
    productRiskGrade: body.productRiskGrade,
    riskLevel,
    reason,
    triggeredRules,
    timestamp,
  };

  const history = await readJSON<RiskRecord[]>("risk-history.json");
  history.push(record);
  await writeJSON("risk-history.json", history);

  return NextResponse.json(record);
}

// GET /api/check-risk → 전체 위험 판정 이력 조회
export async function GET() {
  const history = await readJSON<RiskRecord[]>("risk-history.json");
  return NextResponse.json(history);
}
