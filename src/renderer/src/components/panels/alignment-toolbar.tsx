import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter
} from 'lucide-react'
import type { AlignMode } from '@shared/canvas/element-alignment'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'

const aligns: { mode: AlignMode; label: UiStringKey; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'align.left', icon: AlignStartVertical },
  { mode: 'centerX', label: 'align.centerX', icon: AlignCenterVertical },
  { mode: 'right', label: 'align.right', icon: AlignEndVertical },
  { mode: 'top', label: 'align.top', icon: AlignStartHorizontal },
  { mode: 'centerY', label: 'align.centerY', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'align.bottom', icon: AlignEndHorizontal }
]

/** Shown for multi-selection; distribution needs three or more elements. */
export function AlignmentToolbar({ count }: { count: number }) {
  const alignSelected = useDocumentStore((s) => s.alignSelected)
  const distributeSelected = useDocumentStore((s) => s.distributeSelected)
  if (count < 2) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5 py-1" data-testid="alignment-toolbar">
      {aligns.map(({ mode, label, icon: Icon }) => (
        <IconButton
          key={mode}
          label={t(label)}
          className="h-7 w-7"
          onClick={() => alignSelected(mode)}
        >
          <Icon size={14} />
        </IconButton>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <IconButton
        label={t('align.distributeX')}
        className="h-7 w-7"
        disabled={count < 3}
        onClick={() => distributeSelected('x')}
      >
        <AlignHorizontalDistributeCenter size={14} />
      </IconButton>
      <IconButton
        label={t('align.distributeY')}
        className="h-7 w-7"
        disabled={count < 3}
        onClick={() => distributeSelected('y')}
      >
        <AlignVerticalDistributeCenter size={14} />
      </IconButton>
    </div>
  )
}
