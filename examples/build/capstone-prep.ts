import type { DocBuilder } from './builder.ts'
import {
  brand,
  brandSoft,
  bullets,
  card,
  code,
  ink,
  mutedC,
  para,
  rowLabel,
  slate,
  slide,
  table,
  teal,
  title
} from './capstone-style.ts'

/** Row 3: 프로젝트 개요, 사전 준비, 개발 도구, Google AI Studio, Ollama, 정리. */
export function prepRow(b: DocBuilder): void {
  rowLabel(b, 3, 'PART 3 · 프로젝트 준비')

  // 프로젝트 개요
  const s1 = slide(b, 0, 3, '프로젝트 개요')
  title(b, s1, '프로젝트 개요')
  b.text(s1.x + 64, s1.y + 196, 'AI 기반 개인정보 보호 시스템 구축', {
    fontSize: 36,
    bold: true,
    color: brand,
    width: 1152
  })
  const topics = [
    '출력 가드레일 기반 민감 데이터\n동적 마스킹 및 복원 시스템',
    '임베딩 기반 사내 핵심 기밀 데이터\n유출 차단 및 리스크 평가 시스템',
    'Vision LLM 기반\n멀티모달 문서 자동 분류 체계',
    '입력 검증 및\n프롬프트 인젝션/탈옥 방어 시스템'
  ]
  topics.forEach((topic, i) => {
    const x = s1.x + 64 + (i % 2) * 588
    const y = s1.y + 280 + Math.floor(i / 2) * 170
    card(b, x, y, 564, 150)
    b.ellipse(x + 24, y + 24, 48, 48, {
      fill: brand,
      stroke: brand,
      text: `${i + 1}`,
      color: '#ffffff',
      bold: true,
      fontSize: 20
    })
    b.text(x + 92, y + 24, `주제 ${i + 1}`, { fontSize: 14, bold: true, color: mutedC })
    b.text(x + 92, y + 50, topic, { fontSize: 19, bold: true, color: ink, width: 450 })
  })

  // 사전 준비 사항
  const s2 = slide(b, 1, 3, '프로젝트 사전 준비 사항')
  title(b, s2, '프로젝트 사전 준비 사항')
  const checks = [
    'Python ≥ 3.12 권장',
    'uv 설치',
    'Google AI Studio 가입',
    'Local LLM 권장 (Ollama)',
    'Visual Studio Code 또는 Antigravity 설치',
    'Github 가입',
    'Vibe 코딩? 코딩 assistant 적극 활용',
    '창의력'
  ]
  checks.forEach((item, i) => {
    const x = s2.x + 64 + (i % 2) * 588
    const y = s2.y + 200 + Math.floor(i / 2) * 104
    card(b, x, y, 564, 84)
    b.rect(x + 24, y + 26, 32, 32, {
      fill: '#ffffff',
      stroke: brand,
      strokeWidth: 2,
      radius: 6,
      text: i === 7 ? '★' : '✓',
      color: brand,
      bold: true,
      fontSize: 18
    })
    b.text(x + 76, y + 28, item, { fontSize: 20, bold: true, color: ink, width: 460 })
  })

  // 개발 도구
  const s3 = slide(b, 2, 3, '개발 도구')
  title(b, s3, '개발 도구 · Python, uv, 에디터, Git')
  const tools: [string, string, string[]][] = [
    [
      'Python',
      'https://www.python.org',
      [
        '1991년 귀도 반 로섬이 만든 고급 언어',
        '쉽고 직관적인 문법, AI·웹·데이터·자동화 전반',
        'Windows: 설치 시 "Add Python to PATH" 체크'
      ]
    ],
    [
      'uv',
      'Rust 기반 패키지·프로젝트 관리',
      [
        'pip, venv, poetry, pip-tools를 하나로',
        '10~100배 빠르고 의존성 관리가 깔끔',
        'uv init · uv add · uv sync · uv run'
      ]
    ],
    [
      'VS Code / Antigravity',
      'code.visualstudio.com · antigravity.google',
      [
        'VS Code: MS의 무료 오픈소스 에디터',
        'Antigravity: VS Code 기반 AI 코드 에디터',
        'curl -fsSL https://antigravity.google/cli/install.sh | bash'
      ]
    ],
    [
      'GitHub + Git',
      'github.com · git-scm.com',
      [
        'git init / clone / status / add / commit',
        'git branch / checkout / merge',
        'git push / pull / log'
      ]
    ]
  ]
  tools.forEach(([name, sub, facts], i) => {
    const x = s3.x + 64 + (i % 2) * 588
    const y = s3.y + 190 + Math.floor(i / 2) * 230
    card(b, x, y, 564, 210)
    b.text(x + 28, y + 22, name, { fontSize: 22, bold: true, color: brand })
    b.text(x + 28, y + 54, sub, { fontSize: 14, color: teal, width: 500 })
    bullets(b, x + 28, y + 90, facts, { fontSize: 15, width: 510 })
  })

  // Google AI Studio
  const s4 = slide(b, 3, 3, 'Google AI Studio')
  title(b, s4, 'Google AI Studio')
  bullets(
    b,
    s4.x + 64,
    s4.y + 196,
    [
      '대학생 Gemini Pro 1년 무료 (348,000원 상당)',
      '2026년 12월 31일까지 신청 가능',
      'https://gemini.google/students',
      'ChatGPT는 유료 사용자라도 API 비용이 별도 청구',
      'Google AI Studio는 무료로 API 실험 가능',
      '무료 모델: https://openrouter.ai',
      'github.com/hakilee/oh-my-free-models'
    ],
    { fontSize: 16, width: 520 }
  )
  code(
    b,
    s4.x + 620,
    s4.y + 190,
    596,
    300,
    [
      'import google.generativeai as genai',
      'genai.configure(api_key="API키")',
      'generation_config = {',
      '  "temperature": 1,   # 0.0 결정적 ~ 2.0 창의적',
      '  "top_p": 0.7,',
      '  "top_k": 40',
      '}',
      "model = genai.GenerativeModel('models/gemini-2.5-flash-lite')",
      'response = model.generate_content("안녕")',
      'print(response.text)'
    ].join('\n')
  )
  card(b, s4.x + 620, s4.y + 510, 596, 130, { fill: brandSoft, stroke: brandSoft })
  bullets(
    b,
    s4.x + 644,
    s4.y + 526,
    [
      'top_k: 다음 토큰 확률 상위 k개 선택',
      'top_p: k개 중 누적 확률 퍼센트',
      'temperature: 낮을수록 결정적, 높을수록 창의적 (0~2)'
    ],
    { fontSize: 14, color: brand, width: 550 }
  )
  b.text(
    s4.x + 64,
    s4.y + 420,
    '세 가지 모두 값을 낮출수록 안전하고 정확한 대답, 높일수록 다양하고 창의적인 대답',
    { fontSize: 15, color: mutedC, width: 520 }
  )

  // Local LLM (Ollama)
  const s5 = slide(b, 4, 3, 'Local LLM (Ollama)')
  title(b, s5, 'Local LLM 설치 (Optional) · Ollama')
  bullets(
    b,
    s5.x + 64,
    s5.y + 196,
    [
      '로컬 PC에서 오픈소스 LLM을 실행하게 해주는 도구 — https://ollama.com',
      'ChatGPT처럼 쓰지만 인터넷 없이 동작 (로컬 실행)',
      'LLaMA, Qwen, Gemma, CodeLlama 등 다양한 모델 지원',
      '기업 보안 이슈로 sLLM 고려가 필연적'
    ],
    { fontSize: 17, width: 1120 }
  )
  table(
    b,
    s5.x + 64,
    s5.y + 360,
    [300, 460, 392],
    [
      ['명령어', '설명', '예시'],
      ['ollama --version', 'Ollama 버전 확인', 'ollama --version'],
      ['ollama ls', '설치된 모델 확인', 'ollama ls'],
      ['ollama pull <모델>', '모델 다운로드', 'ollama pull llama3'],
      ['ollama run <모델>', '지정 모델 실행', 'ollama run llama3']
    ],
    { rowHeight: 44, fontSize: 16 }
  )

  // 정리
  const s6 = slide(b, 5, 3, '정리')
  title(b, s6, '정리')
  const groups: [string, string[]][] = [
    ['필수 설치', ['python', 'Antigravity cli', 'ollama']],
    ['프로젝트 협업', ['github']],
    ['개발 편의성', ['VSCode or Antigravity']],
    ['모델 API', ['Google AI Studio', 'OpenRouter']]
  ]
  groups.forEach(([head, items], i) => {
    const x = s6.x + 64 + i * 294
    card(b, x, s6.y + 196, 270, 260)
    b.rect(x, s6.y + 196, 270, 6, { fill: brand, stroke: brand, strokeWidth: 0, radius: 3 })
    b.text(x + 24, s6.y + 226, head, { fontSize: 20, bold: true, color: ink })
    bullets(b, x + 24, s6.y + 270, items, { fontSize: 18, color: slate, width: 230 })
  })
  card(b, s6.x + 64, s6.y + 490, 1152, 140, { fill: brandSoft, stroke: brandSoft })
  b.text(s6.x + 96, s6.y + 512, 'Vibe 코딩', { fontSize: 22, bold: true, color: brand })
  para(
    b,
    s6.x + 96,
    s6.y + 550,
    ['코딩 assistant를 동료처럼 쓴다. 예: v0.app으로 만든 웹사이트 · https://hwan77.pages.dev'],
    { fontSize: 17, color: ink, width: 1090 }
  )
}
