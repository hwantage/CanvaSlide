import type { ShapeElement as ShapeElementModel } from '@shared/canvas/element-types'
import { shapeGeometry } from '@shared/canvas/shape-svg'
import { EditableText } from './editable-text'

function ShapePath({ element }: { element: ShapeElementModel }) {
  const { style } = element
  const paint = { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth }
  const geometry = shapeGeometry(element)
  switch (geometry.tag) {
    case 'rect': {
      const { tag: _tag, ...rect } = geometry
      return <rect {...rect} {...paint} />
    }
    case 'ellipse': {
      const { tag: _tag, ...ellipse } = geometry
      return <ellipse {...ellipse} {...paint} />
    }
    case 'polygon':
      return <polygon points={geometry.points} strokeLinejoin="round" {...paint} />
  }
}

export function ShapeElement({
  element,
  editing
}: {
  element: ShapeElementModel
  editing: boolean
}) {
  const hasLabel = editing || element.text !== ''
  return (
    <div
      className="absolute"
      data-element-id={element.id}
      data-element-type="shape"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    >
      <svg
        className="absolute inset-0 overflow-visible"
        width={element.width}
        height={element.height}
        viewBox={`0 0 ${element.width} ${element.height}`}
      >
        <ShapePath element={element} />
      </svg>
      {hasLabel && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <EditableText
            elementId={element.id}
            text={element.text}
            style={element.textStyle}
            editing={editing}
            placeholder=""
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
