import { useMemo } from 'react'
import { connectorMidpoint, hostsOf } from '@shared/canvas/connector-geometry'
import { connectorDrawing } from '@shared/canvas/connector-markers'
import {
  defaultTextStyle,
  type ConnectorElement as ConnectorElementModel
} from '@shared/canvas/element-types'
import { connectorCanvasRect, connectorDashArray } from '@shared/canvas/shape-svg'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'
import { EditableText } from './editable-text'

export function ConnectorElement({
  element,
  editing
}: {
  element: ConnectorElementModel
  editing: boolean
}) {
  // Why: subscribe to the two hosts by reference; a selector returning a fresh array would loop.
  const startHost = useDocumentStore((s) =>
    element.start.elementId ? s.document.elements[element.start.elementId] : undefined
  )
  const endHost = useDocumentStore((s) =>
    element.end.elementId ? s.document.elements[element.end.elementId] : undefined
  )
  const hosts = useMemo(() => hostsOf(startHost, endHost), [startHost, endHost])
  const drawing = connectorDrawing(element, hosts)
  const mid = connectorMidpoint(element, hosts)
  const { stroke, strokeWidth } = element.style
  const box = connectorCanvasRect(element)
  const hasLabel = editing || element.label !== ''
  // Labels sit on a themed surface; resolve the default ink without changing saved colours.
  const labelStyle = {
    ...element.textStyle,
    color:
      element.textStyle.color.toLowerCase() === defaultTextStyle.color
        ? 'var(--foreground)'
        : element.textStyle.color
  }
  return (
    <div
      className="absolute"
      data-element-id={element.id}
      data-element-type="connector"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <svg
        className="absolute inset-0 overflow-visible"
        width={box.width}
        height={box.height}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      >
        <path
          data-testid="connector-path"
          data-route={drawing.route}
          d={drawing.d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={connectorDashArray(element)}
        />
        {drawing.markers.map((marker, index) => (
          <path
            key={index}
            data-testid="connector-marker"
            d={marker.d}
            fill={marker.filled ? stroke : 'none'}
            stroke={marker.filled ? undefined : stroke}
            strokeWidth={marker.filled ? undefined : strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {hasLabel && (
        <div
          className="absolute min-w-6 max-w-64 rounded bg-canvas px-1.5 py-0.5"
          style={{
            left: mid.x - box.x,
            top: mid.y - box.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <EditableText
            elementId={element.id}
            text={element.label}
            style={labelStyle}
            editing={editing}
            placeholder={t('connector.labelPlaceholder')}
            textField="label"
          />
        </div>
      )}
    </div>
  )
}
