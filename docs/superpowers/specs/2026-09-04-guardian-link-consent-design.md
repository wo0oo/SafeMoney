# 보호자-피보호자 연결 승인(동의관리) 설계

## 배경

`safemoney_역할분담.md` 4주차 항목 "보호자 대시보드 구현(로그인, 동의관리, 위험 이력 리스트)" 중 로그인은 이번 세션에서 구현했지만 동의관리는 아직 없다. `guardian-link-design.md`에도 "승인/대기 절차 없이 즉시 등록... 범위 밖"으로 의도적으로 빠져 있었다.

로그인이 붙은 지금은 이게 단순 누락이 아니라 실제 프라이버시 문제다: `components/connection-form.tsx`(kind="protected")에서 보호자가 아무 시니어 `username`이나 입력하면 `POST /api/guardian-link`가 그 자리에서 연결을 확정하고, 그 순간부터 그 보호자는 시니어의 동의 없이 거래 내역을 조회하고(`GET /api/check-risk?seniorUserId=&guardianEmail=`) 고위험 거래 알림 이메일을 받는다(`app/api/check-risk/route.ts`의 `listGuardiansForSenior` 기반 발송).

제출 마감이 3일 남아 최소 기능으로 간다. 시니어가 보호자를 추가하는 반대 방향(kind="guardian")은 시니어 본인이 스스로 선택한 것이라 승인 절차가 필요 없다 — 이번 스펙은 **보호자가 시니어를 추가하는 경우에만** 승인을 요구한다.

## 데이터 모델

`lib/guardianLink.ts`의 `GuardianLink`에 필드 하나만 추가한다.

```ts
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status?: "pending" | "approved"; // 없으면 approved로 취급(기존 레코드 마이그레이션 불필요)
  createdAt: string;
};
```

## 핵심 설계: 조회 함수를 승인된 것만 반환하도록 바꿔서 나머지 소비처는 안 건드린다

`lib/guardianLink.ts`의 다음 세 함수를 **`status !== "pending"`(= 승인됨, 필드 없는 레거시 레코드 포함)만 반환**하도록 수정한다:

- `listGuardiansForSenior(seniorUserId)`
- `listSeniorsForGuardian(guardianEmail)`
- `findGuardianLink(seniorUserId, guardianEmail)`

이 세 함수는 이미 다음 위치에서 재사용되고 있다: `app/api/check-risk/route.ts`(보호자 알림 발송의 `listGuardiansForSenior`, GET 403 인가 체크의 `findGuardianLink`), `components/guardian-records.tsx`, `components/notification-toggle.tsx`, `app/guardian/page.tsx`, `app/guardian/family/page.tsx`, `app/elder/guardian/page.tsx`의 기존 "등록된 보호자" 목록. 이 세 함수만 고치면 위 파일들은 코드 변경 없이 "미승인 보호자는 시니어 데이터에 접근 불가"가 자동 적용된다.

대기 중 요청 목록이 필요한 곳(시니어의 "보호자 설정" 화면) 하나만 새 함수로 추가한다:

```ts
export async function listPendingRequestsForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.seniorUserId === seniorUserId.trim() && l.status === "pending");
}

export async function approveGuardianLink(seniorUserId: string, guardianEmail: string): Promise<GuardianLink | null> {
  // seniorUserId + guardianEmail 조합의 레코드를 찾아 status를 "approved"로 바꾼다.
  // 정규화(trim / guardianEmail toLowerCase)는 createGuardianLink와 동일하게.
}
```

거부는 새 함수가 필요 없다 — 기존 `deleteGuardianLinkByPair`를 그대로 재사용한다(대기 중 요청을 지우는 것도, 이미 승인된 연결을 끊는 것도 "그 조합을 지운다"라는 같은 동작).

## API

`app/api/guardian-link/route.ts` 변경:

- **`POST`** — body에 `initiatedBy: "senior" | "guardian"` 필수 추가(형식 오류면 400). `initiatedBy === "guardian"`이면 `status: "pending"`, `"senior"`이면 `status: "approved"`로 `createGuardianLink`에 전달한다.
- **`GET ?seniorUserId=`** — 기존과 동일(승인된 것만, `listGuardiansForSenior` 그대로 사용). 변경 없음.
- **`GET ?seniorUserId=&status=pending`**(신규) — `listPendingRequestsForSenior` 사용, 그 시니어의 대기 중 요청만 반환.
- **`GET ?guardianEmail=`** — 기존과 동일. 변경 없음(보호자 쪽 대기 목록은 이번 범위 밖).
- **`PATCH`** — body에 `approve: true`(선택) 추가. 오면 `approveGuardianLink` 호출, 대상 없으면 404. `alertEnabled` 처리는 기존 그대로 유지 — 이번 PATCH 호출에서 `approve`와 `alertEnabled` 중 최소 하나는 있어야 한다.
- **`DELETE`** — 변경 없음.

## 화면

- **`components/connection-form.tsx`** — `createGuardianLink` 호출에 `initiatedBy: guardian ? "senior" : "guardian"` 추가(`guardian`은 `kind === "guardian"`일 때 true, 즉 시니어가 보호자를 추가하는 경우). `kind === "protected"`(보호자가 시니어를 추가)일 때는 성공 후 `/guardian/family`로 리다이렉트하지 않고(승인 전이라 목록에 안 뜸), 폼 자리에 "요청을 보냈습니다. 시니어의 승인을 기다려주세요." 인라인 안내로 교체한다. `kind === "guardian"`(시니어가 보호자 추가)은 기존 리다이렉트 동작 그대로.
- **`app/elder/guardian/page.tsx`**(시니어 "보호자 설정" 화면) — "대기 중인 연결 요청" 섹션 신설. `GET /api/guardian-link?seniorUserId=&status=pending`으로 목록을 불러와 요청자 이메일과 승인/거부 버튼을 보여준다. 승인은 `PATCH { seniorUserId, guardianEmail, approve: true }`, 거부는 기존 `DELETE`를 그대로 호출.

## 클라이언트 API/타입

- `lib/client-types.ts`: `GuardianLink`에 `status?: "pending" | "approved"` 추가, `CreateGuardianLinkRequest`에 `initiatedBy: "senior" | "guardian"` 추가.
- `lib/client-api.ts`: `createGuardianLink`는 시그니처 변경 없이 새 필드를 그대로 전달(타입만 갱신). 새 함수 `getPendingGuardianRequests(seniorUserId): Promise<GuardianLink[]>`(GET, `status=pending` 쿼리), `approveGuardianLink(seniorUserId, guardianEmail): Promise<GuardianLink>`(PATCH, `approve: true`) 추가. 거부는 기존 `removeGuardianLink` 재사용.

## 범위 밖

- 보호자 쪽 "내 요청이 대기 중" 별도 목록 화면 — 신청 직후 인라인 메시지로만 안내.
- 알림 배지/벨 아이콘에 대기 건수 표시.
- 승인 취소(승인된 연결을 다시 대기 상태로 되돌리기) — 기존 "연결 해제"(DELETE)로 완전히 끊는 것만 가능.
- 여러 보호자가 한 시니어에게 동시에 대기 중일 때의 정렬/우선순위 UX(생성 순서 그대로 노출).

## 테스트

`tsc --noEmit`/`eslint` 통과 확인 후, 로컬 서버에 curl로 스모크 테스트:

1. 보호자 계정으로 `POST /api/guardian-link`(`initiatedBy: "guardian"`) → 응답에 `status: "pending"` 확인.
2. 그 상태에서 `GET /api/check-risk?seniorUserId=&guardianEmail=`(대기 중인 그 보호자로) → 403 확인(승인 전엔 조회 불가).
3. 시니어 계정으로 `GET /api/guardian-link?seniorUserId=&status=pending` → 방금 만든 요청이 보이는지 확인.
4. `PATCH { seniorUserId, guardianEmail, approve: true }` → `status: "approved"`로 바뀌는지 확인.
5. 승인 후 다시 `GET /api/check-risk?seniorUserId=&guardianEmail=` → 200으로 바뀌는지 확인.
6. 다른 보호자로 대기 요청 하나 더 만든 뒤 `DELETE`(거부)로 지우고, `GET ?seniorUserId=&status=pending` 목록에서 빠지는지 확인.
7. 시니어가 보호자를 추가하는 기존 흐름(`initiatedBy: "senior"`)이 여전히 즉시 승인되는지 확인(회귀 체크).
