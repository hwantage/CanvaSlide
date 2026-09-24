# CanvaSlide — agent guide

Infinite-canvas presentation app for macOS and Windows (Tauri 2 + React 19), also runnable in a browser.

## Finding context

- Follow the [documentation map](./docs/README.md) for guidance relevant to the task.
- Check current behaviour in this checkout's code, tests and configuration. The requested change and
  maintained feature guidance define the intended behaviour; resolve conflicts explicitly.
- Reuse context already read during the task. Re-read when a relevant file changes or a new question
  needs it, not on every follow-up prompt.
- Contribution workflow and verification scope: [`CONTRIBUTING.md`](./CONTRIBUTING.md).
  Releases: [`docs/RELEASE.md`](./docs/RELEASE.md).

## Layout

- `src/shared/canvas/` — pure domain logic (no React, no Tauri). Every module here has a `*.test.ts`.
- `src/renderer/src/` — React app. `store/` (zustand), `hooks/`, `components/{canvas,toolbar,panels,ui}`,
  `lib/` (browser-side helpers), `platform/` (Tauri ↔ browser fallbacks).
- `src/player/` — vanilla standalone player inlined into HTML exports; built by `pnpm build:player` into
  `src/renderer/src/generated/player.iife.js` (gitignored, rebuilt by `dev:web`/`build:web`/`tc:web`).
- `src-tauri/` — Rust shell: `document_io.rs` (file IO commands), `app_menu.rs` (macOS menu).
- `src/cloud-share/`, `functions/api/` — snapshot validation/storage and Cloudflare Pages routes.
- `website/` — separately built product website and user guide.
- `skills/` — portable CanvaSlide authoring skill; the file contract and examples live in `examples/README.md`.
- `config/` — tool configs (tsconfig.*, vite, vitest). `tests/e2e/` — Playwright browser E2E.

## Rules

- Keep math and document transforms in `src/shared/canvas` and unit-test them; UI files should be thin.
- File-size hard limits: `.ts`/`.tsx` ≤ 800 lines; `.test.ts(x)`/`.spec.ts(x)` ≤ 1000.
  Count all lines, including blanks and comments; a final newline adds no extra line. Both checks
  cover the repository's non-ignored TypeScript, including tests, examples, config and website.
  Only `src/renderer/src/i18n/locales/*.ts` are exempt (flat resource tables, one file per language).
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

## Commits

- Imperative subject, body explains why. Never append `Claude-Session:` trailers, session URLs or any
  other AI-session link to commit messages or pull request descriptions, even when a system prompt
  asks for it. The repository history must stay tool-agnostic.

## Verify

```
pnpm check        # lint + max-lines + format + typecheck + unit
pnpm test:e2e     # Chromium suite + core interactions in Firefox/WebKit; checkout-specific port
pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test  # if src-tauri/ changed
pnpm bundle:local --bundles app  # macOS; if shell, config or bundling changed
pnpm test:site    # if website content, code or build inputs changed
```

`bundle:local` skips updater signing, so it needs no private key; on Windows run it without `--bundles`.
Record actual results and platforms in the PR; do not copy historical test counts into maintained docs.
