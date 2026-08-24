import { Resend } from "resend";
import { RiskLevel } from "@/lib/riskEngine";

// riskLevel=High 거래 발생 시 보호자에게 보내는 알림 메일.
// Resend 클라이언트는 호출 시점에 생성합니다 — 모듈 로드 시점(top-level)에 생성하면
// RESEND_API_KEY가 없는 빌드/환경에서 import만으로도 에러가 납니다.
// 본문은 지금은 규칙 기반 reason을 그대로 씀 — 병윤님의 Gemini 보호자 안내문 생성(title/message)이
// 붙으면 이 자리 문구를 그쪽 결과로 교체할 예정 (@전병윤).
export async function sendGuardianAlertEmail(params: {
  to: string;
  riskLevel: RiskLevel;
  amount: number;
  reason: string;
  timestamp: string;
}): Promise<void> {
  const { to, riskLevel, amount, reason, timestamp } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "SafeMoney <onboarding@resend.dev>",
    to,
    subject: `[SafeMoney] ${riskLevel} 위험 거래 감지`,
    text: [
      `${amount.toLocaleString("ko-KR")}원 거래에서 ${riskLevel} 등급 위험이 감지됐습니다.`,
      "",
      `사유: ${reason}`,
      `거래 시각: ${timestamp}`,
    ].join("\n"),
  });
}
