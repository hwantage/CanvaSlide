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
  title
} from './capstone-style.ts'

/** Row 1 (first half): 과학 발전 속도, 특이점, 수확가속의 법칙, 10년 주기 기술 혁신. */
export function accelerationRow(b: DocBuilder): void {
  rowLabel(b, 1, 'PART 2 · 기술 변화와 AI 시대')

  // 과학 발전 속도 — bar heights follow log10 of the speed-up so the last bar still fits.
  const s1 = slide(b, 0, 1, '과학 발전 속도')
  title(b, s1, '과학 발전 속도')
  para(
    b,
    s1.x + 64,
    s1.y + 190,
    [
      '인류 학자들은 BC 8000년부터 현재까지 약 1만 년을 문명의 역사로 본다.',
      '지난 9,900년의 발전 속도를 10이라고 하면 2020~2030년은 780,000배 — 특이점 세계가 열린다.'
    ],
    {
      fontSize: 18,
      width: 1100
    }
  )
  const speeds: [string, string, number][] = [
    ['BC 8000 ~ 1946', '10', 1],
    ['1946 ~ 2000', '100배', 2],
    ['2000 ~ 2010', '4,000배', 3.6],
    ['2010 ~ 2020', '60,000배', 4.78],
    ['2020 ~ 2030', '780,000배', 5.89]
  ]
  const baseY = s1.y + 600
  b.rect(s1.x + 96, baseY, 1090, 2, {
    fill: '#cbd5e1',
    stroke: '#cbd5e1',
    strokeWidth: 0,
    radius: 0
  })
  speeds.forEach(([period, label, log], i) => {
    const x = s1.x + 120 + i * 215
    const h = log * 56
    const last = i === speeds.length - 1
    b.rect(x, baseY - h, 150, h, {
      fill: last ? brand : brandSoft,
      stroke: last ? brand : brandMid,
      strokeWidth: 1,
      radius: 8
    })
    b.text(x, baseY - h - 34, label, {
      fontSize: 20,
      bold: true,
      color: ink,
      align: 'center',
      width: 150
    })
    b.text(x - 20, baseY + 12, period, { fontSize: 14, color: mutedC, align: 'center', width: 190 })
  })

  // 특이점이 온다
  const s2 = slide(b, 1, 1, '특이점이 온다')
  title(b, s2, "레이 커즈와일 '특이점이 온다 (The Singularity is Near)'")
  card(b, s2.x + 64, s2.y + 196, 700, 150, { fill: brandSoft, stroke: brandSoft })
  para(
    b,
    s2.x + 96,
    s2.y + 220,
    [
      "'미래에 기술 변화의 속도가 매우 빨라지고 그 영향이 매우 깊어서",
      "인간의 생활이 되돌릴 수 없도록 변화되는 시기'"
    ],
    { fontSize: 20, bold: true, color: brand, width: 640 }
  )
  b.text(s2.x + 96, s2.y + 306, '— 2007년 1월 출간, 특이점의 정의', { fontSize: 14, color: mutedC })
  bullets(
    b,
    s2.x + 64,
    s2.y + 380,
    [
      '근 미래에 인류는 완전히 다른 진화의 단계로 들어선다',
      '죽음을 극복하고 에너지 문제를 해결한다',
      '인간을 능가하는 인공지능이 등장한다',
      '기계의 도움으로 생물학적 육체의 한계를 넘어선다',
      'SF에서나 보던 모든 것이 우리 세대가 자연사하기 전에 현실이 된다'
    ],
    { fontSize: 18, width: 700 }
  )
  stat(b, s2.x + 820, s2.y + 196, 396, '86%', '2023년 3월 기준 그의 예측 적중률', teal)

  // 수확가속의 법칙
  const s3 = slide(b, 2, 1, '수확가속의 법칙')
  title(b, s3, '수확가속의 법칙')
  card(b, s3.x + 64, s3.y + 190, 560, 300)
  b.text(s3.x + 92, s3.y + 214, "무어의 법칙 (Moore's Law)", {
    fontSize: 22,
    bold: true,
    color: ink
  })
  bullets(
    b,
    s3.x + 92,
    s3.y + 256,
    [
      '고든 무어, 1965: 트랜지스터 수는 18~24개월마다 2배',
      '적용 범위: 하드웨어 성능(컴퓨팅 파워, 집적도)',
      '형태: 경험적 법칙, 반도체 산업의 로드맵',
      '한계: 원자 크기·발열·양자 효과로 언젠가 둔화'
    ],
    { fontSize: 16, width: 510 }
  )
  card(b, s3.x + 656, s3.y + 190, 560, 300, { fill: brandSoft, stroke: brandSoft })
  b.text(s3.x + 684, s3.y + 214, '수확가속의 법칙 (Law of Accelerating Returns)', {
    fontSize: 22,
    bold: true,
    color: brand
  })
  bullets(
    b,
    s3.x + 684,
    s3.y + 256,
    [
      '레이 커즈와일: 기술 발전은 선형이 아니라 지수적으로 가속',
      '적용 범위: 컴퓨터·AI·바이오·나노·에너지 등 기술 전반',
      '한 분야가 둔화되면 다른 분야가 속도를 이어받는다',
      "'두 배'가 아니라 혁신의 속도 자체가 빨라지는 메가트렌드"
    ],
    { fontSize: 16, color: ink, width: 510 }
  )
  card(b, s3.x + 64, s3.y + 520, 1152, 120, { fill: '#fffbeb', stroke: '#fde68a' })
  b.text(
    s3.x + 92,
    s3.y + 540,
    '퀴즈 · 31일간 일하는데 100억을 준다  vs  첫날 100원, 다음날부터 전날의 2배',
    {
      fontSize: 20,
      bold: true,
      color: '#92400e'
    }
  )
  b.text(
    s3.x + 92,
    s3.y + 584,
    '둘째 안은 31일째 하루치가 1,073억, 합계 약 2,147억. 지수 곡선은 늘 처음엔 시시해 보인다.',
    {
      fontSize: 16,
      color: '#92400e',
      width: 1090
    }
  )

  // 10년 주기 기술 혁신
  const s4 = slide(b, 3, 1, '10년 주기 기술 혁신')
  title(b, s4, '10년 주기 기술 혁신')
  b.rect(s4.x + 120, s4.y + 300, 1040, 4, {
    fill: brandMid,
    stroke: brandMid,
    strokeWidth: 0,
    radius: 2
  })
  const eras: [string, string, string[]][] = [
    [
      '2000년대',
      '초고속 인터넷',
      [
        '1998 두루넷 케이블 모뎀, 10Mbps',
        '1999 하나로통신·한국통신 ADSL 개시',
        '2002 초고속 인터넷 천만 가구 돌파'
      ]
    ],
    [
      '2010년대',
      '스마트폰',
      [
        '2007.1.9 스티브 잡스, 아이폰 첫 공개',
        '2009 아이폰 3GS 국내 출시',
        '스마트폰 시장이 본격적으로 열림'
      ]
    ],
    [
      '2020년대',
      '인공지능',
      [
        '2016 알파고 vs 이세돌 9단, AI 대중 인식 확산',
        '2022 ChatGPT, Midjourney, Claude',
        '대규모 언어모델(LLM)·생성형 AI 시대'
      ]
    ]
  ]
  eras.forEach(([when, what, facts], i) => {
    const x = s4.x + 120 + i * 400
    b.ellipse(x - 16, s4.y + 286, 32, 32, { fill: brand, stroke: '#ffffff', strokeWidth: 4 })
    b.text(x - 40, s4.y + 210, when, { fontSize: 22, bold: true, color: brand, width: 200 })
    b.text(x - 40, s4.y + 244, what, { fontSize: 18, color: slate, width: 200 })
    card(b, x - 40, s4.y + 340, 340, 200)
    bullets(b, x - 16, s4.y + 362, facts, { fontSize: 15, width: 300 })
  })
}
