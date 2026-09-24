# Contributing to CanvaSlide

Thanks for taking the time to contribute. CanvaSlide is an infinite-canvas presentation app built with
Tauri 2, React 19 and TypeScript. This guide covers how to set up, what we expect from a change, and how
to get it merged.

## Before You Start

- Keep each change scoped to one improvement, bug fix, refactor, or documentation topic.
- CanvaSlide targets **macOS and Windows** as first-class platforms. Never hardcode `metaKey`; use
  `hasPrimaryModifier()` and `shortcutLabel()` from `src/renderer/src/lib/platform-keys.ts` so shortcuts
  and their labels (⌘ / Ctrl) are right on both.
- The app must work both inside the Tauri shell and in plain browser dev mode (`pnpm dev:web`). Anything
  that touches the OS (file dialogs, menus, file IO) goes through `src/renderer/src/platform/` with a
  browser fallback.
- Read [`AGENTS.md`](./AGENTS.md) for code rules and follow the [documentation map](./docs/README.md) for task-specific guidance.
- Check existing issues first. For anything larger than a bug fix, open an issue describing the problem
  and your proposed approach before writing code, so we can agree on direction early.

## Local Setup

Requirements:

- Node.js 22.20+ and pnpm 11 (`corepack enable` picks up the pinned version from `package.json`)
- Rust stable toolchain (only for the Tauri window and `src-tauri/` changes)
- Tauri prerequisites for your OS: <https://v2.tauri.app/start/prerequisites/>

Exact commands and dependency versions are maintained in [`package.json`](./package.json).

```bash
pnpm install
pnpm dev            # Tauri window (needs Rust)
pnpm dev:web        # browser only, http://127.0.0.1:1420
```

`pnpm install` sets up a husky pre-commit hook that runs lint-staged (oxlint + oxfmt) on staged files.

## Project Layout

| Path                                 | What lives there                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/shared/canvas/`                 | Pure domain logic (geometry, document transforms). No React, no Tauri. Tested.       |
| `src/renderer/src/`                  | React app: `store/` (zustand), `hooks/`, `components/`, `lib/`, `platform/`, `i18n/` |
| `src/player/`                        | Vanilla standalone player inlined into HTML exports                                  |
| `src-tauri/`                         | Rust shell: window, macOS menu, file IO commands                                     |
| `config/`                            | Tool configs (tsconfig, vite, vitest)                                                |
| `tests/e2e/`                         | Playwright browser E2E                                                               |
| `examples/`                          | Sample `.canvaslide` documents and their generated HTML exports                      |
| `src/cloud-share/`, `functions/api/` | Cloud snapshot validation/storage and Pages API routes                               |
| `website/`                           | Separate product website and user documentation                                      |
| `skills/`                            | Portable authoring skill linked to the example guide and file schema                 |

## Code Rules

The full list is in [`AGENTS.md`](./AGENTS.md). The ones that most often come up in review:

- **Logic in `src/shared/canvas`, UI stays thin.** Math and document transforms belong in the shared
  layer with a `*.test.ts` next to them. Components and hooks should mostly wire things together.
- **File-size hard limits:** `.ts`/`.tsx` ≤ 800 lines; `.test.ts`, `.test.tsx`, `.spec.ts` and
  `.spec.tsx` ≤ 1000. Count blank lines and comments; a final newline adds no extra line. This applies
  to all non-ignored TypeScript across the repository, including tests, examples, config and website.
  Only `src/renderer/src/i18n/locales/*.ts` are exempt. Keep related state and transitions together;
  split when responsibilities or lifecycles differ, not to satisfy a smaller target. Never disable
  the rule. `.oxlintrc.json` defines the limits, test patterns and locale exception for both checks;
  the guard shares oxlint's file discovery and counts independently of inline disables.
- **Name files after the concept** (`frame-fit.ts`, `camera-animator.ts`), never `utils` or `helpers`.
- **i18n:** every user-visible string goes through `t()` / `tn()`. Add the key to `i18n/locales/en.ts`
  first; the type forces every other locale to follow. Keep product names, key names (Esc, ⌘), file
  formats and units out of resources. Translate Korean the way Figma / PowerPoint's Korean editions do.
  The HTML export player stays English.
- **Zustand:** always subscribe with a selector, never `useStore()` without one.
- **Undo history:** recorded edits go through `applyEdit` / `patchElements(ids, patch)`. Drags use
  `beginEdit` → `patchElements(..., false)` → `endEdit` so they collapse into one undo step.
- **Styling:** use design tokens from `src/renderer/src/assets/main.css`; no ad-hoc hex in components.
- **Comments** explain _why_, one line, only when it is not obvious from the code.

## Presentation Experience Across App and HTML Export

Presentation features must work consistently in the desktop app, the browser editor's slide show,
and newly exported HTML. Changes to shared presentation code must also preserve the cloud-share
slide show. A presentation feature is complete when both the app and the standalone player support
it; implementing only one and leaving the other for a follow-up is not the default contribution path.

- **Ship both experiences in the same PR.** New or changed presentation controls, shortcuts,
  navigation, auto-hide behavior, laser pointing, ink, and accessibility must be implemented and
  verified in the app and HTML player together.
- **Share the implementation.** Keep control definitions, icon geometry, state transitions,
  input ownership, and presentation styling in shared modules. Framework adapters should connect
  lifecycle, camera state, labels, and supported host actions; they should not own duplicate behavior.
  Pure geometry and policy belong in `src/shared/canvas/`; shared DOM bindings, painters, and
  presentation CSS belong in `src/shared/presentation/`.
- **Keep runtime boundaries intact.** Shared presentation modules must not depend on React,
  Zustand, Tauri, renderer-only imports, or app localization. The HTML player remains a single
  self-contained file with inline styles and SVG icons, without an added framework, icon runtime,
  or CDN dependency. Preserve the player dependency boundary and built-artifact size budget.
  Existing externally linked media keep their documented provider and protocol requirements.
- **Preserve temporary annotations.** Laser pointing and ink are presentation-session state, not
  document edits. They must not change document contents, dirty state, undo history, or serialized
  exports. Share their clearing, retention, coordinate, and pointer-cancellation rules across hosts.
- **Keep controls usable across input methods.** Mouse, keyboard, touch, and pen must follow the
  same input policy. Drawing must not also trigger swipe navigation. Hidden controls must not retain
  keyboard focus, and compact layouts must keep the presentation tools reachable.
- **Test the same behavior in both hosts.** Reuse presentation scenarios against the app and an
  actual exported HTML opened locally. Cover focus and auto-hide, reduced motion, narrow viewports,
  pointer/ink lifecycle, navigation, and input conflicts. Include core input coverage in Chromium,
  Firefox, and WebKit, and record the native platforms actually checked in the PR.
- **Document intentional differences.** The app uses its localized labels and appearance
  preference; HTML uses English and its existing fixed light theme. Do not copy the author's app
  theme into the document or switch the exported board using the viewer's color-scheme preference.
  Return-to-editor controls exist only when an editor is available. These host differences do not
  justify omitting presentation tools from HTML.

An export embeds its player at creation time. Player changes apply to newly generated HTML;
previously distributed files remain unchanged until they are regenerated and redistributed.

## Documentation and Temporary Files

- Update the maintained documentation affected by the change; keep the English and Korean README
  structure, feature summaries and getting-started steps aligned.
- Track planned work in issues and completed changes
  in PRs/releases. Put run-specific test results, counts and measurements in the PR with their environment,
  not in a rolling status report. Preserve lasting constraints with links to the code/tests that enforce them.
- Do not add files under `docs/` without a specific, lasting documentation need. Explain that need
  in the PR; `docs/` is not a workspace for task artifacts or review evidence.
- Keep temporary files in `discuss/`, which is already excluded by `.gitignore`. This includes
  screenshots, before/after images, recordings, reproduction files, logs and issue/PR drafts.
- Do not force-add files from `discuss/`. Attach review screenshots or videos directly to the issue
  or PR instead of committing them solely as visual proof.

## Branch Naming

Work branches must use `<type>/<short-kebab-case-description>`. Start with a purpose prefix such as
`fix/`, `feat/`, `docs/`, `refactor/`, `test/`, `perf/`, or `chore/`, followed by a short description
in lowercase words separated by hyphens:

- `fix/canvas-rendering-performance`
- `fix/connector-port-snap-on-resize`
- `feat/frame-list-drag-reorder`
- `chore/update-playwright`

The slash between the type and description is required: `fix-canvas-rendering-performance` is invalid.
Do not prepend a username, team, or tool name, such as `username/fix-canvas-rendering-performance`
or `username/fix/canvas-rendering-performance`. Avoid vague names like `test`, `wip`, or `changes`.

After a tool creates a branch or worktree, check the actual Git branch name with
`git branch --show-current` and correct any automatic prefix before committing or opening a PR.

## Commits

- Write the subject in the imperative mood (“Add elbow connector labels”, not “Added …”).
- Keep one logical change per commit where practical; it makes review and bisecting easier.
- Do not bump versions or touch release metadata in a normal contribution.

## Before Opening a PR

Run the same checks CI runs:

```bash
pnpm check                          # oxlint + max-lines + oxfmt + tsc + vitest
pnpm test:e2e                       # Chromium suite + core interactions in Firefox/WebKit
pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test   # only if src-tauri/ changed
pnpm bundle:local --bundles app     # macOS; if you touched the shell, config, or bundling
pnpm test:site                      # if website content, code, or build inputs changed
```

E2E starts Vite on a port derived from this checkout and verifies the server belongs to it.
Install browsers with `pnpm exec playwright install chromium firefox webkit` if needed.
Set `CANVASLIDE_E2E_WEBKIT=1` to include the additional WebKit rendering regressions.
`pnpm bundle:local` builds unsigned installers for the current OS without the updater key; on Windows
run it without `--bundles`, and on macOS drop `--bundles app` to also build the DMG.
CI runs Rust checks and macOS/Windows bundle jobs regardless of the local change scope; workflow
definitions live in [`.github/workflows/`](./.github/workflows/).

`pnpm format` fixes formatting; `pnpm lint:fix` fixes auto-fixable lint issues; `pnpm rust:fmt`
reformats `src-tauri/`.

For documentation edits, check relative links, anchors, example paths and documented commands against
the checkout. Do not add runtime tests solely to assert prose. Report skipped or failed checks explicitly.

Add tests that would actually catch a regression, not just the happy path:

- New or changed math / document logic → unit test in `src/shared/canvas/*.test.ts`.
- New or changed interaction (tools, shortcuts, selection, presenting) → Playwright test in `tests/e2e/`.
- Rust command changes → `cargo test` in `src-tauri/`.

If your change affects UI or interaction, try it in both the Tauri window and browser mode, and on
Windows if the change involves shortcuts, menus or file dialogs.

## Pull Requests

Each PR should be small, focused and easy to review. In the description:

- **Summary:** one plain-language paragraph on what the change does for a user.
- **What changed and why:** the approach and any alternatives you rejected.
- **Linked issue:** `Fixes #123` where one exists.
- **Visual proof:** before / after screenshots or a short video for any UI or interaction change. If
  there is truly no visual change, say `No visual change` and why. Attach this evidence directly to
  the PR; this requirement does not mean adding image files to the repository.
- **Testing:** how you verified it, which platforms you actually ran it on, and which automated tests
  you added or why none were needed.
- **Platform notes:** anything macOS-only, Windows-only, or Tauri-vs-browser specific.

Maintainers may ask for changes; keep the conversation on the PR so the reasoning is preserved.

## Reporting Bugs and Requesting Features

Open a GitHub issue. Report security vulnerabilities privately instead, as described in
[`SECURITY.md`](./SECURITY.md). For bugs, include:

- CanvaSlide version (or commit), OS and version, and whether you ran the Tauri app or browser mode
- Steps to reproduce, expected vs. actual behaviour
- A `.canvaslide` that reproduces it, if the bug depends on document content

For feature requests, describe the problem you are trying to solve before the solution you have in mind.

## Releases

Releases are maintainer-managed and driven by git tags: `npm version <bump>` then
`git push --follow-tags` builds macOS and Windows installers into a draft GitHub Release.
The full procedure, troubleshooting and the signing roadmap are in [`docs/RELEASE.md`](./docs/RELEASE.md).

## License

CanvaSlide is released under the [MIT License](./LICENSE). By contributing, you agree that your
contributions will be licensed under the same terms.
