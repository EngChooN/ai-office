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
