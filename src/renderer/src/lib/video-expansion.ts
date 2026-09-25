import { createVideoFocus } from '@shared/canvas/video-focus'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectPresentationShot, usePresentationStore } from '@/store/presentation-store'

export const canvasVideoFocus = createVideoFocus({
  getView: () => ({
    camera: useCameraStore.getState().camera,
    shot: selectPresentationShot(usePresentationStore.getState())
  }),
  setView: ({ camera, shot }) => {
    useCameraStore.getState().setCamera(camera)
    usePresentationStore.setState(shot)
  },
  getRect: (id) => {
    const element = useDocumentStore.getState().document.elements[id]
    return element?.type === 'video' ? element : null
  },
  getViewport: () => useCameraStore.getState().viewport,
  onRestore: () => usePresentationStore.getState().refitToViewport()
})
