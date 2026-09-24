# Crash recovery

[Documentation map](./README.md) · [Architecture and constraints](./ARCHITECTURE.md)

Recovery periodically keeps a local copy of a dirty document. After an interrupted session, the
app offers the **latest successfully persisted snapshot**, not necessarily the last edit. Recovery
is separate from Save and never silently replaces the open document or its source file.

## Scope and loss window

| Situation                                               | Behaviour                                                                                                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer crash, force quit or interrupted OS session    | Offers retained snapshots once their owners' locks are released and storage is readable.                                                                                                 |
| Browser reload, navigation or close                     | Retains snapshots, even if a browser-owned leave confirmation appeared. Lifecycle events do not prove consent.                                                                           |
| Successful Save or explicit in-app document replacement | Schedules cleanup of this editor's own and adopted copies. Pending IO and failed cleanup can leave a later offer.                                                                        |
| Recovery switched Off                                   | Stops new writes and schedules cleanup of this editor's copies; unanswered offers stay retained.                                                                                         |
| Confirmed native quit                                   | Stops new writes and attempts queued cleanup; quits after two seconds if the document has not changed. New edits or document replacement cancel the quit and resume recovery scheduling. |

There may be no snapshot before the first scheduled write, while recovery is disabled or unsupported,
or after storage refuses a write. Later edits can be lost even when an older copy exists. Browser
storage eviction, private-session disposal, user deletion, hardware failure and filesystem durability
limits remain outside the recovery contract. This is not a backup service or a universal power-loss
guarantee.

## Envelope and storage

The worker produces version-1 UTF-8 JSON:

```text
{ version, file: { display, handle } | null, documentName, savedAt, contents }
```

`contents` uses the normal document JSON codec. The envelope and document are serialized in
[`document-file.worker.ts`](../src/renderer/src/lib/document-file.worker.ts), then returned as
transferable bytes. Native writes pass those bytes as the IPC body, with the session id in a header,
avoiding another large JSON serialization in the renderer. Sending the document to the worker still
uses structured cloning, including newly changed embedded assets; this is not a zero-copy pipeline.

`file.display` is only a label. Restore validates `file.handle`: string paths cannot be empty or
contain NUL; encoded paths need nonzero integer units in the platform's range and the current
platform's encoding. Invalid handles fall back to Save As. Recovery does not compare source-file
mtime: a newer timestamp cannot establish that the file includes the recovered edits. Named-file
offers warn that the original may differ and should be compared before saving over it.

The native shell accepts a copy only when `file` is null or names a file already
[chosen this session](../src-tauri/src/granted_files.rs), exactly once. Reading a copy for Restore
grants that file, so the restored document saves back to it.

| Platform | Storage and commit boundary                                                                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser  | IndexedDB `canvaslide-recovery`, schema version 2. `snapshots` stores small metadata/byte counts; `payloads` stores binary envelopes. One transaction updates or removes both stores and explicitly requests `durability: 'strict'`. Acknowledgement waits for transaction completion. The browser decides how that durability hint is implemented. |
| Native   | `<app data>/recovery/<session>.json`. Write `<session>.json.tmp`, synchronize the file, then replace the destination. Unix also synchronizes the parent directory; Windows uses `MoveFileExW` with replacement and write-through flags after synchronizing the file. Failures propagate before the store retires an adopted copy.                   |

Browser launch scans read only the metadata store. Native scans read and parse each full envelope on
a blocking worker thread and return only metadata, so they are not metadata-only disk reads. Full
document decoding happens only on Restore.

Unknown versions and malformed envelopes are quarantined and shown with Restore disabled. They are
retained for a compatible app or an explicit Discard. A missing record or failed read is a retryable
error, not authorization to delete. The ordinary document decoder validates contents on Restore;
a valid envelope alone does not establish a valid document.

## Ownership and launch

Each renderer gets a random session id. It must acquire its own claim before scans or writes can
succeed. Browsers use an exclusive Web Lock; native instances use OS file locks through `fs2`.
Native ownership therefore also applies to multiple macOS instances launched with `open -n`.
A native renderer reload releases that process's previous renderer claims before acquiring new ones.

Before reading any foreign record, including incompatible data or temporary files, the recovery
consumer acquires its exclusive claim. It holds that claim throughout offering, deferral and adoption.
A different consumer skips the record. Writes, reads for Restore and deletes check ownership again.
Claims are released after successful removal or after an unsuccessful scan read; adopted records
are excluded from retry scans so their claims cannot be released there. Normal process/tab teardown
releases OS/browser locks. This coordinates cooperating app instances; it is not a security boundary
against another program modifying the recovery directory or same-origin storage.

The store shares an in-flight initialization promise. The hook subscribes before initialization, so
edits during a slow scan remain scheduled, while storage mutation waits for acknowledged ownership
and a completed scan. A failed list is reported separately from an empty store. Partial read failures
are reported alongside readable offers. Settings provides **Check recovery copies again**; retry does
not reset active ownership. A rejected lock request remains a failure, and absent browser Web Locks
leave recovery unsupported rather than allowing a misleading Saved status.

Candidates are sorted newest first. File timestamps are not used to delete work. At most
`MAX_RECOVERABLE_SESSIONS` (five) Discard decisions appear in one prompt batch; the remaining queue
stays reachable through Settings → Review. Restore or Later returns to the editor without answering
the other offers.

## Scheduling

[`nextSnapshotAction`](../src/shared/canvas/recovery-snapshot.ts) is the pure scheduling decision.
The hook records revisions and the first pending change, then executes its answer. Scheduling uses
the monotonic `performance.now()` clock; only the displayed snapshot timestamp uses wall-clock time.

| Input                                | Rule                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Idle window                          | Prefer a write five seconds after the latest edit.                                                                         |
| Maximum pending age                  | A first pending change becomes due after 30 seconds, even with continuous input.                                           |
| Interval and previous cost           | Use 20 times the previous attempt's duration, clamped between 30 seconds and two minutes, measured between attempt starts. |
| Prompt/action, quit or write pending | Defer scheduling until the operation completes, the prompt closes or the quit is canceled.                                 |
| Saved or disabled                    | Clear existing own/adopted state after queued writes finish.                                                               |
| Explicit enable                      | Reschedule the current dirty revision even if no new edit occurred.                                                        |

The cost multiplier is an adaptive target, not a hard 5% CPU bound. It measures the previous whole
attempt, including queue/storage latency, and can extend the nominal 30-second deadline up to the
two-minute interval cap. Suspension included in elapsed time cannot multiply into hours of additional
waiting; wall-clock corrections do not alter scheduling. Some platforms pause their monotonic clock
during sleep, so a remaining bounded interval may still run after wake. Background
timer throttling, initialization, prompts and in-flight writes also extend the loss window. After a
failed attempt, that same revision is not retried on a timer; a later edit or explicit Off/On permits
another attempt. Edits during the failed attempt already count as later revisions.

## Restore, discard and cleanup

Only one prompt action can run at a time; all action buttons are disabled while it runs. Restore
confirms replacement of dirty work and decodes the selected payload. An authored content change or
session replacement during either step defers the offer; text-height measurements do not. Refusing
the confirmation returns to the editor so the current work can be saved. The prompt is not shown
during a slide show and does not block its keys; it reappears when the slide show ends. A transient read/worker failure retains the offer for Retry.

New/Open also observe authored content and session changes throughout discard confirmation and file
reading. Any content edit or session replacement, including live typing/dragging in an already dirty
document and an edit followed by undo, cancels the pending replacement. Text-height measurements and
the resulting attached-connector geometry do not cancel it. An Open
started before Restore cannot replace the recovered document or trigger cleanup of its source.

Restoring atomically replaces the document with `savedDocument = null`, so it remains dirty even
after editing and undoing back to the restored state. The source snapshot remains exclusively claimed
as `adopted`. Its removal waits for a successful replacement write for the captured document session
and adopted id, or an explicit Save/discard decision. An old write completing after a different
Restore cannot delete the new adopted record. Writes and clears are serialized by the recovery store.

This retains the previously persisted recovered revision during handoff; it does not promise a copy
of every subsequent edit at every instant. Cleanup of an adopted-only copy also runs if Save happens
before the first recovery timer. Failed deletion retains retryable state and reports an error rather
than claiming the copy is gone. A browser unload never attempts destructive cleanup. Native
filesystem commands use blocking workers behind async commands; the quit command does not need their
mutex. Native cleanup can be interrupted by the exit deadline. Native quit observes authored content
and session changes from confirmation through cleanup and cancels if any occur, even if an edit was
subsequently undone. Renderer measurements alone do not cancel quit. Overlapping close requests
share that decision. Cancellation resumes scheduling and skips queued exit cleanup that has not
started. Already-dispatched IO cannot be undone; new copies wait behind it in the same queue. A
canceled quit therefore keeps the current work in the editor but does not promise uninterrupted
storage availability during stalled IO.

## Bounded retention and native temporary files

Neither a sixth unanswered session nor an unknown version is evicted automatically. Instead, new
writes are refused when their replacement would exceed **256 MiB per snapshot**, **512 MiB of stored
payloads**, or **1,000 records**. Existing unanswered work remains. Size/count checks and commits share
one IndexedDB transaction or a native namespace lock, so competing writers cannot bypass the check.
The limits describe application payload accounting, not exact disk allocation: database overhead,
metadata/locks and the native old-plus-temporary replacement add space. Foreign files or
externally modified storage can already exceed those limits; refusal does not erase them.

Native startup also discovers temp-only sessions. Under the abandoned session's claim it promotes a
complete JSON value (including an unknown envelope version or shape), synchronizing it before
replacement. Temp files that fail parsing at an unexpected end of input are removed; an existing completed snapshot remains.
If settling a temp fails, an existing completed snapshot is read independently and offered when
valid, alongside the scan warning. Under the namespace lock, the failing temp is retained as a
`.json` record without changing its bytes. With no completed copy it keeps the same claimed session
id, so malformed data immediately becomes a quarantined item the user can review or discard; the
next scan no longer reports a temp-settlement failure. When a completed copy exists, the temp uses a
unique `quarantine-*.json` session id, so cleanup of the completed copy cannot delete the alternative.
A subsequent scan discovers that retained file independently. Oversized/unreadable files still
remain scan failures. If the move fails, the temp remains in place and the failure is reported;
Settings → Check recovery copies again retries after filesystem access is restored. Empty abandoned lock files are collected under the
namespace lock; live locks are left alone.

## Enforced invariants

Store and hook tests use controlled IO promises to create race schedules; they establish state and
ordering rules, not disk durability. Browser tests exercise actual IndexedDB, Web Locks and workers;
native tests use real files and OS locks.

| Invariant                                                                                                           | Enforced in                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An offered or adopted record stays exclusively owned, and live incompatible data is skipped before inspection.      | [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [recovery_store_tests.rs](../src-tauri/src/recovery_store_tests.rs)                                                                                                                                                                                       |
| Transient Restore errors do not authorize deletion.                                                                 | [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts)                                                                                                                                                                                                                                                            |
| A stale write cannot retire another document's adopted copy; a failed write retains the source.                     | [recovery-store.test.ts](../src/renderer/src/store/recovery-store.test.ts), [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [recovery_store_tests.rs](../src-tauri/src/recovery_store_tests.rs)                                                                                                           |
| Restore stays dirty until a real save, including after edit/undo.                                                   | [document-store.test.ts](../src/renderer/src/store/document-store.test.ts), [recovery-store.test.ts](../src/renderer/src/store/recovery-store.test.ts), [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [autosave-recovery.spec.ts](../tests/e2e/autosave-recovery.spec.ts)                               |
| Unanswered and unknown-version work is retained across prompt batches and reload; quota refuses rather than evicts. | [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [recovery_store_tests.rs](../src-tauri/src/recovery_store_tests.rs), [recovery-snapshot.test.ts](../src/shared/canvas/recovery-snapshot.test.ts)                                                                                                          |
| Scheduling observes edits during initialization and continuous input, and re-enabling permits a fresh attempt.      | [use-recovery-snapshot.test.tsx](../src/renderer/src/hooks/use-recovery-snapshot.test.tsx)                                                                                                                                                                                                                                       |
| Unsupported ownership cannot become Saved, and scan/cleanup failures remain visible and retryable.                  | [recovery-session.test.ts](../src/renderer/src/platform/recovery-session.test.ts), [use-recovery-snapshot.test.tsx](../src/renderer/src/hooks/use-recovery-snapshot.test.tsx), [recovery-store.test.ts](../src/renderer/src/store/recovery-store.test.ts), [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts) |
| Prompt operations cannot overlap or replace a document changed during decode; refusal allows Save.                  | [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [recovery-store.test.ts](../src/renderer/src/store/recovery-store.test.ts), [autosave-recovery.spec.ts](../tests/e2e/autosave-recovery.spec.ts)                                                                                                           |
| Browser metadata scans do not load payloads, and encoding/decoding runs through the worker.                         | [recovery_store_tests.rs](../src-tauri/src/recovery_store_tests.rs), [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [recovery-native-transport.test.ts](../src/renderer/src/platform/recovery-native-transport.test.ts)                                                                                  |
| A pending Open cannot replace recovered work or delete its source, and text remeasurement alone does not cancel it. | [recovery-retention.spec.ts](../tests/e2e/recovery-retention.spec.ts), [use-document-commands.test.tsx](../src/renderer/src/hooks/use-document-commands.test.tsx)                                                                                                                                                                |
| Changes during native quit, but not text remeasurement, cancel that quit and resume recovery scheduling.            | [window-lifecycle.test.ts](../src/renderer/src/platform/window-lifecycle.test.ts), [recovery-store.test.ts](../src/renderer/src/store/recovery-store.test.ts), [use-recovery-snapshot.test.tsx](../src/renderer/src/hooks/use-recovery-snapshot.test.tsx)                                                                        |
| Suspended writes cannot create unbounded backoff, and wall-clock jumps do not affect scheduling.                    | [recovery-snapshot.test.ts](../src/shared/canvas/recovery-snapshot.test.ts), [use-recovery-snapshot.test.tsx](../src/renderer/src/hooks/use-recovery-snapshot.test.tsx)                                                                                                                                                          |
| A failed temp does not hide the completed copy; quarantined temp bytes survive cleanup and can be retried.          | [recovery_store_tests.rs](../src-tauri/src/recovery_store_tests.rs), [recovery-native-transport.test.ts](../src/renderer/src/platform/recovery-native-transport.test.ts)                                                                                                                                                         |

The Chromium crash suite uses `Page.crash`; the `@core-interaction` recovery cases also run in
Firefox and WebKit. Native tests cover file and lock operations and failure preservation, not a
physical power cut or every filesystem's persistence semantics; the bounded-quit test uses a cleanup
promise that never resolves, not a stalled disk, and IPC tests check the call boundary, not a live
webview. These suites do not establish WKWebView/WebView2, private-storage or bfcache-eviction
guarantees. Platform runs and actual verification results belong in the change report, not here.
