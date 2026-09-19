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

`linked-video.mp4` (8 seconds, H.264/AAC) and `linked-video.webm` (4 seconds, VP9/Opus) are
synthetic 320×180 test patterns with a quiet sine tone. They contain no user media. Linked-video E2E serves these bytes from a mocked HTTP
media URL to verify decoding, playback and teardown without third-party network dependencies.

`linked-video-portrait.mp4` is a silent 2-second, 180×320 rotation of the same synthetic pattern.
It checks metadata-based portrait insertion without playing or storing the video in a document.
