# Architecture and constraints

[Documentation map](./README.md) · [Code rules and checks](../AGENTS.md)

This guide records boundaries and reasons that are easy to miss when changing the app. Feature usage
lives in the README and feature guides; implementation details and regression expectations live in
the linked code and tests. It is not a release report or a performance guarantee.

## Runtime boundaries

The directory layout is listed once, in [AGENTS.md](../AGENTS.md#layout). The boundaries that are
easy to break:

- [`src/shared/`](../src/shared/) never imports React, Zustand, Tauri or renderer code: the app and the
  HTML player run the same canvas, presentation and media modules.
- In [`src/renderer/src/`](../src/renderer/src/), OS operations belong in `platform/`, with browser
  fallbacks.
- [`src/player/`](../src/player/) has no React runtime.
- [`src/shared/render/`](../src/shared/render/) draws elements as static DOM for the HTML player and
  for PDF pages, which rasterise that DOM; a change there changes both exports. It and the editor's
  React element components take their styling from
  [`element-style.ts`](../src/shared/canvas/element-style.ts), and
  [`element-render-parity.test.tsx`](../src/renderer/src/components/canvas/element-render-parity.test.tsx)
  checks that both draw an element alike.
- [`src/cloud-share/`](../src/cloud-share/) and [`functions/api/`](../functions/api/) keep snapshots
  validated and expiring; see [cloud share](./CLOUD-SHARE.md) for the API and hosting contract.
- [`website/`](../website/) is a separate static build (`pnpm build:site`).

Browser E2E can exercise the editor without Rust, but does not establish native menu, clipboard,
font or window behaviour. See [Verify](../AGENTS.md#verify) for platform checks.

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
  selection changes do not represent content edits. `savedDocument` is `null` for work restored from
  a crash, where nothing on disk matches it — see [crash recovery](./CRASH-RECOVERY.md).
- Every replacement of the open document (New, Open, a file the OS hands over, Restore, a share or
  example link) goes through [`replaceDocument`](../src/renderer/src/lib/document-replacement.ts).
  It refuses while an edit gesture is in progress, guards unsaved work, cancels if authored content
  or the session changes while it waits, leaves presentation, loads, closes and clears launch links
  that no longer name the document and places the camera. Commands and Restore ask before
  discarding unsaved work; a link refuses and keeps it, since nobody chose to replace it in this
  window. Restore returns to the camera its recovery copy recorded; everything else fits the board.
  A slideshow-only link loads once the editor has unmounted.
- Shapes, text and images may carry `rotation`: degrees clockwise about the centre of their unrotated
  `x`/`y`/`width`/`height` box. Every renderer applies it as a CSS `rotate()` about that centre.
  Code that measures position on the canvas (selection, snapping, alignment, frame contents, fitting)
  uses the rotated bounds from [`element-bounds.ts`](../src/shared/canvas/element-bounds.ts); handle,
  resize and connector-port math lives in [`element-rotation.ts`](../src/shared/canvas/element-rotation.ts).
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

## Shared presentation experience

[`mountPresentationExperience`](../src/shared/presentation/presentation-experience.ts) owns the control
DOM, SVG icons, keyboard commands, swipe ownership, auto-hide, laser and ink lifetime in the editor
slideshow, cloud viewer and standalone HTML. Host adapters supply state/view subscriptions, labels and
optional exit. Camera notifications follow existing animation/shot updates; there is no extra camera loop.
Label updates preserve the session. View snapshots are refreshed by camera notifications, so drawing
does not read layout on every pointer sample; the app caches ordered frames until its document changes.
Pure command, annotation and auto-hide policy lives in `shared/canvas`; navigation, DOM bindings and
CSS live in `shared/presentation`. The React adapter is [`PresentationOverlay`](../src/renderer/src/components/canvas/presentation-overlay.tsx).

[`createPresentationNavigator`](../src/shared/presentation/presentation-navigator.ts) owns frame and
overview transitions, flights, and the refit and settle policy through a camera and position port.
A resize during a flight keeps the flight's length; otherwise the camera corrects within 250 ms, and a
frame's media become usable once the camera holds still on it.
[`createViewportRefit`](../src/shared/presentation/viewport-refit.ts) refits once a resize burst ends,
and a video closing out of its expanded view refits what it hands back. The
[presentation store](../src/renderer/src/store/presentation-store.ts) and the
[player](../src/player/player-presentation.ts) adapt it; the store adds previews, fullscreen and the
return to the editor. The editor slideshow and the cloud viewer fly to the first frame from the current
camera, while exported HTML opens on it. Without frames the app's slideshow does not start and a
slideshow share is refused, while HTML shows the board with a notice.

Ink points stay in world coordinates in a session painter, with screen-width strokes; laser positions
stay in viewport coordinates. Pointer movement updates DOM directly, without React renders or document
store writes. Changing frame identity, erasing or ending the session clears ink; overview on the same
frame and disabling the pointer preserve it. Controls and media own their gestures, and drawing disables
swipe navigation. The compact tool disclosure holds chrome open and restores focus when closed.
Slide clicks, taps and drawing leave hidden controls hidden; bottom-edge movement or touch and Tab
reveal them, keeping the tools reachable without interrupting presentation content.
Escape closes tools, then leaves overview, then exits only when an editor exists.
P/E/O also resolve physical letter keys with Korean/IME input on the presentation surface.
Editable content, dialogs and media retain their keys; IME confirmation/cancellation never navigates.

Shared light tokens and presentation CSS are imported by the app and inlined by the player. App theme
and localization remain device preferences; HTML stays light and English. Exports embed the runtime at
creation, so previously distributed HTML needs regeneration. Temporary ink is never serialized.
[`presentation-contract.spec.ts`](../tests/e2e/presentation-contract.spec.ts) runs the same contract
against the app and an actual downloaded HTML opened over `file://`, including default cross-browser
core input, compact controls, camera/roll and maximum-zoom ink. Build output includes an ignored
`player.modules.json` report; the [module boundary](../config/scripts/player-module-boundary.mjs)
rejects packages, renderer code and schema runtime before the built-byte budget check.

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
version number looks familiar; see the
[pre-stabilization compatibility policy](../AGENTS.md#code). Use the complete current
file schema. JSON preserves readable SVG markup and shared image resources without ZIP compression;
disk size, runtime memory, HTML size and the
[cloud payload limit](./CLOUD-SHARE.md#api-contract-and-limits) measure different representations.

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
[`tests/e2e/`](../tests/e2e/). `CANVASLIDE_E2E_WEBKIT=1 pnpm test:e2e` adds the `@webkit` scenarios,
which CI runs on macOS, to WebKit's default core interaction coverage. Headless timing depends on
document, viewport, DPR, browser and hardware; it cannot promise a native frame rate. For profiling, see
[`profile-camera-transitions.mjs`](../config/scripts/profile-camera-transitions.mjs) and its usage text.

## Platform and media constraints

- Native [file IO](../src-tauri/src/document_io.rs) runs off the main thread and replaces files
  [atomically and durably](../src-tauri/src/atomic_file.rs): a sibling temp file is flushed to the
  disk and renamed over the target, then Unix syncs the folder where the volume supports it and
  Windows renames with write-through, falling back to the standard rename when that is refused (a
  long path or a target another program holds open). Documents, exports and recovery copies share
  this path.
  Browser mode uses upload/download fallbacks. Keep failures from replacing the current document or a
  previously saved file.
- Commands fail with a [code and a detail](../src-tauri/src/command_error.rs); the webview shows the
  [localized message](../src/renderer/src/platform/native-command.ts) for the code, followed by the
  detail, and branches on the code (a full disk reads as a recovery quota problem, for example).
- Native file commands act only on [files the user chose](../src-tauri/src/granted_files.rs) this
  session: a native Open/Save dialog pick, a document the OS opened the app with, or the file a
  recovery copy names. Export commands show their own save dialog and write the chosen name under the
  format's extension, so the webview never supplies a path.
- The [macOS menu](../src-tauri/src/app_menu.rs) avoids native Undo/Redo accelerators stealing app
  shortcuts. WKWebView may omit a useful DOM paste event without editable focus, so
  [native clipboard fallback](../src/renderer/src/platform/native-clipboard.ts) remains necessary.
- PDF import produces page images and frames, not editable PDF text. Figma import can preserve
  editable text/shapes within the [documented conversion limits](./FIGMA-IMPORT.md).
- Installed font availability differs between native and browser environments. Desktop HTML export
  can subset installed fonts; without embedding or a matching font, the receiving device uses a
  fallback. See [`font-embedding.ts`](../src/renderer/src/platform/font-embedding.ts).
- Linked videos keep URLs, not video bytes. Playback depends on the provider, network and browser;
  YouTube HTML exports require HTTP(S). In the desktop app, YouTube and Vimeo players run on the
  native [video embed host](../src-tauri/src/video_embed.rs), which serves only the embed bridge
  assets on loopback, with no filesystem proxy or Tauri IPC access. The main window loads no
  third-party scripts, frames only that host, and plays direct video files over HTTPS only.
  Players must tear down on navigation/exit and ignore late callbacks.
- App update installation is platform-specific; the [release guide](./RELEASE.md#7-자동-업데이트)
  distinguishes updater signatures from OS code signing and describes the actual workflow.
