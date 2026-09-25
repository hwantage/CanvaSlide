import { useMemo } from 'react'
import { connectorMidpoint, hostsOf } from '@shared/canvas/connector-geometry'
import { connectorDrawing } from '@shared/canvas/connector-markers'
import {
  defaultTextStyle,
  type ConnectorElement as ConnectorElementModel
} from '@shared/canvas/element-types'
import { connectorLabelCss, connectorPaths } from '@shared/canvas/element-style'
import { connectorCanvasRect } from '@shared/canvas/shape-svg'
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
  const { line, markers } = connectorPaths(element, drawing)
  const mid = connectorMidpoint(element, hosts)
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
        <path data-testid="connector-path" data-route={drawing.route} {...line} />
        {markers.map((marker, index) => (
          <path key={index} data-testid="connector-marker" {...marker} />
        ))}
      </svg>
      {hasLabel && (
        <div style={connectorLabelCss(mid, box, element.textStyle.fontSize)}>
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
