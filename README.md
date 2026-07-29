# SafeMoney Senior

AI 기반 고령층 금융 안전관리 플랫폼. 팀 역할 분담은 `safemoney_역할분담.md`, 태스크는 노션 보드 참고.

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

## 새 API 만드는 법

1. `app/api/<이름>/route.ts` 파일 생성
2. `GET`, `POST` 등 HTTP 메서드 이름으로 함수 export
3. DB에 읽고 쓸 게 있으면 `lib/db.ts`의 `readJSON` / `writeJSON` 사용 (사용 전 `data/`에 빈 배열 `[]`을 담은 json 파일 하나 만들어두기)

```ts
import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/db";

export async function GET() {
  const items = await readJSON<MyType[]>("my-file.json");
  return NextResponse.json(items);
}
```

## 협업 규칙 (1↔2, 2↔4 인터페이스)

- 화면에서 새 API가 필요하면, 프론트엔드 담당과 요청/응답 JSON 형태를 먼저 맞추고 나서 구현합니다.
- 위험도 판정 스키마(`riskLevel`, `reason` 등 필드명)는 데이터/AI 담당이 정한 형태를 그대로 따릅니다. 임의로 필드명을 바꾸지 않습니다.
- 이메일 발송 트리거 기준(몇 단계 위험도부터 보낼지)은 탐지 로직 담당과 사전 합의 후 구현합니다.

## 배포

Vercel 배포는 아직 연결 전. GitHub 레포 생성 후 진행 예정.

## 참고

- 알려진 이슈: `npx create-next-app`으로 새로 스캐폴딩하면 `AGENTS.md`, `CLAUDE.md` 파일이 자동 생성됨 (Next.js 16 공식 배포판 기본 동작으로 확인됨). AI 코딩 도구에게 `node_modules` 내부 문서를 읽으라고 유도하는 내용이라 이 프로젝트에서는 삭제하고 사용 중.
