import { describe, expect, it } from 'vitest'
import { stringTableProblems } from './string-table-checks'
import { createTranslator, interpolate, type Locale } from './translator'

const tables = {
  en: { hello: 'Hello, {name}', 'item.one': '{n} item', 'item.other': '{n} items' },
  ko: { hello: '{name}님, 안녕하세요', 'item.one': '항목 {n}개', 'item.other': '항목 {n}개' }
}

describe('interpolate', () => {
  it('fills named params and leaves unknown placeholders intact', () => {
    expect(interpolate('{a} and {b}', { a: 1, b: 'x' })).toBe('1 and x')
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}')
    expect(interpolate('plain')).toBe('plain')
  })
})

describe('createTranslator', () => {
  it('reads the locale on every call', () => {
    let locale: Locale = 'en'
    const { t } = createTranslator(tables, () => locale)
    expect(t('hello', { name: 'Ada' })).toBe('Hello, Ada')
    locale = 'ko'
    expect(t('hello', { name: 'Ada' })).toBe('Ada님, 안녕하세요')
  })

  it('picks .one for exactly one and .other otherwise', () => {
    const { tn } = createTranslator(tables, () => 'en')
    expect(tn('item', 1)).toBe('1 item')
    expect(tn('item', 0)).toBe('0 items')
    expect(tn('item', 2)).toBe('2 items')
  })
})

describe('stringTableProblems', () => {
  it('reports empty values, placeholder drift and unpaired plurals', () => {
    expect(stringTableProblems(tables)).toEqual([])
    expect(
      stringTableProblems({
        en: { a: 'Hi {name}', 'b.one': 'one', c: '', d: '{size} left' },
        ko: { a: ' ', 'b.one': '하나', c: '다', d: '{sz} 남음' }
      })
    ).toEqual([
      'en:c is empty',
      'ko:a is empty',
      'ko:a has placeholders that differ from English',
      'ko:d has placeholders that differ from English',
      'b.one has no .other form'
    ])
  })
})
