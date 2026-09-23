import { CornerDownRight, Spline, TrendingUp } from 'lucide-react'
import { connectorDrawing, type ConnectorDrawing } from '@shared/canvas/connector-markers'
import {
  arrowHeads,
  defaultConnectorStyle,
  defaultTextStyle,
  type ArrowHead,
  type ConnectorRoute
} from '@shared/canvas/element-types'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'

/** The route and end marker choices, shared by the tool flyout and the properties panel. */
export type ConnectorOption<T> = { value: T; label: UiStringKey; icon: typeof TrendingUp }

export const connectorRouteOptions: readonly ConnectorOption<ConnectorRoute>[] = [
  { value: 'straight', label: 'connector.route.straight', icon: TrendingUp },
  { value: 'orthogonal', label: 'connector.route.orthogonal', icon: CornerDownRight },
  { value: 'curved', label: 'connector.route.curved', icon: Spline }
]

const headLabels: Record<ArrowHead, UiStringKey> = {
  none: 'connector.head.none',
  arrow: 'connector.head.arrow',
  openArrow: 'connector.head.openArrow',
  circle: 'connector.head.circle',
  diamond: 'connector.head.diamond',
  bar: 'connector.head.bar'
}

type ConnectorEndName = 'start' | 'end'

const headIconDrawings = new Map<string, ConnectorDrawing>()

/** A short line with `head` on one end, drawn by the geometry the canvas and exports use. */
function headIconDrawing(head: ArrowHead, end: ConnectorEndName): ConnectorDrawing {
  const key = `${end}:${head}`
  const cached = headIconDrawings.get(key)
  if (cached) {
    return cached
  }
  const drawing = connectorDrawing({
    id: 'preview',
    type: 'connector',
    x: 4,
    y: 16,
    width: 24,
    height: 1,
    start: { x: 4, y: 16 },
    end: { x: 28, y: 16 },
    route: 'straight',
    startHead: end === 'start' ? head : 'none',
    endHead: end === 'end' ? head : 'none',
    style: { ...defaultConnectorStyle, strokeWidth: 2 },
    label: '',
    textStyle: defaultTextStyle
  })
  headIconDrawings.set(key, drawing)
  return drawing
}

function ConnectorHeadIcon({ head, end }: { head: ArrowHead; end: ConnectorEndName }) {
  const { d, markers } = headIconDrawing(head, end)
  return (
    <svg width={16} height={16} viewBox="0 0 32 32" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} fill="none" />
        {markers.map((marker) => (
          <path
            key={marker.d}
            d={marker.d}
            fill={marker.filled ? 'currentColor' : 'none'}
            stroke={marker.filled ? 'none' : undefined}
          />
        ))}
      </g>
    </svg>
  )
}

/** One row of end marker choices for the start or the end of a connector. */
export function ConnectorHeadPicker({
  end,
  value,
  onChange,
  buttonClassName
}: {
  end: ConnectorEndName
  value: ArrowHead
  onChange: (head: ArrowHead) => void
  buttonClassName?: string
}) {
  return (
    <div
      role="group"
      aria-label={t(end === 'start' ? 'connector.start' : 'connector.end')}
      className="flex gap-0.5"
    >
      {arrowHeads.map((head) => (
        <IconButton
          key={head}
          label={t(headLabels[head])}
          className={buttonClassName}
          active={value === head}
          onClick={() => onChange(head)}
        >
          <ConnectorHeadIcon head={head} end={end} />
        </IconButton>
      ))}
    </div>
  )
}
