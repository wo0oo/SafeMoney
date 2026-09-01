# 보호자 이력 조회 + 알림 on/off 설계

## 배경

`feat/guardian-link` 브랜치(PR #17, 아직 미머지)에서 시니어-보호자 연결(`GuardianLink`) 기능을 추가했다. 이 스펙은 그 위에 두 가지를 추가한다: 보호자가 사용자 동의 하에 연결된 시니어의 위험 이력을 조회하는 기능, 그리고 보호자별로 알림 수신 여부를 켜고 끄는 기능(`safemoney_기획서.pdf` 4번 항목 "금융 위험 이력 관리"와 5번 항목 활용 데이터 "보호자 알림 여부"에 대응).

이 브랜치는 `feat/guardian-link` 위에서 시작한다 — `GuardianLink` 타입과 `lib/guardianLink.ts`의 기존 CRUD 함수가 전제 조건이기 때문이다.

## 1. 보호자용 위험 이력 조회

`GET /api/check-risk`에 쿼리 파라미터를 추가해 필터링/접근 제어를 얹는다. 새 엔드포인트를 만들지 않는 이유는 프론트엔드의 `getRiskHistory()`(`lib/client-api.ts`, `origin/frontend` 브랜치)가 이미 이 엔드포인트를 쓰고 있어서, 파라미터만 추가하면 되기 때문이다.

파라미터 조합별 동작:

- 파라미터 없음: 기존과 동일하게 전체 이력 반환. `app/demo/page.tsx`처럼 파라미터 없이 호출하는 기존 사용처와의 하위호환을 위해 유지한다.
- `seniorUserId`만: 그 시니어의 이력만 필터링해서 반환. 별도 인증 없음 — 시니어 본인 조회 용도이고, 앱 전체에 로그인 시스템이 없는 것과 같은 수준의 신뢰 모델이다.
- `seniorUserId` + `guardianEmail`: `lib/guardianLink.ts`에 새로 추가하는 `findGuardianLink(seniorUserId, guardianEmail)`로 그 조합이 실제 `GuardianLink`에 있는지 확인한다. 있으면 필터링된 이력을 반환하고, 없으면 403과 함께 에러 메시지를 반환한다.
- `guardianEmail`만(비어있지 않은데 `seniorUserId`가 없는 경우): 400. 보호자가 여러 시니어의 이력을 한 번에 합쳐 보는 기능은 이번 범위 밖이라, 항상 `seniorUserId`와 함께 쓰도록 강제한다.

`findGuardianLink`는 이 접근 검증과 아래 2번 항목의 PATCH 두 곳에서 재사용한다.

## 2. 보호자별 알림 on/off

- `GuardianLink` 타입에 `alertEnabled?: boolean`을 추가한다. 생성 시 값을 안 주면 `true`로 저장한다(기존 동작 — 연결되면 항상 알림 — 과 호환 유지).
- `POST /api/guardian-link`가 선택적으로 `alertEnabled`(boolean)를 받도록 확장한다. 안 주면 `true`.
- 새 `PATCH /api/guardian-link` 핸들러를 추가한다. body `{ seniorUserId, guardianEmail, alertEnabled }` — 셋 다 필수, `alertEnabled`는 boolean이어야 한다(아니면 400). `findGuardianLink`로 대상을 찾아 `lib/guardianLink.ts`의 새 함수 `updateGuardianLinkAlert(seniorUserId, guardianEmail, alertEnabled)`로 갱신한다. 대상이 없으면 404.
- `app/api/check-risk/route.ts`의 보호자 발송 루프(`guardianLinks`를 순회하며 개별 발송하는 부분)에서, `link.alertEnabled === false`인 보호자는 발송 대상에서 제외한다(`alertEnabled`가 `undefined`거나 `true`면 발송).

## 데이터 정규화

`findGuardianLink`/`updateGuardianLinkAlert`는 `createGuardianLink`와 동일한 정규화(`seniorUserId.trim()`, `guardianEmail.trim().toLowerCase()`)를 적용해서 대소문자/공백 차이로 매칭이 깨지지 않게 한다. `deleteGuardianLinkByPair`가 이미 이 패턴을 쓰고 있으므로 그대로 따른다.

## 에러 처리

기존 `app/api/guardian-link/route.ts`의 스타일(수동 필드 검증, `NextResponse.json`, 명시적 상태 코드)을 그대로 따른다. `check-risk` GET의 403/400 응답도 같은 스타일(`{ error: "..." }`, 명시적 상태 코드)로 맞춘다.

## 테스트

테스트 프레임워크가 없으므로 `tsc --noEmit`/`eslint` + curl 스모크 테스트로 검증한다:

1. `seniorUserId` 없이 GET → 전체 이력(기존 동작 회귀 확인).
2. `seniorUserId=u_01`만으로 GET → u_01 이력만.
3. 연결 안 된 `guardianEmail`로 `seniorUserId=u_01&guardianEmail=` 조합 GET → 403.
4. 연결된 `guardianEmail`(`ij5943@naver.com`)로 같은 조합 GET → 성공, u_01 이력만.
5. `guardianEmail`만 단독 GET → 400.
6. `alertEnabled:false`로 새 guardian-link POST → 저장값 확인.
7. High 등급 거래 발생 → `alertEnabled:false`인 보호자는 발송 로그에 없고, `true`(또는 미지정)인 보호자는 발송되는지 확인.
8. PATCH로 `alertEnabled`를 토글 → GET으로 값 변경 확인.
9. 존재하지 않는 조합으로 PATCH → 404.

## 범위 밖

- 프론트엔드 연동(`NotificationToggle` 컴포넌트를 PATCH에 연결, `HistoryList`/`GuardianRecords`가 새 쿼리 파라미터를 보내도록 수정) — 이번 스펙은 백엔드 API까지만 다룬다.
- 보호자가 여러 시니어의 이력을 한 번에 합쳐 보는 기능.
- 알림 종류별(이메일 외 SMS 등) 세분화된 on/off — 지금 있는 이메일 알림 하나에 대해서만 켜고 끈다.
