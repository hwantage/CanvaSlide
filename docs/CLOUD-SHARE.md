# Cloud share

[Documentation map](./README.md) · [Product overview](../README.md)

## Sharing a snapshot

The top-bar **Share** button lets you choose **Edit a copy** or **View slide show only** before
creating a link. Editable copies open in the editor and can be changed and saved locally.
Slideshow-only links require at least one presentation frame and open directly in a dedicated
viewer with frame navigation and overview, without editor tools, editing shortcuts, paste, or
file import. Escape stays in the viewer. The choice is stored with the snapshot, so changing
URL parameters cannot switch a slideshow link into an editable one.
Viewing-only controls do not prevent recipients from copying content they can view or access.

Anyone with the link can read the document. Each snapshot is automatically deleted from KV
24 hours after creation; reading a link or sharing again does not extend an earlier link's lifetime.
Later edits do not change existing links. The app has no account or manual revocation.
Keep private content in local files. Documents over 5 MiB (UTF-8 JSON, including embedded images)
stay local. The dialog offers a `.canvaslide` save when sharing is unavailable, offline, or over quota.

## Local development

Run the app and Pages Functions with a local KV namespace, without a Cloudflare account:

```bash
pnpm dev:cloud      # http://localhost:8788, builds the app first; KV stays in .wrangler/
```

For Vite hot reload, keep that server running and start
`VITE_CLOUD_SHARE_URL=http://localhost:8788 pnpm dev:web`. Generated links open the built app on
port 8788. Plain `pnpm dev:web` uses a same-origin API; without a Pages backend, sharing shows the
local-save fallback. No upload occurs until **Copy link** is pressed.

## Hosting and desktop builds

To host the editor on Cloudflare Pages, use the repository root, build command `pnpm build:web`,
and output directory `dist`. The product website in `website/` remains a separate build.
Create a KV namespace and bind it as **SHARED_DOCUMENTS** in the Pages project's settings for
each production/preview environment, then redeploy. The `functions/api/share.ts` and
`functions/api/share/[id].ts` routes provide POST/GET; `src/renderer/public/_routes.json` restricts function
invocations to those API paths. See Cloudflare's
[Pages KV binding instructions](https://developers.cloudflare.com/pages/functions/bindings/#kv-namespaces).

For desktop builds, set `VITE_CLOUD_SHARE_URL=https://YOUR-PAGES-PROJECT.pages.dev` when running
`pnpm dev` or `pnpm tauri build`. This must be the origin of the deployed editor, without a path,
query, or credentials. Unconfigured desktop builds retain local saving and show an unavailable
message for cloud sharing. Export this variable in the build process environment so Vite and Rust
receive the same value; setting it only in a Vite `.env` file does not configure the native CSP.
The Rust build pins the Tauri CSP to that exact origin, including its port. Packaged builds require
HTTPS; `pnpm dev` also accepts an explicit local HTTP origin such as `http://localhost:8788`.
The API's credential-free CORS responses allow desktop WebViews and Vite to reach it. Desktop
link copying uses the native clipboard plugin. Share URLs open the hosted editor in a browser;
OS deep-link registration is outside this feature.

## API contract and limits

- **Validation:** the API validates the current runtime JSON document schema (`canvasDocumentSchema`),
  checks streamed bytes as well as Content-Length, and returns JSON with `no-store`/`nosniff` headers.
  Shared images must use embedded image data URLs; external URLs, including image references nested
  inside SVGs, are rejected on upload and again by the viewer.
  SVG validation rejects malformed XML, DTDs, processing instructions, and excessive nesting.
- **Video policy:** shared videos accept YouTube, Vimeo, and direct files hosted on the share service's
  exact origin; arbitrary external video URLs must be removed or replaced before sharing. YouTube and
  Vimeo playback still contacts those providers. Local desktop documents retain their existing video support.
- **Content Security Policy:** Pages' `_headers` restricts scripts, connections, frames, and media to the
  application and the required provider origins, blocks external image loads except YouTube thumbnails,
  and omits referrers.
- **Errors:** KV quota failures return 429 with Retry-After; other storage failures return 503.
  Configure request limits for `/api/share` in the Cloudflare deployment if needed; the application
  does not implement an atomic per-IP limiter in KV.
- **Propagation:** new snapshots may take up to a minute to become visible in another region because of
  [KV's propagation behavior](https://developers.cloudflare.com/kv/api/write-key-value-pairs/#concurrent-writes-to-the-same-key).
  The missing-link dialog provides a retry action.
- **Access envelope:** POST bodies and stored GET responses use `{ access: "edit" | "present", document }`.
  A body without the envelope or with unrecognized access metadata is rejected instead of falling
  back to editing.
- **TTL:** automatic deletion uses KV's `expirationTtl: 86400`, so no scheduled cleanup is required.

The API receives resolved runtime assets, not the saved file’s shared `resources` table. Its 5 MiB
limit covers the entire JSON request, including the access envelope and resolved image data. A local
file with shared image resources can fit on disk yet exceed the cloud limit. To upload a file through
the API, first load it with the current document parser to obtain the runtime representation.
See [document formats](./ARCHITECTURE.md#document-formats). The implementation is in
[`src/cloud-share/`](../src/cloud-share/) and [`functions/api/`](../functions/api/); deployment policies
are in [`_headers`](../src/renderer/public/_headers) and [`_routes.json`](../src/renderer/public/_routes.json).
