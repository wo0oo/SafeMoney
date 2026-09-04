import { NextRequest, NextResponse } from "next/server";
import { findSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { findUserById, toPublicUser } from "@/lib/users";

// GET /api/auth/me → 쿠키의 세션 토큰으로 현재 로그인 사용자 조회
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const session = await findSession(token);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(toPublicUser(user));
}
