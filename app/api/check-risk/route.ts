import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";
import { getUserBaseline } from "@/lib/userBaseline";
import { getTodayTransactions } from "@/lib/riskHistory";
import { judgeRisk, TransactionInput, RiskRecord } from "@/lib/riskEngine";
import { nowKstIso } from "@/lib/time";
import { sendGuardianAlertEmail } from "@/lib/sendGuardianAlert";
import { findGuardianLink, listGuardiansForSenior } from "@/lib/guardianLink";

// userId/type/merchantCategory/payeeAccount/region/productRiskGrade는 태현님(데이터/AI) 탐지 규칙(R1~R7)이
// 필요로 하는 거래 필드. userId/type/baseline이 모두 있으면 judgeRisk()가 실제 탐지 모델
// (model/judgeRisk.ts)을 호출하고, 그렇지 않으면(콜드스타트) amount 더미 규칙으로 판정합니다.
// POST /api/check-risk → 거래 하나를 판정하고 위험 이력(risk-history.json)에 기록
export async function POST(request: NextRequest) {
  const body = await request.json();
  const amount = Number(body.amount);

  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount는 숫자여야 합니다." }, { status: 400 });
  }

  const timestamp = nowKstIso();
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

  // riskLevel=High(콤보 C1~C3 포함, judgeRisk가 항상 High로 반환하기로 확인됨)일 때만 발송.
  // 이메일 발송 실패가 check-risk 응답 자체를 막으면 안 되므로 별도로 감싸서 실패를 삼킵니다.
  if (riskLevel === "High" && body.userId) {
    let guardians: Awaited<ReturnType<typeof listGuardiansForSenior>> = [];
    try {
      guardians = await listGuardiansForSenior(body.userId);
    } catch (error) {
      console.error("[check-risk] 보호자 연결 조회 실패", error);
    }

    for (const guardian of guardians.filter((link) => link.alertEnabled !== false)) {
      try {
        await sendGuardianAlertEmail({
          to: guardian.guardianEmail,
          riskLevel,
          amount,
          reason,
          timestamp,
        });
      } catch (error) {
        console.error(`[check-risk] 보호자(${guardian.guardianEmail}) 알림 메일 발송 실패`, error);
      }
    }
  }

  return NextResponse.json(record);
}

// GET /api/check-risk → 전체 위험 판정 이력 조회
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId")?.trim() || null;
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail")?.trim() || null;

  if (!seniorUserId && guardianEmail) {
    return NextResponse.json(
      { error: "guardianEmail은 seniorUserId와 함께 사용해야 합니다." },
      { status: 400 },
    );
  }

  const history = await readJSON<RiskRecord[]>("risk-history.json");
  if (!seniorUserId) return NextResponse.json(history);

  if (guardianEmail && !await findGuardianLink(seniorUserId, guardianEmail)) {
    return NextResponse.json(
      { error: "이 시니어의 위험 이력을 조회할 권한이 없습니다." },
      { status: 403 },
    );
  }

  return NextResponse.json(history.filter((record) => record.userId === seniorUserId));
}
