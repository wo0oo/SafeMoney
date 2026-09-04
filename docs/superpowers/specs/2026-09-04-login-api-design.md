# 로그인/회원가입 API 설계

## 배경

`lib/client-identity.ts`가 `CURRENT_SENIOR_USER_ID`/`CURRENT_GUARDIAN_EMAIL`을 하드코딩("인증 API가 생기기 전까지" 임시로 명시)하고 있고, `app/login/elder`, `app/login/guardian`, `app/signup/guardian`, `app/signup/protected` 화면은 UI만 있고 실제 로그인/회원가입 API 연동이 없다. PR #16(프론트 UI + GuardianLink 연동)이 `dev`에 머지된 지금, 이 하드코딩을 실제 계정/세션으로 교체한다.

프로젝트에 아직 별도 DB나 인증 라이브러리가 없다. 기존 `lib/guardianLink.ts`, `lib/userBaseline.ts`와 동일하게 `lib/db.ts`의 `readJSON`/`writeJSON`(Vercel Blob 기반) 위에 얹어서 구현한다.

## 데이터 모델

새 리소스 `data/users.json` + `lib/users.ts`.

```ts
export type User = {
  id: string;            // crypto.randomUUID()
  username: string;      // 로그인 아이디, 전체 유니크
  passwordHash: string;  // bcrypt
  name: string;
  email: string;
  role: "senior" | "guardian";
  createdAt: string;
};
```

역할별로 기존 스키마에 연결되는 방식이 다르다:

- **피보호자(senior)**: `username`이 곧 `RiskRecord.userId` / `GuardianLink.seniorUserId`로 쓰인다. 기존 시드 데이터(`u_01` 등)는 그대로 두고, 새 가입자는 본인이 정한 아이디를 그대로 쓴다(형식 강제 없음 — 지금도 `userId`는 자유 문자열).
- **보호자(guardian)**: `email` 필드가 곧 `GuardianLink.guardianEmail`로 쓰인다. `username`은 로그인 전용 식별자로 별개다.

`username` 중복은 role 구분 없이 전체에서 막는다(같은 아이디로 시니어/보호자 둘 다 가입하는 경우를 방지).

비밀번호는 bcrypt로 해시해서 저장한다. `bcryptjs` 의존성을 추가한다(순수 JS 구현이라 서버리스 환경에서 네이티브 빌드 문제가 없다).

## 세션

새 리소스 `data/sessions.json` + `lib/session.ts`.

```ts
export type Session = {
  token: string;    // crypto.randomUUID()
  userId: string;   // User.id
  createdAt: string;
};
```

로그인/회원가입 성공 시 세션 레코드를 만들고 `token`을 httpOnly 쿠키(`safemoney_session`)로 내려준다. `Secure`, `SameSite=Lax`, `maxAge` 30일. 로그아웃 시 쿠키 삭제 + 세션 레코드 삭제.

세션 만료(30일 경과) 레코드에 대한 별도 정리(GC) 배치는 두지 않는다 — `sessions.json`이 무한정 쌓이는 문제는 이번 스펙의 범위 밖이다.

## API

`app/api/auth/` 아래에 라우트를 신설한다. 기존 `app/api/guardian-link/route.ts`와 같은 스타일(수동 필드 검증, `NextResponse.json`)로 작성한다.

- `POST /api/auth/signup` — body `{ username, password, name, email, role }`. `username` 중복 시 409, 필드 누락/`role` 값 오류 시 400. bcrypt 해시 후 `User` 생성, 곧바로 세션 발급 + 쿠키 설정까지 처리한다(가입 후 별도 로그인 단계 없이 화면 진입).
- `POST /api/auth/login` — body `{ username, password, role }`. `role`을 같이 받는 이유: `/login/elder`·`/login/guardian`이 URL로 이미 역할을 구분하므로, 아이디는 맞지만 다른 역할 화면으로 들어온 경우(예: 보호자 계정으로 피보호자 로그인 화면에 입력)를 걸러낸다. 계정 없음/비밀번호 불일치/역할 불일치 모두 401(계정 존재 여부를 노출하지 않기 위해 에러 메시지를 통일한다).
- `POST /api/auth/logout` — 쿠키의 세션 토큰으로 세션 레코드 삭제, 쿠키 제거.
- `GET /api/auth/me` — 쿠키의 세션 토큰으로 현재 로그인 사용자 조회. `{ id, username, name, email, role }` 반환(`passwordHash` 제외). 세션 없음/만료 시 401.

## 클라이언트 연동

- `lib/client-api.ts`에 `signup`, `login`, `logout`, `getMe` 추가.
- `lib/client-identity.ts`의 하드코딩 상수를 제거하고, `getMe()` 결과를 쓰는 방식으로 교체한다. 이 값을 쓰던 `connection-form.tsx`, `notification-toggle.tsx`, `guardian-records.tsx`, `app/elder/guardian/page.tsx`, `app/guardian/family/page.tsx` 등도 함께 고친다.
- `components/auth-pages.tsx`의 `LoginPage`/`SignupForm`을 실제 API 호출로 바꾼다. 실패 시 `connection-form.tsx`가 이미 쓰는 인라인 에러 메시지 패턴을 그대로 따른다. 로그인/가입 성공 시 각각 `/elder` 또는 `/guardian`으로 리다이렉트.
- `AppShell`/`GuardianShell` 최상단에서 `getMe()` 실패(401) 시 해당 역할의 로그인 페이지로 리다이렉트하는 가드를 추가해, 비로그인 상태로 내부 화면에 못 들어가게 막는다.

## 에러 처리

`readJSON`이 blob 미존재 시 throw하는 기존 패턴과 동일하게, `users.json`/`sessions.json` 초기 빈 배열 파일을 미리 만들어둔다. 검증 에러는 기존 라우트들과 동일하게 400/401/409 + `{ error }` 바디로 통일한다.

## 테스트

`tsc --noEmit`/`eslint` 통과 확인 후, 로컬 서버에 curl로 실제 라우트 스모크 테스트:

1. `POST /api/auth/signup`(role: senior)로 가입 → 응답 쿠키에 `safemoney_session` 있는지 확인 → `GET /api/auth/me`로 본인 정보 조회.
2. 같은 `username`으로 재가입 시도 → 409 확인.
3. `POST /api/auth/login`(role: guardian)로 존재하지 않는 계정/틀린 비밀번호/역할 불일치 각각 시도 → 모두 401, 메시지 동일한지 확인.
4. `POST /api/auth/logout` 후 `GET /api/auth/me` → 401 확인.
5. 새로 가입한 시니어 계정의 `username`으로 `connection-form.tsx` 플로우(보호자 연결) → `guardian-link`/`check-risk`가 그 `username`을 `seniorUserId`로 정상 인식하는지 확인.

## 범위 밖

- `check-risk`/`guardian-link` 라우트에 세션 기반 인가(요청자가 실제로 그 사람인지 검증)를 추가하는 작업. 지금처럼 파라미터를 그대로 신뢰하는 수준을 유지하며, 필요해지면 별도 후속 이슈로 다룬다.
- 아이디 찾기/비밀번호 찾기, 비밀번호 재설정, 이메일 인증. UI의 관련 링크는 비활성 placeholder로 남긴다.
- 세션 만료 레코드 정리(GC).
