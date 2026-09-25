import type { SiteStringKey } from './i18n/site-strings'

export const topics = [
  { id: 'overview', group: 'start', minutes: 2 },
  { id: 'installation', group: 'start', minutes: 4 },
  { id: 'quick-start', group: 'start', minutes: 5 },
  { id: 'examples', group: 'start', minutes: 3 },
  { id: 'canvas', group: 'create', minutes: 2 },
  { id: 'editing', group: 'create', minutes: 4 },
  { id: 'media', group: 'create', minutes: 4 },
  { id: 'ai', group: 'create', minutes: 3 },
  { id: 'frames', group: 'create', minutes: 3 },
  { id: 'sharing', group: 'create', minutes: 3 },
  { id: 'shortcuts', group: 'reference', minutes: 2 },
  { id: 'faq', group: 'reference', minutes: 3 }
] as const

export type Topic = (typeof topics)[number]
export type TopicId = Topic['id']
export const topicTitle = (id: TopicId): SiteStringKey => `site.docs.${id}.title`
export const topicSummary = (id: TopicId): SiteStringKey => `site.docs.${id}.summary`

export const topicGroups = [
  { id: 'start', title: 'site.docs.startGroup' },
  { id: 'create', title: 'site.docs.createGroup' },
  { id: 'reference', title: 'site.docs.referenceGroup' }
] as const

export function currentTopic(): Topic {
  const requested = new URLSearchParams(location.search).get('guide')
  return topics.find((topic) => topic.id === requested) ?? topics[0]
}
