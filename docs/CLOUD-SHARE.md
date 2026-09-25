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
Later edits do not change existing links. The app has no account or manual revocation; the service
operator can delete a snapshot on request ([abuse reports](#reporting-abuse-and-deleting-a-snapshot)).
Keep private content in local files. Documents over 5 MiB (UTF-8 JSON, including embedded images)
stay local. The dialog offers a `.canvaslide` save when sharing is unavailable, offline, or over quota.

## Local development

Run the app and Pages Functions with a local KV namespace, without a Cloudflare account. The command
reads the top level of [`wrangler.toml`](../wrangler.toml):

```bash
pnpm dev:cloud      # http://localhost:8788, builds the app first; KV stays in .wrangler/
```

For Vite hot reload, keep that server running and start
`VITE_CLOUD_SHARE_URL=http://localhost:8788 pnpm dev:web`. Generated links open the built app on
port 8788. Plain `pnpm dev:web` uses a same-origin API; without a Pages backend, sharing shows the
local-save fallback. No upload occurs until **Copy link** is pressed.

## Hosting and desktop builds

The hosted editor is the Cloudflare Pages project configured in [`wrangler.toml`](../wrangler.toml):
the output directory `dist` built by `pnpm build:web`, the compatibility date, and the KV namespace
bound as **SHARED_DOCUMENTS** in production. Cloudflare reads these settings from the file and shows
them read-only in the dashboard
([Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)).
The product website in `website/` remains a separate build. The `functions/api/share.ts` and
`functions/api/share/[id].ts` routes provide POST/GET; `src/renderer/public/_routes.json` restricts function
invocations to those API paths.

Production is published only from commits that passed CI, by the
[Web editor workflow](../.github/workflows/deploy-web-editor.yml):

- Whenever CI finishes on `main`, it takes the newest commit of `main` whose CI passed, builds it with
  `pnpm build:web` in a job without secrets, and publishes it with `wrangler pages deploy --branch main`.
  After a failed run the editor and its share API stay on the last commit that passed. **Actions → Web
  editor → Run workflow** on `main` publishes the newest passing commit again. To retry a failed
  publication, run it that way instead of re-running the failed job, which would publish the commit
  that older run chose.
- The publishing job runs in the `web-editor` GitHub environment and needs its `CLOUDFLARE_API_TOKEN`
  secret, an API token with the account's **Cloudflare Pages: Edit** permission, and its
  `CLOUDFLARE_ACCOUNT_ID` variable. Without both it publishes nothing and ends with a warning; with
  only one of them it fails. Only the step that runs Wrangler receives the token, after dependencies
  are installed without install scripts.
- Pull request previews are still built by Cloudflare's Git integration, whose automatic production
  deployments are turned off; publishing previews from a workflow would hand the token to pull request
  runs. Previews run unreviewed branches, so `wrangler.toml` gives them no KV namespace and sharing
  there reports that it is unavailable.

To host another copy, create a Pages project whose production branch is `main` and a KV namespace,
put their name and id in `wrangler.toml`, give the `web-editor` environment your own token and
account ID, and set the workflow's environment URL to your project. If the project uses the Git
integration, turn off its automatic production deployments, or it publishes commits that failed CI.

For desktop builds, set `VITE_CLOUD_SHARE_URL=https://YOUR-PAGES-PROJECT.pages.dev` when running
`pnpm dev` or `pnpm bundle:local`. This must be the origin of the deployed editor, without a path,
query, or credentials. Unconfigured desktop builds retain local saving and show an unavailable
message for cloud sharing. Export this variable in the build process environment so Vite and Rust
receive the same value; setting it only in a Vite `.env` file does not configure the native CSP.
The Rust build pins the Tauri CSP to that exact origin, including its port. Packaged builds require
HTTPS; `pnpm dev` also accepts an explicit local HTTP origin such as `http://localhost:8788`.
The hosted editor calls the API on its own origin. Cross-origin, the API answers only the desktop
WebViews (`tauri://localhost` on macOS, `http://tauri.localhost` on Windows) and loopback HTTP origins
(`localhost`, `127.0.0.1`, `[::1]`, any port) used by `pnpm dev` and Vite, without credentials.
CORS requests and uploads from any other origin receive 403 before the body is read or KV is
touched. Desktop link copying uses the native clipboard plugin. Share URLs open the hosted editor in
a browser; OS deep-link registration is outside this feature.

## API contract and limits

- **Validation:** the API validates the current runtime JSON document schema (`canvasDocumentSchema`),
  checks streamed bytes as well as Content-Length, and returns JSON with `no-store`/`nosniff` headers.
  Shared images must use embedded image data URLs; external URLs, including image references nested
  inside SVGs, are rejected on upload and again by the viewer.
  SVG validation rejects malformed XML, DTDs, processing instructions, and excessive nesting.
  Raster images (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), including those nested inside SVGs, must be
  base64 data whose leading bytes carry the signature of the declared image type.
- **Video policy:** shared videos accept YouTube, Vimeo, and direct files hosted on the share service's
  exact origin; arbitrary external video URLs must be removed or replaced before sharing. YouTube and
  Vimeo playback still contacts those providers. Local documents keep any linked video URL; the desktop
  app plays direct video files only over HTTPS.
- **Content Security Policy:** Pages' `_headers` restricts scripts, connections, frames, and media to the
  application and the required provider origins, blocks external image loads except YouTube thumbnails,
  and omits referrers.
- **Errors:** KV quota failures return 429 with Retry-After; other storage failures return 503.
  Requests from a disallowed browser origin return 403. Request rate limits belong to the deployment
  ([rate limiting](#rate-limiting)); the application does not implement a per-client limiter.
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

## Abuse controls

The API accepts uploads without an account. The checks above bound what one request can store
(5 MiB for 24 hours) and keep other websites from uploading through their visitors' browsers.
Per-client request rate limits belong to the deployment rather than the application.

### Rate limiting

Pages Functions cannot bind the Workers rate-limiting API directly, and an exact per-client counter
cannot be built on eventually consistent KV. Configure a
[WAF rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) instead:

- **Scope:** WAF rules run on a zone the account owns, so serve the Pages project from a
  [custom domain](https://developers.cloudflare.com/pages/configuration/custom-domains/) and
  [redirect `*.pages.dev`](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/)
  to it. Desktop builds fetch without following redirects and pin their CSP to the
  `VITE_CLOUD_SHARE_URL` they were built with, so build them with the custom domain before the
  redirect takes effect; installed builds that use the old origin cannot share once it does.
- **Expression:** `http.request.uri.path in {"/api/share" "/api/share/"}`. Both paths reach the
  upload route. This counts uploads and their CORS preflights and leaves `/api/share/<id>` reads alone.
- **Counting:** by IP. The period, request count and mitigation timeout available depend on the
  Cloudflare plan; the Free plan offers one rule with a 10-second period and a 10-second timeout.
- **Action:** Block with the default 429 response. The hosted editor then shows its quota message.
  The block response carries no CORS headers, so the desktop app reports a network error instead.
  Both offer a local save.

### Reporting abuse and deleting a snapshot

Report a share link that contains abusive or illegal content privately, through
[GitHub's private report form](https://github.com/hwantage/CanvaSlide/security/advisories/new).
Include the share ID (the `share` value in the link) and the reason; do not post the link publicly.

A maintainer with access to the Cloudflare account deletes the snapshot with Wrangler:

```bash
pnpm exec wrangler login
# <namespace-id>: the SHARED_DOCUMENTS id under [[env.production.kv_namespaces]] in wrangler.toml
pnpm exec wrangler kv key get "share:<share-id>" --namespace-id <namespace-id> --remote   # confirm
pnpm exec wrangler kv key delete "share:<share-id>" --namespace-id <namespace-id> --remote
```

Preview deployments have no namespace, so every link to the hosted editor is stored in production.
Other regions can keep serving the snapshot for a minute or more after deletion because of KV
propagation, and a recipient who already opened the link keeps the copy loaded in their tab.
