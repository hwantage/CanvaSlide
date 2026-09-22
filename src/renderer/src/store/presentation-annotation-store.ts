import { createAnnotationSession } from '@shared/canvas/presentation-annotation-state'

// The app adapter exposes session state for inspection; pointer samples stay in the shared painter.
export const annotationSession = createAnnotationSession()
