# Contributing to CanvaSlide

Thanks for taking the time to contribute. CanvaSlide is an infinite-canvas presentation app built with
Tauri 2, React 19 and TypeScript. This guide covers how to set up, what we expect from a change, and how
to get it merged.

## Before You Start

- Read [`AGENTS.md`](./AGENTS.md): it holds the repository layout, the code rules and the Verify
  commands for everyone, human or agent. Follow the [documentation map](./docs/README.md) for
  task-specific guidance.
- Keep each change scoped to one improvement, bug fix, refactor, or documentation topic.
- Check existing issues first. Except for a small bug fix, open an issue describing the problem and
  your proposed approach before writing code, so we can agree on direction early.
- Until 1.0, stabilizing what exists comes before new features; 1.0 is also where the document format
  is declared stable. The [feature status](./README.md#feature-status) lists which features are core
  and which are experimental; a feature changes status only when a maintainer updates that list.
- Keep a new feature's complexity in proportion to its importance. Split a large feature into steps
  that each leave the app working, one pull request per step, so reviewers can follow it. New
  features ship as core; a maintainer decides when one is marked experimental, for example when it
  depends on a hosted service the project does not control.

## Local Setup

Requirements:

- Node.js 22.20+ (CI uses the version in `.node-version`) and pnpm 11 (`corepack enable` picks up
  the pinned version from `package.json`)
- Rust 1.89+ (only for the Tauri window and `src-tauri/` changes); with rustup, the first `cargo`
  command installs the version CI uses, pinned in `rust-toolchain.toml`
- Tauri prerequisites for your OS: <https://v2.tauri.app/start/prerequisites/>

Exact commands and dependency versions are maintained in [`package.json`](./package.json).

```bash
pnpm install
pnpm dev            # Tauri window (needs Rust)
pnpm dev:web        # browser only, http://127.0.0.1:1420
```

`pnpm install` sets up a husky pre-commit hook that runs lint-staged (oxlint + oxfmt) on staged files.
oxlint runs with type information (`options.typeAware` in [`.oxlintrc.json`](./.oxlintrc.json), through
the `oxlint-tsgolint` dev dependency), so rules that need types run in the hook, `pnpm lint` and CI alike.

### Editor Setup

The project uses TypeScript 7, whose package has no `tsserver`: its native `tsc` is both the compiler
and, with `--lsp`, the language server, so an editor's built-in TypeScript support, which loads
`tsserver.js` from `node_modules/typescript`, cannot use it. In VS Code, install the extensions
recommended in [`.vscode/extensions.json`](./.vscode/extensions.json):

- **TypeScript 7** (`TypeScriptTeam.native-preview`), the TypeScript 7 language server. It turns
  itself on after installation; if you turned it off, run **TypeScript: Enable TypeScript 7 Language
  Server** from the Command Palette. It runs the TypeScript 7 bundled with the extension, whose
  version can differ from the project's.
- **Oxc** (`oxc.oxc-vscode`), which shows oxlint's diagnostics, type-aware rules included, from the
  project's `.oxlintrc.json` and `node_modules`.

In other editors, use a TypeScript 7 language server; `pnpm typecheck` and `pnpm lint` decide what CI
accepts.

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

- Write the subject in the imperative mood (“Add elbow connector labels”, not “Added …”) and explain
  why in the body.
- Keep one logical change per commit where practical; it makes review and bisecting easier.
- Do not bump versions or touch release metadata in a normal contribution.

## Pull Requests

Before opening a PR, run the applicable [Verify commands](./AGENTS.md#verify). Each PR should be small,
focused and easy to review; the [PR template](./.github/pull_request_template.md) asks for:

- **Summary:** one plain-language paragraph on what the change does for a user.
- **What changed and why:** the approach and any alternatives you rejected.
- **Linked issue:** `Fixes #123` where one exists.
- **Visual proof:** before / after screenshots or a short video for any UI or interaction change. If
  there is truly no visual change, say `No visual change` and why. Attach this evidence directly to
  the PR; this requirement does not mean adding image files to the repository.
- **Testing:** the commands you ran and their results, which platforms you actually ran it on, which
  checks you skipped and why, and which automated tests you added or why none were needed.
- **Platform notes:** anything macOS-only, Windows-only, or Tauri-vs-browser specific.

`main` changes only through pull requests, and a PR can merge only when its `CI passed` check succeeds.
Maintainers may ask for changes; keep the conversation on the PR so the reasoning is preserved.

## Reporting Bugs and Requesting Features

Open a GitHub issue with the [bug or feature form](https://github.com/hwantage/CanvaSlide/issues/new/choose).
Report security vulnerabilities privately instead, as described in [`SECURITY.md`](./SECURITY.md).

## Releases

Releases are maintainer-managed and driven by git tags: a version bump is merged through a pull
request, and pushing a `v*` tag on its merge commit builds macOS and Windows installers into a draft
GitHub Release once that commit's CI on `main` has passed.
The full procedure, troubleshooting and the signing roadmap are in [`docs/RELEASE.md`](./docs/RELEASE.md).

## License

CanvaSlide's code and documentation are released under the [MIT License](./LICENSE). By
contributing, you agree that your contributions will be licensed under the same terms. The name,
logo and mascot artwork are not covered; see [License in the README](./README.md#license).
