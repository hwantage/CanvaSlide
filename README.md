# CanvaSlide

**English** | [한국어](./README.ko.md)

Miro-style infinite canvas for macOS and Windows with **presentation frames**: lay frames anywhere on
the board, press _Present_, and the camera glides between them with a smooth zoom-and-pan
(van Wijk & Nuij interpolation). Built with **Tauri 2 + React 19 + TypeScript**.

## Features

- Infinite pan/zoom (wheel, trackpad pinch, space-drag, hand tool), cursor-anchored zoom
- Text, rectangle, ellipse, diamond, image paste (⌘V / Ctrl+V), inline text editing
- Connectors (L): straight / elbow / curved, arrowheads, dashed, labels; drop an end on a side port to pin it there, or on the
  shape body for an automatic port that always faces the other end; lines follow shapes as they move
- Move, 8-handle resize, marquee/shift selection, duplicate, z-order, undo/redo
- Copy/cut/paste objects (⌘C/⌘X/⌘V, works across documents), ⌥-drag or ⇧⌘-drag to duplicate
- Align (left/center/right/top/middle/bottom) and distribute selections
- Settings (⌘, / Ctrl+,): transition time, canvas background (dots / grid / plain), frame border style
- Smart guides while dragging: snap to edges/centers and to equal spacing (hold ⌘/Ctrl to disable)
- Frame list: click to select and jump to a frame, drag rows to reorder, double-click to rename
- Presentation frames with explicit order; moving a frame carries its contents
- Slideshow: fixed per-transition duration (0–3 s slider) so long jumps feel fast, short ones slow
- `.canvaslide` documents via native dialogs (Tauri) or download/upload (browser dev mode)
- **Export as HTML** (⌘E / Ctrl+E): one self-contained file with a built-in player (keyboard, nav bar,
  overview with click-to-jump), image quality presets and a size estimate before saving

## Develop

```bash
pnpm install
pnpm dev            # Tauri window (needs Rust toolchain)
pnpm dev:web        # browser only, http://127.0.0.1:1420
```

## Verify

```bash
pnpm check          # oxlint + oxfmt + tsc + vitest
pnpm test:e2e       # Playwright (chromium)
pnpm rust:clippy && pnpm rust:test
```

## Build

```bash
pnpm tauri build                 # dmg/app on macOS, nsis/msi on Windows
pnpm tauri build --bundles app   # macOS .app only
```

## Shortcuts

| Action                                    | macOS                   | Windows                           |
| ----------------------------------------- | ----------------------- | --------------------------------- |
| Tools                                     | V H T R O D F           | same                              |
| Undo / Redo                               | ⌘Z / ⇧⌘Z                | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z   |
| Copy / Cut / Paste / Duplicate            | ⌘C / ⌘X / ⌘V / ⌘D       | Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D |
| Duplicate by dragging                     | ⌥-drag or ⇧⌘-drag       | Alt-drag or Shift+Ctrl-drag       |
| Delete / Select all                       | ⌫ / ⌘A                  | Del / Ctrl+A                      |
| Zoom in / out / 100% / fit                | ⌘+ / ⌘- / ⌘0 / ⇧1       | Ctrl+…                            |
| New / Open / Save / Save as / Export HTML | ⌘N / ⌘O / ⌘S / ⇧⌘S / ⌘E | Ctrl+…                            |
| Slide Show / next / previous / exit       | ⌘⏎ / → Space / ← / Esc  | Ctrl+Enter …                      |
| Bring to front / send to back             | ⌘] / ⌘[                 | Ctrl+] / Ctrl+[                   |

## Examples

Ready-made documents (flowchart, ERD, slide deck, system architecture, mind map) live in
[`examples/`](./examples/README.md). Open one with ⌘O / Ctrl+O and press ⏎ to present.

## Contributing

Bug reports, feature ideas and pull requests are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for setup, code rules and the PR checklist.

## License

[MIT](./LICENSE)
