import {
  ArrowRight,
  Circle,
  Diamond,
  Frame,
  Hand,
  ImagePlus,
  Video,
  MousePointer2,
  Square,
  Triangle,
  Type
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { VideoUrlDialog } from '@/components/panels/video-url-dialog'
import { ConnectorHeadPicker, connectorRouteOptions } from '@/components/ui/connector-options'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { importPickedFiles } from '@/lib/external-content'
import { shortcutLabel } from '@/lib/platform-keys'
import { useStyleMemoryStore } from '@/store/style-memory-store'
import { selectTool, useToolStore, type ToolId } from '@/store/tool-store'

const tools: { id: ToolId; label: UiStringKey; key?: string; icon: ReactNode }[] = [
  { id: 'select', label: 'tool.select', key: 'V', icon: <MousePointer2 size={16} /> },
  { id: 'hand', label: 'tool.hand', key: 'H', icon: <Hand size={16} /> },
  { id: 'text', label: 'tool.text', key: 'T', icon: <Type size={16} /> },
  { id: 'rectangle', label: 'tool.rectangle', key: 'R', icon: <Square size={16} /> },
  { id: 'ellipse', label: 'tool.ellipse', key: 'O', icon: <Circle size={16} /> },
  { id: 'diamond', label: 'tool.diamond', key: 'D', icon: <Diamond size={16} /> },
  { id: 'triangle', label: 'tool.triangle', icon: <Triangle size={16} /> },
  { id: 'frame', label: 'tool.frame', key: 'F', icon: <Frame size={16} /> },
  { id: 'connector', label: 'tool.connector', key: 'L', icon: <ArrowRight size={16} /> }
]

/** Sub-options for the connector tool: route shape and end markers for the next line drawn. */
function ConnectorFlyout() {
  const preset = useToolStore((s) => s.connectorPreset)
  const setPreset = useToolStore((s) => s.setConnectorPreset)
  const heads = useStyleMemoryStore((s) => s.memory.connectorHeads)
  const setHeads = useStyleMemoryStore((s) => s.setConnectorHeads)
  return (
    <div
      data-testid="connector-flyout"
      className="tool-flyout absolute left-full top-0 ml-2 flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <div className="flex gap-0.5">
        {connectorRouteOptions.map(({ value, label, icon: Icon }) => (
          <IconButton
            key={value}
            label={t(label)}
            active={preset.route === value}
            onClick={() => setPreset({ route: value })}
          >
            <Icon size={14} />
          </IconButton>
        ))}
      </div>
      <div className="h-px bg-border" />
      <ConnectorHeadPicker
        end="start"
        value={heads.startHead}
        onChange={(startHead) => setHeads({ startHead })}
      />
      <ConnectorHeadPicker
        end="end"
        value={heads.endHead}
        onChange={(endHead) => setHeads({ endHead })}
      />
    </div>
  )
}

export function ToolBar() {
  const [videoDialog, setVideoDialog] = useState(false)
  const active = useToolStore(selectTool)
  const setTool = useToolStore((s) => s.setTool)
  return (
    <div className="editor-tool-bar relative flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-md">
      {tools.map((tool) => (
        <IconButton
          key={tool.id}
          label={tool.key ? `${t(tool.label)} (${tool.key})` : t(tool.label)}
          active={active === tool.id}
          onClick={() => setTool(tool.id)}
        >
          {tool.icon}
        </IconButton>
      ))}
      <div className="my-0.5 h-px bg-border" />
      <IconButton
        label={`${t('import.files')} (${shortcutLabel('I')})`}
        data-testid="import-files"
        onClick={() => void importPickedFiles()}
      >
        <ImagePlus size={16} />
      </IconButton>
      <IconButton label={t('video.insert')} onClick={() => setVideoDialog(true)}>
        <Video size={16} />
      </IconButton>
      {videoDialog && <VideoUrlDialog onClose={() => setVideoDialog(false)} />}
      {active === 'connector' && <ConnectorFlyout />}
    </div>
  )
}
