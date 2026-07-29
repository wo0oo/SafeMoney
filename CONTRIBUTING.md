# 브랜치 작업 가이드

## 1. master 최신화 (작업 시작 전 항상 먼저)

```bash
git checkout master
git pull origin master
```

## 2. 본인 이름으로 브랜치 생성

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
git commit -m "커밋 메시지"
```

여러 번 나눠서 커밋해도 됩니다. 병합 시 squash로 정리되니 커밋 단위는 편하게 나누면 됩니다.

## 4. 원격에 브랜치 push

```bash
git push -u origin <이름>/<작업내용>
```

처음 push할 때만 `-u`가 필요하고, 이후엔 `git push`만 하면 됩니다.

## 5. Pull Request(PR) 생성

PR은 "이 브랜치 내용을 master에 합쳐도 될지 검토해달라"는 요청입니다. 저장소 페이지에서 방금 push한 브랜치로 뜨는 **Compare & pull request** 버튼을 클릭하고, base가 `master`인지 확인한 뒤 제목/설명에 무엇을 바꿨는지 간단히 작성합니다.

## 6. 리뷰 & 병합

- `master`는 보호 브랜치라 팀원 1명 승인 없이는 병합할 수 없습니다.
- 리뷰가 필요하면 단톡방/노션에 PR 링크를 공유합니다.
- 승인이 나면 **Squash and merge** 버튼으로 병합합니다 (Merge commit이나 Rebase가 아닌 Squash로 통일).
- 병합 후 GitHub에서 **Delete branch**를 눌러 브랜치를 정리합니다.

## 7. 다음 작업

다음 작업을 시작할 땐 다시 1번부터 반복합니다 (master pull → 새 브랜치).

## 주의사항

- `master`에 직접 push는 막혀 있습니다. 반드시 브랜치 + PR로 작업합니다.
- API 요청/응답 형태(JSON 필드명)를 바꾸는 PR은 병합 전에 관련 담당자에게 꼭 알립니다. 프론트↔백엔드, 백엔드↔데이터/AI 간 인터페이스 규칙은 `CLAUDE.md`의 협업 규칙을 따릅니다.
- `data/*.json` 로컬 테스트 파일은 git에 추적되지 않으니 커밋 걱정 없이 마음껏 테스트해도 됩니다.
