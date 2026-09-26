# CanvaSlide — 릴리스 가이드

워크플로: [`.github/workflows/release.yml`](../.github/workflows/release.yml) ·
[`.github/workflows/release-notes.yml`](../.github/workflows/release-notes.yml) · [문서 목록](./README.md)

`main`에서 CI를 통과한 커밋에 붙인 git 태그 하나로 macOS·Windows 설치 파일을 빌드해 GitHub Release에 첨부하는 절차를 정리한다.
릴리스는 메인테이너가 수행하며, 코드 규칙과 검증은 [`AGENTS.md`](../AGENTS.md), 기여 절차는 [`CONTRIBUTING.md`](../CONTRIBUTING.md)를 따른다.

## 1. 한눈에 보기

```bash
git switch -c chore/release-v0-8-0 origin/main
pnpm version minor --no-git-tag-version      # ① package.json 버전만 올린다
git commit -am "Prepare v0.8.0 release"      # ② 릴리스 PR을 올리고 아래 main·태그 규칙에 따라 머지
git switch main && git pull
git tag -a v0.8.0 -m v0.8.0 <머지 커밋>        # ③ 머지 커밋에 태그를 붙여 푸시하면
git push origin v0.8.0                       #    release.yml 이 그 커밋의 CI를 확인한 뒤 빌드한다
# ④ GitHub → Releases 에서 초안(draft)에 노트를 쓰고 Publish — 앱의 업데이트 안내에도 이 노트가 나간다
```

병합과 태그 권한은 [main·태그 규칙](#branch-and-tag-rules)을 따른다.

## 2. 버전 규칙

- 버전은 **`package.json` 한 곳**에만 있다. `src-tauri/tauri.conf.json`은 `"version": "../package.json"`으로 그 값을 읽는다. `src-tauri/Cargo.toml`의 버전은 번들에 쓰이지 않으므로 손대지 않는다.
- [SemVer](https://semver.org)를 따른다. 1.0 전에는 `minor`가 기능 추가, `patch`가 버그 수정이다.
  - `pnpm version patch` → 0.1.0 → 0.1.1
  - `pnpm version minor` → 0.1.0 → 0.2.0
  - `pnpm version major` → 0.1.0 → 1.0.0
- 릴리스 PR에서는 `pnpm version <bump> --no-git-tag-version`으로 `package.json`만 고친다. 옵션이 없으면 커밋과
  태그를 브랜치 커밋에 바로 만드는데, 그 커밋은 `main`의 CI가 검사한 커밋이 아니어서 릴리스되지 않는다.
- 태그는 릴리스 PR이 머지된 뒤 그 머지 커밋에 `git tag -a v<버전>`으로 만든다. 태그 이름과 `package.json` 버전이
  다르면 워크플로가 빌드 전에 실패한다.

## 3. 릴리스 절차

1. 데스크톱 클라우드 공유를 제공할 때는 저장소 **Settings → Secrets and variables → Actions → Variables**의
   `VITE_CLOUD_SHARE_URL`을 배포된 편집기의 HTTPS origin으로 설정한다(예: `https://canvaslide.pages.dev`).
   CI 번들과 릴리스 빌드는 이 값을 Vite와 Rust에 함께 전달한다. 값이 없으면 데스크톱 공유가 비활성화된다.
2. 최신 `main`에서 릴리스 브랜치를 만들고 버전을 올린다.
   ```bash
   git fetch origin
   git switch -c chore/release-v0-8-0 origin/main
   pnpm version minor --no-git-tag-version
   pnpm check                     # 관련 spec과 조건부 검증은 AGENTS.md의 Verify 참조
   ```
3. 커밋하고 릴리스 PR을 올린 뒤 [main·태그 규칙](#branch-and-tag-rules)에 따라 머지한다.
   ```bash
   git commit -am "Prepare v0.8.0 release"
   git push -u origin chore/release-v0-8-0
   gh pr create --fill
   ```
4. 머지 커밋에 태그를 붙여 푸시한다. 머지한 뒤 `main`의 CI가 끝나기 전에 푸시해도 된다.
   ```bash
   git switch main && git pull
   commit="$(gh pr view chore/release-v0-8-0 --json mergeCommit --jq .mergeCommit.oid)"
   git tag -a v0.8.0 -m v0.8.0 "$commit"
   git push origin v0.8.0
   ```
5. Actions 탭에서 **Release** 워크플로가 끝나기를 기다린다. 먼저 태그 커밋의 `main` CI가 성공으로 끝나기를
   기다리고, macOS와 Windows 빌드가 병렬로 돈 뒤 macOS 서명·공증, 업데이터 서명, 게시 잡이 이어진다.
6. **Releases** 페이지에 본문이 빈 초안이 생겨 있다. 다음을 확인하고 노트를 쓴다.
   - 첨부 파일: `CanvaSlide_<버전>_universal.dmg`, `CanvaSlide_<버전>_x64-setup.exe`, `CanvaSlide_<버전>_x64_en-US.msi`
   - **Generate release notes** 버튼을 눌러 지난 태그 이후 머지된 PR 제목을 불러온 뒤 사용자 관점으로 다듬는다.
   - OS 코드 서명이 없는 설치 파일은 §6의 안내 문구를 노트에 넣는다. Windows 설치 파일은 아직 서명하지 않고,
     macOS 파일은 **sign and notarize · macOS** 잡에 `No Apple credentials` 경고가 있으면 서명되지 않은 것이다.
   - Release 본문이 릴리스 노트의 유일한 원본이다. 공개하면 이 본문이 그대로 데스크톱 앱의 업데이트 안내에 나간다(§7).
7. 아래 [데스크톱 점검표](#desktop-release-checklist)의 공개 전 항목을 두 OS에서 확인한 뒤 **Publish release**를 누른다. 초안은 일반 사용자에게 배포되지 않는다. 공개한 태그는 옮기지 않는다.
8. Actions 탭에서 **Release notes** 워크플로가 성공했는지 확인한다. 이 워크플로는 공개 직후 본문을
   `latest.json`의 `notes`로 옮기고, 공개한 뒤 본문을 고치면 다시 실행되어 앱의 안내도 바꾼다.
   이전 설치본으로 점검표의 공개 직후 업데이트 확인·설치를 마친다.

<a id="desktop-release-checklist"></a>

### 릴리스 전 데스크톱 수동 점검

PR마다 두 OS에서 확인하는 대신, 메인테이너가 릴리스 초안의 설치 파일을 macOS와 Windows에 각각 설치하고
아래 표를 복사해 결과를 기록한다. 버전·커밋, OS 버전·CPU, 설치 형식, 실행한 절차와 결과를 릴리스 PR에 남긴다.
실패와 미실행은 이유 및 후속 조치와 함께 명시하고 통과로 표시하지 않는다. 각 PR의 `Desktop check` 절차도 함께 확인한다.
테스트에는 원본 대신 예제 사본과 별도 작업 폴더를 사용한다. `기본 키`는 macOS의 ⌘, Windows의 Ctrl이다.

| 항목               | 절차와 기대 결과                                                                                                                                                                                                      | macOS  | Windows |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| 열기               | 앱의 열기 명령 또는 기본 키+O로 `.canvaslide` 사본을 열고, Finder/탐색기에서 파일을 열어 전달되는지도 확인한다. 취소하면 현재 문서를 유지한다.                                                                        | 미실행 | 미실행  |
| 저장               | 내용을 편집하고 기본 키+S로 저장한 뒤 다시 열어 변경 내용이 남았는지 확인한다.                                                                                                                                        | 미실행 | 미실행  |
| 다른 이름으로 저장 | 기본 키+Shift+S로 새 경로에 저장하고 원본은 그대로인지 확인한다. 저장 대화상자 취소 시 문서와 경로가 유지된다.                                                                                                        | 미실행 | 미실행  |
| HTML/PDF 내보내기  | 파일 메뉴에서 각각 내보내고 결과를 연다. HTML의 프레임 탐색·텍스트·이미지, PDF의 페이지 순서·글꼴·잘림을 확인한다.                                                                                                    | 미실행 | 미실행  |
| 슬라이드 쇼        | 프레임이 있는 문서에서 F5로 시작하고 방향키로 이동한다. P/E/O 도구, Tab 초점, Esc 복귀와 작은 창의 도구 접근을 확인한다. Mac에서 필요하면 Fn+F5를 쓴다.                                                               | 미실행 | 미실행  |
| 업데이트 확인·설치 | 아래 공개 전/직후 절차와 [플랫폼별 동작](../README.md#update-behavior)에 따라 확인한다. 설치 뒤 앱 버전과 문서 보존을 확인한다. 저장 확인을 지원하는 설치본에서는 취소 시 설치 중단도 확인한다.                       | 미실행 | 미실행  |
| 공유               | 공유가 설정된 빌드에서 문서 링크를 만들고 다른 브라우저에서 열어 보기·슬라이드 쇼를 확인한다. 비활성 빌드는 그 설정과 사유를 기록한다.                                                                                | 미실행 | 미실행  |
| 링크 동영상        | YouTube·Vimeo·HTTPS 직접 동영상 링크를 각각 재생한다. 프레임 이동과 발표 종료 뒤 재생이 멈추는지 확인한다. HTML의 YouTube는 HTTP(S)에서 확인한다.                                                                     | 미실행 | 미실행  |
| Figma 가져오기     | 로컬 `.fig` 사본을 가져오고 텍스트·도형·이미지를 확인한다. [변환 제약](./FIGMA-IMPORT.md) 안의 내용을 편집하고 저장·다시 열기를 확인한다.                                                                             | 미실행 | 미실행  |
| 복구               | 사본을 편집하고 설정의 복구 저장 완료를 확인한 뒤 앱을 강제 종료한다. 다시 열어 복구를 선택하고 마지막 저장 사본이 복원되는지 확인한 뒤 다른 이름으로 저장한다. [복구 범위](./CRASH-RECOVERY.md)를 기준으로 판단한다. | 미실행 | 미실행  |

업데이트 점검은 다음처럼 나눈다. 초안과 프리릴리스는 앱의 `releases/latest` 피드로 배포되지 않으므로,
공개 전 시험만으로 새 버전의 자동 업데이트 경로가 통과했다고 기록하지 않는다.

- **공개 전:** 초안 설치 파일로 직접 설치·실행을 확인하고, 정보 대화상자의 **업데이트 확인**이 현재 공개 피드를
  조회하는지 확인한다. 새 버전으로의 실제 업데이트는 `공개 직후 확인 예정`으로 기록하고 이전 설치본을 남겨 둔다.
- **공개 직후:** §3 8단계가 끝나면 작업 사본을 먼저 저장하고 이전 설치본의 **업데이트 확인**을 누른다.
  수동 확인이 없는 설치본은 앱을 다시 시작해 자동 확인을 기다린다. Windows는 NSIS와 MSI 설치본에서 각각
  설치하고 재시작 후 버전을 확인한다. macOS는 [플랫폼별 동작](../README.md#update-behavior)에 따라 앱 안 설치 또는 **다운로드 페이지 열기** 후 직접
  설치를 확인한다. 실패 시 §5에 따라 처리한다.
- **저장 확인을 지원하는 설치본:** 앱 안 설치 전에 예제 사본에 저장하지 않은 편집을 만들고
  **설치 후 다시 시작 → 취소**로 설치가 중단되는지, 다시 시도해 **저장**을 선택하면 저장 후 설치되는지 확인한다.
  이 확인은 업데이트를 받는 기존 설치본의 코드가 수행한다. 그 설치본에 저장 확인이 없으면 새 버전의 보호 동작을
  검증할 수 없으므로 이 항목은 미검증 사유를 남긴다. 새 버전에 기능이 있다는 이유로 통과 처리하지 않는다.

## 4. 워크플로가 하는 일

`release.yml`은 `v*` 태그 푸시에서만 실행된다. 태그 커밋의 CI를 먼저 확인하고, 빌드 스크립트와 의존성이
실행되는 잡에는 업데이터 서명 키도, Apple 자격 증명도, 저장소 쓰기 권한도 주지 않도록 잡을 나눈다.

| 잡                               | 러너             | 받는 권한·비밀                   | 산출물                                                             |
| -------------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------ |
| wait for CI on the tagged commit | `ubuntu-latest`  | `actions: read`                  | 없음(태그 커밋의 `main` CI 결과 확인)                              |
| build · macOS (universal)        | `macos-latest`   | 읽기 전용, 비밀 없음             | `.dmg`, 업데이터용 `.app.tar.gz` (Apple Silicon + Intel)           |
| build · Windows (x64)            | `windows-latest` | 읽기 전용, 비밀 없음             | `.exe` (NSIS 설치 파일), `.msi`                                    |
| sign and notarize · macOS        | `macos-latest`   | `release` 환경의 Apple 자격 증명 | 서명·공증한 `.dmg`와 `.app.tar.gz`(자격 증명이 없으면 빌드 그대로) |
| sign updater files               | `ubuntu-latest`  | `release` 환경의 서명 키         | 업데이터 파일의 서명(`.sig`)                                       |
| publish draft release            | `ubuntu-latest`  | `contents: write`                | 노트 없는 `latest.json`, 본문이 빈 Release 초안                    |

0. **wait for CI**: 태그 커밋에서 `main`에 푸시되어 실행된 **CI** 워크플로 실행을 Actions API로 찾아 끝나기를
   기다린다. 10분 안에 실행이 나타나지 않거나(태그 커밋이 `main` 푸시의 끝 커밋, 즉 PR의 머지 커밋이 아님)
   결과가 성공이 아니거나 API 호출이 실패하면 실패하고, 이후 잡은 실행되지 않는다. 체크아웃도 패키지
   스크립트도 실행하지 않는다. 이 잡은 태그 커밋에 들어 있는 `release.yml`에서 실행되므로, 이 잡이 없는
   커밋(예: 옛 태그에서 갈라진 핫픽스)에 태그를 달면 CI 확인 없이 빌드된다. 핫픽스도 §3처럼 `main`을 거친다.
1. **build**: pnpm, `.node-version`의 Node, `rust-toolchain.toml`의 Rust를 준비하고(맥은
   `aarch64-apple-darwin`, `x86_64-apple-darwin` 타깃 추가) `pnpm install --frozen-lockfile`,
   태그 ↔ `package.json` 버전 일치 검사를 한다. 이어서
   `pnpm tauri build --no-sign`이 `pnpm build:web`(tauri.conf.json의 `beforeBuildCommand`)과 번들을 만들고,
   릴리스할 파일을 워크플로 아티팩트로 올린다.
2. **notarize**: 체크아웃과 macOS 빌드 아티팩트만 받고 의존성은 설치하지 않는다. Apple 자격 증명은
   [`notarize-macos-release.sh`](../config/scripts/notarize-macos-release.sh)를 실행하는 단계에만 전달되고, 이
   스크립트는 macOS와 Xcode에 들어 있는 Apple 도구(`security`, `codesign`, `notarytool`, `stapler`, `hdiutil` 등)만
   실행한다. 빌드 잡의 `macos-build` 아티팩트를 읽고, 서명·공증한 파일을 `release-macos-latest`로 올리며, 공증했는지를
   게시 잡에 넘긴다(§6). 서명·게시 잡은 `release-*` 아티팩트만 읽는다.
3. **sign**: 패키지 스크립트를 실행하지 않고 의존성을 설치한 뒤(`pnpm install --ignore-scripts`)
   `tauri signer sign`만으로 `.app.tar.gz`, `-setup.exe`, `.msi`를 서명한다. 서명 키는 이 단계에만 전달된다.
   OS 코드 서명이 파일을 바꾸므로 이 잡은 notarize 잡 뒤에 실행된다.
4. **publish**: [`updater-feed.mjs`](../config/scripts/updater-feed.mjs)가 각 서명을 설치된 앱이 신뢰하는
   공개키, 즉 공개된 최신 릴리스(앱이 업데이트를 받는 `releases/latest`) 태그의 `tauri.conf.json` 공개키로
   앱과 같은 규칙에 따라 검증하고 `latest.json`을 만든다. 공개된 릴리스가 없거나 저장소 변수
   `UPDATER_KEY_CHANGE_TAG`가 이 태그 이름이면 이 태그의 공개키도 신뢰한다(§7 키 교체).
   notarize 잡이 공증했으면 macOS 항목에 `"notarized": true`를 붙인다(§7).
   서명이 맞지 않거나 플랫폼이 빠지면 업로드 전에 실패한다. 그다음 같은 태그의 Release 초안을 본문 없이 만들고
   파일을 올린다. 초안이 이미 있으면 파일을 교체하고, 이미 공개된 Release면 실패한다. 이때의 `latest.json`에는
   `notes`가 없다. 대체 문구를 넣지 않으므로 노트 없이 공개하면 앱의 안내에는 새 버전과 버튼만 보인다. 공개한 뒤
   **Release notes** 워크플로가 끝날 때까지도 그 사이에 확인한 앱에는 노트가 없다.

**Release notes** 워크플로(`release-notes.yml`)는 Release가 공개되거나(`published`) 공개된 Release가 수정될 때
(`edited`) 실행된다. 초안은 건너뛴다. 한 잡이 `contents: write` 권한으로 세 단계를 거친다.

1. 토큰을 쓰는 단계가 Release가 공개 상태인지 확인하고 본문과 `latest.json`을 내려받는다.
2. 토큰이 없는 단계가 [`updater-feed-notes.mjs`](../config/scripts/updater-feed-notes.mjs)로 본문을 `notes`에
   넣는다. 줄바꿈은 LF로 맞추고 앞뒤 공백을 지운다. 본문이 비면 `notes`를 뺀다. `latest.json`의 버전이 태그와
   다르면 실패한다. 다른 필드는 바꾸지 않는다.
3. 토큰을 쓰는 단계가 새 파일을 `latest.next.json`으로 먼저 올리고, 기존 `latest.json`을 지운 뒤 새 파일의 이름을
   `latest.json`으로 바꾼다. `gh release upload --clobber latest.json`은 기존 파일을 먼저 지우므로 업로드가 실패하면
   피드가 사라진다. 이 순서에서는 이름 변경 API 호출 한 번 동안만 `latest.json`이 없다. 그 사이에 멈춘 실행은
   `latest.next.json`만 남기고, 다음 실행이 이 파일을 읽어 이어서 교체한다.

저장소의 불변 릴리스(immutable releases)를 켜면 공개된 Release의 파일을 바꿀 수 없으므로 이 워크플로도 동작하지 않는다.

Release 이벤트는 태그 커밋에 있는 워크플로 파일로 실행되므로, 이 파일이 없는 태그(v0.7.0 이하)에서는 자동으로
돌지 않는다. 그런 Release와 실패한 실행은 `main`의 워크플로를 수동으로 실행해 처리한다.

```bash
gh workflow run release-notes.yml -f tag=v0.8.0
```

### CI와 툴체인 유지보수

[CI](../.github/workflows/ci.yml)는 PR과 main 푸시마다 `pnpm check`의 단계를 Linux·Windows에서,
Rust 검사를 Linux·macOS·Windows에서 실행한다. 전체 E2E는 Chromium·Firefox의 Linux shard와
`@webkit`을 포함한 macOS WebKit의 2개 shard에서 실행하며, 러너마다 테스트를 하나씩 실행한다. 사이트 빌드·검사는
Linux에서, 번들 빌드는 macOS·Windows에서 매번 실행한다. 로컬에서는
[Verify](../AGENTS.md#verify)의 범위에 맞춰 실행한다.

Node.js는 [`.node-version`](../.node-version), Rust는 [`rust-toolchain.toml`](../rust-toolchain.toml)에서
고정 버전을 읽는다. [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml)의 `rust-version`은 앱을 빌드할 수 있는
가장 오래된 Rust다. [Rust dependencies](../.github/workflows/rust-dependencies.yml)는 매주 및 Rust 코드·Cargo
관련 파일을 바꾸는 PR에서 RustSec 보안 권고, 사용 중단(yanked) crate, 최소 Rust 버전 빌드 실패를 검사한다.
Renovate가 제안하는 툴체인·의존성·액션 업데이트의 묶음과 승인 절차는 [의존성 업데이트](#dependency-updates)를 따른다.

모든 잡의 체크아웃은 토큰을 작업 폴더에 남기지 않는다(`persist-credentials: false`). 모든 워크플로의 액션은
전체 커밋 SHA로 고정하고 주석에 버전을 적는다. 액션을 올릴 때는 새 버전 태그가 가리키는 커밋 SHA와 주석을 함께 바꾼다.

<a id="branch-and-tag-rules"></a>

#### main·태그 규칙

`main`은 PR로만 바뀌고, PR은 `CI passed` 검사가 통과해야 머지된다. 저장소 관리자는 긴급할 때 PR
머지에서만 이 검사를 우회할 수 있다. 그래도 릴리스는 §4의 태그 커밋 CI 확인을 거친다.
`v*` 태그는 저장소 관리자만 만들고 옮기고 지울 수 있다. 두 규칙은 저장소 ruleset에 있다.

CI의 `CI passed` 잡은 다른 모든 CI 잡이 성공해야 통과한다. main ruleset이 요구하는 검사는 이 잡 하나이므로,
CI 잡을 추가하거나 이름을 바꿔도 저장소 설정을 고칠 필요가 없다. 새 잡은 `CI passed`의 `needs`에 넣으며,
[`workflow-hardening.test.mjs`](../config/scripts/workflow-hardening.test.mjs)가 이를 검사한다.

SHA 고정과 비밀 격리는 [`workflow-hardening.test.mjs`](../config/scripts/workflow-hardening.test.mjs),
툴체인 고정은 [`dependency-updates.test.mjs`](../config/scripts/dependency-updates.test.mjs)가 `pnpm test`에서 검사한다.
빌드·패키지 스크립트를 실행하는 잡에는 서명 비밀을 전달하지 않는 원칙을 유지한다.

번들 종류는 `src-tauri/tauri.conf.json`의 `bundle.targets: "all"`이 결정한다. Linux 러너를 추가하면 `.AppImage`/`.deb`도 같은 방식으로 붙는다.

<a id="dependency-updates"></a>

### 의존성 업데이트

[Renovate 설정](../.github/renovate.json)은 매주 월요일 00:00~04:00 KST에 새 업데이트를 제안한다.
매니저에 관계없이 minor·patch·digest·pin(액션 SHA의 pinDigest 포함)을 한 PR로 묶는다.
0.x minor는 호환성을 깨뜨릴 수 있으므로 공통 묶음에서 빼고 개별 PR로 만들되, CI 통과 후 자동 머지는 허용한다.
Tauri npm 패키지와 Rust crate는 별도 묶음으로 사람이 머지한다. CI는 데스크톱 앱을 실행하지 않아 런타임 회귀를 보장하지 못한다.
메이저도 수동 머지한다. Node.js·pnpm 메이저는 Dependency Dashboard 승인도 필요하며,
`wrangler.toml`의 빌드 변수와 Node.js의 `@types/node`는 함께 수동 갱신한다.
npm·crate의 `security:minimumReleaseAge*` 프리셋과 액션 SHA 고정은 유지한다.

lock file maintenance는 수동 머지한다. Renovate의 공개 후 3일 유예는 lockfile 재생성에 적용되지 않는다.
[`package.json`](../package.json)에 고정된 pnpm의 기본 유예는 1일이며, 명시하지 않으면 조건을 만족하는 버전이 없을 때 더 새 버전으로 넘어갈 수 있다.
현재 `pnpm-workspace.yaml`에는 유예 기간이 없고 특정 버전 예외만 있으므로 3일 이상 보호를 보장하지 않는다.
pnpm 설정은 Cargo lockfile도 보호하지 않으므로, lock 유지보수 전체를 자동 머지에서 제외한다.
근거: [Renovate 공개 유예 프리셋](https://docs.renovatebot.com/presets-security/),
[pnpm 공개 유예와 strict 설정](https://pnpm.io/settings/dependency-resolution#minimumreleaseage).

Tauri를 제외한 비메이저 묶음과 개별 0.x minor PR에는 GitHub 자동 머지(squash)를 요청한다.
PR 생성 일정과 달리 머지는 요일 제한 없이 필수 `CI passed`가 통과하고 나머지 ruleset 조건을 만족하면 진행된다.
자동 머지된 변경은 main CI 통과 후 웹 편집기와 웹사이트 운영 배포로 이어진다.
[Renovate의 platformAutomerge](https://docs.renovatebot.com/configuration-options/#platformautomerge)는
GitHub의 필수 검사를 사용하므로, 메인테이너가 다음을 설정해야 한다.

1. **Settings → General → Pull Requests → Allow auto-merge**를 켠다. CLI로는 다음과 같다.
   ```bash
   gh api --method PATCH repos/hwantage/CanvaSlide -F allow_auto_merge=true
   gh api repos/hwantage/CanvaSlide --jq '.allow_auto_merge'
   ```
2. **Settings → Rules → Rulesets**에서 [main·태그 규칙](#branch-and-tag-rules)이 적용되어 있는지 확인한다.
   ```bash
   gh api repos/hwantage/CanvaSlide/rules/branches/main
   ```
3. 첫 Renovate 묶음 PR에서 자동 머지 예약과 `CI passed` 대기를 확인한다. 검사가 실패하거나 대기 중이면
   머지되지 않아야 한다. main 규칙의 현재 설정은 최신 main 반영을 필수로 요구하지 않으므로,
   테스트를 통과한 PR이 main보다 뒤처진 상태에서도 머지될 수 있다.

## 5. 실패했을 때

- **CI 대기 잡이 실패**: 재실행은 처음 실행과 같은 커밋을 다시 검사한다.
  - `No CI run from a push to main`: 태그가 `main`에 푸시되어 CI가 돈 커밋(PR의 머지 커밋)이 아닌 곳을
    가리킨다. 공개하지 않은 태그이므로 메인테이너가 지우고 릴리스 PR의 머지 커밋에 다시 만든다.
  - `finished with failure` 등 CI 실패: 일시적 실패이거나 코드 밖 원인(러너, 외부 서비스, 저장소 변수)을
    고쳤으면 태그 커밋의 **CI** 실행을 재실행해 성공시킨 뒤 Release 워크플로의 **Re-run failed jobs**를 누른다.
    코드를 고쳐야 하면 수정 PR을 머지하고, 공개하지 않은 태그를 메인테이너가 지운 뒤 그 머지 커밋에 다시
    만들어 푸시한다. 새 Release 실행이 시작된다.
  - `gh:`로 시작하는 API 오류: Release 워크플로의 **Re-run failed jobs**를 누른다.
- **태그 불일치로 실패**: 태그와 `package.json`의 차이를 확인한다. 아직 공개하지 않은 태그만
  메인테이너가 수정하며, 이미 공개한 버전이면 새 버전·태그를 만든다.
- **한쪽 플랫폼만 실패**: 초안은 두 빌드가 모두 성공해야 만들어진다. Actions에서 **Re-run failed jobs**를 하면
  실패한 빌드만 다시 돌고 macOS 서명·공증, 업데이터 서명, 게시 잡이 이어서 실행된다.
- **macOS 서명·공증 잡이 실패**: 실패 메시지에 따라 고친 뒤 **Re-run failed jobs**를 누른다. 이 잡은 빌드
  아티팩트(`macos-build`)를 바꾸지 않으므로 다시 실행해도 빌드한 파일부터 시작한다.
  - `Missing Apple credentials`: `release` 환경의 Apple secret이 일부만 있다. 여섯 개를 모두 넣거나 모두 지운다(§6).
  - `Notarization of … finished with Invalid`: 이어서 출력된 공증 로그의 문제(서명 누락, hardened runtime 등)를 고친다.
  - `security import` 또는 `codesign` 오류: `.p12`의 암호, 인증서 종류(Developer ID Application), 만료일을 확인한다.
- **업데이터 서명 또는 게시 잡이 실패**: `release` 환경의 서명 키와 암호를 확인한다. 게시 잡이
  `signed with a key other than the one installed apps trust`로 실패하면 환경의 개인키가 공개된 최신 릴리스의
  공개키와 짝이 아니다.
- **Release notes 워크플로가 실패**: 대개 앱의 업데이트 안내에 노트가 없거나 이전 노트가 남는다. 마지막 이름 변경에서
  실패했다면 `latest.json`이 없어 업데이트 확인도 실패하므로 바로 다시 실행한다. **Re-run failed jobs**를 누르거나
  §4의 `gh workflow run release-notes.yml -f tag=<태그>`를 실행하면 남은 `latest.next.json`에서 이어서 교체한다.
  `is a draft`로 실패했다면 공개 전에 실행된 것이므로 공개한 뒤 다시 실행한다.
- **초안을 버리고 다시**: 먼저 실패한 잡 재실행을 사용한다. 초안·태그를 재작성할 필요가 있으면
  공개 여부와 두 플랫폼의 산출물을 확인한 뒤 메인테이너가 처리한다.
- **이미 공개한 버전에 문제**: 공개된 Release의 파일과 태그는 바꾸지 말고(노트 본문은 §3 8단계처럼 고칠 수 있다) §3 절차로 `patch` 버전을 올려 다음 버전을 낸다.
- **로컬에서 재현**: 릴리스 빌드는 키 없이 `pnpm bundle:local`(현재 OS용) 또는
  `pnpm bundle:local --target universal-apple-darwin`으로 재현한다. 서명까지 확인하려면 §7의 서명 키를 환경 변수로
  주고 업데이터 파일마다 `pnpm tauri signer sign <파일>`을 실행한다.

`pnpm bundle:local`은 `tauri build --no-sign`이라 업데이터 개인키도, 셸별 따옴표 처리도 필요 없다.
업데이터 서명(`.sig`)과 OS 코드 서명을 건너뛰므로 배포할 산출물을 검증하는 것은 아니다. CI의 번들 잡과
릴리스 빌드 잡도 `--no-sign`을 쓰고, 서명 키는 릴리스 워크플로의 서명 잡에만 전달한다. macOS 앱 번들만 확인할 때는
다음 명령을 사용한다.

```bash
pnpm bundle:local --bundles app
```

## 6. OS 코드 서명

**2026-09-26 결정:** 비용 부담, Apple Developer Program 미가입, Windows 서명 방식 미정으로
OS 코드 서명과 macOS 공증을 당분간 보류한다. 현재는 macOS와 Windows 모두 OS 코드 서명 없이 배포하며,
macOS 업데이트 알림은 다운로드 페이지를 열도록 안내한다. 아래 서명·공증 절차는 도입을 재개할 때 참고한다.

업데이터 서명(§7)은 계속 유지하며, 이번에 보류한 OS 코드 서명과는 별개다. `release` 환경에 Apple 자격 증명이 있으면 릴리스 워크플로가 macOS 앱을
Developer ID로 서명하고 Apple 공증을 받는다. 자격 증명이 없으면 macOS 앱도 서명하지 않고, Windows 설치 파일은
아직 코드 서명하지 않는다.

### macOS 서명과 공증

빌드 잡은 서명 없이(`--no-sign`) 앱을 만들고, **sign and notarize · macOS** 잡이
[`notarize-macos-release.sh`](../config/scripts/notarize-macos-release.sh)로 다음을 한다.

1. 임시 키체인에 인증서를 넣는다. 빌드한 `.dmg`를 쓰기 가능한 사본으로 열어 그 안의 앱을 hardened runtime과
   타임스탬프를 붙여 서명한다. 디스크 이미지의 창 배치, 볼륨 아이콘, 응용 프로그램 폴더 바로 가기는 그대로 남는다.
2. 앱을 공증에 제출한다. 결과가 `Accepted`가 아니면 공증 로그를 출력하고 실패한다. 통과하면 공증 티켓을 앱에
   붙이고(staple) Gatekeeper 평가(`spctl`)를 확인한다.
3. 서명한 앱으로 업데이터용 `.app.tar.gz`를 다시 만들고, 디스크 이미지를 압축한 뒤 서명·공증·스테이플한다.
4. 두 파일을 `release-macos-latest` 아티팩트로 올려서 업데이터 서명 잡이 공증된 파일에 서명하게 한다. 키체인과
   임시 파일은 성공과 실패에 관계없이 지우고, 사용자 키체인 검색 목록은 원래대로 되돌린다.

자격 증명은 저장소 **Settings → Environments → `release`**의 환경 secret으로 두고, 저장소 수준 secret에는
두지 않는다. 이 환경은 §7처럼 `v*` 태그에서만 쓸 수 있게 제한한다. 제한이 없는 환경은 어느 브랜치의 워크플로에서도
쓸 수 있다.

| Secret                       | 값                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Developer ID Application 인증서와 개인키를 내보낸 `.p12`의 base64(`base64 -i cert.p12`)  |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12`를 내보낼 때 정한 암호                                                             |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: <이름> (<팀 ID>)`, `security find-identity -v -p codesigning` |
| `APPLE_ID`                   | Apple Developer Program에 가입한 Apple 계정                                              |
| `APPLE_PASSWORD`             | 그 계정의 앱 암호(account.apple.com에서 만든 app-specific password)                      |
| `APPLE_TEAM_ID`              | 10자리 팀 ID(developer.apple.com → Membership)                                           |

여섯 개가 모두 없으면 잡은 `No Apple credentials` 경고만 남기고 빌드한 파일을 그대로 넘긴다. 이때 릴리스는
지금까지처럼 서명 없이 나간다. 일부만 있으면 서명하기 전에 실패한다. 공증한 릴리스의 `latest.json`에서는 macOS
항목에 `"notarized": true`가 붙고, 이 표시가 있는 업데이트만 macOS 앱이 앱 안에서 설치한다(§7). 서명을 시작한
뒤에는 secret을 지우지 않는다. 지우면 다음 릴리스가 서명 없이 나가고 macOS 앱은 다시 다운로드 페이지로 안내한다.

인증서와 계정을 확인하려면 그 인증서가 있는 Mac에서 같은 환경 변수를 주고 릴리스 아티팩트(`.dmg`와
`.app.tar.gz`)가 든 폴더로 `bash config/scripts/notarize-macos-release.sh <폴더>`를 실행한다. 스크립트는 폴더의
두 파일을 서명한 파일로 바꾸고, 사용자 키체인 검색 목록에 임시 키체인을 잠시 넣었다가 되돌린다.

### Windows 서명

Windows 설치 파일에는 아직 Authenticode 서명이 없다. 서명 서비스(Azure Trusted Signing, 또는 SignPath
Foundation 같은 오픈소스 프로그램)는 메인테이너가 정한다(#146). 붙일 때도 macOS처럼 빌드 잡에는 자격 증명을 주지
않고, 서명 전용 잡이 빌드 산출물을 서명한 뒤 업데이터 서명 잡이 그 파일에 서명하게 한다. 설치 파일 안의 실행
파일까지 서명하려면 `tauri build --no-bundle`로 실행 파일만 만들어 서명하고, `tauri bundle`로 설치 파일을 만든 뒤
설치 파일을 서명한다.

### 서명 없는 배포의 안내

서명 없는 설치 파일에서 나타날 수 있는 다음 경고와 설치 방법을 릴리스 노트에 안내한다. macOS 안내는 macOS
파일을 서명하지 못한 릴리스에만 넣는다.

해결 방법은 macOS 버전보다 경고 문구에 따라 다르다. 서명하지 않은 빌드의 Apple Silicon 코드는 링커가 붙인 임시 서명만 있고
번들 리소스가 봉인되지 않아 서명 검증에 실패하므로, Apple Silicon Mac에서는 "손상" 경고가 나올 수 있다.

- **macOS, "손상되었기 때문에 열 수 없습니다"**: 이 경고는 **그래도 열기**나 우클릭 → 열기로 넘길 수 없다. 앱을
  응용 프로그램 폴더에 옮긴 뒤 `xattr -d com.apple.quarantine /Applications/CanvaSlide.app`을 실행해 격리 속성을 지운다.
- **macOS, 그 밖의 차단 경고**(확인되지 않은 개발자, Apple이 악성 코드 여부를 확인할 수 없음 등):
  - macOS 15(Sequoia) 이상: 경고를 닫고 **시스템 설정 → 개인정보 보호 및 보안** 아래쪽의 CanvaSlide 항목에서
    **그래도 열기**를 누른 뒤 암호로 확인한다. macOS 15부터 Finder의 우클릭 → 열기로는 이 차단을 넘길 수 없다.
  - macOS 13–14: Finder에서 앱을 Control-클릭(우클릭) → **열기**. **시스템 설정 → 개인정보 보호 및 보안**에서도 열 수 있다.
  - macOS 12: Finder에서 앱을 Control-클릭(우클릭) → **열기**. **시스템 환경설정 → 보안 및 개인 정보 보호 → 일반**에서도
    열 수 있다.
- **Windows**: SmartScreen "PC 보호" 화면. **추가 정보 → 실행**.

릴리스 노트는 영어로 쓰므로 다음 문구를 그대로 쓸 수 있다.

```markdown
- **macOS, "CanvaSlide is damaged and can't be opened":** Finder and System Settings offer no way past
  this alert. Move the app to Applications and run
  `xattr -d com.apple.quarantine /Applications/CanvaSlide.app`.
- **macOS 15 and later, any other alert:** Close the alert, open **System Settings → Privacy & Security**,
  click **Open Anyway** next to CanvaSlide and confirm.
- **macOS 12–14, any other alert:** Control-click (right-click) `CanvaSlide.app` in Finder and choose **Open**.
- **Windows:** If SmartScreen appears, click **More info → Run anyway**.
```

## 7. 자동 업데이트

업데이트 확인 시점·플랫폼별 동작·전송 데이터는 README의
[Network and privacy](../README.md#network-and-privacy)를 기준으로 한다.
설정 조작 방법은 [웹사이트 안내](https://hwantage.github.io/CanvaSlide/docs/?lang=ko&guide=faq#network-and-privacy)를 따른다.
확인과 설치 구현은 [`use-update-check.ts`](../src/renderer/src/hooks/use-update-check.ts)와
[`app-update.ts`](../src/renderer/src/platform/app-update.ts)에 있다.

관리되는 네트워크에서 모든 사용자의 확인 요청을 막으려면
[`tauri.conf.json`](../src-tauri/tauri.conf.json)의 `plugins.updater.endpoints`에 있는 매니페스트 URL을 차단한다.

**설치 후 다시 시작**을 누르면 저장하지 않은 변경에 대해 **저장 / 변경 내용 버리기 / 취소**를 묻는다.
저장 대화상자를 취소하거나 저장에 실패하면 설치하지 않는다. 확인·저장·다운로드 중 문서가 바뀌면 설치를
중단하고 업데이트를 다시 선택할 수 있게 한다. 다운로드가 끝난 뒤 실제 설치 직전에 한 번 더 확인하므로
Windows 설치 프로그램이 앱을 종료하는 경로에도 적용된다.
최종 확인을 통과하면 설치 전에 일반 종료와 같은 복구 사본 정리를 최대 2초 기다린다. 정리 중 문서가
바뀌면 설치를 취소하고 복구 저장을 재개한다. 설치나 재시작이 실패해도 복구 저장을 재개한다. 정리 실패나
시간 초과는 일반 종료처럼 설치를 막지 않으므로 복구 사본 제거가 항상 완료되는 것은 아니다.

동작 원리:

- 빌드가 `bundle.createUpdaterArtifacts`로 업데이터 파일을 만들고(공증한 릴리스의 macOS 파일은 notarize 잡이
  서명한 앱으로 다시 만든다, §6), 서명 잡이 그 서명 파일(`.sig`)을, 게시 잡이 `latest.json`을 만들어 Release에 첨부한다(§4). 앱은 `https://github.com/hwantage/CanvaSlide/releases/latest/download/latest.json`만 본다. 그래서 **초안을 Publish 해야** 사용자에게 보인다.
- 서명 키: 공개키는 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 있다. 개인키와 암호는
  저장소 Settings → Environments → `release`의 환경 secret `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`에 두고, 이 환경은 `v*` 태그에서만 쓸 수 있게 제한한다. 저장소 수준
  secret에는 두지 않는다.
- 키는 암호로 보호하고, 개인키와 암호를 저장소 밖에 오프라인으로 따로 백업한다. 보관 위치와 백업은 메인테이너가
  관리한다. **키를 잃으면 같은 키로 후속 업데이트를 서명할 수 없다.**
- 키 교체: 설치된 앱은 자기 `tauri.conf.json`의 공개키 하나만 신뢰한다.
  1. `pnpm tauri signer generate`로 암호가 있는 새 키를 만든다.
  2. 새 공개키를 `tauri.conf.json`에 넣은 버전을 **기존 키로 서명해** 릴리스한다. 이 업데이트를 받은 설치본은
     다음부터 새 키를 신뢰한다.
  3. 그 버전을 충분히 오래 최신으로 둔 뒤 `release` 환경의 secret을 새 키로 바꾸고 다음 버전을 릴리스한다.
     2단계 이후의 릴리스는 모두 새 키로 서명해야 하며, 게시 잡이 공개된 최신 릴리스의 공개키로 이를 검사한다.
  4. 2단계 버전을 받지 않은 설치본은 새 키로 서명된 업데이트를 받을 수 없으니 릴리스 노트로 수동 재설치를 안내한다.

  기존 키를 잃었거나 노출됐다면 2단계를 할 수 없다. 새 공개키를 넣은 버전을 새 키로 서명해 릴리스하고, 모든
  사용자에게 수동 재설치를 안내한다. 게시 잡은 기본적으로 공개된 최신 릴리스의 공개키만 신뢰하므로, 태그를 올리기 전에
  `gh variable set UPDATER_KEY_CHANGE_TAG --body <태그>`로 이 태그에 한해 새 공개키를 허용하고 게시가 끝나면
  `gh variable delete UPDATER_KEY_CHANGE_TAG`로 지운다.

- 로컬에서 서명까지 확인하려면 §5처럼 `pnpm bundle:local`로 빌드한 뒤, 같은 서명 키를 환경 변수로 주고
  업데이터 파일마다 `pnpm tauri signer sign <파일>`을 실행한다.
- 릴리스 노트: 앱의 업데이트 안내는 `latest.json`의 `notes`를 보여 준다. 이 값은 공개된 Release 본문을
  **Release notes** 워크플로가 옮긴 것이다(§4). 노트는 Release 본문에서만 고친다.
- Windows 설치 방식: `tauri.conf.json`에 `plugins.updater.windows.installMode`가 없어 업데이터 플러그인의 기본값
  `passive`를 쓴다. 설치 창에는 진행 표시줄만 나온다. NSIS 설치 파일로 설치한 앱은 `-setup.exe`를 받고, 현재
  사용자용 설치(`bundle.windows.nsis.installMode: "currentUser"`)라 사용자 입력이 필요 없다. MSI로 설치한 앱은
  `.msi`를 받는데, Tauri의 MSI는 기기 전체 설치라 Windows가 관리자 확인(UAC)을 요청한다
  (`latest.json`의 `windows-x86_64-nsis`, `windows-x86_64-msi`).
