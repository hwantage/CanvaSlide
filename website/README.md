# CanvaSlide official website

The product website and user guide live here, alongside the desktop app. See the [documentation map](../docs/README.md) for repository guides. The site uses the repository's existing React, Vite, TypeScript, pnpm, and Playwright dependencies. No additional package installation is required beyond the root `pnpm install`.

```bash
pnpm dev:site      # http://127.0.0.1:1421/
pnpm build:site    # website/dist; GitHub Pages base /CanvaSlide/
pnpm preview:site  # http://127.0.0.1:1422/CanvaSlide/
pnpm test:site     # builds and tests the production output
```

## Static pages and search discovery

The English home page is `/`, ShowCase is `/showcase/`, and the guide overview is `/docs/`.
Guide topics use paths such as `/docs/installation/` and `/docs/ai/`. Korean equivalents add
`/ko/`, for example `/ko/docs/ai/`. These paths are relative to the production `/CanvaSlide/` base.
[`site-routes.ts`](./src/site-routes.ts) owns the route list; each route gets a real `index.html`,
so direct navigation and reload work on GitHub Pages without a SPA rewrite or custom 404 redirect.

[`static-pages.ts`](./static-pages.ts) prerenders the same React components used by the browser,
using the client build's asset links. It renders pages sequentially with a fresh preference store
for each route. Initial HTML includes the home content and FAQ answers, ShowCase cards, guide text,
links, localized metadata, reciprocal `en`/`ko`/`x-default` alternates and JSON-LD.
[`entry-server.tsx`](./src/entry-server.tsx) also generates `sitemap.xml` from the same routes.
No guessed modification dates, ratings or reviews are emitted. The browser hydrates this HTML;
OS-specific shortcut labels, theme-dependent artwork and mascot motion enhance it afterward.
Development uses the same routes and components with client rendering.

Old `?guide=installation` and `?lang=ko` links remain usable: JavaScript navigates to the equivalent
path with `location.replace`, keeping anchors and unrelated query parameters. A valid legacy language
parameter overrides the path for that migration; invalid values fall back to the requested page.
This is a client redirect, not a server 301. Without JavaScript, old query URLs display the underlying
path's static page, whose navigation links reach all languages and guide topics. Canonical metadata
always describes that static path and is never rewritten to another URL during hydration.

Submit `https://hwantage.github.io/CanvaSlide/sitemap.xml` through the owner's Search Console and
Bing Webmaster Tools properties after publication. The origin-root `https://hwantage.github.io/robots.txt`
is controlled by the root site, outside this project; a project-level `/CanvaSlide/robots.txt` would
not control crawling. Hosting remains GitHub Pages. No tracking scripts or special AI crawler files
are required by this implementation. Search coverage, rankings and AI citations must be measured
separately; static HTML and structured data do not guarantee them. See Google's
[JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
and [AI search guidance](https://developers.google.com/search/docs/appearance/ai-features).

### Search intent and page ownership

Keep each guide focused on the workflow it actually supports. Page headings and metadata use the
same localized copy; guide navigation retains shorter labels. The home page introduces the product,
while linked guides answer specific tasks:

| Page (and `/ko/` equivalent) | Search intent                                          | Visible evidence                                                             |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `/`                          | Free presentation software; 무료 프레젠테이션 프로그램 | Product introduction, working zoom demo, open-source and offline FAQ         |
| `/docs/frames/`              | Zooming presentations; 무한 캔버스·줌 프레젠테이션     | Nested-frame setup, camera controls and overview navigation                  |
| `/docs/sharing/`             | HTML presentation; 오프라인 발표                       | Export steps, browser playback, editable originals and media/font conditions |
| `/docs/installation/`        | Presentation software for Mac and Windows              | Actual installers, requirements and browser alternative                      |
| `/docs/media/`               | Figma presentation; 피그마 파일 가져오기               | Local `.fig` conversion, editable content and conversion limits              |
| `/docs/ai/`                  | AI-assisted presentation workflow                      | External-assistant prompt, editable output and review steps                  |

Use measured demand, search-result competition and feature fit together when revising this mapping.
Keep dated research, provider exports, country/device settings and uncertainty in PR evidence under
ignored `discuss/`, rather than publishing search-volume claims in product copy. Advertising
competition is not organic ranking difficulty; provider difficulty scores are estimates. Reject
malformed or unsupported-language results instead of treating them as zero demand. Do not target
PPT/PPTX conversion or a built-in AI generator: these are not supported workflows.

After publication and sitemap submission, compare Search Console queries and landing pages by
country/language over consistent 28-day periods. Record impressions, clicks, CTR and average position;
review index coverage before interpreting missing traffic as missing demand. Use owner-authorized
Google Keyword Planner or Naver keyword-tool exports to validate market-specific demand. Do not add
hidden keyword lists, keyword-density targets, or thin pages for spelling variants.

## Content and preferences

- The URL selects the language: English paths always show English and `/ko/` paths always show Korean, regardless of browser language or a previously saved language preference. Language controls are links to the equivalent page; navigating them starts fresh page interactions. Theme choices persist on the device, independently of desktop app settings.
- The initial theme follows the operating system. `public/appearance.js` applies preferences before the page renders; storage failures are nonfatal.
- Visible copy uses `t()` from `src/i18n/site-strings.ts`, with its `site.*` keys in `src/i18n/locales/{en,ko}.ts`, separate from the app's tables. Add English keys first; the type then requires the Korean equivalents. The translator itself is shared with the app ([`translator.ts`](../src/renderer/src/i18n/translator.ts)), and the site's language never changes the app's. The AI guide's controls and prompt are the editor's own strings, shown in the site's language.
- Documentation covers installation, first steps, examples, navigation, editing, connectors, Figma/PDF/image imports, linked video, AI-assisted authoring, frame camera direction and batch editing, saving, cloud snapshots, HTML export, shortcuts, and common questions, including what the app sends over the network.
- The AI guide includes the editor’s shared introduction prompt, General/Dynamic style selection, an optional HTML request, and prompt copying. It also explains how to adapt the brief, choose output files, and open the result. Prompt text and the authoring skill URL come from `src/renderer/src/lib/ai-prompt.ts` so the website and editor stay aligned.
- Download links open the [official Releases page](https://github.com/hwantage/CanvaSlide/releases). Installer availability comes from published releases; source-build instructions describe the checkout. Keep availability wording and download links aligned when maintaining installation copy.
- Screenshots show the actual editor and presentation view. Verify feature copy against the current code, tests and [maintained guides](../docs/README.md); historical plans and implementation reports are not a source for current behavior. Platform prerequisites link to the official Tauri guide.

For navigation and drawing keys, check [`keyboard-shortcuts.ts`](../src/renderer/src/lib/interaction/keyboard-shortcuts.ts) and the app’s shortcut help. Keep English and Korean guide copy aligned. Record test results in the PR, not as a dated status section here.

## Brand and motion

Use the committed logo and Ray artwork in [`public/brand/`](./public/brand/) and the social banner
[`public/og.png`](./public/og.png). Preserve the wordmark geometry, colors, and Wing Smile. Shared palette
tokens live in [`brand.css`](../src/renderer/src/assets/brand.css).

The header and footer GitHub links use the official black and white Invertocat SVGs from the [GitHub brand toolkit](https://brand.github.com/foundations/logo), downloaded from its [official logo archive](https://brand.github.com/GitHub_Logos.zip). The artwork is unmodified; the black or white file is selected for the current theme.

Product demonstrations use real example exports and the app's zoom/pan interpolation. Keep manual
and keyboard controls usable, honor reduced-motion preferences, and refresh screenshots and overview
regions with the [preparation scripts below](#standalone-example-presentations).
The home story moves from the Northwind deck overview into its Pilot results frame and then the
nested 91% frame. Both images stay on one camera surface throughout the transition; the high-resolution
results crop keeps the close-up legible. The app's shared zoom/pan interpolator drives the movement,
without changing app presentation policy. Scroll, buttons and arrow keys select views; Escape returns
to the overview, and reduced motion changes views immediately. The home FAQ uses native disclosures
with all answers in the initial HTML and links to the relevant guide topics.

### Ray's scroll journey

Ray follows the page from hero to footer. The pause control stops wing motion; reduced motion keeps
static illustrations instead. Preserve the image fallback when WebGL is unavailable and keep the
decoration from intercepting input or causing overflow.

For the current implementation, start with [`ray-journey.tsx`](./src/ray-journey.tsx),
[`use-ray-flight.ts`](./src/use-ray-flight.ts), and [`ray-surface.ts`](./src/ray-surface.ts).
[`ray-journey.spec.ts`](./tests/ray-journey.spec.ts) and
[`ray-transparency.spec.ts`](./tests/ray-transparency.spec.ts) cover motion, preferences, and rendering
fallbacks; check [`playwright.config.ts`](./playwright.config.ts) for browser and graphics settings.

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

1. Save a current, validated `.canvaslide` file under `examples/`. Keep it within the 8 MiB sample
   budget in [`examples/README.md`](../examples/README.md#editing-a-sample), far below the
   [Cloudflare Pages 25 MiB limit](https://developers.cloudflare.com/pages/platform/limits/#file-size)
   that the build enforces. Verify image quality, animation, and camera-motion previews after
   optimizing images. Sources and deployed assets are the same bytes.
2. Add a stable kebab-case ID and its source path to `exampleCatalog`. Keep published IDs stable.
3. Add `site.showcase.<id>.title`, `.body`, and `.alt` in both website locale tables.
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

The preview images in `public/examples/` (`flowchart.png`, `erd.png`, `slides.png`, `slide-detail.png`, `architecture.png`) and frame coordinates in `src/architecture-preview-frames.json` and `src/slide-story-frames.json` are committed. Refresh them when the player or those examples change:

```bash
pnpm build:player
node website/scripts/prepare-examples.ts
```

The preparation script uses Playwright Chromium to capture the same exports. It renders the results slide from the original DOM at 6× pixel density for the nested detail demonstration, preserving sharp text on high-density displays without upscaling an existing image. It waits for camera motion to settle before capturing. The overview demonstration uses a separate shop architecture example, captured at 4× density, with selectable edge, services and data regions; story regions record the results frame and its nested detail from the same overview coordinates. The nested-demo browser spec checks that the results image has enough source pixels at the deepest zoom on a 2× display.

The product-features preview uses `inside-8-13.webp`, an animated capture of the Inside example's
frames 8 through 13, plus `inside-preview.webp` as its static fallback. It loads the animation
only while visible, stops when the tab is hidden, and offers stop/replay controls. Reduced-motion
and JavaScript-disabled visitors see the static preview and a working example link.

Regenerate it with Playwright Chromium and the `cwebp`/`img2webp` tools from libwebp installed locally
(the site build and CI use the committed files and do not need these tools):

```bash
pnpm build:player
node website/scripts/prepare-inside-preview.ts
```

The script captures the original exported player's camera at 960×540, approximately 15 fps, with
a short hold on each frame and a longer hold at the end of the loop. Encoded durations play the
sequence at 1.5× speed (about 9.6 seconds per loop). Playwright's controlled clock
keeps camera timing independent of screenshot speed. Only presentation controls are hidden; the
canvas content, frame sequence and shared interpolation remain unchanged.

The editor and slideshow screenshots in `public/images/` (`editor.png`, `present.png`) come from the web editor with the Northwind launch deck open. Refresh them when the editor or presentation UI changes:

```bash
pnpm build:player
node website/scripts/prepare-screenshots.ts
```

## GitHub Pages

1. On `hwantage/CanvaSlide`, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Merge into `main` following the [main and tag rules](../docs/RELEASE.md#branch-and-tag-rules). See [CI maintenance](../docs/RELEASE.md#ci와-툴체인-유지보수) for the website build and test gate.
3. Each time CI finishes on `main`, the **Website** workflow checks the latest CI attempt for its own workflow revision (`github.workflow_sha`). It builds and publishes only that same commit to `https://hwantage.github.io/CanvaSlide/`. If CI is missing, pending or unsuccessful, it keeps the current deployment; an older passing commit is never mixed with newer workflow instructions. The next completed CI run tries again. To retry a failed publication against current `main`, run **Website → Run workflow** on `main`; re-running an old run retains its original revision.

The app build and website output are separate. The Pages workflow does not build a desktop installer. The site uses static files and requires no backend, secrets, or paid hosting services.

The test configuration validates the current `/CanvaSlide/` deployment path. `WEBSITE_BASE_PATH` controls local/build asset paths; public canonical URLs are owned by `siteOrigin` in `src/site-routes.ts`. Changing asset paths alone does not migrate the public site.

## Validation

Run `pnpm test:site` for the production website. The current scenarios live in [`tests/`](./tests/),
with browser and server settings in [`playwright.config.ts`](./playwright.config.ts). Record commands,
results, and platforms in the PR. Build artifacts and test outputs are ignored by Git.
