import { useMemo } from 'react'
import { connectorMidpoint, connectorPath } from '@shared/canvas/connector-geometry'
import { elementRect } from '@shared/canvas/element-bounds'
import type { ConnectorElement as ConnectorElementModel } from '@shared/canvas/element-types'
import {
  ARROW_MARKER,
  arrowMarkerSize,
  connectorCanvasRect,
  connectorDashArray
} from '@shared/canvas/shape-svg'
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
  const obstacles = useMemo(
    () => [startHost, endHost].flatMap((host) => (host ? [elementRect(host)] : [])),
    [startHost, endHost]
  )
  const { d } = connectorPath(element, obstacles)
  const mid = connectorMidpoint(element, obstacles)
  const { stroke, strokeWidth } = element.style
  const head = arrowMarkerSize(element)
  const markerId = `uc-arrow-end-${element.id}`
  const box = connectorCanvasRect(element)
  const hasLabel = editing || element.label !== ''
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
        <defs>
          <marker
            id={markerId}
            viewBox={ARROW_MARKER.viewBox}
            refX={ARROW_MARKER.refX}
            refY={ARROW_MARKER.refY}
            markerUnits="userSpaceOnUse"
            markerWidth={head}
            markerHeight={head}
            orient={ARROW_MARKER.orient}
          >
            <path d={ARROW_MARKER.path} fill={stroke} />
          </marker>
        </defs>
        <path
          data-testid="connector-path"
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={connectorDashArray(element)}
          markerStart={element.startHead === 'arrow' ? `url(#${markerId})` : undefined}
          markerEnd={element.endHead === 'arrow' ? `url(#${markerId})` : undefined}
        />
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
            style={element.textStyle}
            editing={editing}
            placeholder={t('connector.labelPlaceholder')}
            textField="label"
          />
        </div>
      )}
    </div>
  )
}
