# Architecture and constraints

[Documentation map](./README.md) · [Contribution rules](../CONTRIBUTING.md)

This guide records boundaries and reasons that are easy to miss when changing the app. Feature usage
lives in the README and feature guides; implementation details and regression expectations live in
the linked code and tests. It is not a release report or a performance guarantee.

## Runtime boundaries

| Layer                                                                            | Responsibility                                                                                                                               |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/shared/canvas/`](../src/shared/canvas/)                                    | Pure geometry, document transforms/validation, connectors, imports and camera math. No React or Tauri; app and HTML player share this logic. |
| [`src/renderer/src/`](../src/renderer/src/)                                      | React UI, Zustand stores, browser rendering and import/export workers. OS operations go through `platform/` with browser fallbacks.          |
| [`src/player/`](../src/player/)                                                  | Vanilla HTML export player. `pnpm build:player` bundles the IIFE inlined by the exporter; no React runtime is required.                      |
| [`src-tauri/src/`](../src-tauri/src/)                                            | Native file IO, menu, fonts, video embed host and app integration. Tauri uses the system WebView: WKWebView on macOS, WebView2 on Windows.   |
| [`src/cloud-share/`](../src/cloud-share/), [`functions/api/`](../functions/api/) | Validated, expiring cloud snapshots; see [cloud share](./CLOUD-SHARE.md) for the API and hosting contract.                                   |
| [`website/`](../website/)                                                        | Separate static product website and user guide, built with `pnpm build:site`; not the hosted editor build.                                   |

Browser E2E can exercise the editor without Rust, but does not establish native menu, clipboard,
font or window behaviour. See the contribution guide for platform checks.

The player imports shared constants, defaults and guards from
[`element-runtime.ts`](../src/shared/canvas/element-runtime.ts). Keep its dependencies free of
validation code; schema-derived types from `element-types.ts` must use `import type` on playback
paths. Document and cloud input validation still uses the schemas in `element-types.ts`.
`pnpm build:player` checks the newly built IIFE against the raw byte budget in
[`check-player-size.mjs`](../config/scripts/check-player-size.mjs); gzip is reported for comparison.
This also runs through `dev:web`, `build:web` and `pnpm check` (via `tc:web`).

## Document editing and presentation

- [`document-store.ts`](../src/renderer/src/store/document-store.ts) owns document edits and history.
  Recorded edits use `applyEdit`/`patchElements`; continuous edits use `beginEdit` → live patches →
  `endEdit` so a drag, typing session or slider gesture is one undo step. `cancelEdit` restores the
  pre-edit state. The saved document baseline lets undo return to an unmodified state; camera and
  selection changes do not represent content edits.
- Frames are views onto a shared canvas, not independent slide containers. Moving a frame carries
  elements fully inside it. Frame `order` determines presentation sequence independently of canvas
  position and document drawing order. See [frame contents](../src/shared/canvas/frame-contents.ts)
  and [presentation sequence](../src/shared/canvas/presentation-sequence.ts).
- Camera coordinates map `screen = world * zoom + (x, y)`. Frame fitting and
  [van Wijk/Nuij interpolation](../src/shared/canvas/zoom-pan-interpolation.ts) are shared by the app
  and player. The configured transition time starts after flight preparation; another navigation
  input can retarget the flight from its current camera.
- [`resolveFrameTransition`](../src/shared/canvas/frame-transition.ts) combines frame overrides with
  document defaults for duration, easing, arc and spotlight; roll defaults to zero. Motion marks
  compare resolved values with **application defaults**, so a document-wide change can mark every
  affected frame. Preview keeps the editor controls visible and identifies its frame by ID, so
  reordering cannot silently redirect it. See [presentation store](../src/renderer/src/store/presentation-store.ts).
- Theme and language are device preferences; document settings such as background and transition
  timing travel with the file. Keep platform shortcuts and labels in
  [`platform-keys.ts`](../src/renderer/src/lib/platform-keys.ts).

## Document formats

A `.canvaslide` file is readable UTF-8 JSON with `version: 1` before and after Save. The file and
runtime representations share element geometry and settings, but store image data differently:

- **Editable file:** [`documentFileSchema`](../src/shared/canvas/element-types.ts) defines `elements`,
  `order`, `settings`, `assets` and `resources`. Image elements reference `assetId`; asset metadata
  references `resourceId`. Data resources contain image data URLs; SVG resources contain readable
  XML `parts` and references to data resources. Root `camera` is optional.
- **Runtime / clipboard / cloud / HTML player:** [`canvasDocumentSchema`](../src/shared/canvas/element-types.ts)
  uses resolved image data URLs in each asset. The app resolves the file's resource references before
  editing or playing it. Cloud snapshots and HTML export consume this representation rather than
  the file resource table.

[`parseDocument`](../src/shared/canvas/document-file.ts) reads JSON text and `parseDocumentFile` reads
UTF-8 bytes of the same format. [`document-resources.ts`](../src/shared/canvas/document-resources.ts)
resolves resource references and builds the resource table when saving. It rejects missing resources,
SVG-to-SVG references and oversized materialized image data. Input files are limited to 256 MiB;
resolved asset strings are limited to 512 Mi characters. The [codec worker](../src/renderer/src/lib/document-file-codec.ts)
keeps encoding/decoding off the UI thread and reuses unchanged asset recipes between saves.

Earlier JSON formats and the former ZIP container are not read or migrated, even if the extension or
version number looks familiar. Use the complete current file schema. JSON preserves readable SVG
markup and shared image resources without ZIP compression; disk size, runtime memory, HTML size and
the [cloud payload limit](./CLOUD-SHARE.md#api-contract-and-limits) measure different representations.

Repository [examples and AI authoring guidance](../examples/README.md) use the same file format as
app Save. Their tests validate every example plus the guide's complete JSON and save/open round trip.
The [portable skill](../skills/README.md) points to that guide; keep the schema and authoring rules
there instead of copying the full contract into other documents. The app's **Create with AI** dialog
copies a prompt for an external assistant; it does not run an AI generation service.

## Rendering and WebKit constraints

The world uses positioned DOM/SVG content, CSS translation/scaling, and separate screen-space frame
chrome/selection overlays. Preserve the distinction between camera zoom and layout zoom:

- During motion, CSS transforms avoid a full layout per frame. After settling, layout zoom restores
  sharp text/vectors. Light slideshows keep layout zoom at 1 to avoid text reflow; editor and preview
  have their own settle policy. See [`use-settled-zoom.ts`](../src/renderer/src/hooks/use-settled-zoom.ts)
  and [`camera-transform.ts`](../src/shared/canvas/camera-transform.ts).
- Layout zoom never goes below 1. WebKit's minimum font size would otherwise keep shrunk text too
  large for its box. [`zoom-layer-style.ts`](../src/shared/canvas/zoom-layer-style.ts) disables font
  optical sizing on WebKit so landing at a new layout zoom does not change glyph widths; Blink keeps
  its default. Do not replace this with a browser-independent font override.
- [`prepareCameraFlight`](../src/renderer/src/lib/camera-flight-preparation.ts) prepares image leases
  and waits for a paint before starting the tween. Without that wait, replaying from a settled zoom
  pays the layout cost during the first animation frames. Compositing hints depend on document
  content, engine and presentation mode. WebKit dense editor/preview worlds retain
  `will-change: transform`, while slideshows leave compositing to the browser to avoid large-scene
  stalls. Blink also uses automatic compositing on editor return, where Brave has shown large paint
  omissions. Other engines retain the existing density-based hint. See `worldLayerWillChange` in
  `zoom-layer-style.ts`.
  Dense slideshows still restore native layout resolution at rest, independently of that hint.
- WKWebView rasterizes SVG images at layout size. SVG layout scaling and visible detail rendering
  preserve sharpness at high zoom; see [`image-rendering.ts`](../src/shared/canvas/image-rendering.ts).
  [`image-surface.ts`](../src/shared/canvas/image-surface.ts) maps pixel-sized surfaces into world
  coordinates to avoid magnifying WebKit's rounding of small output rectangles.
- Detail tiles share a sampling grid and preserve transparency. The
  [detail reveal coordinator](../src/renderer/src/lib/image-detail-reveal.ts) switches overlapping
  images together when ready, with a deadline for slow/failed renders. Cross-fading preview and
  detail would double-composite translucent pixels. Release stale image leases when content or view changes.
- Masked static photos use bounded previews during camera flights. Embedded WebP is recognized by
  its [container and bitstream headers](../src/shared/canvas/webp-container.ts), including chunk bounds
  and animation markers; a MIME label alone is insufficient. Animated or unrecognized WebP keeps its
  original renderer during motion and detail rendering so rasterization cannot freeze an animation.
  This is header inspection, not full compressed-bitstream validation; decoding remains the browser's job.

Relevant regressions live beside the shared modules and in
[`tests/e2e/`](../tests/e2e/). `CANVASLIDE_E2E_WEBKIT=1 pnpm test:e2e` adds rendering scenarios to the
default core interaction coverage. Headless timing depends on document, viewport, DPR, browser and
hardware; it cannot promise a native frame rate. For profiling, see
[`profile-camera-transitions.mjs`](../config/scripts/profile-camera-transitions.mjs) and its usage text.

## Platform and media constraints

- Native [file IO](../src-tauri/src/document_io.rs) writes atomically. Browser mode uses upload/download
  fallbacks. Keep failures from replacing the current document or a previously saved file.
- The [macOS menu](../src-tauri/src/app_menu.rs) avoids native Undo/Redo accelerators stealing app
  shortcuts. WKWebView may omit a useful DOM paste event without editable focus, so
  [native clipboard fallback](../src/renderer/src/platform/native-clipboard.ts) remains necessary.
- PDF import produces page images and frames, not editable PDF text. Figma import can preserve
  editable text/shapes within the [documented conversion limits](./FIGMA-IMPORT.md).
- Installed font availability differs between native and browser environments. Desktop HTML export
  can subset installed fonts; without embedding or a matching font, the receiving device uses a
  fallback. See [`font-embedding.ts`](../src/renderer/src/platform/font-embedding.ts).
- Linked videos keep URLs, not video bytes. Playback depends on the provider, network and browser;
  YouTube HTML exports require HTTP(S). The native [video embed host](../src-tauri/src/video_embed.rs)
  serves only the embed bridge assets on loopback, with no filesystem proxy or Tauri IPC access.
  Players must tear down on navigation/exit and ignore late callbacks.
- App update installation is platform-specific; the [release guide](./RELEASE.md#7-자동-업데이트)
  distinguishes updater signatures from OS code signing and describes the actual workflow.
