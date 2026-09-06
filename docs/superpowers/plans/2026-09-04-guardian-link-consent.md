# 보호자-피보호자 연결 승인(동의관리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보호자가 시니어를 추가하는 방향(`kind="protected"`)의 `GuardianLink` 생성에 시니어 승인 절차를 넣어, 승인 전까지는 그 보호자가 시니어의 거래 이력/알림에 접근할 수 없게 만든다.

**Architecture:** `GuardianLink`에 `status?: "pending" | "approved"` 필드를 추가하고, 이미 여러 화면/라우트가 재사용 중인 조회 함수 3개(`listGuardiansForSenior`/`listSeniorsForGuardian`/`findGuardianLink`)를 승인된 것만 반환하도록 바꿔서, 그 함수들을 쓰는 기존 코드는 전혀 건드리지 않고 "미승인 보호자는 접근 불가"를 적용한다. 승인 대기 목록/승인/거부는 새 엔드포인트 파라미터 + 시니어 화면의 새 섹션 하나로 처리한다.

**Tech Stack:** Next.js 16 App Router (Route Handlers), TypeScript, 기존 `lib/db.ts`(Vercel Blob JSON) 패턴.

## Global Constraints

- 시니어가 보호자를 추가하는 방향(`kind="guardian"`, `initiatedBy: "senior"`)은 승인 절차 없이 기존처럼 즉시 확정한다 — 변경 금지.
- `status` 필드가 없는 기존 레코드는 전부 승인됨으로 취급한다(`status !== "pending"` = 승인). 마이그레이션 스크립트를 만들지 않는다.
- `listGuardiansForSenior`/`listSeniorsForGuardian`/`findGuardianLink`를 사용하는 기존 파일(`app/api/check-risk/route.ts`, `components/guardian-records.tsx`, `components/notification-toggle.tsx`, `app/guardian/page.tsx`, `app/guardian/family/page.tsx`)은 이번 계획에서 수정하지 않는다 — 데이터 레이어 필터링만으로 보호돼야 한다.
- 거부는 별도 엔드포인트를 만들지 않고 기존 `DELETE /api/guardian-link`를 재사용한다.
- 보호자 쪽 "내 요청 대기 중" 목록 화면, 알림 배지, 승인 취소는 범위 밖이다.
- 참고 스펙: `docs/superpowers/specs/2026-09-04-guardian-link-consent-design.md`

---

### Task 1: 데이터 레이어 + API — 승인 상태 도입

**Files:**
- Modify: `lib/guardianLink.ts`
- Modify: `app/api/guardian-link/route.ts`

**Interfaces:**
- Consumes: `readJSON`/`writeJSON`(`@/lib/db`), `nowKstIso`(`@/lib/time`) — 기존, 시그니처 변경 없음.
- Produces:
  - `lib/guardianLink.ts`: `GuardianLink.status?: "pending" | "approved"`, `listGuardiansForSenior(seniorUserId): Promise<GuardianLink[]>`(승인된 것만, 시그니처 불변), `listSeniorsForGuardian(guardianEmail): Promise<GuardianLink[]>`(승인된 것만, 시그니처 불변), `findGuardianLink(seniorUserId, guardianEmail): Promise<GuardianLink | null>`(승인된 것만, 시그니처 불변), `createGuardianLink(input: { ...기존, status: "pending" | "approved" }): Promise<GuardianLink | null>`(새 필수 필드 `status` 추가), `listPendingRequestsForSenior(seniorUserId): Promise<GuardianLink[]>`(신규), `approveGuardianLink(seniorUserId, guardianEmail): Promise<GuardianLink | null>`(신규).
  - `app/api/guardian-link/route.ts`: `POST` body에 `initiatedBy: "senior" | "guardian"` 필수, `GET ?seniorUserId=&status=pending` 신규 분기, `PATCH` body에 `approve: true`(선택) 처리 — Task 2(클라이언트)가 그대로 호출.

- [ ] **Step 1: `lib/guardianLink.ts` 전체를 아래 내용으로 교체**

```ts
import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

// 보호자-피보호자 연결 한 건. 1 시니어 : N 보호자 — 같은 seniorUserId를 가진
// 레코드가 여러 개 있을 수 있는 flat 배열로 저장한다(data/guardian-links.json).
// guardianEmail이 곧 보호자 식별자다.
//
// status: 보호자가 시니어를 추가한 경우("initiatedBy: guardian")는 "pending"으로
// 생성되고 시니어가 승인해야 "approved"로 바뀐다. 시니어가 보호자를 추가한 경우는
// 승인 절차 없이 바로 "approved"로 생성된다. 필드가 없는 레거시 레코드는 전부
// approved로 취급한다(status !== "pending" 이면 승인된 것으로 본다) — 마이그레이션 불필요.
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status?: "pending" | "approved";
  createdAt: string;
};

export async function listAllGuardianLinks(): Promise<GuardianLink[]> {
  return readJSON<GuardianLink[]>("guardian-links.json");
}

// 시니어 화면(보호자 목록)과 check-risk 알림 발송이 사용. 승인된 연결만 반환한다 —
// 미승인 보호자에게는 알림이 가면 안 되고, 시니어의 "등록된 보호자" 화면에도
// 보이면 안 된다(대기 요청은 별도로 listPendingRequestsForSenior가 담당).
export async function listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.seniorUserId === seniorUserId && l.status !== "pending");
}

// 보호자 화면(가족/피보호자 목록)이 사용. 승인된 연결만 반환한다 — 보호자가 아직
// 승인 안 된 시니어의 거래 이력을 보게 되는 걸 막는 핵심 지점 중 하나.
export async function listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.guardianEmail === guardianEmail && l.status !== "pending");
}

// 그 시니어에게 온, 아직 승인 안 한 요청 목록. 시니어의 "보호자 설정" 화면 전용.
export async function listPendingRequestsForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  const normalizedSeniorUserId = seniorUserId.trim();
  return links.filter((l) => l.seniorUserId === normalizedSeniorUserId && l.status === "pending");
}

// seniorUserId + guardianEmail 조합이 이미 있으면(승인 여부 무관) null을 반환한다
// (중복 연결/중복 요청 방지). status는 호출자가 명시한다 — initiatedBy가 senior면
// "approved", guardian이면 "pending"으로 라우트가 정해서 넘긴다.
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status: "pending" | "approved";
}): Promise<GuardianLink | null> {
  const seniorUserId = input.seniorUserId.trim();
  const guardianEmail = input.guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const exists = links.some(
    (l) => l.seniorUserId === seniorUserId && l.guardianEmail === guardianEmail
  );
  if (exists) {
    return null;
  }

  const link: GuardianLink = {
    id: crypto.randomUUID(),
    seniorUserId,
    guardianEmail,
    guardianName: input.guardianName,
    relation: input.relation,
    alertEnabled: input.alertEnabled ?? true,
    status: input.status,
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

// id 단독 대신 seniorUserId + guardianEmail 조합으로 삭제한다 — id는 GET으로 노출되므로
// id만 알면 누구나 삭제할 수 있는 것을 막기 위함(그 시니어-보호자 조합을 이미 아는 사람만 삭제 가능).
// 대기 중 요청 거부와 승인된 연결 해제 양쪽에 재사용한다(승인 여부 상관없이 그 조합을 지운다).
export async function deleteGuardianLinkByPair(
  seniorUserId: string,
  guardianEmail: string
): Promise<boolean> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const next = links.filter(
    (l) => !(l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail)
  );
  if (next.length === links.length) {
    return false;
  }
  await writeJSON("guardian-links.json", next);
  return true;
}

// seniorUserId + guardianEmail 조합으로 "승인된" 연결 하나를 찾는다. check-risk GET의
// 접근 검증이 사용 — 대기 중인(미승인) 보호자는 이 함수로 찾히지 않으므로 자동으로
// 403 처리된다.
export async function findGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  return (
    links.find(
      (l) =>
        l.seniorUserId === normalizedSeniorUserId &&
        l.guardianEmail === normalizedGuardianEmail &&
        l.status !== "pending"
    ) ?? null
  );
}

// 특정 연결의 alertEnabled만 갱신한다(승인 여부 무관하게 그 조합을 찾아 갱신 —
// 실제로는 승인된 연결에서만 화면에 토글이 노출되므로 대기 중 레코드가 여기로
// 들어올 일은 없다). 대상이 없으면 null.
export async function updateGuardianLinkAlert(
  seniorUserId: string,
  guardianEmail: string,
  alertEnabled: boolean
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const index = links.findIndex(
    (l) => l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail
  );
  if (index === -1) {
    return null;
  }

  links[index] = { ...links[index], alertEnabled };
  await writeJSON("guardian-links.json", links);
  return links[index];
}

// 대기 중인 요청을 승인한다. status가 "pending"인 레코드만 대상으로 하고(이미
// approved거나 존재하지 않으면 null), 승인되면 status를 "approved"로 바꾼다.
export async function approveGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const index = links.findIndex(
    (l) =>
      l.seniorUserId === normalizedSeniorUserId &&
      l.guardianEmail === normalizedGuardianEmail &&
      l.status === "pending"
  );
  if (index === -1) {
    return null;
  }

  links[index] = { ...links[index], status: "approved" };
  await writeJSON("guardian-links.json", links);
  return links[index];
}
```

- [ ] **Step 2: `app/api/guardian-link/route.ts` 전체를 아래 내용으로 교체**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  approveGuardianLink,
  createGuardianLink,
  deleteGuardianLinkByPair,
  listGuardiansForSenior,
  listPendingRequestsForSenior,
  listSeniorsForGuardian,
  updateGuardianLinkAlert,
} from "@/lib/guardianLink";

// GET /api/guardian-link?seniorUserId=                  → 그 시니어의 승인된 보호자 목록
// GET /api/guardian-link?seniorUserId=&status=pending    → 그 시니어에게 온 대기 중 요청 목록
// GET /api/guardian-link?guardianEmail=                 → 그 보호자가 보는 승인된 피보호자(시니어) 목록
// 최소 하나는 필수 — 둘 다 없으면 400.
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");
  const status = request.nextUrl.searchParams.get("status");

  if (seniorUserId && status === "pending") {
    return NextResponse.json(await listPendingRequestsForSenior(seniorUserId));
  }

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

// POST /api/guardian-link → 연결(또는 승인 요청) 등록
// initiatedBy: "senior"면 즉시 승인(approved), "guardian"이면 대기(pending) 상태로 생성.
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (!body.guardianEmail.trim().includes("@")) {
    return NextResponse.json({ error: "guardianEmail 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (body.alertEnabled !== undefined && typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 boolean이어야 합니다." }, { status: 400 });
  }
  if (body.initiatedBy !== "senior" && body.initiatedBy !== "guardian") {
    return NextResponse.json({ error: "initiatedBy는 senior 또는 guardian이어야 합니다." }, { status: 400 });
  }

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
    alertEnabled: typeof body.alertEnabled === "boolean" ? body.alertEnabled : undefined,
    status: body.initiatedBy === "senior" ? "approved" : "pending",
  });

  if (!link) {
    return NextResponse.json({ error: "이미 등록됐거나 요청을 보낸 연결입니다." }, { status: 409 });
  }

  return NextResponse.json(link);
}

// DELETE /api/guardian-link?seniorUserId=&guardianEmail=
// id 단독이 아니라 조합을 요구한다 — GET으로 id가 노출되므로 id만으로는 삭제할 수 없게 하기 위함.
// 대기 중 요청 거부와 승인된 연결 해제 양쪽에 재사용한다.
export async function DELETE(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (!seniorUserId) {
    return NextResponse.json({ error: "seniorUserId 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!guardianEmail) {
    return NextResponse.json({ error: "guardianEmail 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const deleted = await deleteGuardianLinkByPair(seniorUserId, guardianEmail);
  if (!deleted) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/guardian-link → alertEnabled 변경 또는(대기 중 요청) 승인
// body: { seniorUserId, guardianEmail, alertEnabled?, approve? } — alertEnabled/approve 중
// 최소 하나는 있어야 한다. approve: true가 있으면 승인 처리를 먼저 한다.
export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (body.approve !== undefined && body.approve !== true) {
    return NextResponse.json({ error: "approve는 true여야 합니다." }, { status: 400 });
  }
  if (body.alertEnabled !== undefined && typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 boolean이어야 합니다." }, { status: 400 });
  }
  if (body.approve === undefined && body.alertEnabled === undefined) {
    return NextResponse.json({ error: "approve 또는 alertEnabled 중 하나는 필요합니다." }, { status: 400 });
  }

  if (body.approve === true) {
    const approved = await approveGuardianLink(body.seniorUserId, body.guardianEmail);
    if (!approved) {
      return NextResponse.json({ error: "대기 중인 해당 조합의 요청이 없습니다." }, { status: 404 });
    }
    return NextResponse.json(approved);
  }

  const updated = await updateGuardianLinkAlert(body.seniorUserId, body.guardianEmail, body.alertEnabled);
  if (!updated) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json(updated);
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 4: 수동 스모크 테스트**

다른 터미널에서 `npm run dev`(이 워크트리는 Turbopack 이슈가 있으면 `npm run build && npm run start`) 실행 중이어야 함. 먼저 테스트용 시니어/보호자 계정을 만든다:

```bash
curl -s -c /tmp/gc-senior.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"gc_test_senior","password":"testpass123","name":"동의테스트시니어","email":"gc.senior@example.com","role":"senior"}'

curl -s -c /tmp/gc-guardian.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"gc_test_guardian","password":"testpass123","name":"동의테스트보호자","email":"gc.guardian@example.com","role":"guardian"}'
```

보호자가 시니어를 추가(대기 상태로 생성되는지 확인):

```bash
curl -i -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"gc_test_senior","guardianEmail":"gc.guardian@example.com","initiatedBy":"guardian"}'
```

Expected: `HTTP/1.1 200`, 응답 바디에 `"status":"pending"`.

승인 전 조회가 막히는지 확인(check-risk GET 403):

```bash
curl -i "http://localhost:3000/api/check-risk?seniorUserId=gc_test_senior&guardianEmail=gc.guardian@example.com"
```

Expected: `HTTP/1.1 403`.

시니어가 대기 목록을 확인:

```bash
curl -s "http://localhost:3000/api/guardian-link?seniorUserId=gc_test_senior&status=pending"
```

Expected: 방금 만든 요청이 배열에 하나 보임(`status: "pending"`).

승인 처리:

```bash
curl -i -X PATCH http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"gc_test_senior","guardianEmail":"gc.guardian@example.com","approve":true}'
```

Expected: `HTTP/1.1 200`, 응답 바디에 `"status":"approved"`.

승인 후 대기 목록에서 빠지고, check-risk GET이 열리는지 확인:

```bash
curl -s "http://localhost:3000/api/guardian-link?seniorUserId=gc_test_senior&status=pending"
curl -i "http://localhost:3000/api/check-risk?seniorUserId=gc_test_senior&guardianEmail=gc.guardian@example.com"
```

Expected: 첫 번째는 빈 배열 `[]`, 두 번째는 `HTTP/1.1 200`.

거부(=DELETE) 확인용으로 두 번째 보호자 계정을 만들어 대기 요청 후 지워본다:

```bash
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"gc_test_guardian_2","password":"testpass123","name":"동의테스트보호자2","email":"gc.guardian2@example.com","role":"guardian"}'

curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"gc_test_senior","guardianEmail":"gc.guardian2@example.com","initiatedBy":"guardian"}'

curl -i -X DELETE "http://localhost:3000/api/guardian-link?seniorUserId=gc_test_senior&guardianEmail=gc.guardian2@example.com"

curl -s "http://localhost:3000/api/guardian-link?seniorUserId=gc_test_senior&status=pending"
```

Expected: DELETE는 `HTTP/1.1 200`, 마지막 조회는 `[]`(거부된 요청이 목록에서 빠짐).

마지막으로 시니어가 보호자를 추가하는 기존 흐름이 여전히 즉시 승인되는지 회귀 확인:

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"gc_test_senior","guardianEmail":"gc.guardian3@example.com","guardianName":"gc.guardian3","initiatedBy":"senior"}'
```

Expected: 응답에 `"status":"approved"`.

- [ ] **Step 5: 커밋**

```bash
git add lib/guardianLink.ts app/api/guardian-link/route.ts
git commit -m "Feat: 보호자-시니어 연결에 승인 절차 추가 (GuardianLink status)"
```

---

### Task 2: 클라이언트 타입 + API 함수

**Files:**
- Modify: `lib/client-types.ts`
- Modify: `lib/client-api.ts`

**Interfaces:**
- Consumes: Task 1의 `POST /api/guardian-link`(`initiatedBy` 필드), `GET /api/guardian-link?seniorUserId=&status=pending`, `PATCH /api/guardian-link`(`approve` 필드).
- Produces: `GuardianLink.status?: "pending" | "approved"`, `CreateGuardianLinkRequest.initiatedBy: "senior" | "guardian"`(`@/lib/client-types`), `getPendingGuardianRequests(seniorUserId: string): Promise<GuardianLink[]>`, `approveGuardianLink(seniorUserId: string, guardianEmail: string): Promise<GuardianLink>`(`@/lib/client-api`) — Task 3, 4가 그대로 사용. 기존 `createGuardianLink(input: CreateGuardianLinkRequest)`는 시그니처 변경 없음(타입에 필드가 추가됐을 뿐).

- [ ] **Step 1: `lib/client-types.ts`의 `GuardianLink`/`CreateGuardianLinkRequest` 수정**

`export type GuardianLink = { ... };` 블록을 아래로 교체:

```ts
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status?: "pending" | "approved";
  createdAt: string;
};
```

`export type CreateGuardianLinkRequest = { ... };` 블록을 아래로 교체:

```ts
export type CreateGuardianLinkRequest = {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  initiatedBy: "senior" | "guardian";
};
```

- [ ] **Step 2: `lib/client-api.ts`에 함수 추가**

`getSeniorsForGuardian` 함수 뒤(또는 `updateGuardianAlert` 앞)에 아래 두 함수를 추가:

```ts
export async function getPendingGuardianRequests(seniorUserId: string): Promise<GuardianLink[]> {
  return readResponse<GuardianLink[]>(await fetch(
    `/api/guardian-link?seniorUserId=${encodeURIComponent(seniorUserId)}&status=pending`,
    { cache: "no-store" },
  ));
}

export async function approveGuardianLink(seniorUserId: string, guardianEmail: string): Promise<GuardianLink> {
  return readResponse<GuardianLink>(await fetch("/api/guardian-link", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seniorUserId, guardianEmail, approve: true }),
  }));
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음(`createGuardianLink` 호출부가 `initiatedBy`를 안 넘기고 있다면 여기서 타입 에러가 나는 게 정상 — Task 3에서 고친다).

- [ ] **Step 4: 커밋**

```bash
git add lib/client-types.ts lib/client-api.ts
git commit -m "Feat: 보호자 연결 승인 관련 클라이언트 타입/API 함수 추가"
```

---

### Task 3: 연결 신청 화면 (`connection-form.tsx`)

**Files:**
- Modify: `components/connection-form.tsx`

**Interfaces:**
- Consumes: `createGuardianLink(input: CreateGuardianLinkRequest)`(Task 2, `initiatedBy` 필드 포함해서 호출).
- Produces: 없음(리프 태스크) — `app/elder/guardian/add/page.tsx`, `app/guardian/family/add/page.tsx`가 그대로 `<ConnectionForm kind="guardian"/>`, `<ConnectionForm kind="protected"/>`로 사용, props 시그니처 불변.

- [ ] **Step 1: `components/connection-form.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui";
import { createGuardianLink } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";

export function ConnectionForm({ kind }: { kind: "guardian" | "protected" }) {
  const me = useSession();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const guardian = kind === "guardian";

  async function save() {
    const value = identifier.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");
    try {
      await createGuardianLink({
        seniorUserId: guardian ? me.username : value,
        guardianEmail: guardian ? value.toLowerCase() : me.email,
        guardianName: guardian ? value.split("@")[0] : undefined,
        relation: guardian ? relation || "가족" : undefined,
        initiatedBy: guardian ? "senior" : "guardian",
      });
      if (guardian) {
        router.push("/elder/guardian");
        router.refresh();
      } else {
        setRequested(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계정을 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    return (
      <section className="absolute left-[48px] top-[90px] flex h-[459px] w-[1010px] flex-col items-center justify-center rounded-[8px] border border-[#d9d9d9] bg-white px-[38px] py-[36px] text-center">
        <h2 className="m-0 text-[28px] font-semibold">요청을 보냈습니다</h2>
        <p className="mt-[16px] text-[20px] text-[#6b6b6b]">시니어가 승인하면 연결이 완료됩니다. 승인 전까지는 거래 내역을 볼 수 없어요.</p>
      </section>
    );
  }

  return (
    <section className="absolute left-[48px] top-[90px] h-[459px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-white px-[38px] py-[36px]">
      <h2 className="m-0 text-[28px] font-semibold">{guardian ? "보호자 정보" : "피보호자 정보"}</h2>
      <label className="mt-[30px] block text-[20px] font-medium">
        {guardian ? "보호자 아이디" : "피보호자 아이디"}
        <input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={guardian ? "보호자 이메일을 입력하세요" : "연결할 피보호자 아이디"}
          className="mt-[10px] block h-[58px] w-full rounded-[7px] border border-[#d9d9d9] px-[16px] text-[20px]"
        />
      </label>
      {guardian && (
        <label className="mt-[28px] block text-[20px] font-medium">
          보호자와의 관계
          <select value={relation} onChange={(event) => setRelation(event.target.value)} className="mt-[10px] block h-[58px] w-full rounded-[7px] border border-[#d9d9d9] bg-white px-[16px] text-[20px]">
            <option value="">선택해주세요</option>
            <option>자녀</option><option>배우자</option><option>형제·자매</option>
            <option>친족</option><option>기타</option>
          </select>
        </label>
      )}
      {!guardian && <p className="mt-[16px] text-[16px] text-[#6b6b6b]">연결하면 시니어에게 승인 요청이 전달됩니다. 시니어가 승인해야 거래 내역을 볼 수 있어요.</p>}
      {error && <p className="mt-[16px] text-[16px] text-[#d11a1a]">{error}</p>}
      <PrimaryButton onClick={save} disabled={busy} className="absolute bottom-[22px] right-[24px] h-[58px] w-[218px] text-white">
        {busy ? "연결 중" : guardian ? "보호자 추가" : "피보호자 연결"}
      </PrimaryButton>
    </section>
  );
}
```

(변경 요지: `createGuardianLink` 호출에 `initiatedBy` 추가, `kind==="protected"`(보호자가 시니어 추가) 성공 시 리다이렉트 대신 `requested` 상태로 안내 화면 전환, 안내 문구 한 줄 추가.)

- [ ] **Step 2: 타입 체크 + lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: 둘 다 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add components/connection-form.tsx
git commit -m "Feat: 보호자가 시니어 추가 시 승인 대기 안내로 전환"
```

---

### Task 4: 시니어 화면 — 대기 중인 연결 요청 섹션

**Files:**
- Modify: `app/elder/guardian/page.tsx`

**Interfaces:**
- Consumes: `getPendingGuardianRequests(seniorUserId)`, `approveGuardianLink(seniorUserId, guardianEmail)`(Task 2), `removeGuardianLink(seniorUserId, guardianEmail)`(기존, 거부용으로 재사용).
- Produces: 없음(리프 태스크).

- [ ] **Step 1: `app/elder/guardian/page.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NotificationToggle } from "@/components/notification-toggle";
import { approveGuardianLink, getGuardiansForSenior, getPendingGuardianRequests, removeGuardianLink } from "@/lib/client-api";
import { useSession } from "@/lib/session-context";
import type { GuardianLink } from "@/lib/client-types";

export default function GuardianSettings() {
  const me = useSession();
  const [guardian, setGuardian] = useState<GuardianLink | null>(null);
  const [pending, setPending] = useState<GuardianLink[]>([]);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  function loadPending() {
    getPendingGuardianRequests(me.username)
      .then(setPending)
      .catch(() => setPending([]));
  }

  useEffect(() => {
    getGuardiansForSenior(me.username)
      .then(([first]) => setGuardian(first ?? null))
      .catch(() => setGuardian(null));
    loadPending();
  }, [me.username]);

  async function approve(guardianEmail: string) {
    if (busyEmail) return;
    setBusyEmail(guardianEmail);
    try {
      await approveGuardianLink(me.username, guardianEmail);
      loadPending();
      getGuardiansForSenior(me.username).then(([first]) => setGuardian(first ?? null)).catch(() => {});
    } finally {
      setBusyEmail(null);
    }
  }

  async function reject(guardianEmail: string) {
    if (busyEmail) return;
    setBusyEmail(guardianEmail);
    try {
      await removeGuardianLink(me.username, guardianEmail);
      loadPending();
    } finally {
      setBusyEmail(null);
    }
  }

  // 대기 요청이 있을 때만 그 아래 모든 고정 섹션(등록된 보호자/알림 설정/보호자 추가 버튼)을
  // 이 값만큼 균일하게 아래로 민다. 넉넉하게 잡아서(항목당 74px + 여유 90px) 겹칠 일이 없게 한다 —
  // 정확한 픽셀 맞춤보다 "절대 겹치지 않는 것"이 우선이다.
  const shift = pending.length > 0 ? 90 + pending.length * 74 : 0;

  return <AppShell title="보호자 설정" active="guardian">
    <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">고위험 거래가 감지되면 등록된 보호자에게 알림을 보냅니다</p>
    {pending.length > 0 && (
      <section className="absolute left-[68px] top-[70px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-[#fffaf0] px-[31px] py-[20px]">
        <h2 className="m-0 text-[20px] font-semibold">대기 중인 연결 요청</h2>
        <div className="mt-[14px] space-y-[10px]">
          {pending.map((request) => (
            <div key={request.id} className="flex h-[64px] items-center rounded-[6px] border border-[#d9d9d9] bg-white px-[20px]">
              <span className="text-[18px]">{request.guardianEmail}</span>
              <div className="ml-auto flex gap-[10px]">
                <button type="button" disabled={busyEmail === request.guardianEmail} onClick={() => approve(request.guardianEmail)} className="h-[40px] rounded-[6px] border-0 bg-[#262626] px-[16px] text-[16px] font-semibold text-white disabled:opacity-60">승인</button>
                <button type="button" disabled={busyEmail === request.guardianEmail} onClick={() => reject(request.guardianEmail)} className="h-[40px] rounded-[6px] border border-[#d9d9d9] bg-white px-[16px] text-[16px] disabled:opacity-60">거부</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}
    <h2 className="absolute left-[68px] m-0 text-[28px]" style={{ top: 96 + shift }}>등록된 보호자</h2>
    <section className="absolute left-[68px] flex h-[132px] w-[1010px] items-center rounded-[8px] border border-[#d9d9d9] bg-white px-[31px]" style={{ top: 144 + shift }}>
      {guardian ? <><div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#d9d9d9] bg-[#f5f5f5] text-[28px]">👨‍💼</div><div className="ml-[28px]"><strong className="text-[22px]">{guardian.guardianName || guardian.guardianEmail}</strong><span className="mt-[7px] block text-[20px] text-[#6b6b6b]">{guardian.relation || "가족"}</span></div><span className="ml-auto text-[30px]">›</span></> : <p className="m-0 text-[20px] text-[#6b6b6b]">등록된 보호자가 없습니다</p>}
    </section>
    <h2 className="absolute left-[68px] m-0 text-[28px]" style={{ top: 326 + shift }}>보호자 알림 설정</h2>
    <section className="absolute left-[68px] h-[250px] w-[1010px] rounded-[8px] border border-[#d9d9d9] bg-white px-[35px] py-[30px]" style={{ top: 368 + shift }}>
      <strong className="text-[20px] font-medium">고위험 거래 알림</strong><p className="mt-[8px] text-[20px] text-[#6b6b6b]">설정한 위험도 이상인 거래가 감지되면 보호자에게 알려요.</p>
      <div className="absolute right-[62px] top-[29px]">{guardian && <NotificationToggle seniorUserId={guardian.seniorUserId} guardianEmail={guardian.guardianEmail} initial={guardian.alertEnabled !== false} />}</div>
      <div className="mt-[34px] h-px w-[926px] bg-[#d9d9d9]" />
      <label className="mt-[28px] flex items-center text-[20px] font-medium">알림 기준 위험도<select className="ml-auto h-[52px] w-[276px] rounded-[6px] border border-[#d9d9d9] bg-white px-[20px] text-[20px] font-normal"><option>High 이상</option><option>Middle 이상</option><option>모두</option></select></label>
    </section>
    <Link href="/elder/guardian/add" className="absolute left-[860px] flex h-[58px] w-[218px] items-center justify-center rounded-[8px] bg-[#262626] text-[20px] font-semibold text-white no-underline" style={{ top: 674 + shift }}>보호자 추가</Link>
  </AppShell>;
}
```

(대기 요청이 없으면 `shift === 0`이라 기존 레이아웃과 완전히 동일하다. 대기 요청이 하나라도 있으면 그 아래 네 요소 — "등록된 보호자" 제목/섹션, "보호자 알림 설정" 제목/섹션, "보호자 추가" 버튼 — 을 전부 같은 `shift` 값만큼 아래로 민다. 처음 초안에서는 두 요소만 밀고 아래쪽 두 요소(보호자 알림 설정, 보호자 추가 버튼)를 제자리에 뒀더니 대기 요청이 1건만 있어도 겹치는 계산 실수가 있었다 — 자체 리뷰 중 발견해서 전부 같은 `shift`를 쓰도록 고쳤다.)

- [ ] **Step 2: 타입 체크 + lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: 둘 다 에러 없음.

- [ ] **Step 3: 수동 브라우저/curl 통합 테스트**

Task 1의 스모크 테스트에서 만든 `gc_test_senior`/`gc_test_guardian` 조합을 재사용해도 되고, 새로 만들어도 된다.

1. 새 보호자 계정으로 `/guardian/family/add`에서 시니어 아이디 입력 후 연결 → "요청을 보냈습니다" 화면으로 바뀌는지 확인(리다이렉트 안 됨).
2. 시니어 계정으로 `/elder/guardian` 진입 → "대기 중인 연결 요청" 섹션에 방금 그 보호자 이메일이 보이는지 확인.
3. "승인" 클릭 → 섹션이 사라지고 "등록된 보호자"에 반영되는지 확인.
4. 새 보호자 계정으로 다시 시도(다른 계정) → 이번엔 "거부" 클릭 → 대기 목록에서 사라지고, 그 보호자 계정으로 `/guardian/family`에 들어가도 "등록된 피보호자 없음"으로 남아있는지 확인.
5. 시니어가 보호자를 추가하는 기존 흐름(`/elder/guardian/add`, `kind="guardian"`)이 여전히 즉시 반영되는지 회귀 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/elder/guardian/page.tsx"
git commit -m "Feat: 시니어 화면에 대기 중인 보호자 연결 요청 승인/거부 섹션 추가"
```
