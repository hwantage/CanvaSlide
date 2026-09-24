# CanvaSlide — 릴리즈 가이드

워크플로: [`.github/workflows/release.yml`](../.github/workflows/release.yml) · [문서 목록](./README.md)

git 태그 하나로 macOS·Windows 설치 파일을 빌드해 GitHub Release에 첨부하는 절차를 정리한다.
릴리즈는 메인테이너가 수행하며, 코드 규칙과 검증은 [`AGENTS.md`](../AGENTS.md), 기여 절차는 [`CONTRIBUTING.md`](../CONTRIBUTING.md)를 따른다.

## 1. 한눈에 보기

```bash
pnpm version minor       # ① package.json 버전 올리고 커밋 + v0.x.0 태그 생성
git push --follow-tags   # ② 태그가 올라가면 release.yml 이 실행된다
# ③ GitHub → Releases 에서 초안(draft)을 열어 노트를 다듬고 Publish
```

## 2. 버전 규칙

- 버전은 **`package.json` 한 곳**에만 있다. `src-tauri/tauri.conf.json`은 `"version": "../package.json"`으로 그 값을 읽는다. `src-tauri/Cargo.toml`의 버전은 번들에 쓰이지 않으므로 손대지 않는다.
- [SemVer](https://semver.org)를 따른다. 1.0 전에는 `minor`가 기능 추가, `patch`가 버그 수정이다.
  - `pnpm version patch` → 0.1.0 → 0.1.1
  - `pnpm version minor` → 0.1.0 → 0.2.0
  - `pnpm version major` → 0.1.0 → 1.0.0
- `pnpm version`은 `package.json`을 고치고 `v0.2.0` 같은 커밋과 주석 태그를 함께 만든다. 작업 트리가 깨끗해야(`git status` 비어 있어야) 실행된다.
- 태그 이름과 `package.json` 버전이 다르면 워크플로가 빌드 전에 실패한다. 손으로 태그를 만들 때는 `v` 접두사를 붙이고 버전을 맞춘다.

## 3. 릴리즈 절차

1. `main`이 CI를 통과했는지 확인한다(Actions 탭의 **CI** 워크플로가 초록색).
   데스크톱 클라우드 공유를 제공할 때는 저장소 **Settings → Secrets and variables → Actions → Variables**의
   `VITE_CLOUD_SHARE_URL`을 배포된 편집기의 HTTPS origin으로 설정한다(예: `https://canvaslide.pages.dev`).
   CI 번들과 릴리즈 빌드는 이 값을 Vite와 Rust에 함께 전달한다. 값이 없으면 데스크톱 공유가 비활성화된다.
2. 로컬에서 `main`을 최신으로 맞춘다.
   ```bash
   git switch main && git pull
   pnpm check && pnpm test:e2e     # 선택: 로컬에서 한 번 더
   ```
3. 버전을 올린다.
   ```bash
   pnpm version minor
   ```
4. 커밋과 태그를 푸시한다.
   ```bash
   git push --follow-tags
   ```
5. Actions 탭에서 **Release** 워크플로가 끝나기를 기다린다. macOS와 Windows가 병렬로 돈다.
6. **Releases** 페이지에 초안이 생겨 있다. 다음을 확인한다.
   - 첨부 파일: `CanvaSlide_<버전>_universal.dmg`, `CanvaSlide_<버전>_x64-setup.exe`, `CanvaSlide_<버전>_x64_en-US.msi`
   - **Generate release notes** 버튼을 눌러 지난 태그 이후 머지된 PR 제목을 불러온 뒤 사용자 관점으로 다듬는다.
   - 서명이 없는 동안은 §6의 안내 문구를 노트에 넣는다.
7. **Publish release**를 누른다. 초안은 일반 사용자에게 배포되지 않는다. 공개한 태그는 옮기지 않는다.

## 4. 워크플로가 하는 일

`release.yml`은 `v*` 태그 푸시에서만 실행되며 `contents: write` 권한으로 Release를 만든다.

| 잡                | 러너             | 산출물                                 |
| ----------------- | ---------------- | -------------------------------------- |
| macOS (universal) | `macos-latest`   | `.dmg`, `.app` (Apple Silicon + Intel) |
| Windows (x64)     | `windows-latest` | `.exe` (NSIS 설치 파일), `.msi`        |

각 잡은 다음 순서로 진행한다.

1. pnpm·Node 22·Rust stable 준비(맥은 `aarch64-apple-darwin`, `x86_64-apple-darwin` 타깃 추가).
2. `pnpm install --frozen-lockfile`.
3. 태그 ↔ `package.json` 버전 일치 검사.
4. `tauri-apps/tauri-action`이 `pnpm build:web`(tauri.conf.json의 `beforeBuildCommand`) → `tauri build`를 실행하고, 같은 태그의 Release 초안을 찾거나 만들어 번들을 업로드한다. 두 잡이 같은 초안에 파일을 덧붙인다.

번들 종류는 `src-tauri/tauri.conf.json`의 `bundle.targets: "all"`이 결정한다. Linux 러너를 추가하면 `.AppImage`/`.deb`도 같은 방식으로 붙는다.

## 5. 실패했을 때

- **태그 불일치로 실패**: 태그와 `package.json`의 차이를 확인한다. 아직 공개하지 않은 태그만
  메인테이너가 수정하며, 이미 공개한 버전이면 새 버전·태그를 만든다.
- **한쪽 플랫폼만 실패**: Actions에서 실패한 잡만 **Re-run failed jobs** 하면 같은 초안에 파일이 추가된다.
- **초안을 버리고 다시**: 먼저 실패한 잡 재실행을 사용한다. 초안·태그를 재작성할 필요가 있으면
  공개 여부와 두 플랫폼의 산출물을 확인한 뒤 메인테이너가 처리한다.
- **이미 공개한 버전에 문제**: 공개된 Release는 수정하지 말고 `pnpm version patch`로 다음 버전을 낸다.
- **로컬에서 재현**: 서명 단계까지 릴리즈와 같게 확인하려면 §7의 서명 키를 환경 변수로 주고 `pnpm tauri build`(현재 OS용)
  또는 `pnpm tauri build --target universal-apple-darwin`을 실행한다. 서명 외의 단계만 볼 때는 키 없이 `pnpm bundle:local`을 쓴다.

`pnpm bundle:local`은 `tauri build --no-sign`이라 업데이터 개인키도, 셸별 따옴표 처리도 필요 없다.
업데이터 서명(`.sig`)과 OS 코드 서명을 건너뛰므로 배포할 산출물을 검증하는 것은 아니다. CI의 번들 잡도
같은 이유로 `--no-sign`을 쓰고, 서명 키는 릴리즈 워크플로에만 전달한다. macOS 앱 번들만 확인할 때는
다음 명령을 사용한다.

```bash
pnpm bundle:local --bundles app
```

## 6. OS 코드 서명

현재 릴리즈 워크플로는 업데이터 서명 키를 전달하지만 Apple/Windows 코드 서명 자격 증명은
설정하지 않는다. 업데이터 서명과 OS 코드 서명은 별개다. 서명 없는 배포에서 나타날 수 있는
다음 경고와 설치 방법을 릴리즈 노트에 안내한다.

- **macOS**: "손상되었기 때문에 열 수 없습니다" 또는 Gatekeeper 차단. 우클릭 → 열기, 또는
  `xattr -d com.apple.quarantine /Applications/CanvaSlide.app`.
- **Windows**: SmartScreen "PC 보호" 화면. **추가 정보 → 실행**.

서명을 붙이려면 저장소 **Settings → Secrets**에 아래를 넣고 `release.yml`의 `tauri-action` 단계 `env`에 전달하면 된다. `tauri-action`이 서명·공증까지 처리한다.

| 플랫폼  | 준비물                                          | Secrets                                                                                                                    |
| ------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| macOS   | Apple Developer 계정, Developer ID 인증서(.p12) | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | 코드 서명 인증서(EV 권장)                       | `tauri.conf.json`의 `bundle.windows.certificateThumbprint` 또는 Azure Trusted Signing 설정                                 |

## 7. 자동 업데이트

데스크톱 앱은 시작 3초 뒤 한 번 업데이트를 확인한다. **CanvaSlide 정보** 대화상자에서 현재 버전,
릴리즈 노트 링크와 업데이트 상태를 표시하고, 새 버전이 있으면 설치 또는 다운로드 페이지 버튼을 제공한다.
macOS 메뉴의 **Check for Updates…**는 정보 대화상자를 열고 다시 확인한다. 동작은
[`use-update-check.ts`](../src/renderer/src/hooks/use-update-check.ts)와
[`app-update.ts`](../src/renderer/src/platform/app-update.ts)에서 확인한다.

| 플랫폼   | 동작                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Windows  | 새 버전을 앱 안에서 내려받아 설치하고 다시 시작한다(NSIS 조용한 설치).                                     |
| macOS    | 새 버전을 알리고 **다운로드 페이지 열기**로 릴리즈 페이지를 연다. Apple 서명이 생기면 앱 내 설치로 바꾼다. |
| 브라우저 | 자동 업데이트를 조회·설치하지 않는다. 정보 대화상자의 릴리즈 노트 링크로 공개 버전을 확인한다.             |

동작 원리:

- 릴리즈 워크플로가 `bundle.createUpdaterArtifacts`로 서명 파일(`.sig`)을 만들고, `tauri-action`의 `includeUpdaterJson`이 **`latest.json`**을 Release에 첨부한다. 앱은 `https://github.com/hwantage/CanvaSlide/releases/latest/download/latest.json`만 본다. 그래서 **초안을 Publish 해야** 사용자에게 보인다.
- 서명 키: 공개키는 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`, 비밀키는 저장소 Secret
  `TAURI_SIGNING_PRIVATE_KEY`로 전달한다. 암호가 있으면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`도 설정한다.
  개인키 보관 위치와 백업은 메인테이너가 관리한다. **키를 잃으면 같은 키로 후속 업데이트를 서명할 수 없다.**
  키를 교체하려면 기존 설치본의 신뢰 키 전환 또는 수동 재설치 계획이 필요하다.
- 로컬에서 서명된 업데이터 산출물까지 만들려면 같은 서명 키를 환경 변수로 주고 `pnpm tauri build`를 실행한다.
  개인키 없는 번들 검증은 §5의 `pnpm bundle:local`을 따른다.
- 릴리즈 노트: `latest.json`의 `notes`는 Release 본문에서 온다. 초안에 노트를 쓴 뒤 Publish 하면 앱의 업데이트 안내에 그대로 보인다.
