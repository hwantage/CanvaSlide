## Summary

<!-- One plain-language paragraph: what does this change do for a user? The PR title is the one-liner. -->

## What Changed

<!-- Describe the change and keep the scope tight. -->

## Why

<!-- What problem does this solve, and why is this approach right? Mention alternatives you rejected. -->

## Linked Issue

<!-- Link the issue this PR addresses. Open one first unless this is a small bug fix (see CONTRIBUTING.md). -->

Fixes #

## Visual Proof

<!-- REQUIRED for UI or interaction changes: before / after screenshots, or a short video for motion
     (camera transitions, drags, snapping). Drag and drop attachments here; never commit them to the repo.
     If there is truly no visual or interaction change, write exactly `No visual change` and say why. -->

## Testing

<!-- How did you verify this? List the commands you ran with their results, the checks you skipped and
     why, and steps a reviewer can follow. -->

- [ ] Ran in the Tauri window (`pnpm dev`)
- [ ] Ran in browser mode (`pnpm dev:web`)
- [ ] Tested on macOS
- [ ] Tested on Windows (required for shortcut, menu, or file-dialog changes)
- [ ] Automated tests added or updated, or explained below why not

## Platform Notes

<!-- Anything macOS-only, Windows-only, or Tauri-vs-browser specific. Write `N/A` if none. -->

## Checklist

- [ ] This PR is small and focused on one topic
- [ ] The applicable [Verify commands](https://github.com/hwantage/CanvaSlide/blob/main/AGENTS.md#verify) pass (tick each one you ran):
  - [ ] `pnpm check`
  - [ ] `pnpm test:e2e`
  - [ ] `pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test`
  - [ ] `pnpm bundle:local`
  - [ ] `pnpm test:site`
- [ ] The change follows the [code rules](https://github.com/hwantage/CanvaSlide/blob/main/AGENTS.md#rules)
- [ ] Affected documentation and links are updated; new permanent docs have a stated purpose
- [ ] Self-reviewed for correctness, undo/redo behaviour, and performance on large documents
