// 직원 생김새 = 부품 조합. 기존처럼 숫자 하나(avatar)로 저장한다
// 0~23은 예전 아바타(팔레트 8 × 머리 3)로 그대로 읽고, 24 이상은 부품 조합을 섞은 진법으로 담는다

export interface Look {
  hairStyle: number
  hairColor: number
  skin: number
  top: number
  topColor: number
  pants: number
  face: number
  head: number
}

export const HAIR_STYLES = ['짧은 머리', '긴 머리', '단발 앞머리', '포니테일', '삐죽 머리', '풍성한 머리', '옆 가르마', '짧게 민 머리'] as const
export const TOPS = ['티셔츠', '후드티', '셔츠·넥타이', '카디건', '정장'] as const
export const FACE_ITEMS = ['없음', '안경', '선글라스', '수염', '콧수염'] as const
export const HEAD_ITEMS = ['없음', '헤드셋', '모자', '비니', '머리핀', '베레모'] as const

/** [기본, 밝은 쪽]. 앞 8개는 예전 팔레트 순서 그대로 */
export const HAIR_COLORS: readonly [string, string][] = [
  ['#4a3426', '#6e5040'],
  ['#1e1e26', '#3a3a48'],
  ['#8a4b2a', '#b06a40'],
  ['#e0b050', '#f4d07a'],
  ['#6a6a78', '#8e8e9c'],
  ['#3a2040', '#5a3860'],
  ['#b04030', '#d0604a'],
  ['#ece6d6', '#ffffff'],
  ['#2a6ad0', '#4a8af0'],
  ['#e07ab0', '#f09ac8'],
]
export const SKINS = ['#f6d2b0', '#f0c49c', '#f8dcc0', '#d8a880', '#f6cbb0', '#f8dcc4', '#e8b890', '#b07850', '#8a5a3a'] as const
/** [기본, 그늘]. 앞 8개는 예전 팔레트 순서 그대로 */
export const TOP_COLORS: readonly [string, string][] = [
  ['#e8835a', '#c0603c'],
  ['#5a8ae8', '#3f68c0'],
  ['#5ab47e', '#3f8a5c'],
  ['#a57ad8', '#7f56b4'],
  ['#f0c84a', '#c8a030'],
  ['#ec6a8a', '#c44c6a'],
  ['#4ac0c8', '#2f9aa2'],
  ['#8a8aa0', '#6a6a80'],
  ['#3a3f4a', '#22252e'],
  ['#f4f4f8', '#cfd0da'],
  ['#7a4a2a', '#5a3420'],
  ['#2e4a8a', '#1e3268'],
]
export const PANTS = ['#3d4a6a', '#2e3240', '#4a3f3a', '#4a4a58', '#6a5a40', '#5a7aa8'] as const

const RADIX: Record<keyof Look, number> = {
  hairStyle: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  skin: SKINS.length,
  top: TOPS.length,
  topColor: TOP_COLORS.length,
  pants: PANTS.length,
  face: FACE_ITEMS.length,
  head: HEAD_ITEMS.length,
}
const KEYS = Object.keys(RADIX) as (keyof Look)[]
const LOOK_SPACE = KEYS.reduce((n, k) => n * RADIX[k], 1)
/** 이 값보다 작은 avatar는 예전 아바타 번호 */
export const LEGACY_AVATARS = 24

// 예전 팔레트 8개의 피부·바지가 새 목록에서 몇 번째인지
const LEGACY_SKIN = [0, 1, 2, 0, 3, 4, 5, 6]
const LEGACY_PANTS = [0, 1, 2, 0, 1, 3, 0, 1]

export function decodeLook(avatar: number): Look {
  const n = Math.abs(Math.trunc(avatar)) || 0
  if (n < LEGACY_AVATARS) {
    const p = n % 8
    return { hairStyle: Math.floor(n / 8) % 3, hairColor: p, skin: LEGACY_SKIN[p], top: 0, topColor: p, pants: LEGACY_PANTS[p], face: 0, head: 0 }
  }
  // 외부 직원은 세션 해시를 그대로 쓰므로 범위를 넘으면 접어서 읽는다
  let rest = (n - LEGACY_AVATARS) % LOOK_SPACE
  const look = {} as Look
  for (const k of KEYS) {
    look[k] = rest % RADIX[k]
    rest = Math.floor(rest / RADIX[k])
  }
  return look
}

/**
 * 같은 생김새를 가리키는 가장 작은 번호 (0 이상, LEGACY_AVATARS + 생김새 조합 수 미만 — 약 778만).
 * 외부에서 데려온 직원은 세션 해시(최대 2^32 근처)를 avatar로 쓰는데, decodeLook이 어차피 접어 읽으므로 그림은 그대로다.
 * 원격 응답처럼 범위가 정해진 곳에 avatar를 보낼 때 쓴다
 */
export function canonicalAvatar(avatar: number) {
  const n = Math.abs(Math.trunc(avatar)) || 0
  return n < LEGACY_AVATARS ? n : LEGACY_AVATARS + ((n - LEGACY_AVATARS) % LOOK_SPACE)
}

/** canonicalAvatar가 돌려주는 값의 상한(미포함) */
export const AVATAR_LIMIT = LEGACY_AVATARS + LOOK_SPACE

export function encodeLook(look: Look): number {
  let code = 0
  for (const k of [...KEYS].reverse()) code = code * RADIX[k] + (((look[k] % RADIX[k]) + RADIX[k]) % RADIX[k])
  return LEGACY_AVATARS + code
}

/** 부품 하나의 선택지 수 */
export const lookOptions = (k: keyof Look) => RADIX[k]

const pick = (n: number, rand: () => number) => Math.floor(rand() * n)

/** 직무에 어울리는 기본 소품·옷 (고용할 때 직무를 고르면 입혀 준다) */
export function roleLook(role: string): Partial<Look> {
  if (role.includes('팀장')) return { top: 4, topColor: 8 }
  if (role.includes('리뷰')) return { top: 2, face: 1 }
  if (role.includes('프론트')) return { top: 1 }
  if (role.includes('백엔드')) return { head: 1 }
  if (role.includes('QA')) return { head: 2 }
  if (role.includes('기획')) return { top: 3, head: 4 }
  if (role.includes('리서')) return { top: 3, face: 1 }
  if (role.includes('디자')) return { head: 5 }
  return {}
}

/** 무작위 생김새. 소품은 가끔만 붙이고, 직무 기본 소품을 얹는다 */
export function randomLook(role = '', rand: () => number = Math.random): Look {
  const look: Look = {
    hairStyle: pick(RADIX.hairStyle, rand),
    hairColor: pick(RADIX.hairColor, rand),
    skin: pick(RADIX.skin, rand),
    top: pick(RADIX.top, rand),
    topColor: pick(RADIX.topColor, rand),
    pants: pick(RADIX.pants, rand),
    face: rand() < 0.4 ? 1 + pick(RADIX.face - 1, rand) : 0,
    head: rand() < 0.35 ? 1 + pick(RADIX.head - 1, rand) : 0,
  }
  return { ...look, ...roleLook(role) }
}
