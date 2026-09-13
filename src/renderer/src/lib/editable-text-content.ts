/**
 * contentEditable ↔ plain text. `textContent` drops the breaks browsers insert on Enter
 * (`<br>`, `<div>`), so two lines would collapse into one; `innerText` keeps them as `\n`.
 */
export function readEditorText(element: HTMLElement): string {
  const text = element.innerText ?? element.textContent ?? ''
  return text.replace(/\r\n?/g, '\n')
}

/** Inserts a `<br>` at the caret (what Shift+Enter does natively) so every line break is uniform. */
export function insertEditorLineBreak(): void {
  if (!document.execCommand('insertLineBreak')) {
    document.execCommand('insertText', false, '\n')
  }
}
