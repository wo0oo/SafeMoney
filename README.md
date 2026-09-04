# SafeMoney Senior

AI 기반 고령층 금융 안전관리 플랫폼. 태스크는 노션 보드 참고.

## 실행하기

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속. `app/page.tsx`를 고치면 화면이 바로 반영됩니다.

## 폴더 구조

```
safemoney/
  app/
    page.tsx, layout.tsx     화면 (프론트엔드 담당)
    api/
      ping/route.ts          동작 확인용 예제 API
      check-risk/route.ts    위험 판정 API (백엔드 담당)
  lib/
    db.ts                    JSON 파일 읽기/쓰기 유틸
  data/
    risk-history.json        위험 이력 저장소 (JSON DB)
```

## API

### `GET /api/ping`
서버가 살아있는지 확인용. `{ ok: true, message: "pong" }` 반환.

### `POST /api/check-risk`
거래 금액을 받아 위험도를 판정하고 이력에 저장합니다.

요청:
```json
{ "amount": 3500000 }
```

응답:
```json
{
  "id": "uuid",
  "amount": 3500000,
  "riskLevel": "High",
  "reason": "평소보다 지나치게 큰 금액의 거래입니다.",
  "timestamp": "2026-07-29T07:45:21.588Z"
}
```

`riskLevel`은 `Low` / `Medium` / `High` 중 하나. 판정 기준은 `app/api/check-risk/route.ts`의 `judgeRisk` 함수 — 지금은 금액 기준 더미 규칙이고, 데이터/AI 담당(고태현)이 만드는 실제 탐지 로직으로 나중에 교체됩니다.

### `GET /api/check-risk`
지금까지 쌓인 위험 이력 전체를 배열로 반환.

### 터미널에서 테스트하는 법
```bash
curl -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount": 3500000}'
```

### `POST /api/auth/signup` / `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me`

계정(시니어/보호자) 회원가입·로그인·로그아웃과 현재 로그인 사용자 조회. `signup`/`login` 성공 시 httpOnly 쿠키(`safemoney_session`, 30일)로 세션을 내려줍니다. 시니어 계정의 `username`이 곧 `RiskRecord.userId`/`GuardianLink.seniorUserId`, 보호자 계정의 `email`이 곧 `GuardianLink.guardianEmail`로 쓰입니다(둘 다 다른 라우트가 참조하는 실질 식별자이므로 임의로 바꾸면 안 됩니다). 요청/응답 형태와 검증 규칙은 `app/api/auth/*/route.ts` 참고.

## 새 API 만드는 법

1. `app/api/<이름>/route.ts` 파일 생성
2. `GET`, `POST` 등 HTTP 메서드 이름으로 함수 export
3. DB에 읽고 쓸 게 있으면 `lib/db.ts`의 `readJSON` / `writeJSON` 사용 (사용 전 `data/`에 빈 배열 `[]`을 담은 json 파일 하나 만들어두기)

> `data/*.json`은 로컬 실행 중 계속 바뀌는 런타임 데이터라 `.gitignore`에서 제외됩니다. 새 리소스를 추가할 땐 `data/<이름>.example.json`(빈 배열 `[]`)을 템플릿으로 커밋해두면, 다른 팀원이 clone 후 `<이름>.example.json`을 복사해서 `<이름>.json`으로 로컬에 만들어 쓸 수 있습니다.

```ts
import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";

export async function GET() {
  const items = await readJSON<MyType[]>("my-file.json");
  return NextResponse.json(items);
}
```

## 레포 세팅 관련

브랜치 전략 / 보호 규칙 / PR 워크플로우(CONTRIBUTING.md 참고)는 기본적으로 먼저 세팅해뒀습니다.
다들 보고 괜찮은지, 바꾸고 싶은 부분 있으면 편하게 얘기해주세요 — 아직 확정이 아니라 제안입니다.

## 협업 규칙 (1↔2, 2↔4 인터페이스)

- 화면에서 새 API가 필요하면, 프론트엔드 담당과 요청/응답 JSON 형태를 먼저 맞추고 나서 구현합니다.
- 위험도 판정 스키마(`riskLevel`, `reason` 등 필드명)는 데이터/AI 담당이 정한 형태를 그대로 따릅니다. 임의로 필드명을 바꾸지 않습니다.
- 이메일 발송 트리거 기준(몇 단계 위험도부터 보낼지)은 탐지 로직 담당과 사전 합의 후 구현합니다.

## 환경변수

`lib/generateReason.ts`(시니어용 reason 생성), `lib/generateGuardianEmail.ts`(보호자 이메일 생성)를 사용하려면 아래 환경변수가 필요합니다. 로컬은 `.env.local`(git 추적 제외)에 설정하고, 배포 환경은 Vercel 프로젝트 설정의 Environment Variables에 동일하게 등록하세요.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 필수 | Google AI Studio에서 발급한 Gemini API 키. 두 함수가 공유 |
| `GEMINI_REASON_MODEL` | 선택 | reason 생성에 쓸 모델명. 기본값 `gemini-3.6-flash`(회귀 테스트에 사용한 모델). 계정에서 사용 불가능하면 재설정 필요 |
| `GEMINI_GUARDIAN_EMAIL_MODEL` | 선택 | 보호자 이메일 생성에 쓸 모델명. 기본값 `gemini-3.6-flash`. 리즌용과 다른 모델을 쓰고 싶을 때만 설정 |

## 배포

Vercel 배포 연결 완료 (https://safemoney-gamma.vercel.app, 프로젝트 `wo0oos-projects/safemoney`). GitHub 레포에 push하면 자동 배포됩니다.

> 참고: `data/*.json` 기반 JSON DB는 Vercel 배포 환경에서 쓰기가 안 됩니다 (`data/risk-history.json`이 `.gitignore` 대상이라 배포 번들에 없고, 서버리스 함수는 파일시스템이 읽기 전용이라 `writeJSON`이 동작 안 함). 그 결과 배포 환경에서 `POST /api/check-risk`는 500 에러를 냅니다. `GET /api/ping`처럼 파일 I/O 없는 라우트는 정상 동작하며, 로컬 개발(`npm run dev`)은 영향 없습니다. 실제 저장이 필요해지는 4주차(이메일 발송 연동, 보호자 대시보드)에 실 DB(Vercel Blob/KV/Postgres 등)로 교체할지 결정 예정.
>
> `guardian-links.json`도 다른 Blob 기반 JSON 리소스와 마찬가지로, 해당 환경(로컬/Preview/Production)의 Blob 스토어에 한 번도 쓰기가 일어나지 않으면 파일이 존재하지 않습니다. 새 환경에서는 `POST /api/guardian-link`를 한 번 호출해 초기화하기 전까지 `GET`/`DELETE /api/guardian-link`가 실패합니다.
>
> `users.json`/`sessions.json`(로그인/회원가입용)은 `guardian-links.json`과 달리 별도 초기화가 필요 없습니다 — 그 환경에서 첫 `POST /api/auth/signup`이 성공하는 순간 자동으로 생성됩니다.
>
> **계정은 환경(Blob 스토어)마다 완전히 분리됩니다.** Preview에서 가입한 계정으로 Production에 로그인할 수 없고, 반대도 마찬가지입니다. 배포/데모 전에 그 환경에서 새로 회원가입을 해야 합니다.
>
> **로그인 붙기 전에 테스트용으로 쌓아둔 위험 이력/보호자 연결(시니어 `u_01`, 보호자 `ij5943@naver.com` 등)은 이제 로그인 없이는 화면에서 안 보입니다.** 그 전까지는 `lib/client-identity.ts`가 이 값을 하드코딩해서 항상 보여줬는데, 그 파일은 이번에 삭제됐습니다. 각 환경의 Blob 스토어에 남아있는 데이터 자체는 그대로지만, 화면에서 다시 보려면 시니어는 `username`을 정확히 `u_01`로, 보호자는 `email`을 정확히 `ij5943@naver.com`으로 실제 회원가입해야 연결됩니다.

## 참고

- 알려진 이슈: `npx create-next-app`으로 새로 스캐폴딩하면 `AGENTS.md`, `CLAUDE.md` 파일이 자동 생성됨 (Next.js 16 공식 배포판 기본 동작으로 확인됨). AI 코딩 도구에게 `node_modules` 내부 문서를 읽으라고 유도하는 내용이라 이 프로젝트에서는 삭제하고 사용 중.
