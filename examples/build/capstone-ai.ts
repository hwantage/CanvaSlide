import type { DocBuilder } from './builder.ts'
import {
  brand,
  brandSoft,
  bullets,
  card,
  ink,
  mutedC,
  para,
  slate,
  slide,
  stat,
  table,
  teal,
  title
} from './capstone-style.ts'

/** Row 2: Stackoverflow 붕괴, 역할 변화, 택시 기사의 조건, AI잘러, 84%. */
export function aiEraRow(b: DocBuilder): void {
  // Stackoverflow 붕괴 — monthly questions, redrawn from the deck's chart as yearly bars.
  const s1 = slide(b, 0, 2, 'Stackoverflow 붕괴')
  title(b, s1, 'Stackoverflow 붕괴')
  const years: [number, number][] = [
    [2009, 20],
    [2010, 60],
    [2011, 100],
    [2012, 140],
    [2013, 170],
    [2014, 200],
    [2015, 190],
    [2016, 180],
    [2017, 170],
    [2018, 160],
    [2019, 150],
    [2020, 185],
    [2021, 150],
    [2022, 140],
    [2023, 80],
    [2024, 40],
    [2025, 20],
    [2026, 8]
  ]
  const baseY = s1.y + 560
  const chartX = s1.x + 96
  b.rect(chartX, baseY, 760, 2, { fill: '#cbd5e1', stroke: '#cbd5e1', strokeWidth: 0, radius: 0 })
  years.forEach(([year, value], i) => {
    const x = chartX + 8 + i * 42
    const h = value * 1.6
    const dying = year >= 2023
    b.rect(x, baseY - h, 30, h, {
      fill: dying ? '#fca5a5' : brandSoft,
      stroke: dying ? '#ef4444' : brand,
      strokeWidth: 1,
      radius: 4
    })
    if (year % 4 === 2 || year === 2026) {
      b.text(x - 20, baseY + 10, String(year), {
        fontSize: 13,
        color: mutedC,
        align: 'center',
        width: 70
      })
    }
  })
  b.text(chartX, s1.y + 200, '월간 질문 수 · 월간 순 방문자 약 1억 1,000만 명', {
    fontSize: 16,
    bold: true,
    color: ink
  })
  b.ellipse(chartX + 8 + 11 * 42 - 14, baseY - 185 * 1.6 - 24, 58, 48, {
    fill: '#ffffff',
    stroke: '#ef4444',
    strokeWidth: 2
  })
  b.text(chartX + 8 + 11 * 42 - 30, baseY - 185 * 1.6 - 60, 'Covid-19', {
    fontSize: 14,
    bold: true,
    color: '#b91c1c'
  })
  b.ellipse(chartX + 8 + 13 * 42 - 14, baseY - 140 * 1.6 - 24, 58, 48, {
    fill: '#ffffff',
    stroke: '#ef4444',
    strokeWidth: 2
  })
  b.text(chartX + 8 + 13 * 42 - 30, baseY - 140 * 1.6 - 60, 'ChatGPT', {
    fontSize: 14,
    bold: true,
    color: '#b91c1c'
  })
  card(b, s1.x + 900, s1.y + 200, 316, 320, { fill: '#fef2f2', stroke: '#fecaca' })
  para(
    b,
    s1.x + 928,
    s1.y + 230,
    ['방문자 수 폭락', '질문 수 99% 감소', '', '포럼은 죽었지만,', '회사는 흑자?'],
    {
      fontSize: 24,
      bold: true,
      color: '#991b1b',
      width: 270
    }
  )

  // AI로 인한 역할 변화
  const s2 = slide(b, 1, 2, 'AI로 인한 역할 변화')
  title(b, s2, 'AI로 인한 역할 변화')
  const roles: [string, string, number, number, number][] = [
    ['기획자', '디자인도 하고 개발도 한다', 200, 240, -34],
    ['개발자', '기획도 하고 디자인도 한다', 560, 240, -34],
    ['디자이너', '기획도 하고 개발도 한다', 380, 440, 170]
  ]
  const ids = roles.map(([name, does, dx, dy, labelDy]) => {
    const id = b.ellipse(s2.x + dx, s2.y + dy, 160, 160, {
      fill: brand,
      stroke: brand,
      text: name,
      color: '#ffffff',
      bold: true,
      fontSize: 24
    })
    b.text(s2.x + dx - 40, s2.y + dy + labelDy, does, {
      fontSize: 15,
      color: slate,
      align: 'center',
      width: 240
    })
    return id
  })
  const both = {
    route: 'curved' as const,
    stroke: '#94a3b8',
    width: 3,
    startHead: 'arrow' as const,
    endHead: 'arrow' as const
  }
  b.connect(ids[0] as string, ids[1] as string, both)
  b.connect(ids[1] as string, ids[2] as string, both)
  b.connect(ids[2] as string, ids[0] as string, both)
  card(b, s2.x + 800, s2.y + 200, 416, 420, { fill: brandSoft, stroke: brandSoft })
  para(
    b,
    s2.x + 832,
    s2.y + 232,
    [
      '회의 하는 도중에',
      '프로토타입이 완성되는 시대',
      '',
      '나도 능력 확장.',
      '너도 능력 확장.',
      '모두 서로 같은 상황.'
    ],
    { fontSize: 22, bold: true, color: brand, width: 360 }
  )
  b.text(s2.x + 832, s2.y + 540, '모든 사람이 팀장이 되었다.', {
    fontSize: 26,
    bold: true,
    color: ink,
    width: 360
  })

  // 택시 기사의 조건
  const s3 = slide(b, 2, 2, '택시 기사의 조건')
  title(b, s3, '택시 기사의 조건')
  card(b, s3.x + 64, s3.y + 200, 540, 260)
  b.text(s3.x + 96, s3.y + 224, '택시 기사가 되려면', { fontSize: 20, bold: true, color: mutedC })
  para(
    b,
    s3.x + 96,
    s3.y + 270,
    ['운전을 잘해야 함  → 전문 기술', '길을 잘 알아야 함  → 전문 지식'],
    { fontSize: 26, bold: true, color: ink, width: 480 }
  )
  b.text(s3.x + 96, s3.y + 380, '내비게이션이 등장하기 전까지는.', { fontSize: 16, color: mutedC })
  card(b, s3.x + 676, s3.y + 200, 540, 260, { fill: brandSoft, stroke: brandSoft })
  b.text(s3.x + 708, s3.y + 224, '지금은', { fontSize: 20, bold: true, color: brand })
  para(b, s3.x + 708, s3.y + 270, ['전문 지식  ⇒  비용 Zero', '디지털 지식  ⇒  공공재'], {
    fontSize: 26,
    bold: true,
    color: brand,
    width: 480
  })
  b.text(s3.x + 64, s3.y + 520, '누구나 할 수 있는 디지털 주권 시대', {
    fontSize: 40,
    bold: true,
    color: ink,
    align: 'center',
    width: 1152
  })

  // AI잘러
  const s4 = slide(b, 3, 2, 'AI잘러')
  title(b, s4, 'AI잘러')
  table(
    b,
    s4.x + 64,
    s4.y + 190,
    [340, 340],
    [
      ['일잘러', 'AI잘러'],
      ['AI 사용자', 'AI 활용자'],
      ['도구를 쓴다', '동료와 일한다'],
      ['이거 해줘', '내가 원하는 건 이거 저거야. 이런 식으로 해줘.'],
      ['그대로 쓴다', '검수하고 편집'],
      ['가끔 생각날 때', '매일 루틴화'],
      ['약간 편리함', '하루 1~2시간 절약']
    ],
    { rowHeight: 44, fontSize: 17 }
  )
  card(b, s4.x + 780, s4.y + 190, 436, 210)
  b.text(s4.x + 804, s4.y + 208, '자동화 스킬 생성', { fontSize: 17, bold: true, color: brand })
  bullets(
    b,
    s4.x + 804,
    s4.y + 240,
    [
      '이번주 일정 정리 → 노션 업데이트 → 팀 매터모스트 전송',
      '주간·월간 보고서 자동 생성',
      '출근/퇴근 자동화, 리서치 자동화, 주식 종목 분석'
    ],
    { fontSize: 14, width: 400 }
  )
  card(b, s4.x + 780, s4.y + 420, 436, 210)
  b.text(s4.x + 804, s4.y + 438, 'AX 자동화 구현', { fontSize: 17, bold: true, color: brand })
  bullets(
    b,
    s4.x + 804,
    s4.y + 470,
    [
      '개발 환경 자동 로그인, 코드 리뷰 자동화',
      '자동 빌드 및 일감 업데이트, 자동 MR(PR) 요청',
      'UX 일감 자동 감지, 번역 자동화 툴'
    ],
    { fontSize: 14, width: 400 }
  )

  // 전 세계 84%는 AI 미경험자
  const s5 = slide(b, 4, 2, '전 세계 84%는 AI 미경험자')
  title(b, s5, '전 세계 84%는 AI 미경험자')
  stat(
    b,
    s5.x + 64,
    s5.y + 196,
    360,
    '84%',
    '전 세계 인구 81억 명 중 AI를 한 번도\n사용해 본 적 없는 비율'
  )
  stat(b, s5.x + 460, s5.y + 196, 360, '0.3%', '유료 사용자', teal)
  stat(
    b,
    s5.x + 856,
    s5.y + 196,
    360,
    '0.04%',
    "'코딩 스캐폴드(Scaffold) 사용자'의 등장",
    '#7c3aed'
  )
  card(b, s5.x + 64, s5.y + 410, 1152, 200, { fill: brandSoft, stroke: brandSoft })
  b.text(s5.x + 96, s5.y + 438, '"아직 늦지 않았다"', { fontSize: 34, bold: true, color: brand })
  para(
    b,
    s5.x + 96,
    s5.y + 500,
    ["질적 차이가 만드는 지능의 격차 — 중요한 것은 '어떻게 사용하는가'"],
    { fontSize: 22, color: ink, width: 1090 }
  )
  b.text(s5.x + 96, s5.y + 560, '출처: 아웃소싱타임스 (https://www.outsourcing.co.kr)', {
    fontSize: 13,
    color: mutedC
  })
}
