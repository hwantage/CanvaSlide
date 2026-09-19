import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type IconButtonProps = ComponentPropsWithRef<'button'> & {
  active?: boolean
  label: string
  children: ReactNode
}

export function IconButton({
  active = false,
  label,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors',
        'hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active &&
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
