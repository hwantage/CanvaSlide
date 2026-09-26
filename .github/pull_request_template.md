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

Desktop check: none / steps <!-- Give a reason for none, or manual steps with keys for changed desktop behavior; record actual results if run. -->

<!-- Describe automated tests added/updated, or why none were needed. Routine macOS/Windows checks
     belong to docs/RELEASE.md#desktop-release-checklist before release. -->

## Platform Notes

<!-- Anything macOS-only, Windows-only, or Tauri-vs-browser specific. Write `N/A` if none. -->

## Checklist

<!-- Tick only commands you ran successfully; explain skipped or failed checks in Testing.
     Full E2E is left to CI on every PR; run it locally only to reproduce a CI failure. -->

- [ ] `pnpm check`
- [ ] Affected unit/spec files (list exact commands in Testing)
- [ ] `pnpm rust:fmt:check && pnpm rust:clippy && pnpm rust:test` — if `src-tauri/` changed
- [ ] `pnpm test:site` — if `website/` or app modules it imports changed
- [ ] `pnpm bundle:local` (`--bundles app` for macOS app only) — only if bundling configuration changed
- [ ] Affected documentation and links are updated; new permanent docs have a stated purpose
