# CanvaSlide app icons

The app uses the **Type C Wing Smile on a white background** icon chosen in design round 07.

| File                                                                  | Purpose                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `icon-master.png`                                                     | 1254 px square master, before padding and rounded corners         |
| `icon-source.png`                                                     | 1024 px desktop source with the final padding and rounded corners |
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png` | RGBA PNGs for each size, reviewed in round 07                     |
| `icon.icns`                                                           | Final macOS icon                                                  |
| `icon.ico`                                                            | Final Windows icon; its first image is 32 px                      |
| `Square*Logo.png`, `StoreLogo.png`                                    | Windows Store icons generated from the desktop source             |
| `ios/`, `android/`                                                    | Mobile icons generated from the square master                     |

Mobile icons are generated from the square master so that the desktop icon's rounded plate and padding
are not repeated inside the OS mask. The Android hdpi launcher image is 72 px and the adaptive
foreground 162 px.

The paths Tauri uses are listed under `bundle.icon` in `../tauri.conf.json`. Check the macOS bundle
with `pnpm bundle:local --bundles app` from the repository root.

Development builds also embed the icon in the executable. `../build.rs` watches `icons/`, so running
`pnpm dev` after replacing an icon rebuilds the development executable.
