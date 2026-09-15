# Examples

Sample `.canvas.json` documents that show what CanvaSlide is good at. Open any of them with
**Open** (⌘O / Ctrl+O), then press **⏎** to walk the presentation frames.

Start with **`showcase/one-order.canvas.json`** — a 23-frame journey through an order, a lost
payment response, an idempotent retry, and completion, built entirely from editable native shapes,
text, connectors, and presentation frames.

| Folder          | Document                            | What it shows                                                                                                      |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `showcase/`     | `one-order.canvas.json`             | 23 camera stops: checkout → request envelope → payment timeout → recovery → receipt; nested zooms and a system map |
| `swing/`        | `the-swing.canvas.json`             | 12 frames scattered over a 48 000-unit skyline: the camera hurls itself across the city and doubles back           |
| `anatomy/`      | `the-body.canvas.json`              | An atlas on the left and a whole standing figure on the right: 20 stops, then a fall from skull to one cell        |
| `flowchart/`    | `order-fulfillment.canvas.json`     | Process flow with decisions, exception branches, dashed retry loops, three stage frames                            |
| `erd/`          | `shop-schema.canvas.json`           | Seven-table entity-relationship diagram with cardinality labels and cluster frames                                 |
| `slides/`       | `northwind-launch-deck.canvas.json` | Six-slide launch deck: title, agenda, stat cards, step diagram, bar chart, roadmap                                 |
| `architecture/` | `shop-platform.canvas.json`         | Cloud system architecture in zones; solid request path, dashed event lane                                          |
| `mindmap/`      | `product-strategy-2027.canvas.json` | Central topic with five colour-coded branches on curved connectors, one frame each                                 |

## Editing a sample

The documents are the source: open one in the app, change it, save. There is no generator to keep in
sync. Two things to check before committing an edit:

- **Diff size.** Saving rewrites the whole file, so a one-shape change can still touch the camera
  and the element order. Skim the diff rather than assuming it is small.
- **File size.** Images are base64-inlined into the document. Two earlier samples reached 45 MB and
  35 MB that way and had to be dropped; they are still named in `.gitignore` as a reminder. Keep
  raster artwork small, or draw with native shapes instead.

`pnpm test` runs `examples.test.ts`, which parses every `.canvas.json` here with the app's own
`parseDocument` and checks that frames and connector endpoints are intact — a document broken by a
hand edit or a schema change fails CI.

## Authoring a new sample with an AI assistant

A sample is a plain JSON document validated by `canvasDocumentSchema` in
`src/shared/canvas/element-types.ts`, so an assistant can write one directly. What makes the
difference between a usable result and a mess:

**Give it the schema and a sibling.** Point it at `element-types.ts` for the contract and at an
existing document of a similar shape — `flowchart/order-fulfillment.canvas.json` for a diagram,
`slides/northwind-launch-deck.canvas.json` for a deck. The sibling settles the conventions that the
schema does not: id naming, how much padding a frame leaves, what a readable font size is here.

**Have it emit a script, not 4 000 lines of JSON.** Ask for a throwaway Node script that assembles
the document and writes the file. Repetition (a grid of slides, a row of table cells) collapses into
a loop, mistakes are fixed in one place, and you can re-run it while iterating. Delete the script
once the document looks right — the document is what ships.

**Pin the layout in coordinates.** There is no layout engine; every element carries absolute
`x`/`y`/`width`/`height` and nothing warns about overlap. Give it a grid to work against ("columns
at x = 80 / 480 / 880, rows 200 apart") instead of asking it to "arrange things nicely", and say
which elements are connector endpoints so it keeps the space between them clear.

**Know what the schema will not check for you.** Frames carry their own `order` field, which drives
the presentation sequence independently of canvas position. Connector `start`/`end` must name real
element ids. Text height should follow the renderer's 1.4 line-height, or the document is marked
dirty the moment it opens.

**Close the loop with the checks.** `pnpm test` is the pass/fail signal to iterate against, and
`pnpm tc:examples` typechecks this folder. Both together still only prove the document is _valid_ —
open it and walk the frames with **⏎** before calling it done, because the real failure mode of a
generated sample is overlapping boxes and connectors crossing labels, not invalid JSON.
