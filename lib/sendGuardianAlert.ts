import { Resend } from "resend";

// riskLevel=High 거래 발생 시 보호자에게 보내는 알림 메일.
// Resend 클라이언트는 호출 시점에 생성합니다 — 모듈 로드 시점(top-level)에 생성하면
// RESEND_API_KEY가 없는 빌드/환경에서 import만으로도 에러가 납니다.
// subject/body는 호출부(app/api/check-risk/route.ts)에서 결정합니다 — 병윤님의
// generateGuardianEmail()이 만든 결과를 그대로 넘기고, 실패 시에는 규칙 기반 문구로
// 대체하는 판단도 호출부 책임입니다. 이 함수는 "무엇을 보내는지"는 모른 채 발송만 합니다.
export async function sendGuardianAlertEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { to, subject, body } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "SafeMoney <onboarding@resend.dev>",
    to,
    subject,
    text: body,
  });
}
