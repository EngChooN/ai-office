// 회사 자금·상점 (docs/specs/economy-levels.md)
// 자금은 장부로 따로 들고 있지 않고 "토큰 수당 + 보너스·보상 − 구매"로 매번 계산한다 — 어긋날 일이 없다

/** 1토큰당 원 — 1만 토큰 = ₩10만 */
export const WON_PER_TOKEN = 10
/** 업무 카드를 마치면 받는 보너스 */
export const TASK_BONUS = 3_000_000
/** 레벨업 보상 = 레벨 × 이 금액 */
export const LEVEL_REWARD_UNIT = 5_000_000

import { getLang, INTL_LOCALE, tx } from './i18n/index.ts'
import { FURNITURE, type GridItem } from './iso/furniture.ts'
import { ZONE_LAYOUTS, zoneGrantsById } from './iso/zoneLayouts.ts'

export type LedgerKind = 'bonus' | 'levelup' | 'purchase' | 'refund'

export interface LedgerEntry {
  id: number
  ts: number
  /** 들어오면 +, 나가면 − (원) */
  amount: number
  kind: LedgerKind
  label: string
}

/** 화면에 보이는 장부 한 줄 (토큰 수당은 하루 단위로 묶어 보여 준다) */
export interface LedgerRow {
  ts: number
  amount: number
  kind: LedgerKind | 'wage'
  label: string
}

export type Zone = 'work' | 'meeting' | 'lounge'
/** 화면에 보일 이름은 읽을 때 현재 언어로 (아래 *_LABEL·가구·세트·미션 이름 모두 getter) */
const lazyLabels = <K extends string>(prefix: string, ko: Record<K, string>) => {
  const o = {} as Record<K, string>
  for (const k of Object.keys(ko) as K[]) Object.defineProperty(o, k, { enumerable: true, get: () => tx(`${prefix}.${k}`, ko[k]) })
  return o
}
export const ZONE_LABEL: Record<Zone, string> = lazyLabels('zone', { work: '업무 구역', meeting: '회의실', lounge: '휴게실' })

export type ShopCategory = 'wallpaper' | 'floor' | 'furniture' | 'level' | 'desk' | 'chair'
export const SHOP_CATEGORY_LABEL: Record<ShopCategory, string> = lazyLabels('shopCategory', { wallpaper: '벽지', floor: '바닥', furniture: '가구·소품', level: '레벨 전용', desk: '책상', chair: '의자' })
/** 칸 위에 놓는 분류 — 여러 개 살 수 있고, 사면 서랍에 들어간다. 벽지·바닥·책상·의자(gear)는 한 번 사서 여러 곳에 쓴다 */
export const isGridCategory = (category: ShopCategory) => category === 'furniture' || category === 'level'

export type Rarity = 'common' | 'rare' | 'legend'
export const RARITY_LABEL: Record<Rarity, string> = lazyLabels('rarity', { common: '일반', rare: '희귀', legend: '전설' })

export interface ShopItem {
  id: string
  category: ShopCategory
  name: string
  price: number
  /** 이 회사 레벨부터 살 수 있다 */
  minLevel: number
  description: string
  rarity: Rarity
  /** 시즌 한정 — 'MM-DD' 기간에만 판다 (연말처럼 해를 넘겨도 된다) */
  season?: { name: string; from: string; to: string }
}

/** 상점 상태: 산 물건, 구역별 벽지·바닥, 배치한 가구, 직원별 책상·의자 */
export interface ShopState {
  owned: Record<string, number>
  surfaces: Partial<Record<Zone, { wallpaper?: string; floor?: string }>>
  /** 예전 형식(픽셀 좌표). 칸 배치로 옮긴 뒤(schema 2)로는 늘 [] — 예전 폰 화면 호환용 */
  placed: PlacedItem[]
  /** 칸 배치 (docs/specs/office-iso-tech.md 2-2절). 서랍 개수 = owned − grid의 그 품목 수 */
  grid: GridItem[]
  gear: Record<string, { desk?: string; chair?: string }>
  /** 2 = 칸 배치로 옮기기 끝 (main/isoMigrate.ts) */
  schema?: 2
}

export interface PlacedItem {
  uid: string
  itemId: string
  x: number
  y: number
}

/** 서랍 개수 = 산 개수 − 놓인 개수 (칸 배치 + 예전 배치) */
export function drawerCount(shop: ShopState, itemId: string) {
  return (shop.owned[itemId] ?? 0) - shop.grid.filter((g) => g.itemId === itemId).length - shop.placed.filter((p) => p.itemId === itemId).length
}

/** 칸 가구로 놓을 수 있는 품목: 상점 가구(furniture), 또는 상점에 없고 규격표에 있는 품목(prop-* 소품·레벨 전용). 벽지·바닥·책상·의자(gear)는 아님 */
export function isGridFurniture(itemId: string) {
  const item = shopItem(itemId)
  return item ? isGridCategory(item.category) : Object.hasOwn(FURNITURE, itemId)
}

export const EMPTY_SHOP: ShopState = { owned: {}, surfaces: {}, placed: [], grid: [], gear: {} }

const M = 1_000_000
const HALLOWEEN = { get name() { return tx('season.halloween', '할로윈') }, from: '10-01', to: '10-31' }
const AUTUMN = { get name() { return tx('season.autumn', '가을') }, from: '10-01', to: '11-30' }
const CHRISTMAS = { get name() { return tx('season.christmas', '크리스마스') }, from: '12-01', to: '12-31' }
const WINTER = { get name() { return tx('season.winter', '겨울') }, from: '12-01', to: '02-28' }
const LUNAR = { get name() { return tx('season.lunar', '설날') }, from: '01-15', to: '02-28' }
const SPRING = { get name() { return tx('season.spring', '벚꽃') }, from: '03-15', to: '04-30' }

/** 등급은 값으로 정한다 — 3천만 원부터 희귀, 3억부터 전설 */
const rarityOf = (price: number): Rarity => (price >= 300 * M ? 'legend' : price >= 30 * M ? 'rare' : 'common')
// minLevel은 레벨 20단계 개편 때 같은 경험치 기준으로 옮긴 값이다(옛 5→4, 6→5, 7·8→6, 9→7, 10→8 — office-iso-levels.md 5절). 다시 잠기는 물건이 없다
const item = (category: ShopCategory, id: string, name: string, price: number, minLevel: number, description: string, season?: ShopItem['season']): ShopItem => ({
  id,
  category,
  get name() {
    return tx(`item.${id}.name`, name)
  },
  price,
  minLevel,
  get description() {
    return tx(`item.${id}.desc`, description)
  },
  rarity: rarityOf(price),
  season,
})
const wall = (...a: [string, string, number, number, string, ShopItem['season']?]) => item('wallpaper', ...a)
const floor = (...a: [string, string, number, number, string, ShopItem['season']?]) => item('floor', ...a)
const furn = (...a: [string, string, number, number, string, ShopItem['season']?]) => item('furniture', ...a)
const desk = (...a: [string, string, number, number, string]) => item('desk', ...a)
const chair = (...a: [string, string, number, number, string]) => item('chair', ...a)
/**
 * 레벨 전용 가구 (office-iso-levels.md 2-3절). minLevel = 열리는 레벨.
 * 값은 임시 공식(레벨 × ₩300만 × 칸 수/2, 최소 1) — 김기획 확정 값이 오면 이 공식이나 품목별 값만 바꾼다
 */
const levelItemPrice = (level: number, itemId: string) => {
  const [w, d] = FURNITURE[itemId]?.size ?? [1, 1]
  return level * 3 * M * Math.max(1, Math.ceil((w * d) / 2))
}
const lv = (id: string, name: string, level: number, description: string) => item('level', id, name, levelItemPrice(level, id), level, description)

export const SHOP_ITEMS: ShopItem[] = [
  // 벽지 — 업무 구역·회의실에 하나씩
  wall('wall-cream', '크림 페인트', 5 * M, 1, '부드러운 크림색 벽'),
  wall('wall-polka', '물방울 무늬', 8 * M, 2, '귀여운 물방울 벽지'),
  wall('wall-brick', '붉은 벽돌', 12 * M, 1, '스타트업 감성 벽돌 벽'),
  wall('wall-wave', '파도 무늬', 14 * M, 3, '시원한 파란 물결'),
  wall('wall-stripe', '민트 스트라이프', 15 * M, 3, '세로 줄무늬 벽지'),
  wall('wall-concrete', '노출 콘크리트', 18 * M, 3, '인더스트리얼 무드'),
  wall('wall-forest', '숲속 잎사귀', 20 * M, 4, '초록 잎이 가득한 벽지'),
  wall('wall-navy', '네이비 패널', 25 * M, 4, '짙은 남색 목재 패널'),
  wall('wall-sunset', '노을 그라데이션', 28 * M, 4, '주황에서 보라로 물드는 벽'),
  wall('wall-wood', '원목 루버', 35 * M, 5, '세로 원목 루버 마감'),
  wall('wall-glass', '통유리 커튼월', 60 * M, 6, '도시가 보이는 유리벽'),
  wall('wall-gold', '골드 다마스크', 350 * M, 7, '금빛 문양 벽지'),
  wall('wall-galaxy', '은하수', 800 * M, 8, '별이 흐르는 벽'),
  wall('wall-halloween', '할로윈 벽지', 30 * M, 1, '박쥐와 호박이 그려진 벽', HALLOWEEN),
  wall('wall-xmas', '크리스마스 벽지', 30 * M, 1, '빨강·초록 줄과 눈송이', CHRISTMAS),
  // 바닥 — 업무·회의실·휴게실에 하나씩
  floor('floor-vinyl', '베이지 장판', 4 * M, 1, '깔끔한 장판'),
  floor('floor-cork', '코르크', 9 * M, 2, '폭신한 코르크 바닥'),
  floor('floor-checker', '체크 타일', 10 * M, 2, '흑백 체크무늬 타일'),
  floor('floor-bluecarpet', '블루 카펫', 14 * M, 3, '차분한 남색 카펫'),
  floor('floor-terrazzo', '테라조', 16 * M, 3, '알록달록 돌 조각 바닥'),
  floor('floor-carpet', '그레이 카펫', 18 * M, 4, '발소리가 조용한 카펫 타일'),
  floor('floor-hex', '육각 타일', 20 * M, 4, '벌집 모양 타일'),
  floor('floor-grass', '인조 잔디', 22 * M, 6, '실내 정원 느낌'),
  floor('floor-parquet', '헤링본 원목', 30 * M, 5, '헤링본 무늬 원목 마루'),
  floor('floor-marble', '대리석', 70 * M, 7, '반짝이는 대리석'),
  floor('floor-gold', '금박 타일', 400 * M, 7, '눈부신 금빛 타일'),
  floor('floor-cloud', '구름 위', 900 * M, 8, '하늘을 걷는 바닥'),
  floor('floor-leaves', '낙엽 카펫', 25 * M, 1, '바스락거리는 가을 낙엽', AUTUMN),
  floor('floor-snow', '눈밭', 25 * M, 1, '뽀득뽀득 눈 쌓인 바닥', WINTER),
  // 가구·소품 — 사서 꾸미기 모드로 배치 (직원이 찾아가 쓰는 것도 있다)
  furn('fern', '고사리', 1 * M, 1, '작은 초록 화분'),
  furn('cactus', '선인장 3종', 1.5 * M, 1, '작은 선인장 화분 세트'),
  furn('flower-pot', '꽃 화분', 2 * M, 1, '알록달록 꽃'),
  furn('monstera', '몬스테라 화분', 2 * M, 1, '큰 잎 관엽식물'),
  furn('bookshelf', '책장', 4 * M, 1, '직원이 와서 책을 읽어요'),
  furn('fishbowl', '어항', 5 * M, 2, '금붕어 한 마리'),
  furn('fig-tree', '떡갈고무나무', 6 * M, 2, '키 큰 실내 나무'),
  furn('floor-lamp', '스탠드 조명', 2.5 * M, 2, '따뜻한 빛'),
  furn('lava-lamp', '라바 램프', 4 * M, 2, '몽글몽글 움직이는 조명'),
  furn('beanbag-blue', '빈백 (블루)', 3 * M, 2, '푹 꺼지는 의자'),
  furn('rug-round', '원형 러그', 5 * M, 2, '바닥에 까는 동그란 러그'),
  furn('coffee-machine', '에스프레소 머신', 8 * M, 3, '직원이 와서 커피를 내려요'),
  furn('whiteboard', '이동식 화이트보드', 5 * M, 3, '아이디어를 적는 곳'),
  furn('dartboard', '다트판', 8 * M, 3, '직원이 다트를 던져요'),
  furn('globe', '지구본', 7 * M, 3, '빙글빙글 지구본'),
  furn('tv', 'TV', 10 * M, 3, '눌러서 켜고 끄는 TV'),
  furn('arc-lamp', '아크 조명', 9 * M, 3, '곡선 스탠드'),
  furn('easel', '이젤 그림', 10 * M, 3, '직원이 그림을 그려요'),
  furn('sofa-green', '그린 소파', 12 * M, 3, '초록 2인 소파'),
  furn('sofa-pink', '핑크 소파', 12 * M, 3, '분홍 2인 소파'),
  furn('punching-bag', '샌드백', 12 * M, 4, '스트레스 해소용'),
  furn('popcorn', '팝콘 기계', 14 * M, 4, '고소한 팝콘 냄새'),
  furn('arcade', '오락기', 15 * M, 4, '추억의 레트로 게임기'),
  furn('record-shelf', 'LP 선반', 16 * M, 4, '레코드판 컬렉션'),
  furn('icecream', '아이스크림 냉장고', 18 * M, 4, '직원이 아이스크림을 꺼내 먹어요'),
  furn('jukebox', '주크박스', 18 * M, 4, '직원이 와서 춤을 춰요'),
  furn('bonsai', '분재', 20 * M, 4, '정성껏 가꾼 분재'),
  furn('gacha', '뽑기 기계', 22 * M, 4, '캡슐 장난감 뽑기'),
  furn('clock-tower', '괘종시계', 24 * M, 4, '댕~ 댕~'),
  furn('neon-sign', '네온사인', 12 * M, 4, '"SHIP IT" 네온'),
  // 파티션·가벽 (docs/specs/partition-items.md) — 낮음은 책상 칸막이, 높음은 공간 나누기
  furn('partition-low-fabric', '낮은 패브릭 파티션', 4 * M, 2, '책상 사이를 나누는 낮은 천 칸막이'),
  furn('partition-low-glass', '낮은 유리 파티션', 10 * M, 3, '탁 트인 낮은 유리 칸막이'),
  furn('partition-wall-white', '화이트 가벽', 5 * M, 3, '공간을 나누는 흰 벽'),
  furn('partition-wall-wood', '원목 가벽', 20 * M, 4, '따뜻한 원목 칸막이 벽'),
  furn('parrot', '앵무새', 25 * M, 4, '"커밋해! 커밋해!"'),
  furn('foosball', '테이블 축구', 26 * M, 4, '두 명이 붙어서 해요'),
  furn('treadmill', '러닝머신', 30 * M, 4, '직원이 와서 달려요'),
  furn('aquarium', '수족관', 25 * M, 5, '열대어가 헤엄친다'),
  furn('cat-tower', '사무실 고양이', 30 * M, 6, '캣타워와 고양이 한 마리'),
  furn('dog-bed', '사무실 강아지', 35 * M, 5, '꼬리 흔드는 강아지'),
  furn('rug-persian', '페르시안 러그', 40 * M, 5, '고급스러운 문양 러그'),
  furn('pool-table', '당구대', 55 * M, 5, '직원 둘이 당구를 쳐요'),
  furn('claw', '인형뽑기', 60 * M, 5, '오늘은 뽑을 수 있을까'),
  furn('piano', '그랜드 피아노', 45 * M, 6, '직원이 와서 연주해요'),
  furn('trophy', '트로피 장식장', 35 * M, 6, '회사의 역사'),
  furn('statue', '황금 동상', 90 * M, 8, '창업자 기념 동상'),
  furn('vr-booth', 'VR 부스', 120 * M, 6, '가상현실 체험'),
  furn('robot', '로봇 비서', 500 * M, 6, '사무실을 돌아다니는 로봇'),
  furn('rocket', '우주선 모형', 1_200 * M, 7, '실물 크기 로켓'),
  furn('dino', '공룡 화석', 2_000 * M, 8, '티라노사우루스 골격'),
  furn('gold-bar', '금괴 금고', 3_000 * M, 8, '회사의 금고. 반짝반짝'),
  furn('pumpkin', '잭오랜턴', 6 * M, 1, '웃는 호박 등불', HALLOWEEN),
  furn('ghost', '유령 풍선', 8 * M, 1, '둥둥 떠 있는 유령', HALLOWEEN),
  furn('xmas-tree', '크리스마스 트리', 30 * M, 1, '반짝이는 트리', CHRISTMAS),
  furn('snowman', '눈사람', 12 * M, 1, '당근 코 눈사람', WINTER),
  furn('lunar-lantern', '청사초롱', 15 * M, 1, '설날 맞이 등불', LUNAR),
  furn('cherry-tree', '벚꽃 나무', 40 * M, 1, '사무실 안 벚꽃', SPRING),
  // 직원 책상·의자 — 직원마다 적용
  desk('desk-white', '화이트 책상', 6 * M, 1, '깔끔한 흰 상판'),
  desk('desk-pastel', '파스텔 책상', 8 * M, 2, '민트빛 상판'),
  desk('desk-bamboo', '대나무 책상', 9 * M, 2, '친환경 대나무'),
  desk('desk-walnut', '월넛 책상', 12 * M, 3, '짙은 원목 상판'),
  desk('desk-standing', '스탠딩 책상', 15 * M, 4, '높이 조절 책상'),
  desk('desk-gaming', '게이밍 책상', 18 * M, 4, 'RGB 조명 + 듀얼 모니터'),
  desk('desk-glass', '유리 책상', 22 * M, 5, '투명 강화유리 상판'),
  desk('desk-executive', '임원 책상', 40 * M, 6, '원목 + 금장 + 트리플 모니터'),
  desk('desk-hologram', '홀로그램 책상', 400 * M, 7, '허공에 뜬 화면'),
  desk('desk-gold', '황금 책상', 800 * M, 8, '순금 상판'),
  chair('chair-mesh', '메쉬 의자', 3 * M, 1, '통풍 잘 되는 회색 메쉬'),
  chair('chair-wood', '원목 의자', 3.5 * M, 1, '따뜻한 나무 의자'),
  chair('chair-pink', '파스텔 의자', 4 * M, 2, '분홍빛 쿠션'),
  chair('chair-ball', '짐볼 의자', 5 * M, 2, '허리 운동은 덤'),
  chair('chair-gaming', '게이밍 의자', 10 * M, 4, '빨강·검정 레이싱 시트'),
  chair('chair-ergo', '인체공학 의자', 15 * M, 4, '허리를 지켜 줘요'),
  chair('chair-leather', '가죽 의자', 20 * M, 6, '갈색 가죽 임원 의자'),
  chair('chair-egg', '에그 체어', 25 * M, 5, '알 모양 디자인 의자'),
  chair('chair-neon', '네온 게이밍 의자', 35 * M, 6, '빛나는 게이밍 의자'),
  chair('chair-throne', '왕좌', 500 * M, 8, '대표님 전용'),
  // 레벨 전용 가구 — 레벨에 도달하면 열린다. 일부는 그 레벨에 무료로 서랍에 들어온다(LEVEL_GRANTS)
  lv('lv-folding-desk', '접이식 책상', 1, '창업 첫날의 책상'),
  lv('lv-folding-chair', '접이식 의자', 1, '접었다 폈다 하는 의자'),
  lv('lv-kettle-shelf', '커피포트 선반', 2, '차고 한쪽 커피 코너'),
  lv('lv-tool-shelf', '공구 벽선반', 2, '차고 시절의 공구 선반'),
  lv('lv-studio-sofa', '원룸 소파', 3, '작지만 푹신한 소파'),
  lv('lv-hanger', '행거', 3, '외투를 거는 곳'),
  lv('lv-meeting-table', '회의 테이블', 3, '모여 앉는 첫 회의 테이블'),
  lv('lv-cubicle-desk', '칸막이 책상', 4, '집중이 잘 되는 칸막이'),
  lv('lv-glass-table', '유리 회의 테이블', 5, '유리벽 회의실의 큰 테이블'),
  lv('lv-projector', '프로젝터', 5, '발표할 때 화면을 띄워요'),
  lv('lv-stair-plants', '계단 앞 화분 세트', 6, '2층 계단을 반기는 화분'),
  lv('lv-mailbox', '우편함', 6, '회사 앞으로 온 편지'),
  lv('lv-fridge', '냉장고', 7, '탕비실 냉장고'),
  lv('lv-vending', '자판기', 7, '음료 한 캔의 여유'),
  lv('lv-reception', '리셉션 데스크', 8, '손님을 맞는 로비 데스크'),
  lv('lv-waiting-sofa', '대기 소파', 8, '로비 손님용 소파'),
  lv('lv-pingpong', '탁구대', 9, '게임 존의 탁구대'),
  lv('lv-hall-bench', '엘리베이터 홀 벤치', 10, '엘리베이터를 기다리는 벤치'),
  lv('lv-floor-sign', '층 안내판', 10, '몇 층에 누가 있는지'),
  lv('lv-sleep-pod', '수면 캡슐', 11, '잠깐 눈 붙이는 곳'),
  lv('lv-shower', '샤워 부스', 11, '야근 뒤 샤워'),
  lv('lv-tall-bookshelf', '키 큰 책장', 12, '사내 도서관 책장'),
  lv('lv-reading-chair', '독서 의자', 12, '책 읽기 좋은 의자'),
  lv('lv-dumbbell', '덤벨 랙', 13, '피트니스룸 덤벨'),
  lv('lv-espresso-bar', '에스프레소 바', 14, '사옥 카페 바'),
  lv('lv-bar-stool', '바 의자', 14, '카페 바 앞 높은 의자'),
  lv('lv-long-table', '카페테리아 긴 테이블', 15, '다 같이 먹는 긴 테이블'),
  lv('lv-salad-bar', '샐러드 바', 15, '카페테리아 샐러드 바'),
  lv('lv-stage', '강당 단상', 16, '전체 회의 단상'),
  lv('lv-hall-seats', '강당 의자 줄', 16, '강당 객석 한 줄'),
  lv('lv-bbq', '옥상 바비큐', 17, '옥상 정원 바비큐 그릴'),
  lv('lv-hammock', '해먹', 17, '옥상에서 흔들흔들'),
  lv('lv-grass-pot', '잔디 화분', 17, '옥상 잔디 화분'),
  lv('lv-lounge-sofa', '스카이 라운지 소파', 18, '꼭대기 층 라운지 소파'),
  lv('lv-telescope', '망원경', 18, '스카이 라운지 망원경'),
  lv('lv-trophy-case', '트로피 진열장', 19, '트로피 홀 진열장'),
  lv('lv-hall-of-fame', '명예의 전당 벽', 19, '빛나는 이름들'),
  lv('lv-ceo-desk', '대표 책상', 20, '대표실의 큰 책상'),
  lv('lv-fountain', '분수 조형물', 20, '캠퍼스 광장 분수'),
]

/**
 * 레벨 기본 지급 (office-iso-levels.md 2-3절 "기본 지급"): 그 레벨에 도달하면 서랍에 무료로 들어온다. 레벨마다 한 번만
 * (main/isoMigrate.ts runLevelGrants, 설정 키 levelgrant:{n}). 화이트보드는 상점 가구를 그대로 준다
 */
const BASE_LEVEL_GRANTS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  1: { 'lv-folding-desk': 4, 'lv-folding-chair': 4 },
  2: { 'lv-kettle-shelf': 1 },
  3: { 'lv-meeting-table': 1 },
  4: { whiteboard: 1 },
  5: { 'lv-glass-table': 1 },
  7: { 'lv-fridge': 1 },
  8: { 'lv-reception': 1 },
  10: { 'lv-floor-sign': 1 },
  16: { 'lv-stage': 1 },
}

/** 레벨 기본 지급 (키 levelgrant:{n}). 구역 가구는 따로 ZONE_GRANTS */
export const LEVEL_GRANTS: Readonly<Record<number, Readonly<Record<string, number>>>> = BASE_LEVEL_GRANTS

/** 구역 기본 가구 묶음(ZONE_LAYOUTS)의 위치 목록에서 센 구역별 지급 개수 (키 zonegrant:{구역}). 업적은 LEVEL_GRANTS와 이 표를 모두 무료 지급분으로 뺀다 */
export const ZONE_GRANTS: Readonly<Record<string, Readonly<Record<string, number>>>> = zoneGrantsById(ZONE_LAYOUTS)

export function mergeGrants(a: Readonly<Record<number, Readonly<Record<string, number>>>>, b: Readonly<Record<number, Readonly<Record<string, number>>>>) {
  const out: Record<number, Record<string, number>> = {}
  for (const src of [a, b]) for (const [lv, row] of Object.entries(src)) for (const [id, n] of Object.entries(row)) ((out[Number(lv)] ??= {})[id] = (out[Number(lv)][id] ?? 0) + n)
  return out
}

export const shopItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id)

// ── 세트 (컬렉션) ─────────────────────────────────────

export interface ShopSet {
  id: string
  name: string
  emoji: string
  itemIds: string[]
  reward: number
}

export const SHOP_SETS: ShopSet[] = [
  { id: 'garden', name: '정원 세트', emoji: '🌿', itemIds: ['fern', 'cactus', 'flower-pot', 'monstera', 'fig-tree', 'bonsai'], reward: 40 * M },
  { id: 'cafe', name: '카페 세트', emoji: '☕', itemIds: ['coffee-machine', 'popcorn', 'icecream', 'flower-pot', 'rug-round'], reward: 30 * M },
  { id: 'library', name: '서재 세트', emoji: '📚', itemIds: ['bookshelf', 'record-shelf', 'globe', 'easel', 'arc-lamp'], reward: 50 * M },
  { id: 'game', name: '게임 세트', emoji: '🕹️', itemIds: ['arcade', 'pool-table', 'foosball', 'dartboard', 'claw', 'gacha'], reward: 120 * M },
  { id: 'fitness', name: '헬스 세트', emoji: '💪', itemIds: ['treadmill', 'punching-bag', 'chair-ball'], reward: 40 * M },
  { id: 'pets', name: '펫 세트', emoji: '🐾', itemIds: ['cat-tower', 'dog-bed', 'parrot', 'fishbowl', 'aquarium'], reward: 100 * M },
  { id: 'luxury', name: '럭셔리 세트', emoji: '💎', itemIds: ['piano', 'statue', 'rug-persian', 'clock-tower', 'trophy', 'chair-leather'], reward: 300 * M },
  { id: 'legend', name: '전설 세트', emoji: '👑', itemIds: ['robot', 'rocket', 'dino', 'gold-bar'], reward: 2_000 * M },
  { id: 'halloween', name: '할로윈 세트', emoji: '🎃', itemIds: ['pumpkin', 'ghost', 'wall-halloween', 'floor-leaves'], reward: 50 * M },
  { id: 'winter', name: '겨울 세트', emoji: '⛄', itemIds: ['xmas-tree', 'snowman', 'wall-xmas', 'floor-snow'], reward: 50 * M },
].map((s) => ({
  ...s,
  get name() {
    return tx(`set.${s.id}`, s.name)
  },
}))

// ── 오늘의 특가·시즌 ──────────────────────────────────

const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 시즌 한정이 아니거나 지금 시즌이면 판다 */
export function isInSeason(item: ShopItem, now = new Date()) {
  if (!item.season) return true
  const today = mmdd(now)
  const { from, to } = item.season
  return from <= to ? today >= from && today <= to : today >= from || today <= to
}

const dayKey = (now: Date) => `${now.getFullYear()}-${mmdd(now)}`
const seeded = (seed: string) => [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
/** 32비트 선형 합동 난수 — 그냥 곱하면 2^53을 넘어 정밀도를 잃고 같은 값만 돈다 */
const nextRand = (h: number) => (Math.imul(h, 1103515245) + 12345) >>> 0
/** 날짜로 정한 순서대로 조건에 맞는 것을 count개 고른다 (후보가 모자라도 끝난다) */
function pickSeeded<T>(pool: T[], count: number, seed: string, isOk: (item: T, picked: T[]) => boolean) {
  const picked: T[] = []
  let h = seeded(seed)
  for (let i = 0; i < pool.length * 8 && picked.length < count; i++) {
    h = nextRand(h)
    const item = pool[(h >>> 8) % pool.length]
    if (!picked.includes(item) && isOk(item, picked)) picked.push(item)
  }
  return picked
}
const DEAL_COUNT = 3
const DEAL_RATES = [0.3, 0.4, 0.5]

/** 오늘의 특가 3개 — 날짜로 정해서 언제 열어도 같다 (시즌·전설 제외) */
export function dailyDeals(now = new Date()): { itemId: string; discount: number }[] {
  // 레벨 전용 가구는 빼서 후보를 예전과 똑같이 둔다 — 예전 폰 화면도 자기 품목표로 특가를 골라, 후보가 달라지면 보이는 할인가와 실제 값이 어긋난다
  const pool = SHOP_ITEMS.filter((i) => !i.season && i.rarity !== 'legend' && i.category !== 'level')
  return pickSeeded(pool, DEAL_COUNT, dayKey(now), () => true).map((i, n) => ({ itemId: i.id, discount: DEAL_RATES[n] }))
}

/** 오늘 값 (특가면 할인) */
export function priceOf(item: ShopItem, now = new Date()) {
  const deal = dailyDeals(now).find((d) => d.itemId === item.id)
  return deal ? Math.round(item.price * (1 - deal.discount)) : item.price
}

/** ₩1억 2,500만 · ₩3,400만 · ₩80만 */
export function formatWon(won: number, lang = getLang()) {
  const sign = won < 0 ? '−' : ''
  const v = Math.abs(Math.round(won))
  // 한국어만 억·만 단위로 풀어 쓰고, 나머지 언어는 그 언어의 줄임 표기(12M · 1.2億 · 1.2亿)
  if (lang !== 'ko') return `${sign}₩${new Intl.NumberFormat(INTL_LOCALE[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`
  const eok = Math.floor(v / 100_000_000)
  const man = Math.floor((v % 100_000_000) / 10_000)
  if (eok && man) return `${sign}₩${eok}억 ${man.toLocaleString('ko-KR')}만`
  if (eok) return `${sign}₩${eok}억`
  if (man) return `${sign}₩${man.toLocaleString('ko-KR')}만`
  return `${sign}₩${v.toLocaleString('ko-KR')}`
}

// ── 일일 미션·업적 ─────────────────────────────────────

/** 미션·업적이 세는 값 */
export type Metric = 'tasks' | 'tokens' | 'meetings' | 'approvals' | 'instructions' | 'purchases' | 'staff' | 'level' | 'items' | 'sets' | 'earned'

export interface MissionDef {
  id: string
  emoji: string
  label: string
  metric: Metric
  target: number
  reward: number
}

export interface MissionProgress extends MissionDef {
  /** 보상 받기 키 (일일 미션은 날짜가 붙는다) */
  key: string
  progress: number
  isClaimed: boolean
}

export interface MissionsView {
  daily: MissionProgress[]
  achievements: MissionProgress[]
}

/** 화면 이름은 읽을 때 현재 언어로 (사전 키 mission.<id>) */
const withMissionLabel = (m: MissionDef): MissionDef => ({
  ...m,
  get label() {
    return tx(`mission.${m.id}`, m.label)
  },
})

/** 매일 이 중 3개 */
export const DAILY_POOL: MissionDef[] = ([
  { id: 'tasks3', emoji: '✅', label: '업무 카드 3건 완료', metric: 'tasks', target: 3, reward: 15 * M },
  { id: 'tasks1', emoji: '✅', label: '업무 카드 1건 완료', metric: 'tasks', target: 1, reward: 5 * M },
  { id: 'tokens500k', emoji: '⚡', label: '토큰 50만 사용', metric: 'tokens', target: 500_000, reward: 8 * M },
  { id: 'tokens2m', emoji: '⚡', label: '토큰 200만 사용', metric: 'tokens', target: 2_000_000, reward: 20 * M },
  { id: 'meeting1', emoji: '🗣️', label: '회의 1번 열기', metric: 'meetings', target: 1, reward: 6 * M },
  { id: 'approvals5', emoji: '🖊️', label: '결재 5건 처리', metric: 'approvals', target: 5, reward: 6 * M },
  { id: 'instructions5', emoji: '💬', label: '직원에게 5번 지시', metric: 'instructions', target: 5, reward: 6 * M },
  { id: 'purchase1', emoji: '🛍️', label: '상점에서 1개 사기', metric: 'purchases', target: 1, reward: 4 * M },
] as MissionDef[]).map(withMissionLabel)

export const ACHIEVEMENTS: MissionDef[] = ([
  { id: 'tasks10', emoji: '🥉', label: '업무 10건 완료', metric: 'tasks', target: 10, reward: 20 * M },
  { id: 'tasks50', emoji: '🥈', label: '업무 50건 완료', metric: 'tasks', target: 50, reward: 80 * M },
  { id: 'tasks200', emoji: '🥇', label: '업무 200건 완료', metric: 'tasks', target: 200, reward: 300 * M },
  { id: 'staff5', emoji: '👥', label: '직원 5명 고용', metric: 'staff', target: 5, reward: 15 * M },
  { id: 'staff10', emoji: '🏢', label: '직원 10명 고용', metric: 'staff', target: 10, reward: 50 * M },
  { id: 'meetings10', emoji: '🗣️', label: '회의 10번', metric: 'meetings', target: 10, reward: 30 * M },
  { id: 'level5', emoji: '📈', label: '회사 Lv.5', metric: 'level', target: 5, reward: 30 * M },
  { id: 'level8', emoji: '🚀', label: '회사 Lv.8', metric: 'level', target: 8, reward: 150 * M },
  { id: 'level10', emoji: '🏙️', label: '회사 Lv.10 3층 오피스', metric: 'level', target: 10, reward: 1_000 * M },
  // 레벨 20단계 개편 (office-iso-tech.md 5-2절). Lv.10→15·15→20은 각각 그 전까지의 4~5배 경험치가 들어 보상도 약 3배씩 —
  // Lv.15는 가장 비싼 상점 품목(금괴 금고 ₩30억) 한 개, Lv.20은 마지막 목표라 그 세 배 남짓
  { id: 'level15', emoji: '☕', label: '회사 Lv.15 카페테리아', metric: 'level', target: 15, reward: 3_000 * M },
  { id: 'level20', emoji: '👑', label: '회사 Lv.20 캠퍼스', metric: 'level', target: 20, reward: 10_000 * M },
  { id: 'items10', emoji: '🛋️', label: '물건 10종 모으기', metric: 'items', target: 10, reward: 20 * M },
  { id: 'items40', emoji: '🏬', label: '물건 40종 모으기', metric: 'items', target: 40, reward: 120 * M },
  { id: 'sets1', emoji: '🧩', label: '세트 1개 완성', metric: 'sets', target: 1, reward: 20 * M },
  { id: 'sets5', emoji: '🏆', label: '세트 5개 완성', metric: 'sets', target: 5, reward: 200 * M },
  { id: 'earned1b', emoji: '💰', label: '누적 수당 ₩10억', metric: 'earned', target: 1_000 * M, reward: 100 * M },
] as MissionDef[]).map(withMissionLabel)

const DAILY_COUNT = 3

/** 오늘의 미션 3개 — 날짜로 정한다 */
export function dailyMissions(now = new Date()): MissionDef[] {
  // 같은 지표 미션은 하루에 하나만
  return pickSeeded(DAILY_POOL, DAILY_COUNT, `mission-${dayKey(now)}`, (m, picked) => !picked.some((x) => x.metric === m.metric))
}

export const todayKey = (now = new Date()) => dayKey(now)

/** 세트를 다 모았는지 (가구는 1개 이상, 나머지는 보유) */
export const isSetComplete = (set: ShopSet, owned: Record<string, number>) => set.itemIds.every((id) => (owned[id] ?? 0) > 0)

/** 받은 레벨들의 기본 지급과 받은 구역들의 구역 지급 합 (품목별 개수) */
export function grantedCounts(levels: Iterable<number>, zones: Iterable<string> = []): Record<string, number> {
  const out: Record<string, number> = {}
  for (const lv of levels) for (const [id, n] of Object.entries(LEVEL_GRANTS[lv] ?? {})) out[id] = (out[id] ?? 0) + n
  for (const z of zones) for (const [id, n] of Object.entries(ZONE_GRANTS[z] ?? {})) out[id] = (out[id] ?? 0) + n
  return out
}

/**
 * 업적('items'·'sets')이 세는 보유: 무료 기본 지급분을 뺀 개수. owned는 품목별 개수만 있고 어디서 왔는지는 없어서
 * 지급받은 개수를 넘는 만큼만 직접 산(얻은) 것으로 본다 — 산 뒤에 같은 품목을 지급받아도 순서와 관계없이 같다
 */
export function earnedOwned(owned: Record<string, number>, granted: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, n] of Object.entries(owned)) {
    const left = n - (granted[id] ?? 0)
    if (left > 0) out[id] = left
  }
  return out
}
