## Summary

<!-- One plain-language paragraph: what does this change do for a user? The PR title is the one-liner. -->

## What Changed

<!-- Describe the change and keep the scope tight. -->

## Why

<!-- What problem does this solve, and why is this approach right? Mention alternatives you rejected. -->

## Linked Issue

<!-- Link the issue this PR addresses. Open one first for anything larger than a small fix. -->

Fixes #

## Visual Proof

<!-- REQUIRED for UI or interaction changes: before / after screenshots, or a short video for motion
     (camera transitions, drags, snapping). Drag and drop attachments here; never commit them to the repo.
     If there is truly no visual or interaction change, write exactly `No visual change` and say why. -->

## Testing

<!-- How did you verify this? Steps a reviewer can follow. -->

- [ ] Ran in the Tauri window (`pnpm dev`)
- [ ] Ran in browser mode (`pnpm dev:web`)
- [ ] Tested on macOS
- [ ] Tested on Windows (required for shortcut, menu, or file-dialog changes)
- [ ] Automated tests added or updated, or explained below why not

## Platform Notes

<!-- Anything macOS-only, Windows-only, or Tauri-vs-browser specific. Write `N/A` if none. -->

## Checklist

- [ ] This PR is small and focused on one topic
- [ ] `pnpm check` passes (oxlint + max-lines + oxfmt + tsc + vitest)
- [ ] `pnpm test:e2e` passes, or the change cannot affect browser E2E
- [ ] `pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test` pass, or `src-tauri/` is untouched
- [ ] New user-visible strings go through `t()` / `tn()` and are added to `i18n/locales/en.ts` first
- [ ] Shortcuts use `hasPrimaryModifier()` / `shortcutLabel()`, never hardcoded `metaKey`
- [ ] Math and document transforms live in `src/shared/canvas` with unit tests
- [ ] Self-reviewed for correctness, undo/redo behaviour, and performance on large documents
