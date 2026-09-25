import { afterEach, describe, expect, it } from 'vitest'
import { stringTableProblems } from './string-table-checks'
import { currentLocale, detectLocale, locales, setLocale, t, tn, uiStringsIn } from './ui-strings'

describe('detectLocale', () => {
  it('maps Korean tags to ko and everything else to en', () => {
    expect(detectLocale('ko')).toBe('ko')
    expect(detectLocale('ko-KR')).toBe('ko')
    expect(detectLocale('KO-kr')).toBe('ko')
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('ja-JP')).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
    expect(detectLocale('')).toBe('en')
  })
})

describe('locales', () => {
  it('have no empty values, English placeholders and paired plurals', () => {
    expect(stringTableProblems(locales)).toEqual([])
  })

  it('leave website copy to the website tables', () => {
    const websiteKeys = Object.values(locales).flatMap((strings) =>
      Object.keys(strings).filter((key) => key.startsWith('site.'))
    )
    expect(websiteKeys).toEqual([])
  })
})

describe('t / tn', () => {
  afterEach(() => setLocale('en'))

  it('reads from the active locale', () => {
    setLocale('en')
    expect(currentLocale()).toBe('en')
    expect(t('file.save')).toBe('Save')
    setLocale('ko')
    expect(t('file.save')).toBe('저장')
  })

  it('selects singular and plural forms', () => {
    setLocale('en')
    expect(tn('export.frames', 1)).toBe('1 frame')
    expect(tn('export.frames', 0)).toBe('0 frames')
    expect(tn('selection.count', 2)).toBe('2 elements')
    setLocale('ko')
    expect(tn('selection.count', 2)).toBe('요소 2개')
  })

  it('keeps a fixed language for a host with its own language setting', () => {
    setLocale('en')
    expect(uiStringsIn('ko').t('file.save')).toBe('저장')
    expect(uiStringsIn('ko').tn('selection.count', 2)).toBe('요소 2개')
    setLocale('ko')
    expect(uiStringsIn('en').t('file.save')).toBe('Save')
    expect(uiStringsIn('en').tn('export.frames', 1)).toBe('1 frame')
  })
})
