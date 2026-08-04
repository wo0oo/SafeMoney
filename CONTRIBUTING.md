# 브랜치 작업 가이드

> 1주차 마무리 회의(8/3) 결정: `dev`에서 작업 브랜치를 따고, 주기적으로 `dev → master`를 머지해서 배포합니다. `master`는 Vercel 자동 배포와 연결된 **배포 전용 브랜치**입니다.

## 브랜치 구조

```
지선/화면작업 ─┐
우성/api작업  ─┼─→ dev (PR로 자주 머지) ─→ (주기적으로) ─→ master ─→ Vercel 자동 배포
병윤/프롬프트 ─┤
태현/탐지로직 ─┘
```

- **작업 브랜치 → `dev`**: 평소 작업은 전부 여기로 PR. 자주, 작은 단위로 머지합니다.
- **`dev` → `master`**: `dev`가 안정된 상태일 때만 주기적으로 머지합니다 (예: 매주 회의 전, 또는 데모 준비 직전). `master`에 머지되는 순간 실제 서비스(`safemoney-gamma.vercel.app`)에 반영되므로 신중하게 진행합니다.
- `dev → master` 머지는 정우성(Vercel 배포 담당)이 진행하는 것을 기본으로 하되, 팀에서 다르게 정하면 그에 따릅니다.

## 1. dev 최신화 (작업 시작 전 항상 먼저)

```bash
git checkout dev
git pull origin dev
```

## 2. 본인 이름으로 브랜치 생성 (dev에서 분기)

```bash
git checkout -b <이름>/<작업내용>
```

예시:

- 김지선(프론트엔드): `git checkout -b jisun/risk-modal`
- 정우성(백엔드): `git checkout -b useong/email-notify`
- 전병윤(프롬프트/데모): `git checkout -b byungyun/gemini-prompt`
- 고태현(데이터/AI): `git checkout -b taehyun/risk-scoring`

## 3. 작업 & 커밋

```bash
git add <바꾼 파일>
git commit -m "Feat: 커밋 메시지"
```

여러 번 나눠서 커밋해도 됩니다. 병합 시 squash로 정리되니 커밋 단위는 편하게 나누면 됩니다. 커밋 메시지 형식은 아래 [커밋 메시지 규칙](#커밋-메시지-규칙) 참고.

## 4. 원격에 브랜치 push

```bash
git push -u origin <이름>/<작업내용>
```

처음 push할 때만 `-u`가 필요하고, 이후엔 `git push`만 하면 됩니다.

## 5. Pull Request(PR) 생성

PR은 "이 브랜치 내용을 `dev`에 합쳐도 될지 검토해달라"는 요청입니다. 저장소 페이지에서 방금 push한 브랜치로 뜨는 **Compare & pull request** 버튼을 클릭하고, **base가 `master`가 아니라 `dev`인지 확인한 뒤** 제목/설명에 무엇을 바꿨는지 간단히 작성합니다.

## 6. 리뷰 & 병합

- `dev`도 보호 브랜치라 팀원 1명 승인 없이는 병합할 수 없습니다.
- 리뷰가 필요하면 단톡방/노션에 PR 링크를 공유합니다.
- 승인이 나면 **Squash and merge** 버튼으로 병합합니다 (Merge commit이나 Rebase가 아닌 Squash로 통일).
- 병합 후 GitHub에서 **Delete branch**를 눌러 브랜치를 정리합니다.

## 7. dev → master (배포)

`dev`에 쌓인 변경사항이 서로 잘 맞물리는지 확인한 뒤, 주기적으로 `dev → master` PR을 올려 병합합니다. 이 병합 즉시 Vercel에 배포되므로, 병합 전 팀에 한 번 공유하는 것을 권장합니다.

## 8. 다음 작업

다음 작업을 시작할 땐 다시 1번부터 반복합니다 (`dev` pull → 새 브랜치).

## 커밋 메시지 규칙

형식: `<타입>: <제목>`

| 타입 | 의미 |
| --- | --- |
| `Feat` | 새 기능 추가 |
| `Fix` | 버그 수정 |
| `Docs` | 문서 수정 |
| `Style` | 포맷팅 등 로직에 영향 없는 변경 |
| `Refactor` | 기능 변경 없는 코드 구조 개선 |
| `Test` | 테스트 코드 추가/수정 |
| `Chore` | 빌드, 패키지 매니저, 설정 등 |

규칙:
- 제목은 50자 이내, 끝에 마침표를 붙이지 않습니다.
- 제목은 명령문/현재형으로 씁니다 (예: "추가함" X → "추가" O).
- 본문이 필요하면 제목 뒤 한 줄을 띄우고, "무엇을 했는지"보다 "왜 했는지"를 씁니다.

예시:
```
Feat: check-risk 요청 바디에 거래 유형 필드 추가

R1~R8 탐지 규칙이 amount 외에 type/payeeAccount 등을 필요로 해서
요청 스키마를 확장함.
```

## 주의사항

- `master`에 직접 push는 막혀 있습니다. 배포는 반드시 `dev → master` 머지를 통해서만 이루어집니다.
- `dev`에도 직접 push는 막혀 있습니다. 반드시 작업 브랜치 + PR로 작업합니다.
- API 요청/응답 형태(JSON 필드명)를 바꾸는 PR은 병합 전에 관련 담당자에게 꼭 알립니다. 프론트↔백엔드, 백엔드↔데이터/AI 간 인터페이스 규칙은 `CLAUDE.md`의 협업 규칙을 따릅니다.
- `data/*.json` 로컬 테스트 파일은 git에 추적되지 않으니 커밋 걱정 없이 마음껏 테스트해도 됩니다.
