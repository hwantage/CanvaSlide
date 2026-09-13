import { useMemo } from 'react'
import { arrowHeadSize, connectorMidpoint, connectorPath } from '@shared/canvas/connector-geometry'
import { elementRect } from '@shared/canvas/element-bounds'
import type { ConnectorElement as ConnectorElementModel } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'
import { EditableText } from './editable-text'

/** Padding around the bounding box so arrowheads and thick strokes are never clipped. */
const PAD = 24

export function connectorMarkerId(id: string, which: 'start' | 'end'): string {
  return `uc-arrow-${which}-${id}`
}

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
  const { stroke, strokeWidth, dashed } = element.style
  const head = arrowHeadSize(strokeWidth)
  const hasLabel = editing || element.label !== ''
  return (
    <div
      className="absolute"
      data-element-id={element.id}
      data-element-type="connector"
      style={{
        left: element.x - PAD,
        top: element.y - PAD,
        width: element.width + PAD * 2,
        height: element.height + PAD * 2
      }}
    >
      <svg
        className="absolute inset-0 overflow-visible"
        width={element.width + PAD * 2}
        height={element.height + PAD * 2}
        viewBox={`${element.x - PAD} ${element.y - PAD} ${element.width + PAD * 2} ${element.height + PAD * 2}`}
      >
        <defs>
          <marker
            id={connectorMarkerId(element.id, 'end')}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={head}
            markerHeight={head}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
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
          strokeDasharray={dashed ? `${strokeWidth * 3} ${strokeWidth * 2}` : undefined}
          markerStart={
            element.startHead === 'arrow'
              ? `url(#${connectorMarkerId(element.id, 'end')})`
              : undefined
          }
          markerEnd={
            element.endHead === 'arrow'
              ? `url(#${connectorMarkerId(element.id, 'end')})`
              : undefined
          }
        />
      </svg>
      {hasLabel && (
        <div
          className="absolute min-w-6 max-w-64 rounded bg-canvas px-1.5 py-0.5"
          style={{
            left: mid.x - (element.x - PAD),
            top: mid.y - (element.y - PAD),
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
