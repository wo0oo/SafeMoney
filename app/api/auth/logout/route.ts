import { NextRequest, NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE_NAME } from "@/lib/session";

// POST /api/auth/logout → 쿠키의 세션 토큰으로 세션 레코드 삭제, 쿠키 제거
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await deleteSession(token);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
