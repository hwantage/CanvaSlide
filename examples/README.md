# Examples

Sample `.canvaslide` documents that show what CanvaSlide is good at. Open any of them with
**Open** (⌘O / Ctrl+O), then start **Slide Show** with **⌘Enter / Ctrl+Enter**, **F5**, or the toolbar button.
Use **→ / Space** to advance, **←** to go back, **O** for the overview and **Esc** to exit.

Start with **`showcase/one-order.canvaslide`** — a 23-frame journey through an order, a lost
payment response, an idempotent retry, and completion, built entirely from editable native shapes,
text, connectors, and presentation frames.

| Folder          | Document                           | What it shows                                                                                                      |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `showcase/`     | `one-order.canvaslide`             | 23 camera stops: checkout → request envelope → payment timeout → recovery → receipt; nested zooms and a system map |
| `showcase/`     | `freefall.canvaslide`              | 10 camera stops from Earth into nested photographic details, a concert and animated fireworks                      |
| `swing/`        | `the-swing.canvaslide`             | 12 frames scattered over a 48 000-unit skyline: the camera hurls itself across the city and doubles back           |
| `anatomy/`      | `inside.canvaslide`                | 13-frame illustrated journey through the human body with detailed organs and embedded photographs                  |
| `anatomy/`      | `the-body.canvaslide`              | An atlas on the left and a whole standing figure on the right: 20 stops, then a fall from skull to one cell        |
| `flowchart/`    | `order-fulfillment.canvaslide`     | Process flow with decisions, exception branches, dashed retry loops, three stage frames                            |
| `erd/`          | `shop-schema.canvaslide`           | Seven-table entity-relationship diagram with cardinality labels and cluster frames                                 |
| `slides/`       | `northwind-launch-deck.canvaslide` | Seven scenes: launch slides, a step diagram, a chart detail zoom and a roadmap                                     |
| `architecture/` | `shop-platform.canvaslide`         | Cloud system architecture in zones; solid request path, dashed event lane                                          |
| `mindmap/`      | `product-strategy-2027.canvaslide` | Central topic with five colour-coded branches on curved connectors, one frame each                                 |
| `./`            | `canvaslide-claude.canvaslide`     | Eight-scene Korean introduction to CanvaSlide, created by Claude from an AI prompt                                 |
| `./`            | `canvaslide-codex.canvaslide`      | Eight-scene Korean introduction to CanvaSlide, created by Codex from an AI prompt                                  |

## Open examples in the browser

Browse [ShowCase](https://hwantage.github.io/CanvaSlide/showcase/) or open the web editor directly:

- [One order](https://canvaslide.pages.dev/?example=one-order)
- [Inside the human body](https://canvaslide.pages.dev/?example=inside)
- [FREEFALL](https://canvaslide.pages.dev/?example=freefall)
- [CanvaSlide · Claude](https://canvaslide.pages.dev/?example=canvaslide-claude)
- [CanvaSlide · Codex](https://canvaslide.pages.dev/?example=canvaslide-codex)

The shared catalog IDs are `one-order`, `freefall`, `inside`, `swing`, `anatomy`, `flowchart`, `erd`, `slides`,
`architecture`, `mindmap`, `canvaslide-claude`, and `canvaslide-codex`. The two AI-generated introductions
are in Korean and close the ShowCase gallery in Claude, Codex order.
An example opens as an editable local copy; save your changes before
closing or reloading. Refreshing the example link opens its original again. Arbitrary URLs and paths
are not accepted in `example`. The [website guide](../website/README.md#editable-showcase-catalog)
explains catalog additions, preview generation, deployment outputs, and file-size validation.

`showcase/freefall.canvaslide` contains ten frames, embedded photographs, SVG masks, and animated
fireworks. It is served directly as a current-format document; no extraction is needed. When changing
embedded image formats, verify camera-motion previews as well as file size and visual fidelity.

`anatomy/inside.canvaslide` contains 13 frames and embedded anatomical artwork. Its current-format
JSON retains all nine PNG photographs with lossless recompression. At about 24.46 MiB it fits the
hosting limit without reducing image dimensions or changing the canvas layout, and keeps the masked
photo preview path available in existing editors. Initial high-resolution detail rendering can still
take time.

## Editing a sample

The documents are the source: open one in the app, change it, save. There is no generator to keep in
sync. Two things to check before committing an edit:

- **File format.** A `.canvaslide` is a single, readable UTF-8 JSON document. It stays JSON after
  saving in the app. Review its file diff and reopened presentation when editing a sample.
- **File size.** Images are stored once in the JSON's shared `resources` table. SVG text remains
  readable and references shared image data. Keep raster artwork small; it still affects file
  size, runtime memory and HTML exports.

`pnpm test` runs `examples.test.ts`, which parses every `.canvaslide` here with the app's own
`parseDocumentFile` and checks that frames and attached connector endpoints are intact. It also
validates the complete JSON example below and its save/open round trip against the current loader.

## Authoring with AI

The optional [CanvaSlide skill](../skills/canvaslide/SKILL.md) points an assistant to this guide and
the schema. See [installation](../skills/README.md); the skill is one Markdown file.

### Output an editable file

Write **UTF-8 JSON with `version: 1`**, validated by
[`documentFileSchema`](../src/shared/canvas/element-types.ts), and save it as the requested
`name.canvaslide` file. This is the document format for both the browser and desktop app.
The file contains elements, presentation settings, assets and shared resources in one JSON object.
`canvasDocumentSchema` in the application source describes the renderer's resolved image data;
use `documentFileSchema` when producing a file. See [document formats](../docs/ARCHITECTURE.md#document-formats)
for the boundary between file data and the runtime model. Earlier JSON/ZIP formats are not supported.

Deliver the file itself when possible. If only text output is available, provide the complete JSON
in one code block; the user saves its contents without the Markdown fences as UTF-8 `.canvaslide`
(not `.canvaslide.txt`). Open it with **Open** in CanvaSlide. Saving keeps the file editable as JSON;
use **Share → HTML** or **Share → PDF** for a standalone presentation. Those are viewing copies, not the editable source.

An assistant with code execution can use a small Node or Python script to assemble the JSON and
write the file. A local checkout is only needed to run the repository checks, not to author JSON.

### Minimal complete document

This example needs no assets and contains one presentation frame, an editable shape and text.
All coordinates are absolute canvas coordinates; a frame does not create a local coordinate system.

```json
{
  "version": 1,
  "name": "CanvaSlide introduction",
  "elements": {
    "frame-1": {
      "id": "frame-1",
      "type": "frame",
      "x": 0,
      "y": 0,
      "width": 1280,
      "height": 720,
      "name": "Introduction",
      "order": 1
    },
    "card-1": {
      "id": "card-1",
      "type": "shape",
      "shape": "rectangle",
      "x": 80,
      "y": 280,
      "width": 1120,
      "height": 280,
      "style": {
        "fill": "#dbeafe",
        "stroke": "#2563eb",
        "strokeWidth": 2,
        "cornerRadius": 24
      },
      "text": "One canvas. A clear story.",
      "textStyle": {
        "color": "#18181b",
        "fontSize": 40,
        "align": "center",
        "bold": false
      }
    },
    "title-1": {
      "id": "title-1",
      "type": "text",
      "x": 80,
      "y": 80,
      "width": 1120,
      "height": 90,
      "text": "CanvaSlide",
      "textStyle": {
        "color": "#18181b",
        "fontSize": 64,
        "align": "left",
        "bold": true
      }
    }
  },
  "order": ["frame-1", "card-1", "title-1"],
  "settings": { "transitionMs": 1000, "background": "plain" },
  "assets": {},
  "resources": {}
}
```

### Rules beyond the field types

- **IDs and order.** `elements` is an object keyed by each element's unique `id`, not an array.
  Root `order` lists every element ID once, bottom to top. Each frame's numeric `order` separately
  controls the presentation sequence; use distinct values `1..N`. Canvas position does not set it.
- **Frames and layout.** Frames define camera destinations; they have no child list or editable fill
  field. Use shapes for custom backgrounds and put text above them in root `order`. Every element needs finite
  `x`/`y` and positive `width`/`height`. There is no automatic slide layout. For a 1280 × 720 frame,
  start with 64–80 units of safe margin, 48–72 title text and 28–36 body text; these are design
  suggestions, not schema limits. Keep copy short and inspect wrapping at presentation size.
- **Text and shapes.** Every text style requires `color`, `fontSize`, `align` and `bold`.
  Shapes also require all four shape style fields, `text` (even when empty) and `textStyle`.
  Standalone text height is measured on opening; that measurement does not mark the document dirty.
  Estimate height using the default 1.4 line-height (or explicit `textStyle.lineHeight`) and leave
  room for wrapping and font differences. Measurement does not reposition nearby elements.
- **Connectors.** Both `start` and `end` always need world `x`/`y`. For an attached endpoint,
  `elementId` must reference an existing non-connector element. `side` is `top`, `right`, `bottom`
  or `left`; set `pinned: true` with `side` to keep a specific port. Free endpoints omit `elementId`.
  Connectors also need a positive bounding box, `route`, `startHead`, `endHead`, `style`, `label`
  (possibly empty) and `textStyle`; use the exact fields in the schema. The editor recalculates
  attached endpoints and bounds, so do not use a connector's rectangle to position its path.
- **Assets.** Use `assets: {}` and `resources: {}` when no images are needed. Image elements refer
  to an `assetId` and need `naturalWidth` and `naturalHeight`. Each asset has `id`, `mime`, `width`,
  `height` and `resourceId`; that resource must exist in `resources`. Resource IDs can be readable
  names such as `logo` or `photo-1`. The app generates its own IDs when saving; authors need no hash tool.
- **Image resources.** A `type: "data"` resource has `data` containing a complete image data URL.
  Store the same image once and reference its ID wherever needed. A `type: "svg"` resource has
  `parts`, an array of SVG text strings and `{ "resourceId": "photo-1" }` objects. These objects
  insert a shared data URL between text parts. They must reference `type: "data"` resources;
  SVG resources cannot reference other SVG resources. A plain vector SVG needs only one text part.
  This keeps SVG text, crop/mask markup and resource references directly editable without byte offsets.
  Prefer native geometry and text when image bytes are unavailable.

### Calm and dynamic camera direction

A frame can override its incoming camera movement with `transition`. Omitted fields inherit
document settings, except `roll`, which defaults to zero. The camera fits the destination frame;
there is no per-frame `zoom`, `rotation`, `duration` or `animation` property.

| Frame `transition` field | Accepted values                                             | Meaning                                                             |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `ms`                     | Integer `0..10000`                                          | Travel duration to this frame in milliseconds; `0` cuts immediately |
| `easing`                 | `smooth`, `linear`, `accelerate`, `decelerate`, `overshoot` | Speed curve                                                         |
| `arc`                    | `0.6..3`                                                    | Zoom-out arc during travel; higher rises further before zooming in  |
| `roll`                   | `-180..180`                                                 | Camera angle in degrees while viewing this frame                    |
| `spotlight`              | `0..1`                                                      | Dim strength outside the frame                                      |

These values come from `frameTransitionSchema` and the app’s shared camera implementation.

For a calm sequence, use similarly sized nearby frames and, for example,
`"transition": { "ms": 800, "easing": "smooth", "arc": 0.6, "roll": 0 }`.
For a more dynamic journey, vary distances and frame sizes, mix travel durations and arcs, and use
small rolls selectively. Large angle changes can make reading harder.

A nested zoom is another ordinary frame placed over the detail **in the same world coordinates**.
For example, after a 1280 × 720 frame at `(0, 0)`, a 512 × 288 frame at `(384, 216)` focuses on its
center at 2.5× the scale. Reuse the existing text and shapes there; do not invent `parentId` or
`children`. Each nested frame adds one presentation scene. An eight-scene presentation, including
two detail zooms, therefore has eight frames total. Keep detail text inside the smaller frame's
safe margins. To show an overview as an ordered scene, add a frame enclosing the composition;
that frame also counts toward the total. The player's **O** overview is a separate navigation mode.

### Remaining required fields

- **Settings.** `transitionMs` is required (`0..10000`, integer). Optional document defaults are
  `transitionEasing`, `transitionArc`, `spotlight`, `background` (`dots`, `grid`, `plain`) and
  `frameBorder` (`solid`, `dashed`, `none`). Use the file schema for their defaults.
- **Shapes.** `shape` is `rectangle`, `ellipse` or `diamond`. Style fields: `fill`, `stroke`,
  `strokeWidth` (`0..64`), `cornerRadius` (`0..512`). Use CSS color strings.
- **Connectors.** `route` is `straight`, `orthogonal` or `curved`; `startHead` and `endHead` are each
  `none`, `arrow`, `openArrow`, `circle`, `diamond` or `bar`.
  Style fields: `stroke`, `strokeWidth` (`1..32`) and `dashed` (boolean). A positive bounding box is
  required even for horizontal or vertical lines (use at least 1 for the zero dimension).
- **Text.** `align` is `left`, `center` or `right`. Optional `italic`, `lineHeight` (`0.1..10`) and
  `fontFamily` affect rendering. Plain strings only; no HTML/Markdown formatting inside text.
- **Video.** `type: "video"` elements carry a supported HTTP(S) `url` and optional `autoplay`.
  They are links, not embedded resources; omit them from offline presentations.
- **Optional camera.** Root `camera: { "x": 0, "y": 0, "zoom": 1 }` stores the editor viewport;
  it does not control presentation order or per-frame camera effects.

### HTML output

For standalone HTML, open the native document in CanvaSlide and use **Share → HTML**.
An assistant with code execution can also use the existing export path from the public repository:

1. Obtain the repository source and install its dependencies, then run `pnpm build:player`.
2. Read the native file with [`parseDocumentFile`](../src/shared/canvas/document-file.ts).
   This resolves shared resources into the image data URLs expected by the player.
3. Pass the loaded document through [`syncConnectorGeometry`](../src/shared/canvas/connector-geometry.ts),
   then call [`buildStandaloneHtml`](../src/shared/canvas/html-export.ts) with that document and the
   text of `src/renderer/src/generated/player.iife.js` as `playerScript`. Write the returned HTML.

The HTML includes the player, styles and image data; no companion files are needed to view it.
Use system fonts and embedded images for portability. Linked videos need internet access; YouTube
also requires HTTP hosting rather than opening a local file. Preserve the editable `.canvaslide`
when HTML is requested **in addition** to it. HTML is a presentation viewer, not an editable document.

### References and validation

- [Order fulfillment](./flowchart/order-fulfillment.canvaslide): attached connectors and a diagram.
- [Northwind launch](./slides/northwind-launch-deck.canvaslide): a conventional slide deck.
- [One order](./showcase/one-order.canvaslide): nested detail frames and camera direction.

With a checkout, `pnpm test` validates these examples and the complete JSON above with the actual
loader. `pnpm tc:examples` checks the example TypeScript, not JSON validity. Otherwise, open the file
in CanvaSlide and check every frame. A schema pass cannot detect clipped text, unreadable type or
unwanted overlaps; inspect any generated HTML in a browser too.
