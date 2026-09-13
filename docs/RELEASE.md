# CanvaSlide — 릴리즈 가이드

> 작성일: 2026-09-13 · 워크플로: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

git 태그 하나로 macOS·Windows 설치 파일을 빌드해 GitHub Release에 첨부하는 절차를 정리한다.
릴리즈는 메인테이너가 수행하며, 코드 기여 규칙은 [`CONTRIBUTING.md`](../CONTRIBUTING.md)를 따른다.

## 1. 한눈에 보기

```bash
npm version minor        # ① package.json 버전 올리고 커밋 + v0.x.0 태그 생성
git push --follow-tags   # ② 태그가 올라가면 release.yml 이 실행된다
# ③ GitHub → Releases 에서 초안(draft)을 열어 노트를 다듬고 Publish
```

| 단계      | 누가       | 걸리는 시간 |
| --------- | ---------- | ----------- |
| 버전·태그 | 메인테이너 | 1분         |
| 빌드·첨부 | GitHub CI  | 10~15분     |
| 노트·공개 | 메인테이너 | 5분         |

## 2. 버전 규칙

- 버전은 **`package.json` 한 곳**에만 있다. `src-tauri/tauri.conf.json`은 `"version": "../package.json"`으로 그 값을 읽는다. `src-tauri/Cargo.toml`의 버전은 번들에 쓰이지 않으므로 손대지 않는다.
- [SemVer](https://semver.org)를 따른다. 1.0 전에는 `minor`가 기능 추가, `patch`가 버그 수정이다.
  - `npm version patch` → 0.1.0 → 0.1.1
  - `npm version minor` → 0.1.0 → 0.2.0
  - `npm version major` → 0.1.0 → 1.0.0
- `npm version`은 `package.json`을 고치고 `v0.2.0` 같은 커밋과 주석 태그를 함께 만든다. 작업 트리가 깨끗해야(`git status` 비어 있어야) 실행된다.
- 태그 이름과 `package.json` 버전이 다르면 워크플로가 빌드 전에 실패한다. 손으로 태그를 만들 때는 `v` 접두사를 붙이고 버전을 맞춘다.

## 3. 릴리즈 절차

1. `main`이 CI를 통과했는지 확인한다(Actions 탭의 **CI** 워크플로가 초록색).
2. 로컬에서 `main`을 최신으로 맞춘다.
   ```bash
   git switch main && git pull
   pnpm check && pnpm test:e2e     # 선택: 로컬에서 한 번 더
   ```
3. 버전을 올린다.
   ```bash
   npm version minor
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
7. **Publish release**를 누른다. 공개 전까지는 아무도 볼 수 없으므로 초안 단계에서 얼마든지 다시 빌드해도 된다.

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

- **태그 불일치로 실패**: `package.json`을 고쳐 커밋한 뒤 태그를 옮긴다.
  ```bash
  git tag -d v0.2.0 && git push origin :refs/tags/v0.2.0
  git tag v0.2.0 && git push --follow-tags
  ```
- **한쪽 플랫폼만 실패**: Actions에서 실패한 잡만 **Re-run failed jobs** 하면 같은 초안에 파일이 추가된다.
- **초안을 버리고 다시**: Releases에서 초안을 삭제하고 태그를 다시 푸시한다(위 명령).
- **이미 공개한 버전에 문제**: 공개된 Release는 수정하지 말고 `npm version patch`로 다음 버전을 낸다.
- **로컬에서 재현**: `pnpm tauri build`(현재 OS용) 또는 `pnpm tauri build --target universal-apple-darwin`.

## 6. 코드 서명 (아직 없음)

서명 없이 배포하면 다음 경고가 뜬다. 릴리즈 노트에 안내한다.

- **macOS**: "손상되었기 때문에 열 수 없습니다" 또는 Gatekeeper 차단. 우클릭 → 열기, 또는
  `xattr -d com.apple.quarantine /Applications/CanvaSlide.app`.
- **Windows**: SmartScreen "PC 보호" 화면. **추가 정보 → 실행**.

서명을 붙이려면 저장소 **Settings → Secrets**에 아래를 넣고 `release.yml`의 `tauri-action` 단계 `env`에 전달하면 된다. `tauri-action`이 서명·공증까지 처리한다.

| 플랫폼  | 준비물                                          | Secrets                                                                                                                    |
| ------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| macOS   | Apple Developer 계정, Developer ID 인증서(.p12) | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | 코드 서명 인증서(EV 권장)                       | `tauri.conf.json`의 `bundle.windows.certificateThumbprint` 또는 Azure Trusted Signing 설정                                 |

## 7. 자동 업데이트 (다음 단계)

`tauri-plugin-updater`를 붙이면 앱이 최신 Release의 `latest.json`을 읽어 스스로 갱신한다. 필요한 작업:

1. `pnpm tauri signer generate`로 업데이트 서명 키 쌍을 만들고 비밀키를 `TAURI_SIGNING_PRIVATE_KEY` Secret에 저장.
2. `tauri.conf.json`에 `plugins.updater.endpoints`와 공개키, `bundle.createUpdaterArtifacts: true` 추가.
3. `release.yml`에서 `tauri-action`의 `includeUpdaterJson: true`.
4. 앱에 업데이트 확인 UI 추가(설정 다이얼로그가 적당하다).

릴리즈 흐름이 한두 번 자리 잡은 뒤에 별도 작업으로 진행한다.
