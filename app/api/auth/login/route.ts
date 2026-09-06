import { NextRequest, NextResponse } from "next/server";
import { findUserByUsername, verifyPassword, toPublicUser } from "@/lib/users";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

// POST /api/auth/login → body { username, password, role }
// role을 같이 받는 이유: /login/elder·/login/guardian이 URL로 이미 역할을 구분하므로,
// 아이디는 맞지만 다른 역할 화면으로 들어온 경우(보호자 계정으로 시니어 로그인 화면 등)를 걸러낸다.
// 계정 없음/비밀번호 불일치/역할 불일치를 구분하지 않고 전부 동일한 401 메시지로 응답한다
// (계정 존재 여부가 에러 메시지로 노출되지 않게 하기 위함).
const INVALID_CREDENTIALS = { error: "아이디 또는 비밀번호가 올바르지 않습니다." };

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (
    typeof body.username !== "string" ||
    body.username.trim() === "" ||
    typeof body.password !== "string" ||
    (body.role !== "senior" && body.role !== "guardian")
  ) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const user = await findUserByUsername(body.username);
  if (!user || user.role !== body.role || !(await verifyPassword(user, body.password))) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json(toPublicUser(user));
  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
