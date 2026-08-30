// ============================================================
// Gemini 기반 보호자 이메일 subject/body 생성 (전병윤 담당 파트)
// model/judgeRisk.ts가 계산한 JudgeResult 중 guardianAlert=true인 거래에 대해
// 보호자에게 자동 발송할 이메일 콘텐츠를 생성한다. lib/generateReason.ts와
// 동일한 구조(구조화 출력으로 스키마 강제)를 재사용한다.
// 검증 내역: Notion "SafeMoney 보호자 알림 메시지 프롬프트" — B/C/F × 3회 = 9회,
// {subject, body} 스키마 9/9 준수 확인.
//
// 필요 환경변수:
//   GEMINI_API_KEY               - 필수. lib/generateReason.ts와 공유.
//   GEMINI_GUARDIAN_EMAIL_MODEL  - 선택. 기본값 "gemini-3.6-flash".
// ============================================================

import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, JudgeResult } from "@/model/types";
import { GUARDIAN_EMAIL_SYSTEM_PROMPT } from "@/lib/prompts/guardianEmailPrompt";

/** lib/generateReason.ts의 ReasonInput과 동일한 이유로 score를 뺀 부분 타입. */
export type GuardianEmailInput = Pick<
  JudgeResult,
  "riskLevel" | "ruleHits" | "comboHits" | "guardianAlert" | "holdRecommended"
>;

const MODEL = process.env.GEMINI_GUARDIAN_EMAIL_MODEL ?? "gemini-3.6-flash";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    }
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/** 프롬프트 입력 스키마와 동일한 페이로드로 변환. score는 스키마에 없으므로 보내지 않는다. */
function buildPayload(transaction: Transaction, result: GuardianEmailInput) {
  return {
    transaction: {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      timestamp: transaction.timestamp,
      payeeAccount: transaction.payeeAccount ?? null,
      merchantCategory: transaction.merchantCategory ?? null,
      productRiskGrade: transaction.productRiskGrade ?? null,
    },
    riskResult: {
      riskLevel: result.riskLevel,
      ruleHits: result.ruleHits.map(({ id, name, reason }) => ({ id, name, reason })),
      comboHits: result.comboHits.map(({ id, reason }) => ({ id, reason })),
      guardianAlert: result.guardianAlert,
      holdRecommended: result.holdRecommended,
    },
  };
}

export interface GuardianEmailContent {
  subject: string;
  body: string;
}

function parseEmailContent(text: string): GuardianEmailContent {
  const parsed = JSON.parse(text);
  if (typeof parsed.subject !== "string" || !parsed.subject.trim()) {
    throw new Error("Gemini 응답에 유효한 subject 필드가 없습니다.");
  }
  if (typeof parsed.body !== "string" || !parsed.body.trim()) {
    throw new Error("Gemini 응답에 유효한 body 필드가 없습니다.");
  }
  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}

/** 1차 테스트에서 관측된 실패 모드(마크다운 코드블록 래핑)에 대한 방어적 폴백. */
function unwrapCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * JudgeResult(+ 원본 거래 정보)를 보호자용 이메일 subject/body로 변환한다.
 * guardianAlert=true인 경우에만 호출한다는 전제로 설계되었다.
 */
export async function generateGuardianEmail(
  transaction: Transaction,
  result: GuardianEmailInput
): Promise<GuardianEmailContent> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: JSON.stringify(buildPayload(transaction, result)),
    config: {
      systemInstruction: GUARDIAN_EMAIL_SYSTEM_PROMPT,
      temperature: 1.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          body: { type: Type.STRING },
        },
        required: ["subject", "body"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  try {
    return parseEmailContent(text);
  } catch {
    return parseEmailContent(unwrapCodeFence(text));
  }
}
