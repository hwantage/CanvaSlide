---
name: canvaslide
description: Create editable CanvaSlide presentations (.canvaslide JSON) and standalone HTML from a topic, website or repository. Follow the user's language, scene count and presentation style.
---

# CanvaSlide

Analyze the user's topic, website or repository and create a presentation in the requested language,
with the requested scene count and style.

## References

- [Authoring guide and examples](https://github.com/hwantage/CanvaSlide/blob/main/examples/README.md)
- `documentFileSchema` in the [file schema](https://github.com/hwantage/CanvaSlide/blob/main/src/shared/canvas/element-types.ts)

`.canvaslide` is editable UTF-8 JSON. Follow the guide's format and use native text, shapes,
connectors and frames. Use restrained movement for calm presentations, and varied camera movement
with nested zoom frames for dynamic presentations. Count nested frames toward the total scene count.

## Output

- By default, create only a `.canvaslide` file with the requested name.
- When asked to also create HTML, deliver both `.canvaslide` and `.html` with the same content.
- For an HTML-only request, deliver only `.html`.

Follow the guide's HTML export procedure. Preserve scene order and camera movement, and embed
the player, styles and images so the file opens directly in a browser.
Do not include externally linked videos in offline presentations.

Check text size, wrapping, overlaps and presentation order in every scene, then deliver the actual files.
State any limitations if file generation or verification could not be performed.
