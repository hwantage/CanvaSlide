import { afterEach, describe, expect, it } from 'vitest'
import { en } from './locales/en'
import { ko } from './locales/ko'
import {
  currentLocale,
  detectLocale,
  interpolate,
  locales,
  setLocale,
  t,
  tn,
  type UiStringKey
} from './ui-strings'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

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
  it('have no empty values', () => {
    for (const [name, strings] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(strings)) {
        expect(value.trim(), `${name}:${key}`).not.toBe('')
      }
    }
  })

  it('use the same placeholders as English for every key', () => {
    for (const key of Object.keys(en) as UiStringKey[]) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('pair every plural .one key with .other', () => {
    for (const key of Object.keys(en)) {
      if (key.endsWith('.one')) {
        expect(en).toHaveProperty(key.replace(/\.one$/, '.other'))
      }
    }
  })
})

describe('t / tn', () => {
  afterEach(() => setLocale('en'))

  it('interpolates named params and leaves unknown placeholders intact', () => {
    expect(interpolate('{a} and {b}', { a: 1, b: 'x' })).toBe('1 and x')
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}')
    expect(interpolate('plain')).toBe('plain')
  })

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
})
