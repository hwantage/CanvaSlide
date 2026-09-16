# Contributing to CanvaSlide

Thanks for taking the time to contribute. CanvaSlide is an infinite-canvas presentation app built with
Tauri 2, React 19 and TypeScript. This guide covers how to set up, what we expect from a change, and how
to get it merged.

## Before You Start

- Keep each change scoped to one user-facing improvement, bug fix, or refactor.
- CanvaSlide targets **macOS and Windows** as first-class platforms. Never hardcode `metaKey`; use
  `hasPrimaryModifier()` and `shortcutLabel()` from `src/renderer/src/lib/platform-keys.ts` so shortcuts
  and their labels (⌘ / Ctrl) are right on both.
- The app must work both inside the Tauri shell and in plain browser dev mode (`pnpm dev:web`). Anything
  that touches the OS (file dialogs, menus, file IO) goes through `src/renderer/src/platform/` with a
  browser fallback.
- Read [`AGENTS.md`](./AGENTS.md) for the code rules, [`docs/PRD.md`](./docs/PRD.md) for scope and
  [`docs/REPORT.md`](./docs/REPORT.md) for the current state before changing behaviour.
- Check existing issues first. For anything larger than a bug fix, open an issue describing the problem
  and your proposed approach before writing code, so we can agree on direction early.

## Local Setup

Requirements:

- Node.js 22+ and pnpm 11 (`corepack enable` picks up the pinned version from `package.json`)
- Rust stable toolchain (only for the Tauri window and `src-tauri/` changes)
- Tauri prerequisites for your OS: <https://v2.tauri.app/start/prerequisites/>

```bash
pnpm install
pnpm dev            # Tauri window (needs Rust)
pnpm dev:web        # browser only, http://127.0.0.1:1420
```

`pnpm install` sets up a husky pre-commit hook that runs lint-staged (oxlint + oxfmt) on staged files.

## Project Layout

| Path                 | What lives there                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ |
| `src/shared/canvas/` | Pure domain logic (geometry, document transforms). No React, no Tauri. Tested.       |
| `src/renderer/src/`  | React app: `store/` (zustand), `hooks/`, `components/`, `lib/`, `platform/`, `i18n/` |
| `src/player/`        | Vanilla standalone player inlined into HTML exports                                  |
| `src-tauri/`         | Rust shell: window, macOS menu, file IO commands                                     |
| `config/`            | Tool configs (tsconfig, vite, vitest)                                                |
| `tests/e2e/`         | Playwright browser E2E                                                               |
| `examples/`          | Sample `.canvaslide` documents and their generated HTML exports                      |

## Code Rules

The full list is in [`AGENTS.md`](./AGENTS.md). The ones that most often come up in review:

- **Logic in `src/shared/canvas`, UI stays thin.** Math and document transforms belong in the shared
  layer with a `*.test.ts` next to them. Components and hooks should mostly wire things together.
- **File size limits:** `.ts` ≤ 300 lines, `.tsx` ≤ 400, tests ≤ 800. Split the file instead of
  disabling the rule. Only `src/renderer/src/i18n/locales/*.ts` are exempt.
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
pnpm test:e2e                       # Playwright (starts its own vite; port derived from the checkout)
pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test   # only if src-tauri/ changed
pnpm tauri build --bundles app      # if you touched the shell, config, or bundling
```

`pnpm format` fixes formatting; `pnpm lint:fix` fixes auto-fixable lint issues; `pnpm rust:fmt`
reformats `src-tauri/`.

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
  there is truly no visual change, say `No visual change` and why.
- **Testing:** how you verified it, which platforms you actually ran it on, and which automated tests
  you added or why none were needed.
- **Platform notes:** anything macOS-only, Windows-only, or Tauri-vs-browser specific.

Maintainers may ask for changes; keep the conversation on the PR so the reasoning is preserved.

## Reporting Bugs and Requesting Features

Open a GitHub issue. For bugs, include:

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
