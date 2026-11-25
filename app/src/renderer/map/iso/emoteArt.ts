// 직원 머리 위 감정 표현 — 글자 이모지 대신 도트 말풍선 (흰 풍선 + 9×8 도트 아이콘).
// 가구 행동(shared/iso/actions.ts)·상태 변화가 주는 이모지를 감정 9가지 중 하나로 바꿔 그린다.

import { Cv, toCanvas } from './isoArt.ts'

export type EmoteKind = 'love' | 'note' | 'excited' | 'happy' | 'relax' | 'idea' | 'sweat' | 'ask' | 'done' | 'look' | 'good' | 'coffee' | 'question'
export const EMOTE_KINDS: EmoteKind[] = ['love', 'note', 'excited', 'happy', 'relax', 'idea', 'sweat', 'ask', 'done', 'look', 'good', 'coffee', 'question']

/** 이모지 → 감정. 표에 없으면 기분 좋음 */
const BY_EMOJI: Record<string, EmoteKind> = {
  // 상태 변화 (IsoOfficeScene EMOTES)
  '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea',
  // 상호작용 연출: 어깨 너머 검토 👀 · 승인 👍 · 막힘 도움 ? · 커피 심부름 ☕
  '👀': 'look', '👍': 'good', '?': 'question', '❓': 'question', '☕': 'coffee',
  // 귀여운 것·동물·꽃 → 좋아함
  '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love',
  // 음악
  '🎵': 'note', '🎶': 'note', '🎹': 'note',
  // 놀이·운동 → 신남
  '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃': 'excited', '🚀': 'excited', '🦖': 'excited', '🤖': 'excited', '🥽': 'excited', '🎁': 'excited',
  // 먹고 마시기·계절 소품 → 기분 좋음
  '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy',
  // 쉬기
  '🛋️': 'relax', '🕰️': 'relax',
  // 읽기·그리기·구경 → 아이디어
  '📖': 'idea', '🎨': 'idea', '🌍': 'idea',
}
export const emoteKindOf = (emoji: string): EmoteKind => BY_EMOJI[emoji] ?? BY_EMOJI[emoji.replace(/️/g, '')] ?? 'happy'

const OUT = '#2e2a40' // isoArt S.out
const COL: Record<string, string> = {
  R: '#ec5a72', r: '#b83a56', w: '#ffffff',
  N: '#8f80e6', n: '#6a5cc8',
  Y: '#f5c43a', y: '#d89a1a', e: '#3a3040', m: '#c0506a',
  B: '#5aa8e8', b: '#3a7ec0',
  G: '#3fb868', g: '#8a8fa8', h: '#5d6380',
  O: '#f0834e',
  K: '#9a6440', k: '#6a4030',
}
/** 9×8 아이콘 (. = 빈칸) */
const ICON: Record<EmoteKind, string[]> = {
  love: ['.RR...RR.', 'RwRR.RRRR', 'RRRRRRRRr', '.RRRRRRr.', '..RRRRr..', '...RRr...', '....r....', '.........'],
  note: ['...nnnnnn', '...NNNNNN', '...N....N', '...N....N', '.NNN..NNN', 'NNNn.NNNn', '.nn...nn.', '.........'],
  excited: ['....Y....', '...YYY...', 'YYYYwYYYY', '.YYYYYYy.', '..YYYYy..', '.YYy.YYy.', '.Yy...Yy.', '.........'],
  happy: ['..YYYYY..', '.YYYYYYY.', 'YYeYYYeYY', 'YYeYYYeYY', 'YmYYYYYmY', 'YYeYYYeYy', '.YYeeeYy.', '..yyyyy..'],
  relax: ['....bbbb.', '......b..', '.....b...', '....bbbb.', 'BBB......', '..B......', '.B.......', 'BBB......'],
  idea: ['...YYY...', '..YwYYY..', '.YwYYYYy.', '.YYYYYYy.', '..YYYYy..', '...YYy...', '...ggg...', '...hhh...'],
  sweat: ['....B....', '...BBB...', '..BBBBB..', '.BwBBBBB.', '.BwBBBBb.', '.BBBBBBb.', '..BBBbb..', '...bbb...'],
  ask: ['...OOO...', '...OOO...', '...OOO...', '...OOO...', '....O....', '.........', '...OOO...', '...OOO...'],
  done: ['........G', '.......GG', '......GG.', 'G....GG..', 'GG..GG...', '.GGGG....', '..GG.....', '.........'],
  look: ['.........', '.ee...ee.', 'ewwe.ewwe', 'ewwe.ewwe', 'eewe.eewe', 'eewe.eewe', '.ee...ee.', '.........'],
  good: ['....YY...', '...YYy...', '...Yy....', 'BYYYYYYy.', 'BYYYYYYy.', 'BYYYYYyy.', 'BYYYYYy..', '..yyyy...'],
  question: ['..OOOO...', '.OO..OO..', '.....OO..', '....OO...', '...OO....', '.........', '...OO....', '...OO....'],
  coffee: ['..g..g...', '...g..g..', '.KkkkkK..', '.KKKKKKkk', '.KKKKKK.k', '.KKKKKKkk', '..KKKKk..', '.ggggggg.'],
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** 말풍선 한 장 (픽셀): 13×12 몸통(모서리 깎음) + 아래 꼬리 3px. 아래 가운데가 기준점 */
export function artEmote(kind: EmoteKind) {
  const W = 13
  const H = 15
  const cv = new Cv(W, H)
  const put = (x: number, y: number, c: string) => cv.write(y * W + x, [...hex(c), 255] as [number, number, number, number])
  // 몸통: 테두리(외곽선) + 안쪽 흰색, 네 모서리 1칸 깎기
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < W; x++) {
      const isCorner = (x === 0 || x === W - 1) && (y === 0 || y === 11)
      if (isCorner) continue
      const isEdge = x === 0 || x === W - 1 || y === 0 || y === 11 || ((x === 1 || x === W - 2) && (y === 1 || y === 10))
      put(x, y, isEdge ? OUT : y >= 9 ? '#e6e3f2' : '#ffffff')
    }
  // 꼬리 (가운데 아래로)
  for (const [x, y, c] of [[5, 11, '#ffffff'], [6, 11, '#ffffff'], [7, 11, '#ffffff'], [5, 12, OUT], [6, 12, '#e6e3f2'], [7, 12, OUT], [6, 13, OUT]] as [number, number, string][]) put(x, y, c)
  ICON[kind].forEach((row, y) => [...row].forEach((k, x) => k !== '.' && put(x + 2, y + 2, COL[k])))
  return cv
}

/** 화면 캔버스 */
export const drawEmote = (kind: EmoteKind) => toCanvas(artEmote(kind))

// ── 도우미 말풍선 "×N" — 감정 말풍선과 같은 틀(높이 12 몸통·꼬리·외곽선), 폭만 숫자 길이에 맞춘다. 사라지지 않고 떠 있는다 ──
const HELPER_INK = '#4b3bc7' // 시안 글자색 — 사무실 캔버스는 앱 테마를 따르지 않는다
const HELPER_BACK = '#b3aaf2' // 뒷사람 (시안 불투명도 .45를 흰 바탕 위 색으로)
/** 겹친 두 사람 9×8 (l = 뒷사람, d = 앞사람) */
const HELPER_ICON = ['.ll......', 'llll.dd..', '.ll.dddd.', '....dddd.', 'll...dd..', 'll.dddddd', 'l.ddddddd', '..ddddddd']
/** 3×5 숫자 */
const DIGIT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']
const TIMES = ['101', '010', '101']

/** "×N" 말풍선 (픽셀). 아래 가운데가 기준점 */
export function artHelperBubble(n: number) {
  const digits = String(Math.min(99, Math.max(0, Math.floor(n))))
  const W = 17 + digits.length * 4
  const H = 15
  const cv = new Cv(W, H)
  const put = (x: number, y: number, c: string) => cv.write(y * W + x, [...hex(c), 255] as [number, number, number, number])
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < W; x++) {
      const isCorner = (x === 0 || x === W - 1) && (y === 0 || y === 11)
      if (isCorner) continue
      const isEdge = x === 0 || x === W - 1 || y === 0 || y === 11 || ((x === 1 || x === W - 2) && (y === 1 || y === 10))
      put(x, y, isEdge ? OUT : y >= 9 ? '#e6e3f2' : '#ffffff')
    }
  const mid = Math.floor(W / 2)
  for (const [x, y, c] of [[mid - 1, 11, '#ffffff'], [mid, 11, '#ffffff'], [mid + 1, 11, '#ffffff'], [mid - 1, 12, OUT], [mid, 12, '#e6e3f2'], [mid + 1, 12, OUT], [mid, 13, OUT]] as [number, number, string][]) put(x, y, c)
  HELPER_ICON.forEach((row, y) => [...row].forEach((k, x) => k !== '.' && put(x + 2, y + 2, k === 'l' ? HELPER_BACK : HELPER_INK)))
  TIMES.forEach((row, y) => [...row].forEach((k, x) => k === '1' && put(x + 12, y + 5, HELPER_INK)))
  ;[...digits].forEach((d, i) => [...DIGIT[Number(d)]].forEach((k, j) => k === '1' && put(16 + i * 4 + (j % 3), 4 + Math.floor(j / 3), HELPER_INK)))
  return cv
}

export const drawHelperBubble = (n: number) => toCanvas(artHelperBubble(n))
