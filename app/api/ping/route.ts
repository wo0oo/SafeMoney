import { NextResponse } from "next/server";

// 배포/헬스체크용 liveness 확인 엔드포인트. 인증·DB 접근 없이 즉시 응답합니다.
export async function GET() {
  return NextResponse.json({ ok: true, message: "pong" });
}
