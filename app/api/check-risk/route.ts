import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";
import { getUserBaseline } from "@/lib/userBaseline";
import { findGuardianLink, listGuardiansForSenior } from "@/lib/guardianLink";
import { getTodayTransactions } from "@/lib/riskHistory";
import { judgeRisk, TransactionInput, RiskRecord, RiskJudgement } from "@/lib/riskEngine";
import { nowKstIso } from "@/lib/time";
import { sendGuardianAlertEmail } from "@/lib/sendGuardianAlert";
import { generateReason, ReasonInput } from "@/lib/generateReason";
import { generateGuardianEmail, GuardianEmailInput } from "@/lib/generateGuardianEmail";
import { Transaction as ModelTransaction } from "@/model/types";

// ruleHits가 있을 때만(콜드스타트 더미 판정이 아닐 때만) 채워지는, judgement로부터
// model/generateReason·generateGuardianEmail이 요구하는 입력을 만든다. judgeRisk()가
// ruleHits를 채우는 건 userId/type/baseline이 모두 있을 때뿐이므로(lib/riskEngine.ts),
// 이 시점엔 transaction.userId/type이 항상 정의되어 있다고 안전하게 가정할 수 있다.
function buildAiInputs(
  id: string,
  transaction: TransactionInput,
  judgement: RiskJudgement & Required<Pick<RiskJudgement, "ruleHits">>
): { transaction: ModelTransaction; result: ReasonInput & GuardianEmailInput } {
  return {
    transaction: {
      id,
      userId: transaction.userId!,
      type: transaction.type!,
      amount: transaction.amount,
      timestamp: transaction.timestamp,
      payeeAccount: transaction.payeeAccount,
      merchantCategory: transaction.merchantCategory,
      productRiskGrade: transaction.productRiskGrade,
    },
    result: {
      riskLevel: judgement.riskLevel,
      ruleHits: judgement.ruleHits,
      comboHits: judgement.comboHits ?? [],
      guardianAlert: judgement.guardianAlert ?? false,
      holdRecommended: judgement.holdRecommended ?? false,
    },
  };
}

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
  const judgement = judgeRisk(transaction, baseline, recentTransactions);
  const { riskLevel, triggeredRules } = judgement;
  const recordId = crypto.randomUUID();

  // Gemini가 판정을 재계산하지 않고 ruleHits/comboHits 근거만 인용해 고령자 친화 문장으로
  // 풀어쓰도록 되어 있음(SafeMoney Reason 프롬프트 검증 리포트 참고). ruleHits가 없으면
  // (콜드스타트 더미 판정) Gemini에 넘길 근거가 없으므로 규칙 기반 문구를 그대로 쓴다.
  // 호출 실패 시에도 check-risk 응답 자체가 막히면 안 되므로 규칙 기반 reason으로 대체한다.
  let reason = judgement.reason;
  if (judgement.ruleHits) {
    const aiInputs = buildAiInputs(recordId, transaction, { ...judgement, ruleHits: judgement.ruleHits });
    try {
      reason = await generateReason(aiInputs.transaction, aiInputs.result);
    } catch (error) {
      console.error("[check-risk] Gemini reason 생성 실패 — 규칙 기반 reason으로 대체", error);
    }
  }

  const record: RiskRecord = {
    id: recordId,
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

  // guardianAlert(실제 모델) 또는 riskLevel=High(콜드스타트 더미 판정 fallback)일 때만 발송.
  // 이메일 발송 실패가 check-risk 응답 자체를 막으면 안 되므로 별도로 감싸서 실패를 삼킵니다.
  const shouldAlertGuardian = judgement.guardianAlert ?? riskLevel === "High";
  let guardianLinks: Awaited<ReturnType<typeof listGuardiansForSenior>> = [];
  if (shouldAlertGuardian && body.userId) {
    try {
      guardianLinks = await listGuardiansForSenior(body.userId);
    } catch (error) {
      console.error("[check-risk] 보호자 연결 조회 실패 — 알림 발송을 건너뜁니다", error);
    }
  }

  // alertEnabled가 명시적으로 false인 보호자는 발송 대상에서 제외한다(미지정/true면 발송).
  const alertRecipients = guardianLinks.filter((link) => link.alertEnabled !== false);

  if (alertRecipients.length > 0) {
    let subject = `[SafeMoney] ${riskLevel} 위험 거래 감지`;
    let emailBody = [
      `${amount.toLocaleString("ko-KR")}원 거래에서 ${riskLevel} 등급 위험이 감지됐습니다.`,
      "",
      `사유: ${reason}`,
      `거래 시각: ${timestamp}`,
    ].join("\n");

    // reason과 동일하게, ruleHits가 있을 때만(콜드스타트가 아닐 때만) Gemini로 이메일
    // 콘텐츠를 생성한다. 실패 시 위에서 만든 규칙 기반 문구를 그대로 보낸다.
    if (judgement.ruleHits) {
      const aiInputs = buildAiInputs(recordId, transaction, { ...judgement, ruleHits: judgement.ruleHits });
      try {
        const email = await generateGuardianEmail(aiInputs.transaction, aiInputs.result);
        subject = email.subject;
        emailBody = email.body;
      } catch (error) {
        console.error("[check-risk] Gemini 보호자 이메일 생성 실패 — 규칙 기반 문구로 대체", error);
      }
    }

    // 보호자가 여러 명일 수 있어(1 시니어 : N 보호자) 한 번에 여러 명을 to에 넣지 않고
    // 개별 발송한다 — 보호자끼리 서로의 이메일이 노출되지 않게 하기 위해서다.
    // 한 명 발송 실패가 다른 보호자에게 가는 발송을 막으면 안 되므로 각자 개별적으로 감싼다.
    for (const link of alertRecipients) {
      try {
        await sendGuardianAlertEmail({ to: link.guardianEmail, subject, body: emailBody });
      } catch (error) {
        console.error(`[check-risk] 보호자(${link.guardianEmail}) 알림 메일 발송 실패`, error);
      }
    }
  }

  return NextResponse.json(record);
}

// GET /api/check-risk                                → 전체 이력 조회(파라미터 없음, 기존 동작 하위호환)
// GET /api/check-risk?seniorUserId=                   → 그 시니어 이력만 필터링(별도 인증 없음 — 시니어 본인 조회용)
// GET /api/check-risk?seniorUserId=&guardianEmail=     → 그 조합이 GuardianLink로 연결돼 있어야 함(아니면 403)
// GET /api/check-risk?guardianEmail= (seniorUserId 없이) → 400
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId")?.trim() || null;
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail")?.trim() || null;

  if (!seniorUserId && guardianEmail) {
    return NextResponse.json(
      { error: "guardianEmail은 seniorUserId와 함께 사용해야 합니다." },
      { status: 400 }
    );
  }

  const history = await readJSON<RiskRecord[]>("risk-history.json");

  // 주의: 아래 무파라미터 분기는 의도적으로 미인증 상태다 — seniorUserId 없이 호출되면
  // 아래의 guardianEmail(seniorUserId+guardianEmail 조합) 접근 제어를 전혀 거치지 않고
  // 모든 시니어의 전체 이력을 그대로 반환한다. app/demo/page.tsx(내부 테스트용 데모 페이지)가
  // 파라미터 없이 이 엔드포인트를 호출하는 기존 동작과의 하위호환을 위해 남겨둔 것으로,
  // 이 함수 안의 guardianEmail 403 체크가 엔드포인트 전체를 보호한다고 착각하면 안 된다 —
  // 이 분기는 그 체크와 별개로 완전히 열려 있는 경로다. app/demo/page.tsx(또는 다른 호출부)가
  // 항상 seniorUserId를 보내도록 수정되면, 이 무파라미터 분기는 제거하거나
  // (예: 프로덕션 환경에서는 막는 등) 제한해야 한다.
  if (!seniorUserId) {
    return NextResponse.json(history);
  }

  if (guardianEmail) {
    const link = await findGuardianLink(seniorUserId, guardianEmail);
    if (!link) {
      return NextResponse.json(
        { error: "이 시니어의 위험 이력을 조회할 권한이 없습니다." },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(history.filter((record) => record.userId === seniorUserId));
}
