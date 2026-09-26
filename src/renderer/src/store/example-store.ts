import { create } from 'zustand'
import type { ExampleErrorCode } from '@/platform/example-document'

type ExampleState = {
  open: boolean
  busy: boolean
  error: ExampleErrorCode | null
}

export const useExampleStore = create<ExampleState>(() => ({
  open: false,
  busy: false,
  error: null
}))
