import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  X
} from 'lucide-react'
import { t } from './i18n/site-strings'
import { repositoryUrl, siteHref, useSitePreferences } from './site-preferences'
import { currentTopic, topics, topicGroups, topicSummary, topicTitle } from './docs-topics'
import { docSections } from './docs-sections'
import { DocsExtra } from './docs-extras'
import { updateMetadata } from './site-metadata'

export function Documentation() {
  const locale = useSitePreferences((s) => s.locale)
  const topic = currentTopic()
  const sections = docSections(topic.id)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const matches = topics.filter((item) => {
    const text = [
      t(topicTitle(item.id)),
      t(topicSummary(item.id)),
      ...docSections(item.id).flatMap((section) => [t(section.heading), t(section.body)])
    ]
      .join(' ')
      .toLocaleLowerCase()
    return text.includes(query.trim().toLocaleLowerCase())
  })
  const index = topics.findIndex((item) => item.id === topic.id)
  const previous = topics[index - 1]
  const next = topics[index + 1]

  useEffect(() => {
    const title = `${t(topicTitle(topic.id))} — CanvaSlide ${t('site.docs.title')}`
    const description = t(topicSummary(topic.id))
    const image =
      topic.id === 'overview'
        ? 'images/editor.png'
        : topic.id === 'frames'
          ? 'images/present.png'
          : undefined
    updateMetadata(title, description, `docs/?guide=${topic.id}&lang=${locale}`, image)
  }, [locale, topic.id])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.key === '/' &&
        !(
          target instanceof HTMLElement &&
          (target.matches('input, textarea, select') || target.isContentEditable)
        )
      ) {
        event.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    if (location.hash) {
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView())
    }
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <main id="main" className="docs-layout container">
      <aside className="docs-sidebar">
        <a className="docs-sidebar-title" href={siteHref('docs/')}>
          <BookOpen size={17} />
          {t('site.docs.title')}
        </a>
        <div className="docs-search">
          <Search size={15} />
          <input
            type="search"
            ref={search}
            value={query}
            placeholder={t('site.docs.search')}
            aria-label={t('site.docs.searchLabel')}
            onChange={(event) => {
              setQuery(event.target.value)
              setExpanded(true)
            }}
          />
          {query ? (
            <button
              type="button"
              aria-label={t('site.docs.clear')}
              onClick={() => {
                setQuery('')
                search.current?.focus()
              }}
            >
              <X size={13} />
            </button>
          ) : (
            <kbd aria-hidden="true">/</kbd>
          )}
        </div>
        <button
          type="button"
          className="docs-browse-toggle"
          aria-expanded={expanded}
          aria-controls="docs-navigation"
          onClick={() => setExpanded(!expanded)}
        >
          {t('site.docs.browse')}
          <ChevronDown size={16} />
        </button>
        <nav
          id="docs-navigation"
          className={expanded ? 'expanded' : ''}
          aria-label={t('site.docs.browse')}
        >
          {topicGroups.map((group) => {
            const items = matches.filter((item) => item.group === group.id)
            if (!items.length) {
              return null
            }
            return (
              <div className="docs-nav-group" key={group.id}>
                <h2>{t(group.title)}</h2>
                {items.map((item) => (
                  <a
                    key={item.id}
                    href={siteHref('docs/', item.id)}
                    aria-current={item.id === topic.id ? 'page' : undefined}
                  >
                    {t(topicTitle(item.id))}
                    {item.id === topic.id && <ChevronRight size={13} />}
                  </a>
                ))}
              </div>
            )
          })}
          {matches.length === 0 && (
            <p className="search-empty" role="status">
              {t('site.docs.empty')}
            </p>
          )}
        </nav>
      </aside>
      <article className={`doc-article ${topic.id === 'quick-start' ? 'quick-start-article' : ''}`}>
        <div className="doc-breadcrumb">
          <a href={siteHref('docs/')}>{t('site.docs.title')}</a>
          <ChevronRight size={12} />
          <span>{t(topicTitle(topic.id))}</span>
        </div>
        <header className="doc-heading">
          <h1>{topic.id === 'overview' ? t('site.docs.intro') : t(topicTitle(topic.id))}</h1>
          <p>{topic.id === 'overview' ? t('site.docs.description') : t(topicSummary(topic.id))}</p>
          <span className="reading-time">{t('site.docs.time', { minutes: topic.minutes })}</span>
        </header>
        {topic.id === 'overview' && (
          <div className="docs-start-links">
            {(['installation', 'quick-start'] as const).map((id) => (
              <a key={id} href={siteHref('docs/', id)}>
                <span>
                  <strong>{t(topicTitle(id))}</strong>
                  <small>{t(topicSummary(id))}</small>
                </span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </div>
        )}
        {sections.map((section, position) => (
          <section className="doc-section" key={section.id} id={section.id}>
            <h2>
              {topic.id === 'quick-start' && (
                <span className="instruction-number">{position + 1}</span>
              )}
              {t(section.heading)}
            </h2>
            <p>{t(section.body, section.params)}</p>
            <DocsExtra topic={topic.id} section={section.id} />
          </section>
        ))}
        <nav className="doc-pagination" aria-label={t('site.docs.browse')}>
          {previous ? (
            <a href={siteHref('docs/', previous.id)}>
              <ArrowLeft size={16} />
              <span>
                <small>{t('site.docs.previous')}</small>
                <strong>{t(topicTitle(previous.id))}</strong>
              </span>
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a className="next-guide" href={siteHref('docs/', next.id)}>
              <span>
                <small>{t('site.docs.next')}</small>
                <strong>{t(topicTitle(next.id))}</strong>
              </span>
              <ArrowRight size={16} />
            </a>
          )}
        </nav>
        <a
          className="docs-feedback"
          href={`${repositoryUrl}/issues/new`}
          target="_blank"
          rel="noreferrer"
        >
          {t('site.docs.edit')}
          <ArrowUpRight size={13} />
        </a>
      </article>
      <aside className="docs-toc">
        <p>{t('site.docs.onPage')}</p>
        <nav aria-label={t('site.docs.onPage')}>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {t(section.heading)}
            </a>
          ))}
        </nav>
      </aside>
    </main>
  )
}
