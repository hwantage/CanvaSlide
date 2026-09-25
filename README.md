![CanvaSlide official logo](./website/public/brand/canvaslide-readme.png)

# CanvaSlide

**English** | [한국어](./README.ko.md)

An infinite-canvas presentation app for macOS and Windows. Arrange text, shapes and media on one
board, place **presentation frames** around the views you want to show, then press **Slide Show**
to move between them with continuous zoom/pan. Built with **Tauri 2 + React 19 + TypeScript**;
the editor also runs in a browser.

![CanvaSlide — zoom from the big picture into connected details](./website/public/images/canvaslide-showcase.webp)

[ShowCase](https://hwantage.github.io/CanvaSlide/showcase/) ·
[Try the web editor](https://canvaslide.pages.dev/) ·
[Download releases](https://github.com/hwantage/CanvaSlide/releases) ·
[User guide](https://hwantage.github.io/CanvaSlide/docs/) ·
[Documentation map](./docs/README.md)

## Why CanvaSlide?

- **Present the big picture and the detail.** Arrange frames on one canvas and guide attention with
  continuous zoom/pan and per-frame camera motion.
- **Share one file.** Export a presentation as HTML with a built-in player, or as a PDF with one page
  per frame.
- **Start with an AI prompt.** Choose General or Dynamic, then ask your assistant to create an editable
  presentation, optionally with HTML output.
- **Send a cloud snapshot.** Share an editable copy or a slideshow viewer with a link that lasts 24 hours.

## Features

- **Editing:** text, shapes, images and connectors; pan/zoom, multi-select, grouping, rotation, alignment,
  distribution, snapping, clipboard operations and undo/redo. Choose light/dark/system theme and English/Korean.
- **Presenting:** order and preview frames, move them with their contents, and edit transitions together.
  Set duration, easing, arc, roll and spotlight; navigate through the overview and play linked videos.
  The app, cloud slideshow and newly exported HTML share auto-hiding controls, a laser pointer and
  temporary ink that is never saved: press P, drag to draw, and E to erase.
- **Import & export:** import images, PDF pages and [local Figma files](./docs/FIGMA-IMPORT.md);
  open/save editable JSON `.canvaslide` files. Export HTML with image quality controls and a size estimate,
  or PDF with one page per frame at a chosen page resolution; desktop HTML export can embed installed fonts.
- **Recovery:** unsaved work is copied locally in the background and offered back after a crash or an
  interrupted session; [crash recovery](./docs/CRASH-RECOVERY.md) explains what it keeps.
- **Sharing:** use a configured cloud service for editable copies or slideshow-only snapshots,
  or send an exported HTML file.

## Get started

1. Create content with the text or shape tools, paste an image, or import a file.
2. Draw frames with **F** and arrange their sequence in the frame list.
3. Start **Slide Show** with ⌘Enter / Ctrl+Enter, or F5. Use → and ← to navigate, **O** for overview,
   and **Esc** to return to the editor.
4. Save an editable `.canvaslide` with ⌘S / Ctrl+S, or export HTML or PDF with ⌘E / Ctrl+E.

Ready-made flowcharts, diagrams and presentations are in [examples](./examples/README.md).
Open one and start Slide Show to explore it.
For the full shortcut list, press **K** in the editor or visit the [shortcut guide](https://hwantage.github.io/CanvaSlide/docs/?guide=shortcuts).

## AI-assisted authoring

Open **Create with AI**, choose **General** or **Dynamic**, and copy the prompt into your AI assistant.
Enable **Generate an HTML file** when you want HTML alongside the editable document. The app prepares
and copies the prompt; generation happens in the assistant you choose. The optional portable
[CanvaSlide skill](./skills/README.md) and [authoring guide](./examples/README.md#authoring-with-ai)
cover the file schema, scene counts, nested frames and export validation.

## Files and sharing

Save an editable `.canvaslide` using the [current JSON format](./docs/ARCHITECTURE.md#document-formats), or export HTML with its own player.
Press **Copy link** to upload a cloud snapshot and share it for 24 hours.
See [cloud sharing](./docs/CLOUD-SHARE.md) for access options, limits and hosting setup.

## Network and privacy

CanvaSlide has no account, analytics, telemetry or crash reporting. Documents stay on your device
until you share them; crash-recovery copies never leave it. The app contacts a service only in these
cases:

| When                                                                                  | Contacted                                                           | What is sent                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop app: 3 seconds after launch unless turned off, and when you check for updates | GitHub (`github.com`, `release-assets.githubusercontent.com`)       | A request for the latest release's `latest.json`, with no document content, app version or device identifier. An update downloads only if you install it. |
| **Copy link** in the Share dialog, and opening a share link                           | The cloud share service (`canvaslide.pages.dev` in official builds) | The whole document, including embedded images, kept for 24 hours; see [cloud sharing](./docs/CLOUD-SHARE.md).                                             |
| Adding a linked video, showing a YouTube video, or playing a video                    | YouTube, Vimeo, or the server of a direct video link                | The video link when it is added, to read its size; then thumbnail, player and video requests.                                                             |
| Using the web editor or opening a web example                                         | The web editor's host (Cloudflare Pages)                            | Ordinary page requests. Documents stay in the browser unless you share them.                                                                              |
| Opening the repository, release notes or a video's original page                      | Your default browser                                                | The page you chose.                                                                                                                                       |

As with any web request, each service sees your IP address and a user agent. A linked video set to
play automatically, the default, starts loading when a slideshow, cloud slideshow or exported HTML
reaches its frame, so presenting it contacts its provider without a click. Only one YouTube video per
frame does so, and the browser or provider may still ask for a click to play it.
To stop the launch check, clear **Check for updates at launch** in the **About CanvaSlide** dialog;
**Check for updates** there still checks on demand. Offline or when the request is blocked, the app
keeps working and shows the failure only in that dialog; nothing is installed without your
confirmation. The setting is per user, so a managed network that must prevent the check for everyone
can block the manifest URL listed under `plugins.updater.endpoints` in
[`tauri.conf.json`](./src-tauri/tauri.conf.json).

## Develop and verify

Install Node.js 22.20+ and the pinned pnpm 11 version; Rust and the OS-specific Tauri prerequisites
are needed for desktop development. Full setup is in [CONTRIBUTING](./CONTRIBUTING.md).

```bash
pnpm install
pnpm dev:web        # browser editor, http://127.0.0.1:1420
pnpm dev            # Tauri desktop window
```

The checks to run before a pull request are listed under [Verify in AGENTS.md](./AGENTS.md#verify).

For website development, use the [website guide](./website/README.md). For native bundle checks,
installer builds, signing and publishing, use the [release guide](./docs/RELEASE.md).

## Contributing

Bug reports, feature ideas and pull requests are welcome. See [CONTRIBUTING](./CONTRIBUTING.md)
for issues, branch names and pull requests, and [AGENTS.md](./AGENTS.md) for code rules and checks.
Report security vulnerabilities privately as described in the [security policy](./SECURITY.md).

## License

[MIT](./LICENSE)
