# Examples

Sample `.canvas.json` documents that show what CanvaSlide is good at. Open any of them with
**Open** (⌘O / Ctrl+O), then press **⏎** to walk the presentation frames.

| Folder          | Document                                 | What it shows                                                                                                                     |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `flowchart/`    | `order-fulfillment.canvas.json`          | Process flow with decisions, exception branches, dashed retry loops, three stage frames                                           |
| `erd/`          | `shop-schema.canvas.json`                | Seven-table entity-relationship diagram with cardinality labels and cluster frames                                                |
| `slides/`       | `northwind-launch-deck.canvas.json`      | Six-slide launch deck: title, agenda, stat cards, step diagram, bar chart, roadmap                                                |
| `architecture/` | `shop-platform.canvas.json`              | Cloud system architecture in zones; solid request path, dashed event lane                                                         |
| `mindmap/`      | `product-strategy-2027.canvas.json`      | Central topic with five colour-coded branches on curved connectors, one frame each                                                |
| `capstone/`     | `hansung-precapstone-2026-2.canvas.json` | A real 59-slide Korean lecture deck condensed to 24 frames in four rows: tables, a bar chart, a code block, architecture diagrams |

## Regenerating

The documents are generated, not hand-edited, so ids and geometry stay consistent with the schema in
`src/shared/canvas/element-types.ts`:

```
pnpm examples:build
```

`build/builder.ts` is a small typed DSL (`rect`, `ellipse`, `text`, `connect`, `frame`, `image`);
each sample lives in its own file next to it. The capstone deck adds `capstone-style.ts`, a slide
vocabulary (`slide`, `title`, `bullets`, `table`, `code`, `stat`, `box`) worth copying for a deck of
your own. `pnpm test` parses every generated file with the app's
own `parseDocument`, so a schema change that breaks a sample fails CI.
