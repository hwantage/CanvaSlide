import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, Info } from 'lucide-react'
import { t, type UiStringKey } from '@app/i18n/ui-strings'
import { isMacPlatform, shortcutLabel, shiftLabel } from '@app/lib/platform-keys'
import { asset, repositoryUrl, siteHref } from './site-preferences'
import type { TopicId } from './docs-topics'
import { exampleEditorUrl, webAppUrl } from './example-links'
import { DocsAiPrompt } from './docs-ai-prompt'

export function CommandBlock({ command }: { command: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeout = useRef(0)
  useEffect(() => () => window.clearTimeout(timeout.current), [])
  return (
    <div className="command-block">
      <button
        type="button"
        className="icon-button"
        aria-label={t(status === 'copied' ? 'site.docs.copied' : 'site.docs.copy')}
        onClick={async () => {
          window.clearTimeout(timeout.current)
          try {
            await navigator.clipboard.writeText(command)
            setStatus('copied')
          } catch {
            setStatus('failed')
          }
          timeout.current = window.setTimeout(() => setStatus('idle'), 3000)
        }}
      >
        {status === 'copied' ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <pre>
        <code>{command}</code>
      </pre>
      <span className="copy-status" role="status">
        {status === 'idle'
          ? ''
          : t(status === 'copied' ? 'site.docs.copied' : 'site.docs.copyFailed')}
      </span>
    </div>
  )
}

function InstallPlatforms() {
  const [platform, setPlatform] = useState(isMacPlatform() ? 'mac' : 'windows')
  return (
    <>
      <aside className="docs-callout">
        <Info size={18} />
        <p>{t('site.download.pending')}</p>
      </aside>
      <div className="install-platforms">
        <div className="platform-tabs" role="group" aria-label={t('site.docs.installation.title')}>
          <button
            type="button"
            aria-pressed={platform === 'mac'}
            onClick={() => setPlatform('mac')}
          >
            macOS
          </button>
          <button
            type="button"
            aria-pressed={platform === 'windows'}
            onClick={() => setPlatform('windows')}
          >
            Windows
          </button>
        </div>
        <p>
          {platform === 'mac'
            ? t('site.docs.install.macBody', { dmg: '.dmg', platform: 'macOS', version: '12' })
            : t('site.docs.install.windowsBody', { exe: '.exe', msi: '.msi' })}
        </p>
        <a
          className="text-button"
          href={`${repositoryUrl}/releases`}
          target="_blank"
          rel="noreferrer"
        >
          {t('site.download.releases')}
          <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  )
}

function ShortcutsTable() {
  const p = shortcutLabel
  const rows: [UiStringKey, string][] = [
    ['site.docs.shortcuts.new', p('N')],
    ['site.docs.shortcuts.open', p('O')],
    ['site.docs.shortcuts.save', p('S')],
    ['site.docs.shortcuts.saveAs', p('S', { shift: true })],
    ['site.docs.shortcuts.export', p('E')],
    ['site.docs.shortcuts.present', `${p('Enter')} / F5`],
    ['site.docs.shortcuts.copy', `${p('C')} / ${p('V')}`],
    ['site.docs.shortcuts.duplicate', p('D')],
    ['site.docs.shortcuts.undo', p('Z')],
    ['site.docs.shortcuts.select', 'V / H'],
    ['site.docs.shortcuts.text', 'T / R / O / D'],
    ['site.docs.shortcuts.frame', 'F / L'],
    ['site.docs.shortcuts.fit', `${shiftLabel()}1`],
    ['site.docs.shortcuts.zoom', `${p('+')} / ${p('−')}`],
    ['site.docs.shortcuts.next', '→ / ←'],
    ['site.docs.shortcuts.exit', 'Esc']
  ]
  return (
    <div className="shortcut-table">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('site.docs.shortcuts.action')}</th>
            <th scope="col">{t('site.docs.shortcuts.keys')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([title, shortcut]) => (
            <tr key={title}>
              <td>{t(title)}</td>
              <td>
                <kbd>{shortcut}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DocsExtra({ topic, section }: { topic: TopicId; section: string }) {
  if (topic === 'examples' && section === 'open-an-example') {
    return (
      <a className="button" href={siteHref('showcase/')}>
        {t('site.showcase.browse')}
        <ArrowUpRight size={16} />
      </a>
    )
  }
  if (topic === 'examples' && section === 'direct-links') {
    return (
      <a
        className="doc-text-link"
        href={exampleEditorUrl('one-order')}
        target="_blank"
        rel="noreferrer"
      >
        {exampleEditorUrl('one-order')}
        <ArrowUpRight size={14} />
      </a>
    )
  }
  if (topic === 'media' && section === 'figma') {
    return (
      <a
        className="doc-text-link"
        href={`${repositoryUrl}/blob/main/docs/FIGMA-IMPORT.md`}
        target="_blank"
        rel="noreferrer"
      >
        {t('site.docs.media.details')}
        <ArrowUpRight size={14} />
      </a>
    )
  }
  if (topic === 'ai' && section === 'create-with-ai') {
    return <DocsAiPrompt />
  }
  if (topic === 'ai' && section === 'open-the-result') {
    return (
      <div className="prompt-actions">
        <a className="button" href={webAppUrl} target="_blank" rel="noreferrer">
          {t('site.hero.editor')}
          <ArrowUpRight size={16} />
        </a>
        <a
          className="doc-text-link"
          href={`${repositoryUrl}/blob/main/examples/README.md#authoring-with-ai`}
          target="_blank"
          rel="noreferrer"
        >
          {t('site.docs.ai.guide')}
          <ArrowUpRight size={14} />
        </a>
      </div>
    )
  }
  if (topic === 'installation') {
    if (section === 'desktop-app') {
      return <InstallPlatforms />
    }
    if (section === 'build-from-source') {
      return (
        <>
          <a
            className="doc-text-link"
            href="https://v2.tauri.app/start/prerequisites/"
            target="_blank"
            rel="noreferrer"
          >
            {t('site.docs.install.prerequisites')}
            <ArrowUpRight size={14} />
          </a>
          <CommandBlock
            command={
              'git clone https://github.com/hwantage/CanvaSlide.git\ncd CanvaSlide\npnpm install\npnpm dev'
            }
          />
        </>
      )
    }
    return <CommandBlock command="pnpm bundle:local" />
  }
  if (topic === 'overview' && section === 'the-canvas') {
    return (
      <figure className="doc-image">
        <img
          src={asset('images/editor.png')}
          width="1440"
          height="900"
          alt={t('site.screenshot.editor')}
        />
        <figcaption>{t('site.screenshot.editor')}</figcaption>
      </figure>
    )
  }
  if (topic === 'overview' && section === 'your-first-story') {
    return (
      <a className="button" href={siteHref('docs/', 'quick-start')}>
        {t('site.docs.quick-start.title')}
        <ArrowUpRight size={16} />
      </a>
    )
  }
  if (topic === 'frames' && section === 'slideshow') {
    return (
      <figure className="doc-image">
        <img
          src={asset('images/present.png')}
          width="1440"
          height="900"
          loading="lazy"
          alt={t('site.screenshot.present')}
        />
      </figure>
    )
  }
  if (topic === 'sharing' && section === 'play-anywhere') {
    return (
      <aside className="docs-callout">
        <Info size={18} />
        <p>{t('site.docs.sharing.tip')}</p>
      </aside>
    )
  }
  if (topic === 'shortcuts') {
    return <ShortcutsTable />
  }
  if (topic === 'faq' && section === 'report-a-problem') {
    return (
      <a
        className="doc-text-link"
        href={`${repositoryUrl}/issues`}
        target="_blank"
        rel="noreferrer"
      >
        {t('site.footer.issues')}
        <ArrowUpRight size={14} />
      </a>
    )
  }
  return null
}
