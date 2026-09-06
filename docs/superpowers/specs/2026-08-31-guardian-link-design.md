# 보호자-피보호자 연동 기능 설계

## 배경

`lib/userBaseline.ts`의 `UserBaseline.guardianEmail`은 시니어 1명당 이메일 문자열 하나만 저장하는 임시 필드였다. 필드 자체의 주석에 "보호자 동의/등록 화면이 아직 없어 임시로 baseline에 둠 — 화면 나오면 그쪽 데이터로 옮길 예정"이라고 적혀 있었고, 최근 `frontend` 브랜치에 보호자-피보호자 연결 화면(`components/connection-form.tsx`)이 올라왔지만 `localStorage`에만 저장하는 클라이언트 전용 스텁이라 실제 연동은 이번에 백엔드에서 구현한다.

로그인/세션 시스템은 프로젝트에 아직 없다(프론트도 `userId: "u_01"` 하드코딩). 이 설계는 그 전제를 그대로 따른다.

## 관계 구조

1 시니어 : N 보호자. 시니어 한 명에게 보호자 여러 명이 각자 알림을 받을 수 있어야 하고, 보호자 한 명이 여러 시니어를 관리할 수도 있다.

## 연결 방식

승인/대기 절차 없이 즉시 등록. 시니어가 보호자 이메일을 입력하거나 보호자가 시니어 식별자를 입력하면 그 자리에서 연결이 확정된다. 초대 코드나 요청-승인 플로우는 도입하지 않는다(범위 밖).

## 데이터 모델

새 리소스 `data/guardian-links.json` + `lib/guardianLink.ts`. `lib/userBaseline.ts`와 동일하게 `readJSON`/`writeJSON` 기반 CRUD로 구현한다.

```ts
export type GuardianLink = {
  id: string;            // crypto.randomUUID()
  seniorUserId: string;  // 피보호자 userId (예: "u_01")
  guardianEmail: string; // 보호자 식별자 — 로그인이 없으니 이메일이 곧 보호자 계정 역할
  guardianName?: string;
  relation?: string;     // "자녀", "배우자" 등
  createdAt: string;
};
```

flat 배열 구조. 같은 `seniorUserId`를 가진 레코드가 여러 개 있을 수 있다. `seniorUserId + guardianEmail` 조합이 이미 있으면 POST에서 409로 거부한다(중복 연결 방지).

## API

`app/api/guardian-link/route.ts` 신설. 기존 `app/api/user-baseline/route.ts`와 같은 스타일(수동 필드 검증, `NextResponse.json`)로 작성한다.

- `POST` — body `{ seniorUserId, guardianEmail, guardianName?, relation? }`. `seniorUserId`/`guardianEmail` 누락 시 400. 중복 조합이면 409. 성공 시 생성된 `GuardianLink` 반환.
- `GET ?seniorUserId=` — 그 시니어의 보호자 목록 반환 (시니어 쪽 "보호자 목록" 화면, check-risk 알림 발송용).
- `GET ?guardianEmail=` — 그 보호자가 보는 피보호자 목록 반환 (보호자 쪽 "가족" 화면).
- `DELETE ?id=` — 연결 해제. 대상 없으면 404.

## 기존 코드 마이그레이션

- `UserBaseline` 타입에서 `guardianEmail` 필드 제거, `app/api/user-baseline/route.ts` POST 핸들러의 관련 매핑 제거.
- `app/api/check-risk/route.ts`의 알림 발송 로직(`if (shouldAlertGuardian && baseline?.guardianEmail)` 블록)을 `listGuardianLinks(seniorUserId)` 결과로 교체하고, 반환된 보호자 각각에게 개별적으로 `sendGuardianAlertEmail`을 호출한다(반복문). 한 번에 여러 명을 `to`에 같이 넣지 않는 이유는 보호자끼리 서로의 이메일이 노출되지 않게 하기 위해서다 — `lib/db.ts`가 이미 private access를 고수하는 것과 같은 맥락.
- `data/user-baseline.json`과 `data/user-baseline.example.json`에 남아있는 테스트용 `guardianEmail` 값들을 `data/guardian-links.json`(과 example 파일) 시드 데이터로 옮겨서 기존 테스트 흐름(u_01/u_02 알림 발송 등)이 그대로 동작하게 한다.

## 에러 처리

`readJSON`이 blob 미존재 시 throw하는 기존 패턴과 동일하게, `guardian-links.json` 초기 빈 배열 파일을 미리 만들어둔다(`user-baseline.json`과 같은 방식). `user-baseline` route.ts에 이미 있는 400/404 스타일 검증을 그대로 따른다.

## 테스트

`tsc --noEmit`/`eslint` 통과 확인 후, 로컬 서버에 curl로 실제 라우트 스모크 테스트:

1. 연결 생성(`POST /api/guardian-link`) → 양방향 조회(`GET ?seniorUserId=`, `GET ?guardianEmail=`)로 확인.
2. 중복 조합 POST 시 409 확인.
3. 같은 시니어에게 보호자 2명 연결한 뒤 High 등급 거래를 발생시켜 두 보호자 모두에게 개별 메일이 가는지 확인(Resend 발송 로그/응답으로 확인).
4. `DELETE`로 연결 해제 후 목록에서 빠지는지 확인, 테스트 데이터 정리.

## 범위 밖

- 보호자 로그인/세션, 초대 코드, 승인 대기 플로우.
- 프론트엔드 UI 변경(`connection-form.tsx`를 실제 API 호출로 바꾸는 작업은 별도 후속 작업으로, 이 스펙에서는 백엔드 API만 다룬다).
