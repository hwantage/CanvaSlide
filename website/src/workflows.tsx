import { ArrowUpRight, Focus, Import, Link, Sparkles } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import { siteHref } from './site-preferences'

const workflows = [
  { id: 'motion', icon: Focus, guide: 'frames', anchor: 'camera-direction' },
  { id: 'import', icon: Import, guide: 'media', anchor: 'figma' },
  { id: 'share', icon: Link, guide: 'sharing', anchor: 'cloud-links' },
  { id: 'ai', icon: Sparkles, guide: 'ai', anchor: 'create-with-ai' }
] as const

export function Workflows() {
  return (
    <section className="workflow-section container" aria-labelledby="workflow-title">
      <div className="section-heading">
        <h2 id="workflow-title">{t('site.workflows.title')}</h2>
        <p>{t('site.workflows.description')}</p>
      </div>
      <div className="workflow-list">
        {workflows.map(({ id, icon: Icon, guide, anchor }) => (
          <a key={id} href={`${siteHref('docs/', guide)}#${anchor}`}>
            <Icon size={24} strokeWidth={1.5} />
            <div>
              <h3>{t(`site.workflows.${id}.title`)}</h3>
              <p>{t(`site.workflows.${id}.body`, { design: 'Figma', pdf: 'PDF', html: 'HTML' })}</p>
            </div>
            <ArrowUpRight size={20} />
          </a>
        ))}
      </div>
    </section>
  )
}
