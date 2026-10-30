// 상점 가구에서 하는 행동 (이모트·대사). 직원이 서는 자리는 furniture.ts의 FURNITURE[itemId].spots[].action이 이 키를 가리킨다

export interface ItemAction {
  emote: string
  say: string[]
}

export const ITEM_ACTIONS: Record<string, ItemAction> = {
  'coffee-machine': { emote: '☕', say: ['샷 추가!', '라떼 한 잔', '카페인 충전'] },
  bookshelf: { emote: '📖', say: ['이 책 재밌네', '클린 코드 다시 읽기'] },
  dartboard: { emote: '🎯', say: ['불스아이!', '아깝다…'] },
  easel: { emote: '🎨', say: ['오늘의 작품', '추상화예요'] },
  'punching-bag': { emote: '🥊', say: ['버그 나가!', '스트레스 해소!'] },
  popcorn: { emote: '🍿', say: ['팝콘 냠냠', '고소하다'] },
  arcade: { emote: '🕹️', say: ['최고 기록!', '한 판만 더'] },
  'record-shelf': { emote: '🎵', say: ['오늘은 재즈', 'LP 감성'] },
  icecream: { emote: '🍦', say: ['민초 최고', '하나만 먹을게요'] },
  jukebox: { emote: '🎶', say: ['신청곡 틀었어요', '♪ 둠칫 둠칫'] },
  gacha: { emote: '🎁', say: ['레어 나와라!', '또 꽝…'] },
  parrot: { emote: '🦜', say: ['커밋해! 커밋해!', '안녕 앵무야'] },
  foosball: { emote: '⚽', say: ['골!', '한 판 붙자'] },
  treadmill: { emote: '🏃', say: ['5km 완주', '헉헉'] },
  aquarium: { emote: '🐠', say: ['물고기 귀엽다', '힐링 중'] },
  fishbowl: { emote: '🐟', say: ['밥 줄게'] },
  'cat-tower': { emote: '🐱', say: ['냥냥아~', '털 묻었다'] },
  'dog-bed': { emote: '🐶', say: ['멍멍이 산책 갈까?', '착하다~'] },
  'pool-table': { emote: '🎱', say: ['8번 공 넣는다', '나이스 샷'] },
  claw: { emote: '🧸', say: ['이번엔 잡는다', '아 놓쳤어'] },
  piano: { emote: '🎹', say: ['♪ 엘리제를 위하여', '연주 중'] },
  'vr-booth': { emote: '🥽', say: ['우주 여행 중', '어지러워…'] },
  robot: { emote: '🤖', say: ['로봇아 커피 줘', '삐빅 안녕하세요'] },
  globe: { emote: '🌍', say: ['여기 가 보고 싶다'] },
  'sofa-green': { emote: '🛋️', say: ['잠깐 쉬는 중'] },
  'sofa-pink': { emote: '🛋️', say: ['폭신하다'] },
  'clock-tower': { emote: '🕰️', say: ['벌써 시간이…'] },
  rocket: { emote: '🚀', say: ['언젠가 우주로', '발사 카운트다운'] },
  dino: { emote: '🦖', say: ['크다…', '쥬라기 오피스'] },
  'gold-bar': { emote: '💰', say: ['회사 금고 든든', '보너스 나오려나'] },
  'xmas-tree': { emote: '🎄', say: ['메리 크리스마스!'] },
  pumpkin: { emote: '🎃', say: ['트릭 오어 트릿!'] },
  snowman: { emote: '⛄', say: ['눈사람 귀엽다'] },
  'cherry-tree': { emote: '🌸', say: ['벚꽃 엔딩~'] },
  // prop-* 소품 (예전 고정 소품을 서랍 가구로 옮긴 것)
  'prop-pingpong': { emote: '🏓', say: ['핑퐁!', '한 세트 더'] },
  'prop-arcade': { emote: '🕹️', say: ['최고 기록!', '한 판만 더'] },
  'prop-aquarium': { emote: '🐠', say: ['물고기 귀엽다', '힐링 중'] },
}
