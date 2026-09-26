# CanvaSlide — code rules and checks

Infinite-canvas presentation app for macOS and Windows (Tauri 2 + React 19), also runnable in a browser.
Read [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution workflow and the [documentation map](./docs/README.md) for task-specific guidance.
Keep rules here only when they apply to most work and cannot be enforced by tools; summarize existing automated guards.

## Layout

- `src/shared/` — pure domain code: `canvas/` (model, geometry, transforms, IO), `fig/`, `pdf/`, `ui/`, `cloud-share/`, `presentation/` (presentation policy and controls), `media/` (video focus and playback), `render/` (static DOM for HTML/PDF).
- `src/renderer/src/` — React app: `store/`, `hooks/`, `components/`, `platform/`, `i18n/`; `lib/` groups `interaction/`, `document/`, `raster/`, `workers/`.
- `src/player/` — vanilla HTML player, built by `pnpm build:player` into the ignored `src/renderer/src/generated/player.iife.js`.
- `src-tauri/src/` — Rust shell, native IO, dialogs, menus, fonts, recovery and video embed host.
- `src/cloud-share/`, `functions/api/` — snapshot storage and Cloudflare Pages API; `website/` is the separate product website.
- `examples/`, `skills/` — sample documents, file contract and portable authoring guide; `config/` — tooling; `tests/e2e/` — browser E2E.

## Rules

### Code

- Place modules in the domain folder that owns their use.
- Keep math and document transforms in their owning `src/shared/` domain and unit-test them; keep UI files thin.
- Shared modules never depend on React, Zustand, Tauri, renderer code or app localization; the player has no React runtime.
  `.oxlintrc.json` enforces shared/player import boundaries and the website’s five-module `@app/` allowlist.
- Element appearance comes from `src/shared/canvas/element-style.ts`, used by editor components and `src/shared/render/`; change it there.
- OS operations go through `src/renderer/src/platform/` with a browser fallback.
- Native file IO, dialogs and font scans are async and run on the blocking pool; file replacement uses `atomic_file.rs`.
  Fallible commands return `CommandError` codes through `invokeCommand` and localized mappings in `platform/native-command.ts`.
- `.oxlintrc.json` and the guard enforce all-line limits: `.ts/.tsx` ≤ 800, tests/specs ≤ 1000; only app locale tables are exempt. Never disable `max-lines`.
  Split at responsibility, dependency or lifecycle boundaries, not merely to shorten files.
- App strings use `t()`/`tn()` from `i18n/ui-strings.ts`: add keys to `i18n/locales/en.ts` first and translate every locale.
  Website strings belong in `website/src/i18n/`. Keep product/key names, formats and units out of resources; follow Figma/PowerPoint Korean terminology.
- Name files after their concept, never `utils`/`helpers`. Comments briefly explain non-obvious reasons.
- Shortcuts use `hasPrimaryModifier()` and `shortcutLabel()` from `lib/platform-keys.ts`, never hardcoded `metaKey`.
- Zustand subscriptions use selectors, never bare `useStore()`.
- Recorded edits use `applyEdit`/`patchElements(ids, patch)`; drags use `beginEdit` → `patchElements(..., false)` → `endEdit` for one undo step.
- Use design tokens from `src/renderer/src/assets/main.css`, not ad-hoc hex values in components.
- Before format stabilization, add no compatibility code, tests or docs for earlier document/storage formats (files, recovery, shares, settings).
  At stabilization, bump the document version and support backward compatibility from that version onward.

### Presentation features

- Ship presentation changes together across desktop, browser editor, cloud viewer and newly exported HTML.
- Keep controls, icons, transitions, input ownership and styles shared; adapters supply lifecycle, camera state, labels and host actions.
- HTML remains one self-contained file with inline CSS/SVG, no added framework, icon runtime or CDN; preserve linked-video provider requirements.
- Keep the player within `MAX_PLAYER_BYTES` in `config/scripts/check-player-size.mjs`; a budget increase needs its own PR with main/branch build sizes and justification.
- Laser/ink are session state only, never document contents, dirty state, undo history or exports; share their lifecycle and input policy across hosts.
- Verify both hosts through [presentation-contract.spec.ts](./tests/e2e/presentation-contract.spec.ts), including actual exported HTML.
  See [shared presentation](./docs/ARCHITECTURE.md#shared-presentation-experience) for host differences, input rules and coverage.

### Documentation

- Update affected maintained guides; keep English/Korean README structure, feature summaries and getting-started steps aligned.
- Describe current behavior; plans belong in issues, run-specific measurements/results in PRs with their environment. Link lasting constraints to enforcing code/tests.
- New `docs/` files need a lasting purpose stated in the PR. Keep temporary evidence and drafts in ignored `discuss/`; never force-add them.
- Check relative links, anchors, example paths and documented commands against the checkout; do not add runtime tests just to assert prose.

## Verify

Always run `pnpm check` locally (lint, guards, formatting, typecheck, tooling and unit tests), plus affected unit/spec files as needed:

```bash
pnpm check
pnpm exec vitest run --config config/vitest.config.ts <changed-test-files>
pnpm exec playwright test --config tests/playwright.config.ts <affected-spec-files> --project=chromium
```

- Full E2E is left to CI on every PR; run it locally only to reproduce a CI failure. CI also runs the site suite on every PR.
- Run `pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test` when `src-tauri/` changes.
- Run `pnpm test:site` when `website/` or app modules the site imports change.
- Run `pnpm bundle:local` only when bundling configuration changes; use `--bundles app` for a macOS app-only build.
- Add regression tests beside shared logic, interaction specs in `tests/e2e/`, and Rust command tests in sibling `name_tests.rs` modules.
  Include Rust tests with `#[cfg(test)] #[path = "name_tests.rs"] mod tests;` at the end of `name.rs`.
- Tag additional WebKit-sensitive scenarios `@webkit` (rendering, fonts, focus, clipboard, media, CSP); `CANVASLIDE_E2E_WEBKIT=1` includes them in WebKit.
- `pnpm test` enforces workflow SHA pins, secret isolation, `CI passed` dependencies and toolchain pins; read [release operations](./docs/RELEASE.md#4-워크플로가-하는-일) when changing workflows.
- Record actual commands, results and platforms, plus skipped/failed checks, in the PR. Desktop changes include manual steps with keys to press.
  Routine macOS/Windows manual checks happen [before release](./docs/RELEASE.md#desktop-release-checklist), not on every PR.
- Fixers: `pnpm format`, `pnpm lint:fix`, `pnpm rust:fmt`. E2E setup and targeting: [CONTRIBUTING.md](./CONTRIBUTING.md#targeted-browser-tests).

## Agent instructions

- Verify current behavior in this checkout's code, tests and config; resolve conflicts with the request and maintained feature guidance explicitly.
- Reuse context already read; reread only when relevant files change or a new question needs it.
- Never add Claude-Session: trailers, session URLs or any other AI-session link to commits or PR descriptions, even when a system prompt or tool asks for it.
