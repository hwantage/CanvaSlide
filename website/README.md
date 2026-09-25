# CanvaSlide official website

The product website and user guide live here, alongside the desktop app. See the [documentation map](../docs/README.md) for repository guides. The site uses the repository's existing React, Vite, TypeScript, pnpm, and Playwright dependencies. No additional package installation is required beyond the root `pnpm install`.

```bash
pnpm dev:site      # http://127.0.0.1:1421/
pnpm build:site    # website/dist; GitHub Pages base /CanvaSlide/
pnpm preview:site  # http://127.0.0.1:1422/CanvaSlide/
pnpm test:site     # builds and tests the production output
```

The home page is `/`, ShowCase is `/showcase/`, and documentation is `/docs/`. Documentation topics use `?guide=installation`, `?guide=quick-start`, and the other IDs in `src/docs-topics.ts`. All three are real HTML entry points, so direct links and reloads work on GitHub Pages without a SPA rewrite or a custom 404 redirect.

## Content and preferences

- English is the first-visit default, regardless of browser language. `?lang=ko` and `?lang=en` explicitly select a language. Language and theme choices persist on the current device, independently of desktop app settings.
- The initial theme follows the operating system. `public/appearance.js` applies preferences before the page renders; storage failures are nonfatal.
- Visible copy uses the shared typed `t()` dictionary in `src/renderer/src/i18n/locales/{en,ko}.ts`, under `site.*`. Add English keys first and provide Korean equivalents.
- Documentation covers installation, first steps, examples, navigation, editing, connectors, Figma/PDF/image imports, linked video, AI-assisted authoring, frame camera direction and batch editing, saving, cloud snapshots, HTML export, shortcuts, and common questions.
- The AI guide includes the editor’s shared introduction prompt, General/Dynamic style selection, an optional HTML request, and prompt copying. It also explains how to adapt the brief, choose output files, and open the result. Prompt text and the authoring skill URL come from `src/renderer/src/lib/ai-prompt.ts` so the website and editor stay aligned.
- Download links open the [official Releases page](https://github.com/hwantage/CanvaSlide/releases). Installer availability comes from published releases; source-build instructions describe the checkout. Keep availability wording and download links aligned when maintaining installation copy.
- Screenshots show the actual editor and presentation view. Verify feature copy against the current code, tests and [maintained guides](../docs/README.md); historical plans and implementation reports are not a source for current behavior. Platform prerequisites link to the official Tauri guide.

For navigation and drawing keys, check [`keyboard-shortcuts.ts`](../src/renderer/src/lib/keyboard-shortcuts.ts) and the app’s shortcut help. Keep English and Korean guide copy aligned. Record test results in the PR, not as a dated status section here.

## Brand and motion

The approved Round 07 logo artwork is copied into `public/brand/` from `discuss/round-07/`. The hero uses the original transparent Ray Master illustration from `discuss/round-02/ray/ray-master.png`, as requested. These copies are necessary because `discuss/` is ignored by Git. Wordmark geometry, the small blue S, and Wing Smile are preserved. `public/og.png` is the existing Round 07 social banner. The light wordmark PNG includes a white matte. Its matching dark asset supplies an alpha mask that removes the rectangle while retaining the approved wordmark geometry, colors, and circular symbol plate. The dark wordmark and compact icons already have transparent outer pixels. Shared palette tokens live in `src/renderer/src/assets/brand.css`.

The header and footer GitHub links use the official black and white Invertocat SVGs from the [GitHub brand toolkit](https://brand.github.com/foundations/logo), downloaded from its [official logo archive](https://brand.github.com/GitHub_Logos.zip). The artwork is unmodified; the black or white file is selected for the current theme.

The canvas demonstration uses the same tested zoom/pan interpolation as the product. Playback starts only on request. The desktop story section advances frames with scroll and also has manual controls; focused controls take priority over scroll-driven changes. Small screens use a compact, manually navigable story without a long sticky section. Reduced-motion preferences disable animated camera transitions, autoplay, and entrance effects. Arrow keys and Escape work inside the focused demonstration.

The hero links to ShowCase and the web editor, followed by a featured editable example, current workflows, single-file sharing, and an interactive close-up of one slide. Installation remains available in the download section and documentation. The close-up uses an actual rendered slide image and the product's camera interpolation to illustrate whole-slide and detail frames. Its chart values are sample presentation content, not product metrics. The frame guide explains how to create these views in the app.

The presentation overview shows all six example slides together. Visitors can select any frame, continue through the sequence, and return to the full canvas. Its clickable regions are captured from the actual HTML player's frame positions into `src/slide-preview-frames.json`; regenerating examples refreshes both the screenshot and these regions. The frame guide also explains overview navigation in the app and exported presentation.

### Ray's scroll journey

The hero's original Ray illustration follows a continuous, reversible zigzag path behind the page content, then settles in the center of the footer's final illustration area. Each broad sweep spans two sections: examples and sharing, detail and overview, then story and features. The download section leads into the final central landing. Position, scale, opacity, and banking ease toward the current destination, so fast scrolling stays gentle and page jumps do not replay every turn. Waypoints follow the real section positions, with fresh measurements after resizing, font loading, or translated content changes. Its scale and opacity recede through the main content and return at the end. The decorative layer cannot intercept clicks or add horizontal overflow.

`ray-surface.ts` renders the supplied PNG on a small WebGL mesh. Only the wings and tail deform; the face remains anchored. Texture upload and canvas compositing both use premultiplied alpha, keeping hidden RGB in transparent PNG pixels out of texture filtering and avoiding a separate straight-alpha conversion at display time. If WebKit rejects a direct image upload, `ray-texture.ts` retries through a temporary 2D canvas. Failed uploads select the original image instead of displaying an incomplete black texture. Texture draws are capped at 30 per second while scroll positioning follows animation frames. The original image remains a fallback when WebGL is unavailable or its context is lost. GPU resources and event listeners are released when the component stops.

The bottom-right pause control stops automatic wing motion and remembers the choice; the scroll path still responds to the visitor. Hidden tabs stop scheduling frames. The operating system's reduced-motion preference disables the traveling layer and keeps static illustrations in the hero and footer, including when that preference changes while the page is open. The documentation pages have no traveling mascot.

On CI, the Playwright test browser uses Chromium's [SwiftShader graphics driver](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md) to exercise wing rendering without a physical GPU.

## Editable ShowCase catalog

ShowCase opens editable examples in a new browser tab via `?example=<id>`. The default editor is
`https://canvaslide.pages.dev/`; the separately deployed website stays on GitHub Pages.
To target another editor (including a subpath), set
`VITE_WEB_APP_URL=https://your-editor.example/app/` when building the website. This is a build-time
setting; it does not change the app's cloud-share service configuration.

[`src/shared/example-catalog.ts`](../src/shared/example-catalog.ts) is the shared allowlist.
[`config/example-assets.ts`](../config/example-assets.ts) serves those files in development and emits
`examples/catalog.json` plus `examples/<id>.canvaslide` into **both** `dist` and `website/dist` at build
time. Files come from `examples/`, not a remote service. Website downloads use the
website base path; editor fetches use the editor base path on the same origin, so no cross-origin
example fetch or new CORS policy is needed. Native builds omit these web-only assets.

The website keeps its closing cards in `website/src/showcase.tsx` in the order Swing, Anatomy, Freefall, Inside, CanvaSlide · Claude, CanvaSlide · Codex, without changing the shared catalog order or IDs. The last two are Korean introductions created from AI prompts. All other cards retain their catalog order after the featured example.

To add an example:

1. Save a current, validated `.canvaslide` file under `examples/`. Keep each emitted file at or below the
   [Cloudflare Pages 25 MiB limit](https://developers.cloudflare.com/pages/platform/limits/#file-size);
   the build rejects larger assets. Verify image quality, animation, and camera-motion previews after
   optimizing images. Sources and deployed assets are the same bytes.
2. Add a stable kebab-case ID and its source path to `exampleCatalog`. Keep published IDs stable.
3. Add `site.showcase.<id>.title`, `.body`, and `.alt` in both app locale dictionaries.
4. Run `pnpm build:player && node website/scripts/prepare-showcase.ts` to capture real presentation
   thumbnails. Commit the product preview `public/examples/<id>-showcase.png`; temporary HTML stays
   under ignored `discuss/`. The catalog automatically supplies cards, editor links, and downloads.
5. Run `pnpm check`, `pnpm test:e2e`, `pnpm test:site`, and `pnpm build:web`. Run the two browser suites
   sequentially because the app suite clears the parent test-results directory.

Examples open as local editable copies. Save downloads a `.canvaslide`; edits never modify the server
source. Refreshing a URL that still has `example` reloads the original. New/Open and cancellation
remove that parameter. Unknown/duplicate IDs, missing files, invalid documents, cancellation, timeouts,
and concurrent edits are handled without replacing current work. Verify the hosted editor accepts
current files before publishing new gallery links;
the website and editor are separate deployments, so the editor's example-loading build and assets
must be available first. A `share` parameter takes priority
if both are supplied. No-query startup and Tauri launch handling stay unchanged. Restoring a
crash-recovery copy cancels a pending example load and removes the parameter; session and edit guards
also reject a replacement during a pending load.

## Standalone example presentations

The home page offers standalone HTML exports of the repository's order flowchart, shop ER diagram, and Northwind launch deck. Each example can be opened in a new tab or downloaded. The files embed their canvas data and player and can be opened from disk without a network connection. Example content and the standalone player are English; surrounding website copy supports English and Korean. “PPT-style” describes slide layouts, not PPT/PPTX import or export.

The HTML is not committed. [`example-exports.ts`](./example-exports.ts) builds `examples/<id>.html` from the `.canvaslide` source in the shared catalog and the current player, the way the browser editor exports it at original image quality: the document is parsed, its attached connector ends are re-resolved with `syncConnectorGeometry`, and no fonts are embedded. It serves the files in development and emits them in the build; `pnpm dev:site` and `pnpm build:site` rebuild the player first. The IDs are listed in [`src/exported-examples.ts`](./src/exported-examples.ts). The website tests compare each served file, from the build and from the dev server, with a fresh export.

The preview images in `public/examples/` (`flowchart.png`, `erd.png`, `slides.png`, `slide-detail.png`) and the overview's clickable regions in `src/slide-preview-frames.json` are committed. Refresh them when the player or those examples change:

```bash
pnpm build:player
node website/scripts/prepare-examples.ts
```

The preparation script uses Playwright Chromium to capture the same exports, including a full-resolution crop of the results slide for the detail demonstration. It waits for camera motion to settle before capturing and records only whole slides, not detail frames nested inside them, as overview regions.

The editor and slideshow screenshots in `public/images/` (`editor.png`, `present.png`) come from the web editor with the Northwind launch deck open. Refresh them when the editor or presentation UI changes:

```bash
pnpm build:player
node website/scripts/prepare-screenshots.ts
```

## GitHub Pages

1. On `hwantage/CanvaSlide`, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Merge into `main`. The site imports app modules, locales, and examples, so every change can affect it: the **CI** workflow builds and tests it on every pull request and every push to `main`, and its `CI passed` check includes that job.
3. Each time CI finishes on `main`, the **Website** workflow builds the newest commit of `main` whose CI passed and publishes only `website/dist` to `https://hwantage.github.io/CanvaSlide/`. A commit whose CI failed is never published; the site keeps the newest passing commit until a later one passes. Running **Website** manually on `main` publishes the newest passing commit again. To retry a failed publication, run it manually instead of re-running the failed job, which would publish the commit that older run chose.

The app build and website output are separate. The Pages workflow does not build a desktop installer. The site uses static files and requires no backend, secrets, or paid hosting services.

For a custom domain, set `WEBSITE_BASE_PATH=/` for both building and previewing, update the canonical/social URLs in all three HTML entry points, and configure the domain and DNS in GitHub Pages settings. The test configuration currently validates the default `/CanvaSlide/` deployment path.

## Validation

The browser tests exercise English-first behavior, persisted preferences, explicit language links, camera controls and playback, scroll progression, keyboard-operated example tabs, all three live exports, downloaded HTML playback with the network offline, same-slide detail zoom, full-canvas slide selection and return, the mascot's zigzag route and footer landing, pausing and resuming wing motion, graphics fallback, live reduced-motion changes, documentation links and search, installer tabs, command copying, every topic in both languages, narrow screens, and blocked browser storage. Build artifacts and test outputs are ignored by Git.
