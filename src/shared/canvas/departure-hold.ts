/** How long a preview rests on the frame it departs from before the flight into the next starts. */
export const PREVIEW_DEPARTURE_HOLD_MS = 500

/** The opening frame starts from the editor's existing view, so it needs no departure hold. */
export function previewDepartureHoldMs(departureIndex: number | null): number {
  return departureIndex === null ? 0 : PREVIEW_DEPARTURE_HOLD_MS
}
