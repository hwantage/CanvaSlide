# Figma import

[Documentation map](./README.md) · [Document formats and platform constraints](./ARCHITECTURE.md)

Choose a `.fig` file with **Import files…** in the left toolbar or ⌘I / Ctrl+I. Dropping the file on
the canvas opens the same dialog. Only local files are read; no Figma account or API token is needed.

## Importing a file

1. Select the pages to import. Hidden internal pages are left out, and the first non-empty page is
   selected by default.
2. Choose **Editable text and shapes** or **Preserve appearance**.
3. The imported content is added to the current document. The view fits the first imported page, and
   the page frames of all imported pages are selected. Pages and their main design frames are added to
   the frame list, ready to present.
4. Check the conversion report for unsupported items. A single undo removes the entire import. Save
   the result as a `.canvaslide` file like any other document.

Coordinates and stacking order within each page are kept, and pages are placed 400 units apart.
The original `.fig` file is never modified.

## What converts to what

| Source                                         | Result                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Text layers                                    | Editable text, including inside frames and groups; rotation kept, mixed styles approximated |
| Basic shapes with a solid fill                 | Native shapes in editable mode; rotation kept                                               |
| Uncropped images                               | The original bitmap asset, with duplicates of the same image stored once; rotation kept     |
| Vectors; flipped, cropped or multi-fill layers | Self-contained SVG images                                                                   |
| Frames and groups that contain text            | Background and children split to keep stacking order; text is never merged into an image    |
| Text outlines                                  | SVG conversion uses the glyph paths in the file, not installed fonts                        |
| Pages and top-level design frames              | Presentation frames                                                                         |
| Hidden or deleted layers, internal pages       | Left out                                                                                    |

**Preserve appearance** turns each top-level layer into an image, so the text inside it cannot be edited
directly; the images can still be zoomed, moved and resized, and the presentation frames edited.
Text imported with **Editable text and shapes** is edited by double-clicking it; the completion dialog
shows how many text layers are editable. Lettering that was part of a screenshot or bitmap, or that exists
only as vector outlines, is not a text layer and cannot be edited. Text that an earlier import merged into
an image becomes editable only by importing the original `.fig` again.

Current limits:

- Editable mode carries over font, size, bold, italic, line height, alignment and rotation. Mixed
  styles are simplified to the first character's style; skewed, flipped, outlined and gradient text is
  approximated so that it stays editable. When a frame boundary clips rotated text, the rotation is
  dropped: the text is set upright in the box that enclosed the rotated text, clipped to the frame and
  counted in the report. Line breaks and fonts that are not installed can differ from the original.
- Effects such as shadows and blurs are omitted. Advanced gradients and blend modes are partly
  approximated or omitted.
- Component instances are not expanded from their main components, and overrides, variables,
  prototype links and auto-layout rules are not imported. When the file contains an instance's child
  layers, their positions are used.
- Masks in areas kept as images become alpha masks. Masks, rotation or rounded frame boundaries in areas
  that contain text are approximated by a rectangle and reported. Rectangular frames clip both text and
  images to their boundary. While clipped text is being edited, its whole content is shown; it is clipped
  again when editing ends.
- Text converted to SVG falls back to font-based SVG text when the file has no glyph outlines for it.
  Missing images and vector paths are listed in the report.
- Files over 128 MiB, with more than 256 MiB of decompressed data or result assets, more than 100,000
  nodes or more than 128 levels of nesting are rejected. Changes to the `.fig` format in newer Figma
  versions may need further work.

For the saved format and the file limits shared by all documents, see
[document formats](./ARCHITECTURE.md#document-formats).

## Structure

- `shared/fig/fig-file.ts`: unpacks ZIP or raw `fig-kiwi` data and inflates Deflate/Zstandard.
- `fig-kiwi.ts`: decodes with the Kiwi schema embedded in the file. It uses no `eval` or `new Function`,
  so the existing Tauri CSP stays unchanged.
- `fig-scene.ts`: page and layer order, matrices, bounds and SVG paths. The NaN size of an auto-sized
  group is computed from its children.
- `fig-svg.ts`: fills, image crops, clipping, masks and glyph rendering. Per-character fills read
  `textStyleTable` and `styleOverrideTable` together; for the same style ID the override wins.
- `fig-convert.ts`: conversion to CanvaSlide elements, assets and presentation frames.
- `fig-text.ts`: conversion to editable text, its styles and frame clipping.
  `shared/canvas/text-clip.ts` holds the visible range the editor and the HTML player share, and the
  editor applies it to selection too.
- `renderer/src/lib/workers/fig-import.worker.ts`: decodes and converts off the main thread; cancelling
  terminates the worker.
- `renderer/src/store/fig-import-store.ts`: dialog state and insertion as a single undo step. If the
  document changed meanwhile, the earlier conversion result is not inserted.

Bulk insertion uses `document-mutations.insertElements`, which copies the element and asset tables once.
Each import runs in its own session so that late results of a cancelled import are ignored, and the
worker is released on success, failure and cancellation. The completion dialog keeps only counts and
warnings.

Binary format references: [Kiwi](https://github.com/evanw/kiwi),
[FIG structure analysis](https://github.com/KwiTsukasa/figma-local-context-mcp/blob/main/FIG_DATA_STRUCTURE_ANALYSIS.md),
[OpenFig image structure](https://github.com/OpenFig-org/openfig-core/blob/main/docs/images.md).
External parsers' runtime schema compilation is not used; the path opcodes were checked against the
quadratic and cubic paths of real sample files.

## Verification

The regression fixtures `tests/fixtures/figma-basic.fig` and `figma-nested-text.fig` are documents made
for this repository; content from users' sample files is never committed. The checks cover binary
decoding, matrices, clipping and image crops, paths and glyphs, hidden pages, both conversion modes,
schema validation, import, cancel and undo, real double-click editing, saving and reopening of nested,
mixed-style and clipped text, the CSP, and invalid files.

To check only the import feature, run the following. Full verification follows
[Verify in AGENTS.md](../AGENTS.md#verify), which also covers native bundle checks.

```bash
pnpm exec vitest run --config config/vitest.config.ts src/shared/fig/fig-convert.test.ts
CANVASLIDE_E2E_WEBKIT=1 pnpm exec playwright test --config tests/playwright.config.ts tests/e2e/fig-import.spec.ts
```

These checks use the synthetic files in the repository. When checking a user's file by hand, keep the
results and logs in the Git-ignored `discuss/` folder and record them in the PR with the environment
and constraints.
