# 소품 연출 시트 목록·측정표 (연출④-5)

상위 업무: [연출④] 소품 연출 — 5/7단계. 분류표 `furniture-motion-catalog.md`, 규칙 `furniture-motion-guide.md`.

- **생성기**: `app/scripts/motion-pilot.mts` (파일럿) + 묶음 파일 `app/scripts/motion/bundle1~4.mts`, 공용 도우미 `app/scripts/motion/kit.mts`.
  - 문서 폴더: `node … scripts/motion-pilot.mts ../docs/specs/office-iso-art/motion` → 시트 + `manifest.json` + 묶음별 미리보기 `preview-b1~b4.png`
  - 앱 폴더 `app/src/renderer/map/iso/motion/`: 같은 명령 결과에서 `preview*.png`만 빼고 복사.
- **그리는 방식**: 프레임마다 원래 품목 정의(isoArt `ITEMS`)의 부품 색·무늬·위치를 조금 바꿔 다시 그린다(`artItemPatched`). 그래서 외곽선·그늘·팔레트가 기존 그림과 같다. 김·빛·음표 같은 것만 덧그린다.
- **0번 장 = 기존 그림**: B의 꺼짐, C의 대기, D의 꺼짐, A의 첫 장은 기존 그림과 같다. 시트를 붙여도 평소 모습은 바뀌지 않는다. 예외로 지구본 0번은 오른쪽 끝 한 줄이 기존과 다르다.
- **칸 크기**: 가로와 기준점 규칙은 기존 그림과 같다. 음표·연기·Zzz처럼 위로 올라가는 것이 있는 시트(주크박스 16, 피아노 12, 수면 캡슐 10, 바비큐 8, 로켓 6, 유령 2 아트 px)는 칸 위쪽만 늘렸다. 엔진은 시트마다 적힌 칸·기준점을 쓰므로 그대로 맞물린다.
- **장수 줄이기**: 앞면만 바뀌는 소품(화이트보드·이젤·오락기·네온사인·자판기 등)은 뒷면 두 방향에 0번 한 장만 둔다. 가운데가 대칭인 소품(스탠드·어항·라바 램프·유령·꽃 화분)은 행 1개다. 앉는 가구(소파·빈백)의 '쓰는 중'은 앉은 직원이 가리므로 1px 눌린 한 장만 둔다.
- **메모리**: 픽셀 크기 × 4바이트로 계산한 값이다(실측 아님). 한 층에 놓인 상품의 시트만 올라간다.

## 시트를 붙이지 않은 움직이는 상품 (분류표 89개 중 8개)

| 상품 | 분류 | 이유 |
|---|---|---|
| `cat-tower` `dog-bed` | E + A | 고양이·강아지는 장면이 가구와 따로 그리는 캐릭터다(`drawPet`). 가구 시트로 움직이면 동물이 아니라 가구가 움직인다. 펫 캐릭터 쪽 연출이 필요하다 |
| `desk-gaming` `desk-hologram` `desk-gold` `chair-ball` `chair-neon` `chair-throne` | A·C·D·F | 책상·의자 장비(gear)는 상점에서 직원에게 배정만 되고, 지금 사무실 지도에는 칸 가구로 그려지지 않는다. 붙일 그림이 없다 |

### 파일럿

| 시트 | 종류 | 함께 쓰는 상품 | 픽셀 크기 | 용량 | 장수 | 메모리(RGBA) |
|---|---|---|---|---|---|---|
| `lv-fountain.png` | A | — | 840×152 | 3.2KB | 6 | 약 499KB |
| `tv.png` | B | — | 648×520 | 7.1KB | 14 | 약 1,316KB |
| `coffee-machine.png` | C | `prop-coffeeCorner` `lv-espresso-bar` | 380×400 | 4.4KB | 20 | 약 594KB |
| **소계** | | 3장 | | 14.7KB | 40 | 약 2,409KB |

### 1묶음 (상)

| 시트 | 종류 | 함께 쓰는 상품 | 픽셀 크기 | 용량 | 장수 | 메모리(RGBA) |
|---|---|---|---|---|---|---|
| `floor-lamp.png` | B+G | `prop-lamp` | 228×120 | 1.9KB | 3 | 약 107KB |
| `jukebox.png` | B+C | — | 456×560 | 7.2KB | 24 | 약 998KB |
| `neon-sign.png` | A+B+G | — | 456×384 | 4.6KB | 14 | 약 684KB |
| `treadmill.png` | C | — | 540×472 | 6.3KB | 20 | 약 996KB |
| `aquarium.png` | A+B | `prop-aquarium` | 972×496 | 12.2KB | 36 | 약 1,883KB |
| `rocket.png` | A+F | — | 532×520 | 6.8KB | 28 | 약 1,081KB |
| `xmas-tree.png` | A+G+F | — | 836×520 | 16.6KB | 44 | 약 1,698KB |
| `lv-projector.png` | B+F | — | 456×312 | 7.9KB | 24 | 약 556KB |
| `prop-printer.png` | D | — | 608×328 | 5.5KB | 32 | 약 779KB |
| **소계** | | 9장 | | 69.0KB | 225 | 약 8,782KB |

### 2묶음 (중 · 상점 가구)

| 시트 | 종류 | 함께 쓰는 상품 | 픽셀 크기 | 용량 | 장수 | 메모리(RGBA) |
|---|---|---|---|---|---|---|
| `fishbowl.png` | A+C | — | 608×92 | 1.3KB | 8 | 약 219KB |
| `lava-lamp.png` | A+B | — | 684×80 | 1.8KB | 9 | 약 214KB |
| `whiteboard.png` | D+F | — | 864×512 | 7.0KB | 18 | 약 1,728KB |
| `dartboard.png` | C | — | 380×432 | 4.1KB | 20 | 약 641KB |
| `globe.png` | A | — | 608×368 | 6.2KB | 32 | 약 874KB |
| `arc-lamp.png` | B+G | — | 228×456 | 7.4KB | 12 | 약 406KB |
| `easel.png` | C | — | 380×400 | 3.1KB | 12 | 약 594KB |
| `punching-bag.png` | C+E | — | 532×496 | 6.5KB | 28 | 약 1,031KB |
| `popcorn.png` | C | — | 380×376 | 4.1KB | 20 | 약 558KB |
| `arcade.png` | B+C | `prop-arcade` | 456×432 | 4.3KB | 14 | 약 770KB |
| `gacha.png` | C | — | 380×400 | 4.9KB | 20 | 약 594KB |
| `clock-tower.png` | A+G | — | 608×536 | 5.3KB | 18 | 약 1,273KB |
| `parrot.png` | E+C | — | 532×464 | 6.1KB | 28 | 약 964KB |
| `foosball.png` | C | — | 540×368 | 5.6KB | 20 | 약 776KB |
| `pool-table.png` | C | — | 860×496 | 8.7KB | 20 | 약 1,666KB |
| `claw.png` | C+A | — | 532×472 | 6.2KB | 28 | 약 981KB |
| `piano.png` | B+C | — | 840×576 | 11.1KB | 24 | 약 1,890KB |
| `trophy.png` | F | — | 432×480 | 5.5KB | 16 | 약 810KB |
| `statue.png` | F+A | — | 532×480 | 10.3KB | 28 | 약 998KB |
| `robot.png` | A+E | — | 456×440 | 4.6KB | 24 | 약 784KB |
| `gold-bar.png` | F+A | — | 532×400 | 7.6KB | 28 | 약 831KB |
| `pumpkin.png` | A+G | — | 608×288 | 3.5KB | 18 | 약 684KB |
| `ghost.png` | A | — | 304×96 | 0.9KB | 4 | 약 114KB |
| `cherry-tree.png` | A | — | 304×592 | 5.1KB | 16 | 약 703KB |
| `bookshelf.png` | C | — | 540×464 | 5.9KB | 20 | 약 979KB |
| **소계** | | 25장 | | 137.1KB | 485 | 약 21,082KB |

### 3묶음 (중 · 레벨 전용·소품)

| 시트 | 종류 | 함께 쓰는 상품 | 픽셀 크기 | 용량 | 장수 | 메모리(RGBA) |
|---|---|---|---|---|---|---|
| `lv-meeting-table.png` | F | — | 560×520 | 7.3KB | 16 | 약 1,138KB |
| `lv-glass-table.png` | F | — | 688×536 | 10.3KB | 16 | 약 1,441KB |
| `lv-mailbox.png` | D | — | 608×384 | 5.4KB | 32 | 약 912KB |
| `lv-fridge.png` | C | — | 380×448 | 4.4KB | 20 | 약 665KB |
| `lv-vending.png` | B+C | — | 456×448 | 5.0KB | 14 | 약 798KB |
| `lv-pingpong.png` | C | `prop-pingpong` | 860×504 | 9.4KB | 20 | 약 1,693KB |
| `lv-floor-sign.png` | D+G | — | 608×432 | 4.9KB | 18 | 약 1,026KB |
| `lv-sleep-pod.png` | C | `prop-napPod` | 540×488 | 6.0KB | 20 | 약 1,029KB |
| `lv-espresso-bar.png` | C | — | 700×552 | 9.3KB | 20 | 약 1,509KB |
| `prop-coffeeCorner.png` | C | — | 540×448 | 6.4KB | 20 | 약 945KB |
| `lv-stage.png` | F | — | 816×688 | 26.5KB | 16 | 약 2,193KB |
| `lv-bbq.png` | C+A | `prop-bbq` | 864×504 | 11.9KB | 32 | 약 1,701KB |
| `lv-trophy-case.png` | F | `prop-trophies` `prop-lobbyTrophies` | 432×544 | 6.0KB | 16 | 약 918KB |
| `lv-hall-of-fame.png` | F | — | 560×664 | 10.3KB | 16 | 약 1,453KB |
| `lv-tall-bookshelf.png` | C | — | 540×576 | 7.4KB | 20 | 약 1,215KB |
| **소계** | | 15장 | | 130.5KB | 296 | 약 18,636KB |

### 4묶음 (하)

| 시트 | 종류 | 함께 쓰는 상품 | 픽셀 크기 | 용량 | 장수 | 메모리(RGBA) |
|---|---|---|---|---|---|---|
| `flower-pot.png` | F | — | 304×86 | 0.9KB | 4 | 약 102KB |
| `beanbag-blue.png` | C | — | 152×296 | 2.0KB | 8 | 약 176KB |
| `sofa-green.png` | C | — | 216×400 | 3.0KB | 8 | 약 338KB |
| `sofa-pink.png` | C | — | 216×400 | 3.0KB | 8 | 약 338KB |
| `lv-studio-sofa.png` | C | — | 216×400 | 3.1KB | 8 | 약 338KB |
| `record-shelf.png` | C | — | 380×304 | 3.2KB | 20 | 약 451KB |
| `icecream.png` | C | — | 380×288 | 3.7KB | 20 | 약 428KB |
| `vr-booth.png` | C | — | 380×472 | 5.2KB | 20 | 약 701KB |
| `dino.png` | E | — | 228×448 | 3.3KB | 12 | 약 399KB |
| `snowman.png` | A | — | 304×440 | 3.8KB | 16 | 약 523KB |
| `lunar-lantern.png` | A+G | — | 608×432 | 8.5KB | 32 | 약 1,026KB |
| `lv-kettle-shelf.png` | C | — | 380×360 | 3.8KB | 20 | 약 534KB |
| `lv-hanger.png` | E | — | 228×432 | 3.6KB | 12 | 약 385KB |
| `lv-shower.png` | C | — | 380×480 | 9.4KB | 20 | 약 713KB |
| `lv-dumbbell.png` | C | — | 540×400 | 7.2KB | 20 | 약 844KB |
| `lv-salad-bar.png` | C | — | 540×432 | 6.8KB | 20 | 약 911KB |
| `lv-hammock.png` | A+C | — | 864×448 | 10.0KB | 32 | 약 1,512KB |
| `lv-telescope.png` | C | — | 380×464 | 4.0KB | 20 | 약 689KB |
| `prop-kitchen.png` | C | — | 700×496 | 8.7KB | 20 | 약 1,356KB |
| `prop-cooler.png` | C | — | 380×400 | 3.6KB | 20 | 약 594KB |
| **소계** | | 20장 | | 96.8KB | 340 | 약 12,358KB |

**전체: 시트 72장 · 파일 448.1KB · 1386장 · 메모리 약 61.8MB (한 층에 놓인 상품의 시트만 올라간다)**

