# CanvaSlide 앱 아이콘

Round 07에서 확정한 **C형 Wing Smile · 흰색 배경** 아이콘을 사용합니다.

| 파일                                                                  | 용도                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `icon-master.png`                                                     | 여백·둥근 모서리를 적용하기 전의 1254px 정사각 마스터 |
| `icon-source.png`                                                     | 최종 여백·둥근 모서리를 포함한 1024px 데스크톱 원본   |
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png` | Round 07에서 검수한 크기별 RGBA PNG                   |
| `icon.icns`                                                           | macOS용 최종 아이콘                                   |
| `icon.ico`                                                            | Windows용 최종 아이콘, 첫 이미지 32px                 |
| `Square*Logo.png`, `StoreLogo.png`                                    | 데스크톱 원본에서 생성한 Windows 스토어 아이콘        |
| `ios/`, `android/`                                                    | 정사각 마스터에서 생성한 모바일 아이콘                |

모바일 아이콘은 정사각 마스터에서 생성해 OS 마스크 안에 데스크톱의 둥근 판과 여백이 중복되지 않도록 합니다.
Android hdpi 런처 이미지는 72px, adaptive foreground는 162px입니다.

Tauri가 사용하는 경로는 `../tauri.conf.json`의 `bundle.icon`에 등록되어 있습니다.
macOS 번들 생성은 프로젝트 루트에서 `pnpm bundle:local --bundles app`으로 확인합니다.

개발 모드도 아이콘을 실행 파일에 포함합니다. `../build.rs`에서 `icons/` 변경을 감지하므로,
아이콘 교체 후 `pnpm dev`를 실행하면 개발용 실행 파일을 다시 빌드합니다.
