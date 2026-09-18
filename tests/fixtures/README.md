# Import fixtures

`figma-basic.fig` is a synthetic ZIP containing `canvas.fig` and `meta.json`. It contains a minimal,
embedded Kiwi schema and Deflate-compressed node data: two visible pages, one hidden page, a blue
rectangle, the text “Hello Figma”, and a blue ellipse. Coordinates include negative values and two
pages sharing the same local origin. No user-provided design content is included.

`figma-nested-text.fig` is a separate synthetic Kiwi/Deflate ZIP with a filled frame, a translated
group, mixed-style text, partially clipped text, fully clipped text, and a hidden ancestor. It
checks that frame backgrounds never capture the text and that the visible text can actually be edited.

The real local sample is exercised only when `CANVASLIDE_FIG_SAMPLE` is set; see
[`docs/FIGMA-IMPORT.md`](../../docs/FIGMA-IMPORT.md).
