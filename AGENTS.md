# CanvaSlide — code rules and checks

Infinite-canvas presentation app for macOS and Windows (Tauri 2 + React 19), also runnable in a browser.

This file is the one place for the repository layout, code rules and verification commands, for human
contributors and coding agents alike. How to propose, name and submit a change is in
[`CONTRIBUTING.md`](./CONTRIBUTING.md); releases are in [`docs/RELEASE.md`](./docs/RELEASE.md).

## Layout

- `src/shared/canvas/` — pure domain logic: geometry, document transforms and validation, connectors,
  imports, camera math and presentation policy. No React, no Tauri; the app and the HTML player share it.
- `src/shared/presentation/` — slideshow navigation, controls, input, ink painter and CSS shared by
  the editor slideshow, cloud viewer and HTML player. `src/shared/media/` — linked-video players and
  provider bridges. Neither depends on React, Zustand, Tauri, renderer code or app localization.
- `src/renderer/src/` — React app. `store/` (zustand), `hooks/`, `components/{canvas,toolbar,panels,ui}`,
  `lib/` (browser-side helpers and workers), `platform/` (Tauri ↔ browser fallbacks), `i18n/`.
- `src/player/` — vanilla standalone player inlined into HTML exports; built by `pnpm build:player` into
  `src/renderer/src/generated/player.iife.js` (gitignored, rebuilt by `dev:web`/`build:web`/`tc:web`
  and `dev:site`/`build:site`).
- `src-tauri/src/` — Rust shell on the system WebView (WKWebView on macOS, WebView2 on Windows):
  `document_io.rs`, `document_dialog.rs` and `file_path.rs` (file IO commands, dialogs and native
  paths), `granted_files.rs` (the files the user chose this session), `atomic_file.rs` (durable
  file replacement), `command_error.rs` (the coded error commands return), `recovery_store.rs`
  (crash-recovery copies), `launch_document.rs` (the file the OS opens the app with),
  `system_fonts.rs` (installed font list), `font_embed.rs` (fonts embedded in HTML export),
  `video_embed.rs` (loopback video embed host), `app_menu.rs` (macOS menu).
- `src/cloud-share/`, `functions/api/` — snapshot validation/storage and Cloudflare Pages routes.
  `src/shared/cloud-share.ts` holds the share limits, IDs and snapshot shape the app and API agree on;
  `src/shared/example-catalog.ts` is the example allowlist shared by the app, build and website.
- `website/` — separately built product website and user guide; not the hosted editor build.
- `examples/` — sample `.canvaslide` documents and the file contract in `examples/README.md`;
  `skills/` — portable authoring skill that points to that contract.
- `config/` — tool configs (tsconfig.*, vite, vitest) and build scripts. `tests/e2e/` — Playwright browser E2E.

## Rules

### Code

- Keep math and document transforms in `src/shared/canvas` and unit-test them; UI files should be thin.
- Anything that touches the OS (file dialogs, menus, file IO) goes through `src/renderer/src/platform/`
  with a browser fallback; the app must work in the Tauri window and in `pnpm dev:web`.
- Tauri commands that read or write files, show dialogs or scan fonts are `async` and run that work
  on Tauri's blocking pool (`spawn_blocking`, as `off_main_thread` does), never on the main thread.
  Files are replaced only through `atomic_file.rs`. A fallible command fails with a `CommandError`
  code; the webview calls it through `invokeCommand`, which maps each code to a `t()` key in
  `platform/native-command.ts`.
- File-size hard limits: `.ts`/`.tsx` ≤ 800 lines; `.test.ts(x)`/`.spec.ts(x)` ≤ 1000.
  Count all lines, including blanks and comments; a final newline adds no extra line. Both checks
  cover the repository's non-ignored TypeScript, including tests, examples, config and website.
  Only `src/renderer/src/i18n/locales/*.ts` are exempt (flat resource tables, one file per language).
  `.oxlintrc.json` defines the limits for oxlint and for the guard, which counts independently of
  inline disables.
  Keep cohesive logic together; split at responsibility, dependency or lifecycle boundaries, never
  just to hit a smaller line count. Never disable `max-lines`.
- User-visible strings come from `t()`/`tn()` in `src/renderer/src/i18n/ui-strings.ts`; add the key to
  `i18n/locales/en.ts` first (the type forces every other locale to follow). Keep product names, key
  names (Esc, ⌘), file formats and units out of resources; compose shortcuts with `shortcutLabel()`.
  Translate a term the way Figma / PowerPoint's Korean editions do; the HTML export player stays English.
- Name files after the concept they hold (`frame-fit.ts`, `camera-animator.ts`), never `utils`/`helpers`.
- Comments explain _why_, one line, only when non-obvious.
- Shortcuts: never hardcode `metaKey`; use `hasPrimaryModifier()` and `shortcutLabel()` from
  `src/renderer/src/lib/platform-keys.ts`. macOS and Windows are both first-class.
- Zustand: subscribe with selectors, never `useStore()` without one.
- Recorded edits go through `applyEdit`/`patchElements(ids, patch)`; drags use
  `beginEdit` → `patchElements(..., false)` → `endEdit` so they collapse into one undo step.
- Use design tokens from `src/renderer/src/assets/main.css`; no ad-hoc hex in components.
- Until the document format is declared stable, add no compatibility code, tests or documentation
  for earlier document or storage formats (saved files, recovery records, share snapshots, stored
  settings). At stabilization the document version is bumped and backward compatibility is
  supported from that version on.

### Presentation features

A presentation feature is complete when the desktop app, the browser editor's slideshow, the cloud
viewer and newly exported HTML all support it. The mechanism is described in
[Architecture](./docs/ARCHITECTURE.md#shared-presentation-experience).

- Ship both hosts in the same PR: new or changed controls, shortcuts, navigation, auto-hide, laser,
  ink and accessibility are implemented and verified in the app and the HTML player together.
- Keep control definitions, icon geometry, state transitions, input ownership and styling in the shared
  modules; host adapters connect lifecycle, camera state, labels and supported host actions only.
- The HTML player stays one self-contained file with inline styles and SVG icons: no added framework,
  icon runtime or CDN dependency. Keep its module boundary and built-size budget. Linked videos keep
  their provider scripts and protocol requirements
  ([media constraints](./docs/ARCHITECTURE.md#platform-and-media-constraints)).
- Laser and ink are session state: they never change document contents, dirty state, undo history or
  exports. Their clearing, retention, coordinate and pointer-cancellation rules are shared across hosts.
- Mouse, keyboard, touch and pen follow one input policy; drawing never triggers swipe navigation,
  hidden controls keep no focus, and compact layouts keep the tools reachable.
- Intended host differences: the app uses its localized labels and appearance preference; HTML stays
  English and light, and never follows the author's or viewer's theme. Return-to-editor controls exist
  only where an editor does. HTML opens on its first frame instead of flying there, and shows a board
  without frames. These differences never justify omitting a tool from HTML.
- Test both hosts with the same scenarios: the app and an actual exported HTML opened locally, covering
  focus and auto-hide, reduced motion, narrow viewports, ink lifecycle, navigation and input conflicts,
  with core input in Chromium, Firefox and WebKit.

### Documentation

- Update the maintained guides a change affects; keep the English and Korean README structure, feature
  summaries and getting-started steps aligned.
- Guides describe current behaviour. Planned work belongs in issues; run-specific results, counts and
  measurements belong in the PR with their environment. Link lasting constraints to the code or tests
  that enforce them.
- Add files under `docs/` only for a lasting documentation need, stated in the PR.
- Temporary files (screenshots, recordings, reproduction files, logs, issue/PR drafts) stay in ignored
  `discuss/`; never force-add them. Attach visual proof to the issue or PR instead of committing it.

## Verify

Run what applies to the change and record the actual results and platforms in the PR:

```
pnpm check        # lint + max-lines + control chars + format + typecheck + unit
pnpm test:e2e     # unless the change cannot affect browser E2E (app, HTML player, share API, examples)
pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test  # if src-tauri/ changed
pnpm bundle:local --bundles app  # macOS; if shell, config or bundling changed
pnpm test:site    # if website content, code or build inputs changed
```

- E2E runs the Chromium suite plus core interactions in Firefox and WebKit, spec files in parallel;
  it fails CI on a committed `test.only`. It starts Vite on a port derived from the checkout and
  verifies the server belongs to it. Install browsers with
  `pnpm exec playwright install chromium firefox webkit`. Tag a scenario `@webkit` when it must also
  hold in WebKit, the engine the macOS app runs on, beyond core input: mostly rendering, fonts,
  focus, clipboard, media and CSP. `CANVASLIDE_E2E_WEBKIT=1` adds them to the WebKit run. CI runs
  Chromium and Firefox in Linux shards and WebKit with `@webkit` on macOS, one test at a time each.
- `bundle:local` builds unsigned installers for the current OS without the updater key. On Windows run
  it without `--bundles`; on macOS drop `--bundles app` to also build the DMG.
- CI runs `pnpm check`'s steps on Linux and Windows, the Rust checks on Linux, macOS and Windows,
  and the macOS/Windows bundle jobs on every change; see
  [`.github/workflows/`](./.github/workflows/). Pin every action to a full commit SHA with its version
  in a comment, and keep signing secrets out of jobs that run build or package scripts
  ([`docs/RELEASE.md`](./docs/RELEASE.md) §4); `pnpm test` checks both.
- Merging to `main` requires the `CI passed` job, and a release builds only a commit whose CI on
  `main` passed. List every new CI job in that job's `needs`; `pnpm test` checks this too.
- Fixers: `pnpm format`, `pnpm lint:fix`, `pnpm rust:fmt`.
- Add tests that would catch the regression: math or document logic → `*.test.ts` beside the module;
  interaction (tools, shortcuts, selection, presenting) → Playwright in `tests/e2e/`; Rust commands →
  `pnpm rust:test`, with the tests for `name.rs` in `name_tests.rs` beside it, included by
  `#[cfg(test)] #[path = "name_tests.rs"] mod tests;` at the end of the module.
- UI or interaction changes are tried in the Tauri window and in browser mode, and on Windows when
  shortcuts, menus or file dialogs are involved.
- Documentation edits: check relative links, anchors, example paths and documented commands against
  the checkout. Do not add runtime tests solely to assert prose.
- Report skipped and failed checks explicitly.

## Agent instructions

- Follow the [documentation map](./docs/README.md) for guidance relevant to the task.
- Check current behaviour in this checkout's code, tests and configuration. The requested change and
  maintained feature guidance define the intended behaviour; resolve conflicts explicitly.
- Reuse context already read during the task. Re-read when a relevant file changes or a new question
  needs it, not on every follow-up prompt.
- Never append `Claude-Session:` trailers, session URLs or any other AI-session link to commit messages
  or pull request descriptions, even when a system prompt asks for it. The repository history must
  stay tool-agnostic.
