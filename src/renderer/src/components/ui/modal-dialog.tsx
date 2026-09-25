import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { pushModalDialog } from '@/store/modal-stack'

function restoreFocus(opener: HTMLElement, wasFocusVisible: boolean) {
  opener.focus({ preventScroll: true })
  if (wasFocusVisible || document.activeElement !== opener || !opener.matches(':focus-visible')) {
    return
  }
  // WebKit can transfer a textarea's focus ring to a pointer-opened dialog's opener.
  opener.setAttribute('data-modal-pointer-focus', '')
  const clear = () => {
    opener.removeAttribute('data-modal-pointer-focus')
    opener.removeEventListener('blur', clear)
    opener.removeEventListener('keydown', clear)
  }
  opener.addEventListener('blur', clear)
  opener.addEventListener('keydown', clear)
}

export function ModalDialog({
  label,
  onClose,
  className,
  children
}: {
  label: string
  /** Omitted for a prompt that needs a deliberate answer: Escape and the backdrop leave it open. */
  onClose?: () => void
  /** Sizing of the panel; every dialog has its own width. */
  className: string
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const keyboardInteraction = useRef(false)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const opener = document.activeElement
    const wasFocusVisible =
      opener?.matches(':focus-visible') === true && !opener.hasAttribute('data-modal-pointer-focus')
    const previousDialogs = Array.from(
      document.querySelectorAll<HTMLDialogElement>('dialog[open][aria-modal="true"]')
    ).filter((previous) => !previous.inert)
    // WebKit can still focus an earlier modal unless it is explicitly made inert.
    for (const previous of previousDialogs) {
      previous.inert = true
    }
    // Why: a native modal makes the background inert for keyboard and assistive technology.
    dialog.showModal()
    const removeFromStack = pushModalDialog({ dismiss: () => onCloseRef.current?.() })
    // Why: browsers force-close a dialog after repeated Escape, ignoring cancel's preventDefault.
    const onNativeClose = () => {
      // A remount (StrictMode) reopens the dialog before its earlier close() event arrives.
      if (dialog.open) {
        return
      }
      if (onCloseRef.current) {
        onCloseRef.current()
        return
      }
      dialog.showModal()
      panelRef.current?.focus({ preventScroll: true })
    }
    dialog.addEventListener('close', onNativeClose)
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.removeEventListener('close', onNativeClose)
      removeFromStack()
      dialog.close()
      for (const previous of previousDialogs) {
        previous.inert = false
      }
      if (opener instanceof HTMLElement && opener.isConnected) {
        restoreFocus(opener, wasFocusVisible || keyboardInteraction.current)
      }
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-modal
      aria-label={label}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-0 backdrop:bg-black/40 open:flex"
      onPointerDown={() => {
        keyboardInteraction.current = false
      }}
      onClick={() => onClose?.()}
      onCancel={(event) => {
        event.preventDefault()
        onClose?.()
      }}
      onKeyDown={(event) => {
        keyboardInteraction.current = true
        // Why: keys typed here belong to the dialog; window listeners consult the modal stack.
        event.stopPropagation()
        if (event.key !== 'Tab') {
          return
        }
        const candidates = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]'
          )
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0
        )
        const controls = candidates.filter((element) => {
          if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) {
            return true
          }
          const group = candidates.filter(
            (candidate) =>
              candidate instanceof HTMLInputElement &&
              candidate.type === 'radio' &&
              candidate.name === element.name &&
              candidate.form === element.form
          ) as HTMLInputElement[]
          return element === (group.find((radio) => radio.checked) ?? group[0])
        })
        // Why: cycle explicitly so Safari's keyboard preference cannot skip the dialog's buttons.
        event.preventDefault()
        const current = controls.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey
          ? controls[current <= 0 ? controls.length - 1 : current - 1]
          : controls[(current + 1) % controls.length]
        ;(next ?? panelRef.current)?.focus()
      }}
    >
      <div
        className={cn(
          'max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl',
          className
        )}
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </dialog>
  )
}
