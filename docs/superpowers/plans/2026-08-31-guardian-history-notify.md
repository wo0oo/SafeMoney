# 보호자 이력 조회 + 알림 on/off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/check-risk`에 시니어별 필터링 + 보호자 접근 검증을 추가하고, `GuardianLink`에 보호자별 알림 on/off(`alertEnabled`)를 추가해 `PATCH /api/guardian-link`로 켜고 끌 수 있게 하며, `check-risk`의 발송 루프가 이 값을 반영하도록 한다.

**Architecture:** `feat/guardian-link` 브랜치(PR #17) 위에서 진행한다. `lib/guardianLink.ts`에 새 조회/갱신 함수 2개를 추가하고, 기존 `app/api/guardian-link/route.ts`(POST 확장 + PATCH 신설)와 `app/api/check-risk/route.ts`(GET 확장 + POST 발송 루프 필터)를 수정한다. 새 리소스나 새 파일은 만들지 않는다 — 전부 기존 구조 위에 얹는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@vercel/blob`(`lib/db.ts` 경유).

## Global Constraints

- 이 저장소에는 테스트 프레임워크가 없다. "테스트"는 `npx tsc --noEmit` + `npx eslint .` + 로컬 dev 서버(`npm run dev`, `http://localhost:3000`)에 대한 curl 스모크 테스트로 대체한다.
- 영속화는 `lib/db.ts`의 `readJSON`/`writeJSON`만 사용한다.
- `seniorUserId`/`guardianEmail` 정규화는 기존 패턴을 그대로 따른다: `seniorUserId.trim()`, `guardianEmail.trim().toLowerCase()`.
- git 커밋 메시지에 "Co-authored-by: Claude" 트레일러를 추가하지 않는다.
- 새/수정 API 핸들러는 기존 `app/api/guardian-link/route.ts`, `app/api/check-risk/route.ts`의 스타일(수동 필드 검증, `NextResponse.json`, 명시적 상태 코드)을 그대로 따른다.
- 프론트엔드(`NotificationToggle`, `HistoryList`, `GuardianRecords` 등)는 이번 계획의 범위 밖이다 — 백엔드 API만 다룬다.

---

### Task 1: `GuardianLink.alertEnabled` + 조회/갱신 함수

**Files:**
- Modify: `lib/guardianLink.ts`

**Interfaces:**
- Produces: `GuardianLink` 타입에 `alertEnabled?: boolean` 필드 추가, `createGuardianLink`가 `alertEnabled?: boolean` 입력을 받아 안 주면 `true`로 저장, `findGuardianLink(seniorUserId: string, guardianEmail: string): Promise<GuardianLink | null>`, `updateGuardianLinkAlert(seniorUserId: string, guardianEmail: string, alertEnabled: boolean): Promise<GuardianLink | null>` — Task 2(guardian-link route)와 Task 3(check-risk route)가 이 네 가지를 그대로 가져다 쓴다.

- [ ] **Step 1: `GuardianLink` 타입에 `alertEnabled` 추가**

`lib/guardianLink.ts`의 타입 정의(7-14번째 줄)를 아래로 교체:
```ts
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  createdAt: string;
};
```

- [ ] **Step 2: `createGuardianLink`가 `alertEnabled`를 받아 기본값 `true`로 저장하도록 수정**

현재(34-62번째 줄) 코드:
```ts
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
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
    createdAt: nowKstIso(),
  };
  links.push(link);
  await writeJSON("guardian-links.json", links);
  return link;
}
```

아래로 교체(입력 타입에 `alertEnabled?: boolean` 추가, `link` 객체에 `alertEnabled: input.alertEnabled ?? true` 추가):
```ts
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
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
    createdAt: nowKstIso(),
  };
  links.push(link);
  await writeJSON("guardian-links.json", links);
  return link;
}
```

- [ ] **Step 3: `findGuardianLink` 추가**

파일 끝(`deleteGuardianLinkByPair` 함수 뒤)에 추가:
```ts

// seniorUserId + guardianEmail 조합으로 특정 연결 하나를 찾는다. check-risk GET의 접근
// 검증과 updateGuardianLinkAlert 양쪽에서 재사용한다. createGuardianLink와 동일한 정규화를 쓴다.
export async function findGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  return (
    links.find(
      (l) => l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail
    ) ?? null
  );
}
```

- [ ] **Step 4: `updateGuardianLinkAlert` 추가**

`findGuardianLink` 뒤에 이어서 추가:
```ts

// 특정 연결의 alertEnabled만 갱신한다. 대상이 없으면 null.
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
```

- [ ] **Step 5: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음(`findGuardianLink`/`updateGuardianLinkAlert`는 아직 아무 곳에서도 쓰이지 않으므로 unused-export 경고 정도는 무시).

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add lib/guardianLink.ts
git commit -m "Feat: GuardianLink에 alertEnabled 추가, findGuardianLink/updateGuardianLinkAlert 함수 추가"
```

---

### Task 2: `app/api/guardian-link` — POST에 `alertEnabled` 지원 + PATCH 신설

**Files:**
- Modify: `app/api/guardian-link/route.ts`

**Interfaces:**
- Consumes: Task 1의 `createGuardianLink`(이제 `alertEnabled?: boolean` 입력 지원), `updateGuardianLinkAlert(seniorUserId, guardianEmail, alertEnabled)` (`@/lib/guardianLink`에서 import).
- Produces: `POST /api/guardian-link`가 이제 `alertEnabled` 필드를 선택적으로 받음, `PATCH /api/guardian-link` 신설 — Task 3는 이 route를 소비하지 않는다(Task 3는 `lib/guardianLink.ts`를 직접 소비).

- [ ] **Step 1: import에 `updateGuardianLinkAlert` 추가**

`app/api/guardian-link/route.ts`의 import 블록(2-7번째 줄)을 아래로 교체:
```ts
import {
  createGuardianLink,
  deleteGuardianLinkByPair,
  listGuardiansForSenior,
  listSeniorsForGuardian,
  updateGuardianLinkAlert,
} from "@/lib/guardianLink";
```

- [ ] **Step 2: POST 핸들러가 `alertEnabled`를 검증하고 전달하도록 수정**

현재(31-56번째 줄) 코드:
```ts
// POST /api/guardian-link → 연결 즉시 등록 (승인/대기 절차 없음)
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
```

아래로 교체(`alertEnabled` 타입 검증 추가, `createGuardianLink` 호출에 `alertEnabled` 전달 추가):
```ts
// POST /api/guardian-link → 연결 즉시 등록 (승인/대기 절차 없음)
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

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
    alertEnabled: typeof body.alertEnabled === "boolean" ? body.alertEnabled : undefined,
  });

  if (!link) {
    return NextResponse.json({ error: "이미 등록된 연결입니다." }, { status: 409 });
  }

  return NextResponse.json(link);
}
```

- [ ] **Step 3: PATCH 핸들러 추가**

파일 끝(`DELETE` 핸들러 뒤)에 추가:
```ts

// PATCH /api/guardian-link → 특정 연결의 alertEnabled만 변경
// body: { seniorUserId, guardianEmail, alertEnabled } 셋 다 필수
export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 필수이며 boolean이어야 합니다." }, { status: 400 });
  }

  const updated = await updateGuardianLinkAlert(body.seniorUserId, body.guardianEmail, body.alertEnabled);
  if (!updated) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json(updated);
}
```

- [ ] **Step 4: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 5: dev 서버 실행**

이미 실행 중이 아니면: `npm run dev` (백그라운드, `http://localhost:3000`).

- [ ] **Step 6: curl 스모크 테스트 — POST의 `alertEnabled` 지원**

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"patch-test-a@example.com","alertEnabled":false}'
```
Expected: 응답 JSON에 `"alertEnabled":false` 포함.

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"patch-test-b@example.com"}'
```
Expected: 응답 JSON에 `"alertEnabled":true` 포함(값을 안 줬으니 기본값).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"patch-test-c@example.com","alertEnabled":"yes"}'
```
Expected: `400`(문자열은 boolean이 아님).

- [ ] **Step 7: curl 스모크 테스트 — PATCH**

```bash
curl -s -X PATCH http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"patch-test-a@example.com","alertEnabled":true}'
```
Expected: 응답 JSON에 `"alertEnabled":true`로 바뀐 것 확인(Step 6에서 `false`로 만든 링크).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"patch-test-a@example.com"}'
```
Expected: `400`(`alertEnabled` 누락).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"no-such-link@example.com","alertEnabled":false}'
```
Expected: `404`.

- [ ] **Step 8: 테스트 데이터 정리**

```bash
curl -s -X DELETE "http://localhost:3000/api/guardian-link?seniorUserId=u_01&guardianEmail=patch-test-a@example.com"
curl -s -X DELETE "http://localhost:3000/api/guardian-link?seniorUserId=u_01&guardianEmail=patch-test-b@example.com"
```
Expected: 둘 다 `{"ok":true}`.

- [ ] **Step 9: 커밋**

```bash
git add app/api/guardian-link/route.ts
git commit -m "Feat: guardian-link POST alertEnabled 지원, PATCH 엔드포인트 추가"
```

---

### Task 3: `check-risk` — 이력 조회 필터링/접근 검증 + 알림 발송 필터링

**Files:**
- Modify: `app/api/check-risk/route.ts`

**Interfaces:**
- Consumes: Task 1의 `findGuardianLink(seniorUserId, guardianEmail): Promise<GuardianLink | null>` (`@/lib/guardianLink`에서 import), `GuardianLink.alertEnabled`.
- Produces: 없음(이 기능의 마지막 배선 지점).

- [ ] **Step 1: import에 `findGuardianLink` 추가**

`app/api/check-risk/route.ts`의 4번째 줄:
```ts
import { listGuardiansForSenior } from "@/lib/guardianLink";
```
을 아래로 교체:
```ts
import { findGuardianLink, listGuardiansForSenior } from "@/lib/guardianLink";
```

- [ ] **Step 2: `GET` 핸들러를 파라미터 기반 필터링 + 접근 검증으로 교체**

현재(156-160번째 줄) 코드:
```ts
// GET /api/check-risk → 전체 위험 판정 이력 조회
export async function GET() {
  const history = await readJSON<RiskRecord[]>("risk-history.json");
  return NextResponse.json(history);
}
```

아래로 교체:
```ts
// GET /api/check-risk                                → 전체 이력 조회(파라미터 없음, 기존 동작 하위호환)
// GET /api/check-risk?seniorUserId=                   → 그 시니어 이력만 필터링(별도 인증 없음 — 시니어 본인 조회용)
// GET /api/check-risk?seniorUserId=&guardianEmail=     → 그 조합이 GuardianLink로 연결돼 있어야 함(아니면 403)
// GET /api/check-risk?guardianEmail= (seniorUserId 없이) → 400
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (!seniorUserId && guardianEmail) {
    return NextResponse.json(
      { error: "guardianEmail은 seniorUserId와 함께 사용해야 합니다." },
      { status: 400 }
    );
  }

  const history = await readJSON<RiskRecord[]>("risk-history.json");

  if (!seniorUserId) {
    return NextResponse.json(history);
  }

  if (guardianEmail) {
    const link = await findGuardianLink(seniorUserId, guardianEmail);
    if (!link) {
      return NextResponse.json(
        { error: "이 시니어의 위험 이력을 조회할 권한이 없습니다." },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(history.filter((record) => record.userId === seniorUserId));
}
```

- [ ] **Step 3: `POST`의 발송 루프를 `alertEnabled`로 필터링**

현재(109-151번째 줄) 코드 중 아래 부분:
```ts
  const shouldAlertGuardian = judgement.guardianAlert ?? riskLevel === "High";
  let guardianLinks: Awaited<ReturnType<typeof listGuardiansForSenior>> = [];
  if (shouldAlertGuardian && body.userId) {
    try {
      guardianLinks = await listGuardiansForSenior(body.userId);
    } catch (error) {
      console.error("[check-risk] 보호자 연결 조회 실패 — 알림 발송을 건너뜁니다", error);
    }
  }

  if (guardianLinks.length > 0) {
```
를 아래로 교체(guardianLinks 조회 블록 뒤에 필터 한 줄 추가, `if` 조건과 그 아래 `for` 루프 대상을 `alertRecipients`로 교체):
```ts
  const shouldAlertGuardian = judgement.guardianAlert ?? riskLevel === "High";
  let guardianLinks: Awaited<ReturnType<typeof listGuardiansForSenior>> = [];
  if (shouldAlertGuardian && body.userId) {
    try {
      guardianLinks = await listGuardiansForSenior(body.userId);
    } catch (error) {
      console.error("[check-risk] 보호자 연결 조회 실패 — 알림 발송을 건너뜁니다", error);
    }
  }

  // alertEnabled가 명시적으로 false인 보호자는 발송 대상에서 제외한다(미지정/true면 발송).
  const alertRecipients = guardianLinks.filter((link) => link.alertEnabled !== false);

  if (alertRecipients.length > 0) {
```

그리고 그 아래, 발송 `for` 루프(현재 `for (const link of guardianLinks) {`로 시작하는 부분)를 아래로 교체:
```ts
    for (const link of alertRecipients) {
```

(나머지 루프 내부 코드는 그대로 — `sendGuardianAlertEmail` 호출과 try/catch는 안 바뀐다.)

- [ ] **Step 4: 타입체크/린트**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 5: dev 서버 실행**

이미 실행 중이 아니면: `npm run dev` (백그라운드, `http://localhost:3000`).

- [ ] **Step 6: curl 스모크 테스트 — GET 필터링/접근 검증**

```bash
curl -s "http://localhost:3000/api/check-risk" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length))"
```
Expected: 숫자 하나(현재 전체 이력 건수) — 에러 없이 배열 그대로 반환되는지 확인(하위호환 회귀 체크).

```bash
curl -s "http://localhost:3000/api/check-risk?seniorUserId=u_01" | node -e "process.stdin.on('data',d=>{const arr=JSON.parse(d);console.log(arr.length, arr.every(r=>r.userId==='u_01'))})"
```
Expected: `<건수> true` — 반환된 레코드 전부 `userId`가 `u_01`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/check-risk?guardianEmail=ij5943@naver.com"
```
Expected: `400`(`seniorUserId` 없이 `guardianEmail`만).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/check-risk?seniorUserId=u_01&guardianEmail=not-connected@example.com"
```
Expected: `403`(연결 안 된 조합 — `feat/guardian-link`의 시드 데이터는 `u_01`↔`ij5943@naver.com`만 있음).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/check-risk?seniorUserId=u_01&guardianEmail=ij5943@naver.com"
```
Expected: `200`(연결된 조합).

- [ ] **Step 7: curl 스모크 테스트 — `alertEnabled` 필터가 실제로 발송 대상에서 제외하는지 확인**

이메일 발송 성공/실패 로그만으로는 "발송 안 시도"와 "발송 시도했는데 조용히 성공"을 구분할 수 없으므로, 필터링 자체가 적용되는지 임시 디버그 로그로 직접 확인한다.

`app/api/check-risk/route.ts`에서 방금 만든 `if (alertRecipients.length > 0) {` 바로 위에 한 줄 임시로 추가:
```ts
  console.log("[check-risk][debug]", guardianLinks.length, alertRecipients.length);
```

dev 서버를 재시작(또는 hot-reload 확인)한 뒤:

```bash
curl -s -X POST http://localhost:3000/api/guardian-link \
  -H "Content-Type: application/json" \
  -d '{"seniorUserId":"u_01","guardianEmail":"debug-filter-test@example.com","alertEnabled":false}'
```
Expected: 생성 성공(id 기억).

```bash
curl -s -X POST http://localhost:3000/api/check-risk \
  -H "Content-Type: application/json" \
  -d '{"amount":3000000,"userId":"u_01","type":"transfer","payeeAccount":"999-***-7777"}'
```
Expected: `riskLevel: "High"`. 서버 콘솔에 `[check-risk][debug] 2 1`이 찍히는지 확인(연결된 보호자 2명 — 시드 `ij5943@naver.com` + 방금 만든 `debug-filter-test@example.com` — 중 `alertEnabled:false`인 1명이 제외돼 발송 대상은 1명).

확인 후 **반드시**:
1. 방금 추가한 `console.log("[check-risk][debug]", ...)` 줄을 삭제한다(커밋에 포함하지 않는다).
2. 테스트로 만든 `debug-filter-test@example.com` 연결을 정리:
```bash
curl -s -X DELETE "http://localhost:3000/api/guardian-link?seniorUserId=u_01&guardianEmail=debug-filter-test@example.com"
```
Expected: `{"ok":true}`.

- [ ] **Step 8: 디버그 로그 제거 확인 + 최종 타입체크/린트**

```bash
grep -n "check-risk\]\[debug\]" app/api/check-risk/route.ts
```
Expected: 아무 것도 안 나옴(빈 출력) — Step 7의 임시 로그가 확실히 지워졌는지 재확인.

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npx eslint .`
Expected: 에러 없음.

- [ ] **Step 9: 커밋**

```bash
git add app/api/check-risk/route.ts
git commit -m "Feat: check-risk GET 이력 필터링/보호자 접근 검증, 알림 발송에 alertEnabled 반영"
```

---

## Self-Review 결과

- **스펙 커버리지:** 1번(이력 조회 파라미터 3가지 조합 + 400/403)은 Task 3 Step 2, 2번(alertEnabled 필드 + 기본값 + PATCH + 발송 필터)은 Task 1 + Task 2 + Task 3 Step 3, 데이터 정규화는 Task 1의 `findGuardianLink`/`updateGuardianLinkAlert`가 기존 패턴을 그대로 따름, 에러 처리는 각 Task의 기존 스타일 준수, 테스트 계획은 각 Task의 curl 스텝이 스펙의 9개 테스트 항목을 전부 커버함(1~5는 Task 3, 6~7은 Task 2, 8은 Task 2, 9는 Task 2). 범위 밖 항목(프론트 연동, 다중 시니어 합산 조회, 알림 종류 세분화)은 포함하지 않음 — 의도된 누락.
- **플레이스홀더 스캔:** 없음 — Step 7의 임시 디버그 로그도 추가/제거 절차가 명시적 코드와 함께 완전히 기술돼 있고 Step 8에서 제거를 재확인함.
- **타입 일관성 확인:** `GuardianLink.alertEnabled`(Task 1) → `createGuardianLink`/`findGuardianLink`/`updateGuardianLinkAlert` 시그니처(Task 1) → `app/api/guardian-link/route.ts`의 POST/PATCH(Task 2)와 `app/api/check-risk/route.ts`의 GET/POST(Task 3)에서의 사용이 모두 동일한 이름·타입으로 일치함을 확인.
