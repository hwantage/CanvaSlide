import type { ShapeElement as ShapeElementModel } from '@shared/canvas/element-types'
import { EditableText } from './editable-text'

function ShapePath({ element }: { element: ShapeElementModel }) {
  const { width: w, height: h, style } = element
  const inset = style.strokeWidth / 2
  const common = {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth
  }
  switch (element.shape) {
    case 'rectangle':
      return (
        <rect
          x={inset}
          y={inset}
          width={Math.max(0, w - inset * 2)}
          height={Math.max(0, h - inset * 2)}
          rx={style.cornerRadius}
          {...common}
        />
      )
    case 'ellipse':
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - inset} ry={h / 2 - inset} {...common} />
    case 'diamond':
      return (
        <polygon
          points={`${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`}
          strokeLinejoin="round"
          {...common}
        />
      )
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
