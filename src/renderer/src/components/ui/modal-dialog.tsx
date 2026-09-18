import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { focusOnMount } from '@/lib/focus-on-mount'

// Why: initial focus inside the panel lets Escape and Tab reach the open dialog.
export function ModalDialog({
  label,
  onClose,
  className,
  children
}: {
  label: string
  onClose: () => void
  /** Sizing of the panel; every dialog has its own width. */
  className: string
  children: ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={label}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={cn(
          'rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl',
          className
        )}
        ref={focusOnMount}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
