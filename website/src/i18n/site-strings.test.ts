import { describe, expect, it } from 'vitest'
import { stringTableProblems } from '@app/i18n/string-table-checks'
import { en } from './locales/en'
import { ko } from './locales/ko'

describe('website strings', () => {
  it('have no empty values, English placeholders and paired plurals', () => {
    expect(stringTableProblems({ en, ko })).toEqual([])
  })
})
