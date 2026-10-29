# 복구 가능한 버전

- v008 기본 화면은 접경 비교 캠페인입니다. `?legacy=v007`에서 이전 양측 출품 화면, `?legacy=v006`에서 이전 지역 지도를 엽니다.
- v008 저장 키는 `common:campaign:v1`입니다. v007의 `common:competition:v1`과 이전 두 키를 접근·초기화하지 않습니다. 기존 출품은 이전 화면에서 확인합니다.
- 변경 전 소스와 Git 이력은 `prototype-v007` 태그와 별도 로컬 Git bundle에 보존했습니다. 별도 폴더에 복구할 때 `git worktree add ../common-v007 prototype-v007`을 사용할 수 있습니다. Git 백업은 브라우저 데이터의 백업이 아닙니다.

- `prototype-v005`: 지역 확대 도입 전의 실행 앱 기준점.
- `main`: 구체와 평면 지역 지도가 연결된 현재 버전.

기존 폴더에 덮어쓰거나 변경을 버리지 않고 별도 작업 폴더로 이전 버전을 꺼낼 수 있습니다.

```sh
git worktree add ../common-v005 prototype-v005
cd ../common-v005
npm ci
```

이전 버전은 원래 브라우저 origin의 `common:frontier-league:v1`을 사용합니다. 새 버전의 초기화는 그 키를 지우지 않습니다. 다른 포트·브라우저에서 실행하면 브라우저 저장소도 별개입니다. 로컬 소스 백업은 브라우저 기록의 내보내기가 아닙니다.

생성 자산과 소스는 Git 태그로 복구할 수 있습니다. 의존성은 package-lock.json과 npm ci로 설치합니다. 로컬의 별도 tar.gz 백업은 공개하지 않았습니다.

이전 태그는 당시 의존성도 그대로 보존합니다. 현재 의존성 보안 수정은 main의 별도 fix(deps) 커밋에 있으며, 이전 화면을 계속 개발할 때 그 변경도 적용하세요.

## v007 competition

`before-competition-v007` preserves the v006 code before competition changes. `prototype-v007` points to the newer competition implementation. For a quick interface comparison, the current app also provides `?legacy=v006`; it retains the v006 storage key.

v007 uses `common:competition:v1` and never reads or deletes the two earlier keys. The local Git bundle is outside this public repository. User-uploaded HTML and covers are browser data, not source files or part of the public Git history.
