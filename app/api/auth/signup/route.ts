import { NextRequest, NextResponse } from "next/server";
import { createUser, toPublicUser } from "@/lib/users";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

// POST /api/auth/signup → 계정 생성 + 즉시 로그인(세션 발급 + 쿠키 설정)
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.username !== "string" || body.username.trim() === "") {
    return NextResponse.json({ error: "아이디는 필수입니다." }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "이름은 필수입니다." }, { status: 400 });
  }
  if (typeof body.email !== "string" || !body.email.includes("@")) {
    return NextResponse.json({ error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (body.role !== "senior" && body.role !== "guardian") {
    return NextResponse.json({ error: "role은 senior 또는 guardian이어야 합니다." }, { status: 400 });
  }

  const user = await createUser({
    username: body.username,
    password: body.password,
    name: body.name,
    email: body.email,
    role: body.role,
  });

  if (!user) {
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
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
