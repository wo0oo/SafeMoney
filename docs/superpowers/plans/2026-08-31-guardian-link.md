# 보호자-피보호자 연동 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시니어(피보호자) 1명에게 보호자 여러 명이 즉시-등록 방식으로 연결될 수 있는 백엔드 API(`app/api/guardian-link`)를 만들고, `check-risk`의 위험 알림 발송이 이 새 연결 정보를 쓰도록 교체한다.

**Architecture:** `lib/db.ts`의 `readJSON`/`writeJSON`(Vercel Blob 기반 flat JSON 파일 저장) 패턴을 그대로 따라 `data/guardian-links.json`을 새 리소스로 추가한다. `lib/userBaseline.ts` + `app/api/user-baseline/route.ts`와 동일한 구조(타입 정의 → CRUD 함수 → Next.js route handler)로 `lib/guardianLink.ts` + `app/api/guardian-link/route.ts`를 만들고, 기존 `UserBaseline.guardianEmail` 단일 필드는 제거해 이 새 리소스로 완전히 이관한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@vercel/blob`(`lib/db.ts` 경유), Resend(`lib/sendGuardianAlert.ts`).

## Global Constraints

- 이 저장소에는 테스트 프레임워크가 설정돼 있지 않다(`package.json`에 test 스크립트 없음, `CLAUDE.md` 명시). 모든 "테스트" 단계는 `npx tsc --noEmit` + `npx eslint .` + 로컬 dev 서버(`npm run dev`, `http://localhost:3000`)에 대한 curl 스모크 테스트로 대체한다.
- 영속화는 `lib/db.ts`의 `readJSON<T>(fileName)` / `writeJSON<T>(fileName, data)`만 사용한다. 다른 저장 방식(로컬 파일 직접 I/O 등)을 새로 만들지 않는다.
- 시각 문자열은 `lib/time.ts`의 `nowKstIso()`로 생성한다(`Date.toISOString()` 직접 사용 금지 — UTC "Z"가 찍혀 KST 벽시계 시간과 어긋난다).
- git 커밋 메시지에 "Co-authored-by: Claude" 트레일러를 추가하지 않는다.
- 커밋 메시지는 이 저장소의 기존 컨벤션(`Feat: ...`, `Fix: ...`, `Docs: ...` 형태의 한글 요약)을 따른다.
- 새로 추가하는 API route(`app/api/guardian-link/route.ts`)는 `app/api/user-baseline/route.ts`의 스타일(수동 필드 검증, `NextResponse.json`, 400/404/409 상태 코드)을 그대로 따른다.

---

### Task 1: `GuardianLink` 데이터 모델 + CRUD

**Files:**
- Create: `lib/guardianLink.ts`
- Create: `data/guardian-links.json`
- Create: `data/guardian-links.example.json`
- Modify: `data/user-baseline.json` (guardianEmail 값을 guardian-links.json으로 이관 후 제거는 Task 3에서)

**Interfaces:**
- Produces: `GuardianLink` 타입, `listAllGuardianLinks(): Promise<GuardianLink[]>`, `listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]>`, `listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]>`, `createGuardianLink(input: { seniorUserId: string; guardianEmail: string; guardianName?: string; relation?: string }): Promise<GuardianLink | null>`(중복이면 null), `deleteGuardianLink(id: string): Promise<boolean>` — 이 함수들을 Task 2(API route)와 Task 4(check-risk)가 그대로 가져다 쓴다.

- [ ] **Step 1: `data/guardian-links.json` / `data/guardian-links.example.json` 생성**

`data/user-baseline.json`에 현재 `u_01`의 `guardianEmail: "ij5943@naver.com"`이 들어있다. 이 값을 새 리소스의 시드 데이터로 옮긴다.

`data/guardian-links.json`:
```json
[
  {
    "id": "seed-guardian-link-u01",
    "seniorUserId": "u_01",
    "guardianEmail": "ij5943@naver.com",
    "createdAt": "2026-08-31T00:00:00+09:00"
  }
]
```

`data/guardian-links.example.json`:
```json
[]
```

- [ ] **Step 2: `lib/guardianLink.ts` 작성**

```ts
import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

// 보호자-피보호자 연결 한 건. 1 시니어 : N 보호자 — 같은 seniorUserId를 가진
// 레코드가 여러 개 있을 수 있는 flat 배열로 저장한다(data/guardian-links.json).
// guardianEmail이 곧 보호자 식별자다 — 보호자 쪽 로그인/계정 시스템이 아직 없다.
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  createdAt: string;
};

export async function listAllGuardianLinks(): Promise<GuardianLink[]> {
  return readJSON<GuardianLink[]>("guardian-links.json");
}

// 시니어 화면(보호자 목록)과 check-risk 알림 발송이 사용.
export async function listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.seniorUserId === seniorUserId);
}

// 보호자 화면(가족/피보호자 목록)이 사용.
export async function listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.guardianEmail === guardianEmail);
}

// seniorUserId + guardianEmail 조합이 이미 있으면 null을 반환한다(중복 연결 방지).
// 승인/대기 절차 없이 즉시 등록되는 게 이 기능의 설계 전제다.
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
}): Promise<GuardianLink | null> {
  const links = await listAllGuardianLinks();
  const exists = links.some(
    (l) => l.seniorUserId === input.seniorUserId && l.guardianEmail === input.guardianEmail
  );
  if (exists) {
    return null;
  }

  const link: GuardianLink = {
    id: crypto.randomUUID(),
    seniorUserId: input.seniorUserId,
    guardianEmail: input.guardianEmail,
    guardianName: input.guardianName,
    relation: input.relation,
    createdAt: nowKstIso(),
  };
  links.push(link);
  await writeJSON("guardian-links.json", links);
  return link;
}

export async function deleteGuardianLink(id: string): Promise<boolean> {
  const links = await listAllGuardianLinks();
  const next = links.filter((l) => l.id !== id);
  if (next.length === links.length) {
    return false;
  }
  await writeJSON("guardian-links.json", next);
  return true;
}
```

- [ ] **Step 3: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음(`lib/guardianLink.ts`는 아직 아무 곳에서도 import되지 않으므로 이 시점엔 unused-export 경고 정도만 있을 수 있고, 이는 무시한다).

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 4: Blob 스토어에 시드 데이터 업로드**

이 저장소는 로컬 개발도 Vercel Blob을 DB로 쓴다(`lib/db.ts`). `data/guardian-links.json`을 만든 것만으로는 Blob 스토어에 파일이 생기지 않는다 — `readJSON`이 최초 호출 시 "Blob store에 guardian-links.json이 없습니다" 에러를 던진다. Task 2에서 route를 만들고 나서, POST 한 번으로 실제 데이터를 Blob에 만드는 것으로 이 초기화를 대신한다(Task 2 Step 4에서 처리).

- [ ] **Step 5: 커밋**

```bash
git add lib/guardianLink.ts data/guardian-links.json data/guardian-links.example.json
git commit -m "Feat: GuardianLink 데이터 모델과 CRUD 함수 추가"
```

---

### Task 2: `app/api/guardian-link` API route

**Files:**
- Create: `app/api/guardian-link/route.ts`

**Interfaces:**
- Consumes: Task 1의 `GuardianLink`, `listGuardiansForSenior`, `listSeniorsForGuardian`, `createGuardianLink`, `deleteGuardianLink` (모두 `@/lib/guardianLink`에서 import).
- Produces: `POST /api/guardian-link`, `GET /api/guardian-link?seniorUserId=`, `GET /api/guardian-link?guardianEmail=`, `DELETE /api/guardian-link?id=` — Task 4(check-risk 알림 발송)가 `listGuardiansForSenior`를 직접 호출하므로 이 route 자체에 대한 의존은 없지만, 이 route의 응답 스키마(`GuardianLink` 그대로 반환)는 이후 프론트엔드 연동의 계약이 된다.

- [ ] **Step 1: route.ts 작성**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  createGuardianLink,
  deleteGuardianLink,
  listGuardiansForSenior,
  listSeniorsForGuardian,
} from "@/lib/guardianLink";

// GET /api/guardian-link?seniorUserId=  → 그 시니어의 보호자 목록
// GET /api/guardian-link?guardianEmail= → 그 보호자가 보는 피보호자(시니어) 목록
// 최소 하나는 필수 — 둘 다 없으면 400.
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (seniorUserId) {
    return NextResponse.json(await listGuardiansForSenior(seniorUserId));
  }

  if (guardianEmail) {
    return NextResponse.json(await listSeniorsForGuardian(guardianEmail));
  }

  return NextResponse.json(
    { error: "seniorUserId 또는 guardianEmail 쿼리 파라미터가 필요합니다." },
    { status: 400 }
  );
}

// POST /api/guardian-link → 연결 즉시 등록 (승인/대기 절차 없음)
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
  });

  if (!link) {
    return NextResponse.json({ error: "이미 등록된 연결입니다." }, { status: 409 });
  }

  return NextResponse.json(link);
}

// DELETE /api/guardian-link?id=
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const deleted = await deleteGuardianLink(id);
  if (!deleted) {
    return NextResponse.json({ error: "해당 id의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 3: dev 서버 실행**

이미 실행 중이 아니면: `npm run dev` (백그라운드, `http://localhost:3000`).

- [ ] **Step 4: curl 스모크 테스트 — 정상 흐름**

시드 데이터(`u_01` ↔ `ij5943@naver.com`)를 실제로 Blob에 밀어넣기 위해, 그리고 새 보호자 한 명을 더 추가하기 위해 POST 두 번:

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"ij5943@naver.com","guardianName":"시드","relation":"자녀"}'
```
Expected: `{"id":"...","seniorUserId":"u_01","guardianEmail":"ij5943@naver.com","guardianName":"시드","relation":"자녀","createdAt":"..."}`

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"guardian-test-2@example.com","guardianName":"테스트2","relation":"배우자"}'
```
Expected: 위와 같은 형태의 새 레코드, 다른 `id`/`guardianEmail`.

```bash
curl -s "http://localhost:3000/api/guardian-link?seniorUserId=u_01"
```
Expected: 방금 만든 2건이 배열로 반환됨.

```bash
curl -s "http://localhost:3000/api/guardian-link?guardianEmail=guardian-test-2@example.com"
```
Expected: `u_01` 1건만 담긴 배열.

- [ ] **Step 5: curl 스모크 테스트 — 에러 케이스**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"guardian-test-2@example.com"}'
```
Expected: `409` (Step 4에서 만든 것과 동일한 조합 재요청).

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/guardian-link
```
Expected: `400` (쿼리 파라미터 둘 다 없음).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "http://localhost:3000/api/guardian-link?id=존재하지-않는-id"
```
Expected: `404`.

- [ ] **Step 6: 테스트 데이터 정리**

Step 4에서 추가한 `guardian-test-2@example.com` 연결을 삭제한다(Step 4 응답의 `id` 값을 사용):

```bash
curl -s -X DELETE "http://localhost:3000/api/guardian-link?id=<위에서-받은-id>"
```
Expected: `{"ok":true}`

`ij5943@naver.com` 시드 연결은 이후 Task 4 테스트에서 계속 쓰이므로 남겨둔다.

- [ ] **Step 7: 커밋**

```bash
git add app/api/guardian-link/route.ts
git commit -m "Feat: 보호자-피보호자 연결 API (POST/GET/DELETE) 추가"
```

---

### Task 3: `UserBaseline.guardianEmail` 필드 제거

**Files:**
- Modify: `lib/userBaseline.ts:16` (필드 정의 삭제)
- Modify: `app/api/user-baseline/route.ts:44` (매핑 삭제)
- Modify: `data/user-baseline.json` (필드 값 삭제 — Task 1에서 이미 `guardian-links.json`으로 이관했으므로 안전)

**Interfaces:**
- Consumes: 없음(독립적인 정리 작업).
- Produces: `UserBaseline` 타입에 더 이상 `guardianEmail`이 없다는 사실 — Task 4가 `baseline?.guardianEmail` 참조를 지울 때 이 타입 변경에 의존한다.

- [ ] **Step 1: `lib/userBaseline.ts`에서 필드 제거**

`lib/userBaseline.ts:6-17`의 `UserBaseline` 타입에서 아래 줄을 삭제:
```ts
  guardianEmail?: string; // 위험 알림 이메일 수신자. 보호자 동의/등록 화면이 아직 없어 임시로 baseline에 둠 — 화면 나오면 그쪽 데이터로 옮길 예정
```

- [ ] **Step 2: `app/api/user-baseline/route.ts`에서 매핑 제거**

`app/api/user-baseline/route.ts:44`의 아래 줄을 삭제(직전 줄 `usualRegion: ...,`은 그대로 유지):
```ts
    guardianEmail: typeof body.guardianEmail === "string" ? body.guardianEmail : undefined,
```

- [ ] **Step 3: `data/user-baseline.json`에서 필드 값 제거**

`data/user-baseline.json`의 `u_01` 레코드에서 `"guardianEmail": "ij5943@naver.com",` 줄을 삭제(Task 1 Step 1에서 이미 `data/guardian-links.json` 시드로 옮겨뒀다).

- [ ] **Step 4: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`app/api/check-risk/route.ts:109,132`가 아직 `baseline?.guardianEmail`을 참조하므로, Task 4를 먼저 하지 않고 이 Step만 단독으로 실행하면 `Property 'guardianEmail' does not exist on type 'UserBaseline'` 컴파일 에러가 난다 — 정상. Task 4에서 그 참조를 제거하면 해소된다. 이 Task 3을 Task 4보다 먼저 커밋하려면, Step 4는 건너뛰고 Task 4 완료 후 한 번에 타입체크한다.)

- [ ] **Step 5: 커밋은 Task 4와 함께**

이 Task는 Task 4(check-risk 배선 교체)와 커밋을 분리하면 중간 상태에서 빌드가 깨지므로, 두 Task의 변경을 한 커밋으로 묶는다. 여기서는 파일만 수정해두고, 커밋은 Task 4 Step의 커밋 단계에서 함께 진행한다.

---

### Task 4: `check-risk`가 새 연결 정보로 보호자 알림 발송

**Files:**
- Modify: `app/api/check-risk/route.ts:1-10` (import 추가)
- Modify: `app/api/check-risk/route.ts:106-136` (알림 발송 블록 교체)

**Interfaces:**
- Consumes: Task 1의 `listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]>` (`@/lib/guardianLink>`), Task 3에서 타입이 바뀐 `UserBaseline`(더 이상 `guardianEmail` 없음), 기존 `sendGuardianAlertEmail(params: { to: string; subject: string; body: string }): Promise<void>`(`@/lib/sendGuardianAlert`, 시그니처 불변).
- Produces: 없음(이 기능의 마지막 배선 지점).

- [ ] **Step 1: import 추가**

`app/api/check-risk/route.ts:3` 아래에 추가:
```ts
import { listGuardiansForSenior } from "@/lib/guardianLink";
```

- [ ] **Step 2: 알림 발송 블록 교체**

`app/api/check-risk/route.ts:106-136`을 아래로 교체. 핵심 변경: `baseline?.guardianEmail` 단일 체크를 `listGuardiansForSenior(body.userId)` 조회로 바꾸고, 여러 보호자 각각에게 개별 발송(반복문)한다. `userId`가 없는 요청(콜드스타트 이전 익명 요청)은 연결을 조회할 대상이 없으므로 그대로 스킵한다.

```ts
  // guardianAlert(실제 모델) 또는 riskLevel=High(콜드스타트 더미 판정 fallback)일 때만 발송.
  // 이메일 발송 실패가 check-risk 응답 자체를 막으면 안 되므로 별도로 감싸서 실패를 삼킵니다.
  const shouldAlertGuardian = judgement.guardianAlert ?? riskLevel === "High";
  const guardianLinks = shouldAlertGuardian && body.userId ? await listGuardiansForSenior(body.userId) : [];

  if (guardianLinks.length > 0) {
    let subject = `[SafeMoney] ${riskLevel} 위험 거래 감지`;
    let emailBody = [
      `${amount.toLocaleString("ko-KR")}원 거래에서 ${riskLevel} 등급 위험이 감지됐습니다.`,
      "",
      `사유: ${reason}`,
      `거래 시각: ${timestamp}`,
    ].join("\n");

    // reason과 동일하게, ruleHits가 있을 때만(콜드스타트가 아닐 때만) Gemini로 이메일
    // 콘텐츠를 생성한다. 실패 시 위에서 만든 규칙 기반 문구를 그대로 보낸다.
    if (judgement.ruleHits) {
      const aiInputs = buildAiInputs(recordId, transaction, { ...judgement, ruleHits: judgement.ruleHits });
      try {
        const email = await generateGuardianEmail(aiInputs.transaction, aiInputs.result);
        subject = email.subject;
        emailBody = email.body;
      } catch (error) {
        console.error("[check-risk] Gemini 보호자 이메일 생성 실패 — 규칙 기반 문구로 대체", error);
      }
    }

    // 보호자가 여러 명일 수 있어(1 시니어 : N 보호자) 한 번에 여러 명을 to에 넣지 않고
    // 개별 발송한다 — 보호자끼리 서로의 이메일이 노출되지 않게 하기 위해서다.
    // 한 명 발송 실패가 다른 보호자에게 가는 발송을 막으면 안 되므로 각자 개별적으로 감싼다.
    for (const link of guardianLinks) {
      try {
        await sendGuardianAlertEmail({ to: link.guardianEmail, subject, body: emailBody });
      } catch (error) {
        console.error(`[check-risk] 보호자(${link.guardianEmail}) 알림 메일 발송 실패`, error);
      }
    }
  }
```

- [ ] **Step 3: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음 — Task 3에서 발생했던 `guardianEmail does not exist` 에러가 여기서 해소된다.

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 4: curl 스모크 테스트 — 보호자 1명 (기존 시드)**

dev 서버가 실행 중이어야 한다(Task 2 Step 3). `u_01`은 Task 1 시드 + Task 2 Step 4에서 `ij5943@naver.com` 연결이 이미 Blob에 있다.

```bash
curl -s -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount":3000000,"userId":"u_01","type":"transfer","payeeAccount":"999-***-9999"}'
```
Expected: 응답 JSON의 `riskLevel`이 `"High"`(u_01 baseline 대비 고액 + 신규 수취인). 서버 콘솔에 `sendGuardianAlertEmail` 실패 로그(`[check-risk] 보호자(...) 알림 메일 발송 실패`)가 찍히지 않으면 실제 발송 성공, 찍히면 `RESEND_API_KEY` 미설정 등 원인을 확인한다(이 스텝의 목적은 "보호자 목록을 정상적으로 조회해서 발송을 시도했는지" 확인이므로, Resend 자체의 실패는 이 Task의 범위 밖이다).

- [ ] **Step 5: curl 스모크 테스트 — 보호자 2명 (신규 시나리오)**

`u_01`에 보호자를 하나 더 연결한 뒤 다시 위험 거래를 발생시켜, 두 보호자 모두에게 개별 발송 로그(에러 없음 = 발송 시도)가 찍히는지 확인한다.

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"guardian-smoke-test@example.com","guardianName":"스모크테스트"}'
```
Expected: 새 `GuardianLink` 반환 (`id` 기억해두기).

```bash
curl -s -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount":3000000,"userId":"u_01","type":"transfer","payeeAccount":"999-***-8888"}'
```
Expected: `riskLevel: "High"`. 서버 콘솔에 발송 실패 로그가 있다면 `ij5943@naver.com`, `guardian-smoke-test@example.com` 두 주소 모두에 대해 각각 한 번씩(2번) 시도 로그/부재를 확인 — 한 명만 시도되고 나머지가 스킵되면 반복문 로직 버그다.

- [ ] **Step 6: curl 스모크 테스트 — userId 없는 요청은 조회 자체를 스킵**

```bash
curl -s -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount":5000000}'
```
Expected: 200 응답 정상 반환, 서버 콘솔에 `listGuardiansForSenior` 관련 에러 없음(userId가 없으므로 `guardianLinks`가 빈 배열로 남고 발송 자체를 시도하지 않는다).

- [ ] **Step 7: 테스트 데이터 정리**

```bash
curl -s -X DELETE "http://localhost:3000/api/guardian-link?id=<Step 5에서 받은 id>"
```
Expected: `{"ok":true}` — Step 5에서 추가한 `guardian-smoke-test@example.com` 연결만 제거하고, 시드(`ij5943@naver.com`)는 남긴다.

- [ ] **Step 8: 전체 회귀 확인**

기존 High/Medium/Low 시나리오가 이 변경으로 깨지지 않았는지 최종 확인:

```bash
curl -s -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount":15000,"userId":"u_01","type":"payment","merchantCategory":"grocery"}'
```
Expected: `riskLevel: "Low"`, 알림 발송 관련 로그 없음(guardianLinks 조회는 하지만 `shouldAlertGuardian`이 false라 애초에 `listGuardiansForSenior` 호출 자체를 안 함).

- [ ] **Step 9: Task 3 + Task 4 통합 커밋**

```bash
git add lib/userBaseline.ts app/api/user-baseline/route.ts data/user-baseline.json app/api/check-risk/route.ts
git commit -m "Feat: check-risk 보호자 알림을 GuardianLink 기반 다중 발송으로 교체"
```

---

## Self-Review 결과

- **스펙 커버리지:** 데이터 모델(Task 1) / API 4종(Task 2) / 기존 필드 마이그레이션(Task 3) / check-risk 배선 교체(Task 4) / 개별 발송으로 프라이버시 보호(Task 4 Step 2) / 테스트 계획(각 Task의 curl 스텝) 모두 스펙 각 섹션과 1:1로 대응됨. 스펙의 "범위 밖" 항목(보호자 로그인, 초대 코드, 프론트 UI)은 이 계획에 포함하지 않음 — 의도된 누락.
- **플레이스홀더 스캔:** 없음 — 모든 코드 블록이 실제로 실행 가능한 전체 내용.
- **타입 일관성 확인:** `GuardianLink`(Task 1) → `listGuardiansForSenior`/`createGuardianLink` 시그니처(Task 1) → `app/api/guardian-link/route.ts`(Task 2)와 `app/api/check-risk/route.ts`(Task 4)에서의 사용이 모두 동일한 이름·타입으로 일치함을 확인.
