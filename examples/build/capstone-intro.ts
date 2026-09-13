import type { DocBuilder } from './builder.ts'
import {
  brand,
  brandMid,
  brandSoft,
  bullets,
  card,
  ink,
  mutedC,
  para,
  rowLabel,
  slate,
  slide,
  stat,
  teal,
  title,
  W
} from './capstone-style.ts'

/** Row 0: 표지, 회사 소개, 멘토 소개. */
export function introRow(b: DocBuilder): void {
  rowLabel(b, 0, 'PART 1 · 인트로')

  // 표지 — the original has a blue wave across the bottom; two stacked bands stand in for it.
  const s1 = slide(b, 0, 0, '표지', { plain: true })
  b.rect(s1.x, s1.y + 520, W, 200, { fill: brand, stroke: brand, strokeWidth: 0, radius: 16 })
  b.rect(s1.x, s1.y + 470, W, 120, { fill: brandMid, stroke: brandMid, strokeWidth: 0, radius: 60 })
  b.rect(s1.x, s1.y + 440, W, 90, {
    fill: brandSoft,
    stroke: brandSoft,
    strokeWidth: 0,
    radius: 45
  })
  b.text(s1.x + 64, s1.y + 40, 'SOMANSA', { fontSize: 22, bold: true, color: brand })
  b.text(s1.x + 96, s1.y + 150, '한성대학교', { fontSize: 26, color: slate })
  b.text(s1.x + 96, s1.y + 200, '융합보안학과\n프리캡스톤 2026-2', {
    fontSize: 60,
    bold: true,
    color: ink,
    width: 900
  })
  b.rect(s1.x + 96, s1.y + 130, 700, 2, { fill: mutedC, stroke: mutedC, strokeWidth: 0, radius: 0 })
  b.rect(s1.x + 96, s1.y + 380, 700, 2, { fill: mutedC, stroke: mutedC, strokeWidth: 0, radius: 0 })
  b.text(s1.x + 64, s1.y + 660, '© Copyright 2026 SOMANSA All rights reserved.', {
    fontSize: 12,
    color: '#ffffff'
  })

  // 회사 소개
  const s2 = slide(b, 1, 0, '회사 소개')
  title(b, s2, '회사 소개')
  b.text(s2.x + 64, s2.y + 196, '소프트웨어를 만드는 사람들', {
    fontSize: 30,
    bold: true,
    color: brand
  })
  para(
    b,
    s2.x + 64,
    s2.y + 250,
    ["1997년 창립 이후 29년간 데이터보호에 집중한 '개인정보 보호 전문기업'"],
    {
      fontSize: 20,
      width: 1100
    }
  )
  stat(b, s2.x + 64, s2.y + 310, 350, '1997', '창립 · 데이터보호 한 우물')
  stat(b, s2.x + 452, s2.y + 310, 350, '360명', '임직원')
  stat(b, s2.x + 840, s2.y + 310, 376, '663억', '작년 매출', teal)
  b.text(s2.x + 64, s2.y + 520, '제품군', { fontSize: 15, bold: true, color: mutedC })
  const products = [
    'Privacy-i',
    'Privacy-i AIDR',
    'Mail-i',
    'WebKeeper',
    'DB-i',
    'Server-i',
    'VD-i'
  ]
  let px = s2.x + 64
  for (const name of products) {
    const w = name.length * 11 + 40
    b.rect(px, s2.y + 550, w, 40, {
      fill: brandSoft,
      stroke: brandSoft,
      strokeWidth: 0,
      radius: 20,
      text: name,
      fontSize: 15,
      bold: true,
      color: brand
    })
    px += w + 12
  }

  // 멘토 소개
  const s3 = slide(b, 2, 0, '멘토 소개')
  title(b, s3, '멘토 소개')
  b.text(s3.x + 64, s3.y + 200, '김정환', { fontSize: 76, bold: true, color: ink })
  b.text(
    s3.x + 64,
    s3.y + 320,
    'hwan77@somansa.com\nhttps://github.com/hwantage\nhttps://hwantage.github.io',
    {
      fontSize: 18,
      bold: true,
      color: teal
    }
  )
  card(b, s3.x + 640, s3.y + 200, 576, 300)
  bullets(
    b,
    s3.x + 672,
    s3.y + 236,
    [
      '건국대학교 컴퓨터공학과 학사 (Computer Engineering)',
      '연세대학교 산업공학과 석사 (Industrial Engineering)',
      '소만사 UX기획팀 팀장'
    ],
    { fontSize: 20, color: ink, width: 520 }
  )
  b.text(s3.x + 672, s3.y + 420, '29년 데이터보호 회사에서 제품 기획과 UX를 맡고 있습니다.', {
    fontSize: 16,
    color: mutedC,
    width: 520
  })
}
