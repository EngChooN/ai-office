// 확정 아이콘(도트 사무실)의 팔레트와 16·32px 전용 그림.
// 큰 그림(art-grid.png)을 줄이면 인물이 뭉개져서, 작은 크기는 칸을 직접 찍어 둔다. '.'는 투명(타일이 보임).
// mono: 안드로이드 테마 아이콘(알파만 쓰임)에서 역할별 진하기. 실루엣 하나로 뭉치지 않게 단계를 나눈다.

/** 글자 → [색, 역할, mono 알파] — art-grid.png의 색은 모두 이 표 안에 있어야 한다 */
export const PALETTE = {
  o: ['#190427', '외곽선', 1],
  W: ['#fcf6e6', '벽 윗면', 0.35],
  w: ['#e8caa1', '왼쪽 벽·피부', 0.35],
  c: ['#fce9c3', '오른쪽 벽', 0.35],
  n: ['#363d64', '모니터·바닥 그림자', 1],
  d: ['#f2ab62', '책상 윗면', 0.7],
  D: ['#d06c37', '책상 앞면·의자', 0.7],
  k: ['#ac5630', '책상 옆면·의자 그림자', 0.7],
  h: ['#4d2a2c', '머리카락', 1],
  v: ['#a681fa', '옷', 0.7],
  g: ['#08331b', '화분 잎 그림자', 1],
  p: ['#139634', '화분 잎', 0.7],
  G: ['#5bcd4a', '화분 잎 밝은 곳', 0.7],
  f: ['#8ba3d5', '바닥 밝은 칸', 0.35],
  F: ['#748dc1', '바닥', 0.35],
  b: ['#5368a6', '바닥 어두운 칸', 0.35],
}

// 32px: 크림 벽, 갈색 머리·보라 옷, 모니터, 주황 책상, 화분, 의자, 청회색 바닥만 남긴다
export const SMALL32 = [
  '.............oo.............',
  '...........ooWWoo...........',
  '.........ooWWwcWWoo.........',
  '.......ooWWwwwcccWWoo.......',
  '.....ooWWwwwwwoooooWWoo.....',
  '...ooWWwwwwwwohhhhhocWWoo...',
  '.ooWWwoowwwwohhhhhhhoccWWoo.',
  '.oWwwwonoowwohhwwwwhoooccco.',
  '.oWoooonnnooohwowowhoDkocco.',
  '.ooGGponnnnfohwwwwwhoDkocco.',
  '.ooGpGonnnnfooohwwhhoDkocco.',
  '.oopGponnnnfoovvvvvvoDkocco.',
  '.oogpggoonnfodoovvvvvokocco.',
  '.oWooooddoonodddoovvvooocco.',
  '.oWooDdddddoddddddoofffFcco.',
  '.ofooDDDddddddddddddooffFfo.',
  'ooFfoDDDDDdddddddddkkoFFFFoo',
  'bbffooDDDDDDdddddkkkkofFFFbb',
  'nnbbffooDDDDDDdkkkkkkoffbbnn',
  'oonnbbFFooDDDDokkkkoofbbnnoo',
  '..oonnbbffooDDokkooFbbnnoo..',
  '....oonnbbffooooofbbnnoo....',
  '......oonnbbFFofbbnnoo......',
  '........oonnbbbbnnoo........',
  '..........oonnnnoo..........',
  '............oooo............',
]

// 16px: 외곽선은 대부분 빼고 색 대비로 나눈다
export const SMALL16 = [
  '......oo......',
  '....ooWWoo....',
  '..ooWwwccWoo..',
  'ooWwwwhhhhcWoo',
  'owwwwhowohDcco',
  'oGpnnhwwwhDcco',
  'opgnnnvvvvDcco',
  'oWoddddddddcco',
  'oFoDdddddddkFo',
  'oFfDDDDokkkFfo',
  '.nFFDDDokkFFn.',
  '..nFFfoooFfn..',
  '....nFFfFn....',
  '......nn......',
]
