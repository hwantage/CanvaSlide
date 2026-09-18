# CanvaSlide — 구현 계획 PRD

> 작성일: 2026-09-12 · 상태: v1 확정 · 대상 플랫폼: macOS, Windows

## 1. 개요

Miro 스타일의 **무한 캔버스 데스크톱 앱**. 사용자는 텍스트·도형·이미지를 자유롭게 배치하고 꾸미며,
**Presentation Frame**을 캔버스 위에 배치한 뒤 슬라이드쇼를 실행하면 카메라가 프레임 사이를
연속적인 줌/팬 애니메이션으로 이동한다.

- 런타임: **Tauri 2** (Rust 셸 + 시스템 WebView). Electron 대비 배포 용량·메모리 부담이 작다.
- 프론트엔드: **React 19 + TypeScript + Vite + Tailwind v4 + zustand**
- 기초 구조: `orca` 저장소 컨벤션을 따른다 (`src/renderer`, `src/shared`, `config/`, `tests/`,
  oxlint/oxfmt, vitest, husky + lint-staged, 파일당 max-lines 제한, 도메인 중심 파일명).

## 2. 목표 / 비목표

### 목표 (v1)

| ID  | 요구사항                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- |
| G1  | 무한 캔버스: 제한 없는 팬/줌, 커서 기준 줌, 트랙패드 핀치, 휠 팬                                          |
| G2  | 도구: 선택(Select), 손(Pan), 텍스트, 사각형, 타원, 마름모, 프레임                                         |
| G3  | 요소 편집: 이동, 8방향 리사이즈, 다중 선택(드래그 박스, Shift+클릭), 삭제, 복제, z-order                  |
| G4  | 스타일: 채우기/테두리 색, 테두리 두께, 텍스트 색·크기·정렬, 프레임 이름                                   |
| G5  | 이미지: 클립보드 **paste**로 이미지 배치(PNG/JPEG), 리사이즈 (비율 유지)                                  |
| G6  | Presentation Frame: 캔버스 위 영역, 순서(번호) 표시, 순서 재정렬                                          |
| G7  | 슬라이드쇼: 시작/이전/다음/종료, 프레임 크기에 맞춰 **연속 줌+팬** 애니메이션                             |
| G8  | 이동 시간 옵션(UI 슬라이더): 전환 1회의 **소요 시간**을 고정 → 거리가 멀면 빠르게, 가까우면 천천히 느껴짐 |
| G9  | 파일: 새로 만들기 / 열기 / 저장 / 다른 이름으로 저장 (`.canvaslide`)                                      |
| G10 | Undo/Redo                                                                                                 |
| G11 | macOS·Windows 단축키 (⌘ / Ctrl 자동 매핑)                                                                 |

### 비목표 (v1 제외)

- 실시간 협업, 클라우드 동기화, 계정
- 연결선(커넥터)·자유 드로잉(펜)·스티커
- PDF/PNG 내보내기 — v2 후보 (단일 HTML 플레이어 익스포트는 v1.1에서 구현)

## 3. 사용자 시나리오

1. 앱 실행 → 빈 캔버스. 툴바에서 **사각형** 선택 후 드래그로 생성. 속성 패널에서 색 변경.
2. **T**(텍스트) 선택 후 클릭 → 인라인 편집 → 밖을 클릭하면 확정.
3. 스크린샷을 복사 → 캔버스에서 **⌘V** → 뷰포트 중앙에 이미지 배치.
4. **F**(프레임) 도구로 여러 프레임 배치 → 프레임 번호가 자동 부여.
5. 우측 상단 **Present** 클릭 → 프레임 1로 줌 → **→ / Space**로 다음 프레임 → 카메라가
   부드럽게 이동/확대/축소 → **Esc**로 종료.
6. 설정에서 전환 시간을 0.3s~3s 범위로 조정.

## 4. 아키텍처

```
canvaslide/
├─ src/
│  ├─ renderer/                # 프론트엔드 (Vite root)
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ main.tsx, App.tsx
│  │     ├─ assets/main.css    # 디자인 토큰(:root/.dark) + Tailwind @theme
│  │     ├─ components/
│  │     │  ├─ canvas/         # 뷰포트, 월드 레이어, 요소 렌더러, 선택 오버레이
│  │     │  ├─ toolbar/        # 도구 툴바, 줌 컨트롤, 프레젠테이션 컨트롤
│  │     │  ├─ panels/         # 속성 패널, 프레임 목록
│  │     │  └─ ui/             # 소형 프리미티브(button, slider, …)
│  │     ├─ hooks/             # 포인터 제스처, 휠 줌, 단축키, 이미지 paste
│  │     ├─ store/             # zustand 스토어 (document/history, camera, tool, presentation)
│  │     └─ platform/          # Tauri ↔ 브라우저 파일 IO 추상화
│  └─ shared/                  # 순수 도메인 로직 (React/Tauri 의존 없음, 단위 테스트 100%)
│     └─ canvas/
│        ├─ element-types.ts           # 요소/문서 타입 + zod 스키마
│        ├─ camera-transform.ts        # world↔screen 변환, 커서 기준 줌
│        ├─ zoom-pan-interpolation.ts  # van Wijk & Nuij 부드러운 줌/팬 보간
│        ├─ frame-fit.ts               # 프레임 → 카메라(fit) 계산
│        ├─ element-bounds.ts          # AABB, 합집합, 포함/교차, 히트테스트
│        ├─ resize-handles.ts          # 8방향 리사이즈 수학
│        ├─ presentation-sequence.ts   # 프레임 순서, 다음/이전 계산
│        └─ document-file.ts           # 직렬화/역직렬화, 버전 마이그레이션
├─ src-tauri/                  # Rust 셸 (Tauri 관례상 이름 고정)
│  ├─ src/main.rs, lib.rs, document_io.rs
│  ├─ Cargo.toml, tauri.conf.json, capabilities/
├─ config/                     # 툴 설정 (tsconfig.*, vitest.config.ts, oxlint 등)
├─ tests/e2e/                  # (v1.1) Playwright 브라우저 모드 E2E
├─ docs/                       # PRD, 리포트, 스타일가이드
└─ .github/workflows/          # lint / typecheck / test / tauri build
```

### 4.1 렌더링 전략

- **DOM 기반 월드 레이어**: `<div class="world" style="transform: translate(tx,ty) scale(z)">` 아래에
  요소를 절대 좌표로 배치. 도형은 인라인 SVG, 텍스트는 contentEditable, 이미지는 `<img>`.
- 선택 핸들·드래그 박스는 **스크린 좌표 오버레이**로 렌더 → 줌에 무관한 고정 픽셀 크기.
- 카메라 변경은 store → 단일 transform 갱신 → GPU 합성. 요소 개수 수백 개 범위에서 60fps 목표.
- Canvas2D/WebGL 전환은 v2 이슈로 남긴다(요소 수천 개 이상일 때).

### 4.2 카메라 모델

```
Camera = { x, y, zoom }        // x,y = 월드 원점의 스크린 좌표(px)
screen = world * zoom + (x, y)
world  = (screen - (x, y)) / zoom
```

- 커서 기준 줌: 줌 전후 커서의 월드 좌표가 동일하도록 x,y 보정.
- 줌 범위 0.02 ~ 64, 휠 델타는 지수 스케일.

### 4.3 슬라이드쇼 전환 (핵심)

- 프레임 → 목표 카메라: 프레임 AABB를 뷰포트에 **contain** 피팅 (여백 4%).
- 보간: **van Wijk & Nuij (2003) "Smooth and efficient zooming and panning"** 을 구현.
  d3.interpolateZoom과 동일한 수학으로, 먼 거리는 자동으로 "줌아웃 → 이동 → 줌인" 궤적을 그리고
  가까운 거리는 직선에 가까운 궤적이 된다.
- 설정의 **전환 시간(ms)** 은 문서 기본값이다. 전환 시간이 고정이므로 먼 거리는 빠르게, 가까운 거리는
  천천히 움직이는 것처럼 느껴진다(G8).
- 프레임은 그 기본값을 **재정의**할 수 있다: 전환 시간·가속 곡선·궤적(van Wijk ρ)·기울기·스포트라이트를
  프레임마다 따로 둔다. 실제 값은 `resolveFrameTransition()`이 문서 기본값을 적용해 한 곳에서 정하고,
  편집기와 HTML 익스포트 플레이어가 같은 함수를 쓴다.
- `requestAnimationFrame` 루프에서 `t∈[0,1]`를 가속 곡선(기본 easeInOutCubic) 후 보간기에 입력.
- 전환 도중 키 입력 시 현재 위치에서 새 목표로 재시작(중단 없는 재타게팅).

### 4.4 상태 관리

- `document-store`: 요소 맵 + 순서 배열 + 선택. 모든 변경은 `commit(label)` 로 history 스냅샷.
- `camera-store`: 카메라 + 뷰포트 크기. history 대상 아님.
- `tool-store`: 활성 도구, 드래그 중간 상태.
- `presentation-store`: 활성 여부, 현재 인덱스, 전환 시간(ms), 애니메이션 핸들.
- 렌더 성능: 각 컴포넌트는 **선택자(selector)** 로 필요한 슬라이스만 구독.

### 4.5 파일 IO

- 문서 형식: `{ version: 1, elements: [...], camera, settings }` JSON. zod로 검증.
- Tauri: `dialog` 플러그인으로 경로 선택, Rust 커맨드 `read_document`/`write_document` 로 IO.
- 브라우저 dev 모드(`pnpm dev:web`): File System Access API 없이 다운로드/파일 input 폴백.
- 이미지는 data URL로 저장하되 **포맷 v2**부터 `assets` 테이블에 내용 해시로 한 번만 두고 요소는 참조(v1 자동 마이그레이션).
  큰 이미지는 붙여넣기 시 최대 2048px로 다운스케일.
- **HTML 익스포트(v1.1)**: `src/player/` 바닐라 플레이어를 IIFE로 번들해 문서 JSON과 함께 단일 HTML로 저장. 품질 옵션·예상 크기 표시.

### 4.6 크로스플랫폼

- `isMacPlatform()` 로 `metaKey`/`ctrlKey` 선택. 단축키 라벨 ⌘/Ctrl 자동 전환.
- Tauri 번들: macOS `.dmg`/`.app`, Windows `.msi`/`.exe`(NSIS). CI 매트릭스 빌드.

## 5. 단축키

| 동작                                     | macOS                              | Windows               |
| ---------------------------------------- | ---------------------------------- | --------------------- |
| 선택/손/텍스트/사각형/타원/마름모/프레임 | V / H / T / R / O / D / F          | 동일                  |
| Undo / Redo                              | ⌘Z / ⇧⌘Z                           | Ctrl+Z / Ctrl+Y       |
| 복제 / 삭제 / 전체선택                   | ⌘D / ⌫ / ⌘A                        | Ctrl+D / Del / Ctrl+A |
| 붙여넣기(이미지)                         | ⌘V                                 | Ctrl+V                |
| 줌 인/아웃/100%/전체보기                 | ⌘+ / ⌘- / ⌘0 / ⇧1                  | Ctrl 동일             |
| 저장 / 열기 / 새 문서                    | ⌘S / ⌘O / ⌘N                       | Ctrl 동일             |
| 프레젠테이션 시작 / 다음 / 이전 / 종료   | ⌘⏎ / → Space / ← / Esc             | Ctrl+Enter 등         |
| 임시 팬                                  | Space + 드래그, 가운데 버튼 드래그 | 동일                  |

## 6. 품질 기준

- `pnpm lint` (oxlint + 독립 줄 수 검사, TS/TSX 800줄·테스트 1000줄 상한) · `pnpm tc` (tsc strict) ·
  `pnpm test` (검사 도구 회귀 테스트 + vitest) 모두 green. 세부 정책은 [기여 가이드](../CONTRIBUTING.md#code-rules)를 따른다.
- `src/shared/**` 순수 모듈은 단위 테스트 필수(카메라 수학, 보간, 피팅, 히트테스트, 직렬화, 히스토리).
- 스토어 로직(undo/redo, 선택, 프레임 순서)은 happy-dom 환경에서 테스트.
- husky pre-commit: oxlint + oxfmt.
- CI: lint → typecheck → test → tauri build(macOS, Windows).

## 7. 마일스톤

| #   | 범위                                                             | 산출물                           |
| --- | ---------------------------------------------------------------- | -------------------------------- |
| M0  | 스캐폴딩: Tauri 2 + Vite + React, 툴체인, CI                     | `pnpm dev`/`pnpm tauri dev` 동작 |
| M1  | 카메라/뷰포트: 팬·줌·핀치, 그리드 배경                           | camera-transform 테스트          |
| M2  | 요소 모델 + 도형/텍스트 생성·선택·이동·리사이즈, undo/redo       | 스토어 테스트                    |
| M3  | 이미지 paste, 속성 패널, 스타일                                  | —                                |
| M4  | 프레임 도구, 순서, 프레젠테이션 모드 + 부드러운 전환 + 속도 옵션 | interpolation 테스트             |
| M5  | 파일 IO(Tauri/브라우저), 단축키, 마무리, 리뷰/테스트 리포트      | docs/REPORT.md                   |

## 8. 리스크와 대응

- **WebView 차이(WKWebView vs WebView2)**: CSS transform·contentEditable 동작 차이 → 표준 API만 사용, 플랫폼 별 수동 테스트 체크리스트 유지.
- **대용량 이미지 인라인**: 문서 크기 폭증 → 붙여넣기 시 2048px 다운스케일 + JPEG/PNG 자동 선택.
- **DOM 렌더 한계**: 요소 수천 개 시 성능 저하 → 뷰포트 컬링(v1.1), Canvas2D 렌더러(v2).
