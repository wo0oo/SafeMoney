// ============================================================
// Gemini 기반 reason 문자열 생성 (전병윤 담당 파트)
// model/judgeRisk.ts가 계산한 JudgeResult(riskLevel·ruleHits·comboHits·
// guardianAlert·holdRecommended)를 입력받아, 고령자 친화 reason 문장을
// Gemini에게 "설명만" 맡긴다. riskLevel 재계산·자체 위험 판단은 절대 하지 않음.
// 검증 내역: Notion "SafeMoney Reason 프롬프트 검증 리포트" (A~F 6개 시나리오
// × 3회 반복 회귀 테스트, 3차까지 통과) 참고.
//
// 필요 환경변수:
//   GEMINI_API_KEY       - 필수. Google AI Studio에서 발급.
//   GEMINI_REASON_MODEL  - 선택. 기본값 "gemini-3.6-flash" (테스트 시 사용한 모델).
//                          해당 모델을 계정에서 사용할 수 없다면 반드시 재설정할 것.
// ============================================================

import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, JudgeResult } from "@/model/types";
import { REASON_SYSTEM_PROMPT } from "@/lib/prompts/reasonSystemPrompt";

/**
 * 이 함수가 실제로 필요로 하는 필드만 뽑은 타입. 전체 JudgeResult(score 포함)를
 * 강제하지 않아서, score 없이 ruleHits/comboHits/guardianAlert/holdRecommended만
 * 채워주는 호출부(lib/riskEngine.ts 등)에서도 그대로 넘길 수 있다.
 */
export type ReasonInput = Pick<
  JudgeResult,
  "riskLevel" | "ruleHits" | "comboHits" | "guardianAlert" | "holdRecommended"
>;

const MODEL = process.env.GEMINI_REASON_MODEL ?? "gemini-3.6-flash";

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

/** 프롬프트 문서 2절 입력 스키마와 동일한 페이로드로 변환. score는 스키마에 없으므로 보내지 않는다. */
function buildPayload(transaction: Transaction, result: ReasonInput) {
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

function parseReason(text: string): string {
  const parsed = JSON.parse(text);
  if (typeof parsed.reason !== "string" || !parsed.reason.trim()) {
    throw new Error("Gemini 응답에 유효한 reason 필드가 없습니다.");
  }
  return parsed.reason.trim();
}

/** 1차 테스트에서 실제로 관측된 실패 모드(마크다운 코드블록 래핑)에 대한 방어적 폴백. */
function unwrapCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * JudgeResult(+ 원본 거래 정보)를 고령자 친화 reason 문장으로 변환한다.
 * riskLevel/ruleHits/comboHits는 그대로 인용만 하고, Gemini는 문장 생성만 담당한다.
 */
export async function generateReason(
  transaction: Transaction,
  result: ReasonInput
): Promise<string> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: JSON.stringify(buildPayload(transaction, result)),
    config: {
      systemInstruction: REASON_SYSTEM_PROMPT,
      temperature: 1.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { reason: { type: Type.STRING } },
        required: ["reason"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  try {
    return parseReason(text);
  } catch {
    return parseReason(unwrapCodeFence(text));
  }
}
