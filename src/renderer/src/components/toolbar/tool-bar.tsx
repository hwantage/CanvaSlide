import {
  ArrowRight,
  ArrowRightLeft,
  Circle,
  CornerDownRight,
  Diamond,
  Frame,
  Hand,
  Minus,
  MousePointer2,
  Spline,
  Square,
  TrendingUp,
  Type
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ArrowHead, ConnectorRoute } from '@shared/canvas/element-types'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { selectTool, useToolStore, type ToolId } from '@/store/tool-store'

const tools: { id: ToolId; label: UiStringKey; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'tool.select', key: 'V', icon: <MousePointer2 size={16} /> },
  { id: 'hand', label: 'tool.hand', key: 'H', icon: <Hand size={16} /> },
  { id: 'text', label: 'tool.text', key: 'T', icon: <Type size={16} /> },
  { id: 'rectangle', label: 'tool.rectangle', key: 'R', icon: <Square size={16} /> },
  { id: 'ellipse', label: 'tool.ellipse', key: 'O', icon: <Circle size={16} /> },
  { id: 'diamond', label: 'tool.diamond', key: 'D', icon: <Diamond size={16} /> },
  { id: 'frame', label: 'tool.frame', key: 'F', icon: <Frame size={16} /> },
  { id: 'connector', label: 'tool.connector', key: 'L', icon: <ArrowRight size={16} /> }
]

const routes: { value: ConnectorRoute; label: UiStringKey; icon: ReactNode }[] = [
  { value: 'straight', label: 'connector.route.straight', icon: <TrendingUp size={14} /> },
  { value: 'orthogonal', label: 'connector.route.orthogonal', icon: <CornerDownRight size={14} /> },
  { value: 'curved', label: 'connector.route.curved', icon: <Spline size={14} /> }
]

const heads: { value: [ArrowHead, ArrowHead]; label: UiStringKey; icon: ReactNode }[] = [
  { value: ['none', 'none'], label: 'connector.ends.line', icon: <Minus size={14} /> },
  { value: ['none', 'arrow'], label: 'connector.ends.arrow', icon: <ArrowRight size={14} /> },
  {
    value: ['arrow', 'arrow'],
    label: 'connector.ends.doubleArrow',
    icon: <ArrowRightLeft size={14} />
  }
]

/** Sub-options for the connector tool: route shape and arrowheads for the next line drawn. */
function ConnectorFlyout() {
  const preset = useToolStore((s) => s.connectorPreset)
  const setPreset = useToolStore((s) => s.setConnectorPreset)
  return (
    <div
      data-testid="connector-flyout"
      className="absolute left-full top-0 ml-2 flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <div className="flex gap-0.5">
        {routes.map((route) => (
          <IconButton
            key={route.value}
            label={t(route.label)}
            active={preset.route === route.value}
            onClick={() => setPreset({ route: route.value })}
          >
            {route.icon}
          </IconButton>
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="flex gap-0.5">
        {heads.map((head) => (
          <IconButton
            key={head.label}
            label={t(head.label)}
            active={preset.startHead === head.value[0] && preset.endHead === head.value[1]}
            onClick={() => setPreset({ startHead: head.value[0], endHead: head.value[1] })}
          >
            {head.icon}
          </IconButton>
        ))}
      </div>
    </div>
  )
}

export function ToolBar() {
  const active = useToolStore(selectTool)
  const setTool = useToolStore((s) => s.setTool)
  return (
    <div className="relative flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-md">
      {tools.map((tool) => (
        <IconButton
          key={tool.id}
          label={`${t(tool.label)} (${tool.key})`}
          active={active === tool.id}
          onClick={() => setTool(tool.id)}
        >
          {tool.icon}
        </IconButton>
      ))}
      {active === 'connector' && <ConnectorFlyout />}
    </div>
  )
}
