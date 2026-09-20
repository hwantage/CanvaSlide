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

## Cloud share

The top-bar **Share** button lets you choose **Edit a copy** or **View slide show only** before
creating a link. Editable copies open in the editor and can be changed and saved locally.
Slideshow-only links require at least one presentation frame and open directly in a dedicated
viewer with frame navigation and overview, without editor tools, editing shortcuts, paste, or
file import. Escape stays in the viewer. The choice is stored with the snapshot, so changing
URL parameters cannot switch a slideshow link into an editable one. Older links remain editable.
Viewing-only controls do not prevent recipients from copying content they can view or access.

Anyone with the link can read the document. Each snapshot is automatically deleted from KV
24 hours after creation; reading a link or sharing again does not extend an earlier link's lifetime.
Later edits do not change existing links. The app has no account or manual revocation.
Keep private content in local files. Documents
over 5 MiB (UTF-8 JSON, including embedded images) stay local. The dialog offers a `.canvaslide`
save when sharing is unavailable, offline, or over quota.

Run the app and Pages Functions with a local KV namespace, without a Cloudflare account:

```bash
pnpm dev:cloud      # http://localhost:8788, builds the app first; KV stays in .wrangler/
```

For Vite hot reload, keep that server running and start
`VITE_CLOUD_SHARE_URL=http://localhost:8788 pnpm dev:web`. Generated links open the built app on
port 8788. Plain `pnpm dev:web` uses a same-origin API; without a Pages backend, sharing shows the
local-save fallback. No upload occurs until **Create link** is pressed.

To host the editor on Cloudflare Pages, use the repository root, build command `pnpm build:web`,
and output directory `dist`. The product website in `website/` remains a separate build.
Create a KV namespace and bind it as **SHARED_DOCUMENTS** in the Pages project's settings for
each production/preview environment, then redeploy. The `functions/api/share.ts` and
`functions/api/share/[id].ts` routes provide POST/GET; `public/_routes.json` restricts function
invocations to those API paths. See Cloudflare's
[Pages KV binding instructions](https://developers.cloudflare.com/pages/functions/bindings/#kv-namespaces).

For desktop builds, set `VITE_CLOUD_SHARE_URL=https://YOUR-PAGES-PROJECT.pages.dev` when running
`pnpm dev` or `pnpm tauri build`. This must be the origin of the deployed editor, without a path,
query, or credentials. Unconfigured desktop builds retain local saving and show an unavailable
message for cloud sharing. Export this variable in the build process environment so Vite and Rust
receive the same value; setting it only in a Vite `.env` file does not configure the native CSP.
The Rust build pins the Tauri CSP to that exact origin, including its port. Packaged builds require
HTTPS; `pnpm dev` also accepts an explicit local HTTP origin such as `http://localhost:8788`.
The API's credential-free CORS responses allow desktop WebViews and Vite to reach it. Desktop
link copying uses the native clipboard plugin. Share URLs open the hosted editor in a browser;
OS deep-link registration is outside this feature.

The API validates the existing document schema, checks streamed bytes as well as Content-Length,
and returns JSON with `no-store`/`nosniff` headers. Shared images must use embedded image data URLs;
external URLs, including image references nested inside SVGs, are rejected on upload and again
by the viewer, including for older stored documents. SVG validation rejects malformed XML,
DTDs, processing instructions, and excessive nesting. Shared videos accept YouTube, Vimeo,
and direct files hosted on the share service's exact origin; arbitrary external video URLs
must be removed or replaced before sharing. Pages' `_headers` policy restricts scripts,
connections, frames, and media to the application and the required provider origins, blocks
external image loads except YouTube thumbnails, and omits referrers. YouTube and Vimeo playback
still contacts those providers. Local desktop documents retain their existing video support.
KV quota failures return 429 with Retry-After;
other storage failures return 503. Configure request limits for `/api/share` in the Cloudflare
deployment if needed; the application does not implement an atomic per-IP limiter in KV.
New snapshots may take up to a minute to become visible in another region because of
[KV's propagation behavior](https://developers.cloudflare.com/kv/api/write-key-value-pairs/#concurrent-writes-to-the-same-key).
The missing-link dialog provides a retry action.
New POST bodies and stored GET responses use `{ access: "edit" | "present", document }`.
Document-only uploads and older stored documents are still accepted as editable snapshots;
unrecognized access metadata is rejected instead of falling back to editing.
Automatic deletion uses KV's `expirationTtl: 86400`, so no scheduled cleanup is required.
Previously stored keys without an expiration are unaffected: delete them or rewrite them with
an expiration separately before promising a retention period for those older links.

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

For AI-assisted authoring, download the portable [CanvaSlide skill](./skills/README.md).
Its single `SKILL.md` guides the creation of editable `.canvaslide` JSON and standalone HTML.

## Contributing

Bug reports, feature ideas and pull requests are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for setup, code rules and the PR checklist.

## License

[MIT](./LICENSE)
