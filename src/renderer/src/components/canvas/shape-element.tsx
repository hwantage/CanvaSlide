import type { ShapeElement as ShapeElementModel } from '@shared/canvas/element-types'
import { rotationCss, shapeLabelCss, shapePaint } from '@shared/canvas/element-style'
import { shapeGeometry } from '@shared/canvas/shape-svg'
import { EditableText } from './editable-text'

function ShapePath({ element }: { element: ShapeElementModel }) {
  const paint = shapePaint(element)
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
      return <polygon points={geometry.points} {...paint} />
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
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        ...rotationCss(element)
      }}
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
        <div style={shapeLabelCss(element)}>
          <EditableText
            elementId={element.id}
            text={element.text}
            style={element.textStyle}
            editing={editing}
            placeholder=""
          />
        </div>
      )}
    </div>
  )
}
