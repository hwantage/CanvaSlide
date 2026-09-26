# Cloud share

[Documentation map](./README.md) · [Product overview](../README.md)

Cloud sharing is [experimental](../README.md#feature-status): the limits and availability of the
[hosted service](#hosted-service) depend on its Cloudflare plan.

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

## Hosted service

Official desktop releases and the web editor at <https://canvaslide.pages.dev/> share through a
service that the CanvaSlide maintainers run on Cloudflare Pages. This section covers that service
only; a [copy hosted by someone else](#hosting-and-desktop-builds) follows its operator's terms.
The Share dialog links here when the app uses this service.

### Terms of use

- The service is free, needs no account and comes with no warranty or guaranteed availability. While
  cloud sharing is experimental, the maintainers may change its limits, pause it or stop it.
- Share only content you have the right to share. Do not use the service for illegal content,
  malware, content that infringes someone else's rights, harassment, or other people's personal data
  without their consent.
- The maintainers may delete snapshots, and block requests, that break these terms or put the service
  at risk.
- A snapshot is not storage or access control: anyone with the link can open it until it expires.
  Keep the `.canvaslide` file as your copy, and keep confidential content out of shared snapshots.

### What is stored, and for how long

- **The snapshot:** the document as uploaded, including its embedded images, and the access choice,
  stored in Workers KV under the random ID in the link. Nothing else is stored with it: no account,
  IP address, device identifier or document history. KV deletes it 24 hours after upload; the
  maintainers can delete it earlier on request ([reporting abuse](#reporting-abuse-and-deleting-a-snapshot)).
- **Copies outside the service:** a recipient's open tab, an edited copy they saved and anything they
  exported stay with them after the snapshot is deleted.
- **Logs:** the share API writes no logs. Pages Functions logs are a live stream that a maintainer can
  watch while it is open and
  [are not stored](https://developers.cloudflare.com/pages/functions/debugging-and-logging/).
  The Cloudflare dashboard shows the maintainers aggregate request and error counts.
- **Cloudflare:** Cloudflare hosts the service for the maintainers. It runs the share API, stores the
  snapshot, and sees each request in full, including the uploaded document, the IP address, user agent
  and headers, in order to serve and protect it. It processes this data under the
  [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/). Its responses ask browsers
  that support Network Error Logging to report failed requests to Cloudflare.
- The project adds no cookies, analytics or tracking to the web editor or the API. What the desktop
  app and web editor send, and when, is listed under
  [network and privacy](../README.md#network-and-privacy).

### Limits and cost

- One snapshot is at most 5 MiB and lasts 24 hours.
- The service runs on Cloudflare's Workers Free plan, whose daily quotas are shared by everyone who
  uses it and reset at 00:00 UTC: 100,000 function requests, 1,000 new snapshots (KV writes) and
  100,000 snapshot reads. Stored snapshots are capped at 1 GB in total, and space frees as snapshots
  expire ([Workers](https://developers.cloudflare.com/workers/platform/limits/),
  [KV](https://developers.cloudflare.com/kv/platform/limits/),
  [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)).
- The Free plan also limits the CPU time of each request, and validating a large snapshot takes more,
  so an upload can fail well below 5 MiB, especially one with many elements. Send the file instead.
- The quotas cap the cost: once one is used up, the service refuses requests instead of charging for
  more, until the daily quotas reset or, for the storage cap, until expiring snapshots free space.
  The Share dialog then reports that sharing is over its limit, unavailable or unreachable, and
  offers a local save.
- No per-client rate limit applies yet: a [WAF rule](#rate-limiting) needs a custom domain, and the
  service runs on `canvaslide.pages.dev`. Until then, one client can use up the daily quotas for
  everyone.

### If the service is unavailable or stops

Only creating and opening share links depend on the share API. Editing, saving, crash recovery,
presenting and HTML or PDF export keep working without it in the desktop app and in a web editor tab
that is already open, and the Share dialog offers a `.canvaslide`, HTML or PDF file instead of a link.
The web editor itself is served by the same Cloudflare Pages project, so an outage of that project
also keeps it from loading.

If the maintainers stop the service, they announce it in the release notes and in this guide, and
stop both ways the app reaches it:

- **Web editor:** it is published without `VITE_CLOUD_SHARE_URL` and calls the share API on its own
  origin, so that variable does not affect it. They remove the production `SHARED_DOCUMENTS` namespace
  from [`wrangler.toml`](../wrangler.toml) and publish; the API then answers 503, and both the web
  editor and installed desktop releases report that sharing is unavailable.
- **Desktop releases:** they remove the `VITE_CLOUD_SHARE_URL` repository variable, so releases built
  afterwards have no share service configured. Installed releases keep the origin they were built
  with, and report sharing as unavailable, or as unreachable once nothing answers there.

Links stop opening; since every snapshot expires within 24 hours anyway, no long-term content is lost.
Send files instead, or [host your own copy](#hosting-and-desktop-builds).

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

- Whenever CI finishes on `main`, it checks the latest CI attempt for the workflow revision
  (`github.workflow_sha`), builds that exact commit with `pnpm build:web`, and publishes it to
  Cloudflare Pages production. Missing, pending or unsuccessful CI leaves the current deployment
  unchanged; the next completed CI run tries again. It never combines a newer workflow with an
  older passing checkout. **Web editor → Run workflow** on `main` retries using current `main`;
  re-running an old run retains its original revision.
- The publishing job runs in the `web-editor` GitHub environment and needs its `CLOUDFLARE_API_TOKEN`
  secret, an API token with the account's **Cloudflare Pages: Edit** permission, and its
  `CLOUDFLARE_ACCOUNT_ID` variable. Without both it publishes nothing and ends with a warning; with
  only one of them it fails. Only the step that runs Wrangler receives the token, after dependencies
  are installed without install scripts.
- Pull request previews are still built by Cloudflare's Git integration, whose automatic production
  deployments are turned off; publishing previews from a workflow would hand the token to pull request
  runs. Previews run unreviewed branches, so `wrangler.toml` gives them no KV namespace and sharing
  there reports that it is unavailable. Each preview builds with its own branch's `wrangler.toml`, so
  a branch that edits the file can bind the production namespace to its preview: this keeps previews
  away from production snapshots by default, not against someone who can push a branch. The Git
  integration builds no previews for pull requests from forks, so only people with write access to
  the repository can create such a branch. Before giving write access to anyone who should not reach
  production snapshots, set **Preview branch** to **None** under the Pages project's Settings →
  Builds → Branch control; any Pages project in the account can bind the namespace, so a separate
  project does not help.

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
[GitHub's private report form](https://github.com/hwantage/CanvaSlide/security/advisories/new),
which requires a GitHub account.
Include the share ID (the `share` value in the link) and the reason; do not post the link publicly.
Ask the same way to delete a snapshot before it expires for any other reason, such as a link shared by
mistake.

A maintainer with access to the Cloudflare account deletes the snapshot with Wrangler:

```bash
pnpm exec wrangler login
# <namespace-id>: the SHARED_DOCUMENTS id under [[env.production.kv_namespaces]] in wrangler.toml
pnpm exec wrangler kv key get "share:<share-id>" --namespace-id <namespace-id> --remote   # confirm
pnpm exec wrangler kv key delete "share:<share-id>" --namespace-id <namespace-id> --remote
```

Preview deployments have no namespace, so sharing there creates no links and opens none; every
snapshot to delete is in the production namespace.
Other regions can keep serving the snapshot for a minute or more after deletion because of KV
propagation, and a recipient who already opened the link keeps the copy loaded in their tab.
