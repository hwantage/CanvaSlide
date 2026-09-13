# CanvaSlide official website

The product website and documentation live here, alongside the desktop app. The site uses the repository's existing React, Vite, TypeScript, pnpm, and Playwright dependencies. No additional package installation is required beyond the root `pnpm install`.

```bash
pnpm dev:site      # http://127.0.0.1:1421/
pnpm build:site    # website/dist; GitHub Pages base /CanvaSlide/
pnpm preview:site  # http://127.0.0.1:1422/CanvaSlide/
pnpm test:site     # builds and tests the production output
```

The home page is `/`; documentation is `/docs/`. Documentation topics use `?guide=installation`, `?guide=quick-start`, and the other IDs in `src/docs-topics.ts`. Both are real HTML entry points, so direct links and reloads work on GitHub Pages without a SPA rewrite or a custom 404 redirect.

## Content and preferences

- English is the first-visit default, regardless of browser language. `?lang=ko` and `?lang=en` explicitly select a language. Language and theme choices persist on the current device, independently of desktop app settings.
- The initial theme follows the operating system. `public/appearance.js` applies preferences before the page renders; storage failures are nonfatal.
- Visible copy uses the shared typed `t()` dictionary in `src/renderer/src/i18n/locales/{en,ko}.ts`, under `site.*`. Add English keys first and provide Korean equivalents.
- Documentation covers installation, a first presentation, navigation, editing, connectors, frames, presentation timing, saving, HTML export, shortcuts, and common questions.
- The first public installer release did not exist when this site was created. Download links deliberately open the official Releases page, and installation documents offer source-build instructions. When installers are published, update the availability copy and download links together.
- Screenshots show the actual editor and presentation view. Feature copy is based on the repository README, PRD, report, and implemented shortcuts. Platform prerequisites link to the official Tauri guide.

## Brand and motion

The approved Round 07 logo artwork is copied into `public/brand/` from `discuss/round-07/`. The hero uses the original transparent Ray Master illustration from `discuss/round-02/ray/ray-master.png`, as requested. These copies are necessary because `discuss/` is ignored by Git. Wordmark geometry, the small blue S, and Wing Smile are preserved. `public/og.png` is the existing Round 07 social banner. Shared palette tokens live in `src/renderer/src/assets/brand.css`.

The GitHub navigation link uses the official black and white Invertocat SVGs from the [GitHub brand toolkit](https://brand.github.com/foundations/logo), downloaded from its [official logo archive](https://brand.github.com/GitHub_Logos.zip). The artwork is unmodified; the black or white file is selected for the current theme.

The canvas demonstration uses the same tested zoom/pan interpolation as the product. Playback starts only on request. The desktop story section advances frames with scroll and also has manual controls; focused controls take priority over scroll-driven changes. Small screens use a compact, manually navigable story without a long sticky section. Reduced-motion preferences disable animated camera transitions, autoplay, and entrance effects. Arrow keys and Escape work inside the focused demonstration.

The hero leads into examples, single-file sharing, and an interactive close-up of one slide. Installation remains available in the header, download section, and documentation. The close-up uses an actual rendered slide image and the product's camera interpolation to illustrate whole-slide and detail frames. Its chart values are sample presentation content, not product metrics. The frame guide explains how to create these views in the app.

The presentation overview shows all six example slides together. Visitors can select any frame, continue through the sequence, and return to the full canvas. Its clickable regions are captured from the actual HTML player's frame positions into `src/slide-preview-frames.json`; regenerating examples refreshes both the screenshot and these regions. The frame guide also explains overview navigation in the app and exported presentation.

### Ray's scroll journey

The hero's original Ray illustration follows a continuous, reversible zigzag path behind the page content, then settles in the center of the footer's final illustration area. Each broad sweep spans two sections: examples and sharing, detail and overview, then story and features. The download section leads into the final central landing. Position, scale, opacity, and banking ease toward the current destination, so fast scrolling stays gentle and page jumps do not replay every turn. Waypoints follow the real section positions, with fresh measurements after resizing, font loading, or translated content changes. Its scale and opacity recede through the main content and return at the end. The decorative layer cannot intercept clicks or add horizontal overflow.

`ray-surface.ts` renders the supplied PNG on a small WebGL mesh. Only the wings and tail deform; the face remains anchored. Texture upload and canvas compositing both use premultiplied alpha, keeping hidden RGB in transparent PNG pixels out of texture filtering and avoiding a separate straight-alpha conversion at display time. If WebKit rejects a direct image upload, `ray-texture.ts` retries through a temporary 2D canvas. Failed uploads select the original image instead of displaying an incomplete black texture. Texture draws are capped at 30 per second while scroll positioning follows animation frames. The original image remains a fallback when WebGL is unavailable or its context is lost. GPU resources and event listeners are released when the component stops.

The bottom-right pause control stops automatic wing motion and remembers the choice; the scroll path still responds to the visitor. Hidden tabs stop scheduling frames. The operating system's reduced-motion preference disables the traveling layer and keeps static illustrations in the hero and footer, including when that preference changes while the page is open. The documentation pages have no traveling mascot.

On CI, the Playwright test browser uses Chromium's [SwiftShader graphics driver](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md) to exercise wing rendering without a physical GPU.

## Example presentations

`public/examples/` contains real standalone HTML exports and screenshots of the repository's order flowchart, shop ER diagram, and Northwind launch deck. Each example can be opened in a new tab or downloaded. The files embed their canvas data and player and can be opened from disk without a network connection. Example content and the standalone player are English; surrounding website copy supports English and Korean. “PPT-style” describes slide layouts, not PPT/PPTX import or export.

To regenerate these static assets with the current player and example documents:

```bash
pnpm build:player
node website/scripts/prepare-examples.ts
```

The preparation script uses Playwright Chromium to capture the actual exported presentations, including a full-resolution crop of the results slide for the detail demonstration. It waits for camera motion to settle before capturing. Generated HTML is excluded from formatting. The site build uses the committed snapshots and does not require a player or example regeneration.

## GitHub Pages

1. On `hwantage/CanvaSlide`, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Merge the website changes into `main`, or run the **Website** workflow manually after the changes are present there.
3. The workflow builds, checks, and tests the site, then publishes only `website/dist` to `https://hwantage.github.io/CanvaSlide/`. Pull requests run validation without publishing.

The app build and website output are separate. The Pages workflow does not build a desktop installer. The site uses static files and requires no backend, secrets, or paid hosting services.

For a custom domain, set `WEBSITE_BASE_PATH=/` for both building and previewing, update the canonical/social URLs in both HTML entry points, and configure the domain and DNS in GitHub Pages settings. The test configuration currently validates the default `/CanvaSlide/` deployment path.

## Validation

The browser tests exercise English-first behavior, persisted preferences, explicit language links, camera controls and playback, scroll progression, keyboard-operated example tabs, all three live exports, downloaded HTML playback with the network offline, same-slide detail zoom, full-canvas slide selection and return, the mascot's zigzag route and footer landing, pausing and resuming wing motion, graphics fallback, live reduced-motion changes, documentation links and search, installer tabs, command copying, every topic in both languages, narrow screens, and blocked browser storage. Build artifacts and test outputs are ignored by Git.
