# 1.3.1 구현 전 디자인 세부 — 단체방 B안 · 휴대폰 연결 1안

- 작성: 이디자 · 2026-11-13 · 요청: 정리드 (`v131-brief.md`)
- 기준 시안: `chat-header/chat-header.html`(B안 + 자동 접힘), `connect/connect.html`(1안), `connect/connect-handoff.md`
- 색·크기는 지금 코드에서 쓰는 Tailwind 클래스와 색 토큰 이름으로 적었습니다. 새 색 토큰은 없습니다. 다크는 토큰이 알아서 바뀌고, 따로 손볼 곳만 1-7에 적었습니다.
- 코드는 고치지 않았습니다. 아래 "기존 클래스"는 `ChatSide.tsx`·`ChatPage.tsx`(RoomTabs·RoomStatusStrip·StatusTip)에서 그대로 가져온 값입니다.

---

## 1. 단체방 B안 — 왼쪽 방 목록 + 자동 접힘

### 1-0. 적용 범위
- **데스크톱 배치(`data-layout`가 phone이 아닐 때)에만** 적용합니다. 세로 폰(`slim:` — ChatSlimBar), 좌우 분할(`split:`/`side:` — 왼쪽 ChatSide), 가로 짧은 폰(`short:`/`typing:`)은 **지금 모습 그대로** 둡니다. "기존 접힘 상태"는 이 변형들과 직원 칩 줄의 `+N명` 펼치기를 말하며, 둘 다 바꾸지 않습니다.
- 지금 머리 4줄(제목 / 설명 / 방 칩 줄(RoomTabs) / 직원 칩 줄)은 → **상단 2줄 + 왼쪽 방 목록**이 됩니다. 데스크톱에서 RoomTabs는 더 쓰지 않습니다.

### 1-1. 방 목록 칸 (펼친 모습)
| 항목 | 값 |
|---|---|
| 칸 | `w-[200px] shrink-0 flex flex-col gap-0.5 overflow-y-auto border-r bg-(--surface-chrome) p-2` (ChatSide 그대로) |
| 칸 머리 | 한 줄 `flex h-8 items-center px-2`: 왼쪽 '대화방'(`text-muted-foreground text-[11px] font-semibold`, 기존 `chat.rooms`), 오른쪽 끝 [접기] 버튼 `Button variant="ghost" className="size-7 p-0"` + `PanelLeftCloseIcon`(size-4) |
| 묶음 제목 | **전체 / 팀 / 랩** 3개. `text-muted-foreground/70 px-2 pt-2 pb-0.5 text-[11px] font-medium` (RoomTabs의 groupLabel 색과 같음). 첫 묶음 '전체'만 `pt-0.5`. 해당 방이 없는 묶음은 제목도 안 그림 |
| 항목 | `flex min-h-8 items-center gap-2 rounded-[10px] px-2 text-left text-sm` — **높이 32px** (ChatSide 그대로) |
| 항목 — 지금 방 | `bg-accent text-foreground font-medium` + `aria-current="true"` |
| 항목 — 나머지 | `text-muted-foreground hover:bg-accent/60` |
| 색 점 | `size-2 shrink-0 rounded-full`, 색은 팀·랩 색(전체 방은 `var(--primary)`) |
| 이름 | `min-w-0 flex-1 truncate`. 전체 방 항목은 '전체 방'(기존 `chat.room.allName`) |
| 결재 대기 점 | 이름 **오른쪽**, 안 읽은 수 배지 **바로 왼쪽**. `bg-status-waiting size-1.5 shrink-0 rounded-full` |
| 안 읽은 수 배지 | **줄 오른쪽 끝**. `bg-status-error min-w-4 shrink-0 rounded-full px-1.5 text-center text-[10px] leading-4 font-semibold text-white dark:text-background`. 100 이상은 `99+`. 지금 보고 있는 방은 그리지 않음(지금 규칙) |
| 회의실 | 랩 묶음 아래 `mt-2 border-t pt-2`로 한 칸 띄우고 지금 회의실 줄(`PresentationIcon size-3.5` + '회의실') 그대로 |
| 다른 PC 한 줄 | 칸 맨 아래 `mt-auto px-2 pt-3`에 RemoteLine (side: 분할과 같은 자리) |
| '지금 하는 일' 목록 | **데스크톱에서는 그리지 않음** — 상단 2줄이 같은 정보를 보여 줌. side:/slim:에서는 지금처럼 그림 (ChatSide에 끄는 속성 하나 추가) |

순서: 전체(전체 방) → 팀(팀 방들) → 랩(랩 방들) → 회의실 → 다른 PC 줄.

### 1-2. 상단 2줄
머리 칸: `border-b px-4 pt-3 pb-2` (지금 `px-6 py-4` → 줄임). 높이 약 80px (지금 4줄 약 150px).

**1줄 — 방 이름 줄** `flex h-8 items-center gap-1.5`
| 요소 | 값 |
|---|---|
| 방 이름 | `min-w-0 truncate text-base font-semibold` — 방 이름만(예: '클로드 오피스 전담 랩'). 전체 방은 '전체 방' |
| 꼬리표 | 팀 방이면 '팀', 랩 방이면 '랩'. `text-muted-foreground shrink-0 rounded-full border px-1.5 text-[10px] leading-4`. 전체 방은 없음 |
| 빈 칸 | `flex-1` |
| ⓘ | `Button size="sm" variant="ghost" className="size-8 p-0"` + `InfoIcon`. 누르면 PopMenu(아래로)에 방 설명(지금 `description`, `text-muted-foreground p-1.5 text-xs`) — ChatSlimBar의 ⓘ와 같은 방식 |
| 🔍 | 지금 버튼 그대로 `size-8 p-0` + `SearchIcon`. ⌘F·Ctrl+F도 그대로. 찾기 칸(ChatSearch)은 2줄 **아래**에 지금처럼 열림 |

**2줄 — 직원 줄** `mt-1.5 flex items-center gap-2`
| 요소 | 값 |
|---|---|
| 요약 | `text-muted-foreground shrink-0 text-xs` — '13명 · **1명 일하는 중**'. '1명 일하는 중' 부분만 `text-status-working font-medium`. 일하는 사람이 없으면 '13명 · 지금 일하는 사람 없음'. 전체 방은 지금 규칙대로 일하는 중·확인 필요·오류인 사람만 셈 |
| 칩 | 지금 RoomStatusStrip 칩 그대로(`bg-card hover:bg-accent ... rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs`, 아바타 `size-5`, 상태 테두리 `/50`). 마우스 올리면 지금 StatusTip, 누르면 직원 패널 |
| 넘침 | 지금처럼 6명 넘으면 `+N명` 버튼(`text-muted-foreground hover:bg-accent rounded-full border px-2.5 py-0.5 text-xs`), 누르면 줄바꿈해 모두 펼침 |
| 대화 칸이 560px 아래 | 칩 대신 **얼굴 겹침**(`flex -space-x-1.5`, 아바타 `ring-background size-5 ring-2`, 최대 3) + 요약 글. 얼굴·요약을 누르면 위 `+N명`과 같이 모두 펼침 |

### 1-3. 56px 띠 (접힌 모습)
| 항목 | 값 |
|---|---|
| 띠 | `w-14 shrink-0 flex flex-col items-center gap-1 overflow-y-auto border-r bg-(--surface-chrome) py-2` |
| ≡ (맨 위) | `Button variant="ghost" className="size-9 p-0"` + `MenuIcon size-4`, `aria-expanded`. 누르면 겹쳐 펼침(1-4) |
| 방 아이콘 | `relative flex size-9 items-center justify-center rounded-[10px] text-[13px] font-semibold text-foreground` |
| 아이콘 바탕 | 팀·랩 색을 옅게: `style={{ background: 'color-mix(in srgb, <색> 18%, transparent)' }}` (다크는 `28%`). 전체 방은 `bg-primary/15` |
| 머리 글자 색 | **`text-foreground`(본문색)로 통일.** 팀 색 글자는 노랑(QA 등)·연두 팀이 라이트에서 대비 3:1도 안 나와서 쓰지 않음. 색 구분은 바탕이 맡음 |
| 머리 글자 | 이름 첫 글자 1자(한글 '프', '디'). 이름이 영문 대문자 2자로 시작하면 2자('PO', 'QA'). 전체 방은 '전' |
| 랩 모양 | 랩 방은 `rounded-full`(동그라미)로 팀(`rounded-[10px]`)과 모양을 다르게 |
| 지금 방 | `ring-primary ring-2` + 띠 왼쪽 막대 `absolute left-0 h-5 w-[3px] rounded-r-full bg-primary` (아이콘 세로 가운데) |
| 안 읽은 수 배지 | 아이콘 **오른쪽 위** `absolute -top-1 -right-1` + 1-1 배지 클래스 + `ring-2 ring-(--surface-chrome)`. 99+ |
| 결재 대기 점 | 아이콘 **오른쪽 아래** `absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-status-waiting ring-2 ring-(--surface-chrome)` |
| 묶음 구분 | 묶음 제목 대신 얇은 선 `my-1 h-px w-6 bg-border` (전체 ↔ 팀 ↔ 랩) |
| 회의실 | 맨 아래 `mt-auto` `Button variant="ghost" className="size-9 p-0"` + `PresentationIcon size-4` |
| 다른 PC 줄 | 띠에서는 안 보임 → ⓘ 팝업 맨 아래에 RemoteLine을 함께 보여 줌 |
| 접근성 | 아이콘마다 `aria-label` = '프론트엔드 팀 방 · 새 메시지 68개 · 결재·질문 기다림'(있는 것만), `aria-current` |

**마우스 올림 말풍선**
- 모양: `bg-popover text-popover-foreground pointer-events-none fixed z-50 rounded-lg border px-2.5 py-1.5 text-xs shadow-lg` (StatusTip과 같은 계열, 폭은 내용만큼, `max-w-60`)
- 자리: 아이콘 **오른쪽** 8px, 세로 가운데 (`left: rect.right + 8`, `top: rect.top + rect.height/2`, `-translate-y-1/2`)
- 내용 1줄: **방 이름**(`font-medium`) + ` · 안 읽은 글 68` (있을 때만) / 2줄: '결재·질문 기다림'(`text-status-waiting`, 있을 때만)
- 마우스 올림·키보드 초점 둘 다 뜸, 300ms 뒤에 뜨고 떠나면 바로 사라짐. 띠를 스크롤하면 닫음(StatusTip 규칙과 같음)

### 1-4. ≡로 겹쳐 펼치기 · 📌 고정 · 직접 접기
- ≡를 누르면 1-1 방 목록(200px)이 띠 **위에 겹쳐** 뜹니다. 대화는 밀리지 않습니다.
  - 겹친 목록: `absolute inset-y-0 left-0 z-30 w-[200px] border-r bg-(--surface-chrome) p-2 shadow-lg`. 뒤를 어둡게 하지 않음.
  - 칸 머리 오른쪽 버튼이 [접기] 대신 **📌 고정**(`PinIcon size-4`, `Button variant="ghost" className="size-7 p-0"`). 시안의 📌 글자는 아이콘으로 그립니다.
  - 닫힘: 방·회의실을 고름 / 바깥을 누름 / Esc / ≡ 다시 누름.
- 📌을 누르면 **고정**: 겹친 목록이 그대로 칸(1-1)이 되어 대화를 밀고, 자동 접힘을 더 하지 않습니다. 고정된 칸의 머리 오른쪽 버튼은 [접기]로 바뀝니다.
- 펼친 칸의 [접기]를 누르면 **직접 접음**: 띠가 되고 자동으로 다시 펴지지 않습니다. 띠의 ≡ → 📌로 다시 고정할 수 있습니다.
- 상태는 3가지: `자동`(기본) / `고정` / `직접 접음`. 사람이 고른 것(고정·직접 접음)이 자동보다 우선이고, 앱을 껐다 켜도 남깁니다. `고정`이나 `직접 접음`일 때 칸 머리 버튼을 길게 설명하지 않고 `title`로만 알림.
- 고정 상태 표시: 고정 중이면 칸 머리 '대화방' 옆에 작은 `PinIcon size-3 text-primary`.

### 1-5. 자동 접힘 기준
- 잴 것: **단체방 본문 줄 전체(방 목록 + 대화)의 실제 폭**. 창 폭이 아니라, 앱 사이드바·직원 패널을 뺀 자리를 잽니다(직원 패널을 열고 닫거나 넓힐 때도 맞게 바뀜). 대화 칸만 재면 접고 펴는 동안 폭이 바뀌어 깜빡일 수 있어 바깥 줄을 잽니다.
- 접힘: 본문 폭 **< 840px** (= 대화 칸 640px + 방 목록 200px).
- 펴짐: 본문 폭 **≥ 856px** (16px 여유를 두어 경계에서 깜빡이지 않게).
- 결과(시안 기준): 1400px 창 + 직원 패널 → 그대로 펼침(대화 642px). 1100px 창 + 직원 패널 → 띠(대화 486px). 직원 패널을 닫으면 다시 펼침.
- 대화 칸 < 560px이면 1-2의 직원 줄이 얼굴 겹침으로 바뀜(띠와 따로 잼, 대화 칸 기준).
- 1000px 아래에서 직원 패널이 대화 위에 겹치는 지금 규칙(compact)은 그대로.

### 1-6. 지금 있는 버튼이 갈 자리
| 지금 | B안 |
|---|---|
| 제목 옆 🔍 대화 찾기 | 1줄 오른쪽 끝(ⓘ 오른쪽). 찾기 칸은 2줄 아래 |
| 제목 아래 설명 한 줄 | 1줄 ⓘ 팝업 안 |
| 방 칩 줄(전체·팀·랩 묶음) | 왼쪽 방 목록 / 띠 |
| 안 읽음 숫자·결재 점 | 목록 항목 오른쪽 / 띠 아이콘 오른쪽 위·아래 |
| 직원 칩 줄·`+N명` | 2줄 (그대로) |
| 회의실 (side:/slim: 목록 안) | 목록 맨 아래 / 띠 맨 아래 아이콘 |
| 다른 PC 한 줄(RemoteLine) | 목록 맨 아래, 띠일 때는 ⓘ 팝업 |
| 폴드 분할 ChatSide, 세로 폰 ▾ | 그대로 (같은 ChatSide를 씀) |

### 1-7. 다크
- 칸·띠 바탕 `bg-(--surface-chrome)`(다크 #181723), 선 `border`, 지금 방 `bg-accent`, 말풍선 `bg-popover` — 모두 토큰이 바뀜.
- 아이콘 바탕 섞는 비율만 18% → **28%** (`dark:` 쪽 값). 18%면 다크에서 바탕이 거의 안 보임.
- 안 읽은 수 배지 글자: 다크 `--status-error`(#FF6B6B)에 흰 글자는 대비 약 2.8:1이라 **`dark:text-background`**. 세로 폰·분할 화면 ChatSide도 같은 줄을 쓰므로 함께 바뀝니다.
- 지금 방 `ring-primary`(다크 #9B8CFF), 결재 점 `bg-status-waiting`(다크 #F2C94C)은 그대로 잘 보임.

### 1-8. 새 사전 키 (한국어, en·ja·zh는 같은 뜻으로)
| 키(제안) | ko |
|---|---|
| `chat.side.collapse` | 방 목록 접기 |
| `chat.side.expand` | 방 목록 펼치기 |
| `chat.side.pin` | 펼친 채로 고정 |
| `chat.side.unpin` | 고정 풀기 |
| `chat.side.tipUnread` | 안 읽은 글 {count} |
| `chat.head.summary` | {total}명 · {working}명 일하는 중 |
| `chat.head.summaryIdle` | {total}명 · 지금 일하는 사람 없음 |
| `chat.head.about` | 방 설명 |
| `chat.head.tagTeam` / `chat.head.tagLab` | 팀 / 랩 |

다시 쓰는 기존 키: `chat.rooms`, `chat.room.all`(묶음 '전체'), `chat.room.allName`(항목 '전체 방'), `chat.room.groupTeams`, `chat.room.groupLabs`, `chat.unread.count`, `chat.unread.approval`, `chat.search.open`, `nav.meeting`, `chat.status.more`/`less`.

### 1-9. 확인할 화면
라이트·다크 × 창 1024·1100·1400 × 직원 패널 닫힘·열림. 방 10개 넘을 때 목록·띠 스크롤, 안 읽은 수 99+, 팀 이름이 영문일 때 머리 글자.

---

## 2. 휴대폰 연결 1안 — 단계형 한국어 최종 문구

- 설정 메뉴와 화면 제목은 **'휴대폰·PC 연결'** 하나입니다. 지금 '원격'이 들어간 사용자용 문구는 모두 '연결'로 바꿉니다.
- 단계 번호는 원 안 숫자, 끝난 단계는 ✓. 끝난 단계는 한 줄로 접고 오른쪽에 [바꾸기].
- `{ }`는 앱이 채우는 값입니다.

### 2-0. 머리
- 제목: **휴대폰·PC 연결**
- 설명(처음, 연결이 꺼져 있을 때만): 휴대폰이나 내 다른 PC에서 이 사무실을 쓸 수 있어요. 세 단계면 끝나요.

### 2-1. ① 어디서 쓰실 건가요?
- 질문: **어디서 쓰실 건가요?**
- 선택지 (지금 기본 Tailscale은 그대로 '밖에서도'가 골라져 있음)
  - **같은 와이파이 안에서만** — 집·사무실 안에서만 써요. 따로 설치할 것이 없어요.
  - **밖에서도 (추천)** — 내 기기끼리 잇는 무료 앱 'Tailscale'을 PC와 휴대폰에 깔아요.
  - **고급: 공유기를 직접 설정할게요** — 공유기 설정을 아는 분만 고르세요.
- 접힌 한 줄: ✓ 어디서 쓰실 건가요? · {같은 와이파이 안에서만 / 밖에서도 쓰기 (Tailscale) / 공유기 직접 설정} [바꾸기]
- 연결이 켜진 채 바꿀 때 확인: 방식을 바꾸면 지금 연결된 휴대폰이 끊겨요. 새 QR을 다시 찍어야 해요. [바꾸기] [취소]

### 2-2. ② 준비물 확인
- 제목: **준비물 확인**
- 아래 줄: ↻ 저절로 다시 확인해요. 다 되면 다음 단계가 열려요.

**밖에서도 (Tailscale)** — 지금 3초마다 읽는 상태 4가지를 첫 줄에 씁니다.
| 상태 | 표시 | 문구 | 버튼 |
|---|---|---|---|
| 설치 안 됨 | ! | 이 PC에 Tailscale을 설치해 주세요 · 내 기기끼리 잇는 무료 앱이에요. | [Tailscale 받기] |
| 로그인 필요 | ! | 이 PC에서 Tailscale 로그인이 필요해요 · Tailscale을 열고 구글·애플 계정 등으로 로그인해 주세요. | [Tailscale 열기] |
| 꺼짐 | ! | 이 PC의 Tailscale이 꺼져 있어요 · Tailscale을 켜 주세요. | [Tailscale 열기] |
| 연결됨 | ✓ | 이 PC Tailscale 준비됨 | — |

- 둘째 줄(앱이 확인할 수 없음, 항상 표시): **휴대폰에도 Tailscale 설치 · 같은 계정으로 로그인** · 휴대폰에서 해 주세요. 이 단계는 앱이 확인할 수 없어요.
- 회사 안내(작게): 회사 PC라면 Tailscale을 써도 되는지 회사 보안 담당에게 먼저 물어보세요.
- 접힌 한 줄: ✓ 준비물 확인 · 이 PC Tailscale 준비됨 · 휴대폰 준비는 직접 확인

**같은 와이파이 안에서만**
- ✓ 따로 설치할 것이 없어요
- 휴대폰과 이 PC가 **같은 와이파이**에 있어야 해요. 회사·카페 와이파이는 기기끼리 막혀 있을 수 있어요.
- 접힌 한 줄: ✓ 준비물 확인 · 같은 와이파이에 연결

**고급: 공유기 직접 설정** — 지금 가이드의 포트·공유기 단계를 이 안에 그대로 둡니다. 머리 문구만:
- 연결 번호(포트): {port} · 공유기에서 이 번호를 이 PC로 열어 주세요.
- 접힌 한 줄: ✓ 준비물 확인 · 공유기 설정 · 연결 번호 {port}

### 2-3. ③ 무엇을 연결할까요?
- 잠겨 있을 때: **무엇을 연결할까요?** · 준비물이 확인되면 열려요.
- 열린 뒤 질문: **무엇을 연결할까요?** [📱 휴대폰] [💻 내 다른 PC]
- 연결이 꺼져 있으면 탭 아래 먼저: [연결 켜기] · 켜면 QR이 나와요.
- 안전 한 줄(③ 안에 한 번만): 🔒 연결한 기기는 이 PC의 AI Office를 모두 쓸 수 있어요(고용·설정·결재 포함). 내 기기만 연결하세요.

**휴대폰 탭**
1. 휴대폰에서 AI Office 앱을 열어요
2. 'PC 연결하기'를 눌러요
3. 이 QR을 비춰요
- 기다림: 휴대폰을 기다리는 중…
- 코드: 카메라가 안 되면 휴대폰 앱의 **'코드로 연결'**에 입력 · `{code}` [복사] → 누르면 '복사했어요'
- 주의: QR과 코드는 한 번 쓰면 사라져요. 사진으로 남기지 마세요.
- **이미 휴대폰이 연결돼 있을 때** (QR 대신 이 안내가 먼저 나옴):
  > 지금 휴대폰이 연결돼 있어요. **새 휴대폰을 연결하면 지금 휴대폰은 끊겨요.** 휴대폰은 한 대만 연결할 수 있어요.
  > [새 QR 만들고 계속] [취소]

**내 다른 PC 탭**
- 질문: 어느 쪽인가요? [이 PC 직원 빌려주기] [다른 PC 직원 데려오기]
- 계정 안내(작게, 한 번): 내 컴퓨터끼리 연결하는 기능이에요. 일을 맡기면 작업 폴더 복사본이 다른 PC로 넘어가고 그 PC에 로그인된 계정으로 처리돼요. 다른 사람의 계정이 로그인된 PC와는 연결하지 마세요.
- **이 PC 직원 빌려주기**
  - 다른 PC의 AI Office에서 '다른 PC 직원 데려오기'를 고르고 아래 정보를 넣어요.
  - 이 PC 주소: `{address}` · 연결 코드: `{code}` [연결 정보 복사]
  - 연결되거나 닫을 때까지 열려 있어요.
- **다른 PC 직원 데려오기**
  - 다른 PC에서 '이 PC 직원 빌려주기'를 열고, 그 화면의 주소와 코드를 적어 주세요.
  - 입력 칸: 다른 PC 주소 / 연결 코드 (XXXX-XXXX-XXXX) · [연결하기]
  - 연결 중: 연결하는 중… 다른 PC가 응답하지 않으면 1분 넘게 걸릴 수 있어요
  - 끝: {name}에 연결했어요. 이제 데려올 직원을 고르세요. [직원 고르기]
- 다른 PC도 연결이 켜져 있어야 해요. 두 PC 모두 이 화면에서 연결을 켜 주세요.

**완료 알림**: 연결됐어요! 이제 휴대폰에서 결재·지시를 할 수 있어요. (다른 PC면: {name} PC와 연결됐어요.)

### 2-4. 끝난 뒤 평소 화면
- 상태 한 줄: **연결 켜짐** · {밖에서도 쓸 수 있어요 / 같은 와이파이에서 쓸 수 있어요 / 공유기 설정으로 연결돼요} [끄기]
- 밑글: 쓰지 않을 땐 꺼 두면 안전해요.
- 끄기 확인: 연결을 끌까요? 휴대폰과 다른 PC에서 이 사무실을 쓸 수 없게 돼요. 다시 켜면 그대로 이어져요. [끄기] [취소]
- 꺼진 상태 한 줄: 연결 꺼짐 · 휴대폰과 다른 PC에서 쓸 수 없어요 [켜기]

**연결된 기기 {n}대** — 둘째 줄은 **'지금 연결됨'** 또는 **'{N}분 전 접속'** 하나만. '결재 N건 처리'는 쓰지 않습니다.
| 기기 | 첫 줄 | 둘째 줄 | 버튼 |
|---|---|---|---|
| 휴대폰 | 📱 휴대폰 | 지금 연결됨 / {N}분 전 접속 | — (끊기는 아래 빨간 접이식) |
| 직원을 데려온 PC | 💻 {PC 이름} · 이 PC가 직원 {n}명을 데려옴 | 지금 연결됨 / {N}분 전 접속 | [직원 고르기] [끊기] |
| 직원을 빌려 간 PC | 💻 {PC 이름} · 이 PC의 직원을 빌려 감 | 지금 연결됨 / {N}분 전 접속 | [끊기] |

- 시각 표시: 1분 안 '방금 접속', 1시간 안 '{N}분 전 접속', 하루 안 '{N}시간 전 접속', 그 뒤 '{M}월 {D}일 접속'.
- '지금 연결됨'은 `text-status-working`, 나머지는 `text-muted-foreground`.
- 휴대폰 접속 시각: 지금 저장되지 않으므로 **`AuthGuard`에 마지막 접속 시각 하나를 추가하는 쪽을 추천**합니다(브리프의 판단 항목). 추가하지 않으면 휴대폰 둘째 줄은 '지금 연결됨'일 때만 쓰고, 아닐 때는 '연결돼 있음'으로 둡니다. 이 PC를 다시 켠 뒤 아직 접속 기록이 없으면 '이 PC를 켠 뒤 아직 접속 안 함'.
- 기기 없음: 아직 연결된 기기가 없어요.
- 끊기 확인(PC): {name} 연결을 끊을까요? 데려온 직원도 함께 사라져요. 다시 쓰려면 처음부터 연결해야 해요. [끊기] [취소]
- 아래 버튼: [＋ 기기 추가] · [처음 안내 다시 보기]
  - [＋ 기기 추가] → ③ 단계를 다시 엶. 휴대폰을 고르면 이미 연결된 휴대폰이 있을 때 2-3의 끊김 안내가 먼저 나옴.

**▸ 고급 설정** (접이식, 접힌 줄: 연결 번호 {port} · 공유기 직접 설정 · 보안 확인 글자 · 최근 접속)
- 연결 번호(포트) / 공유기 직접 설정 / 보안 확인 글자 보기 / 최근 접속
- 최근 접속 한 줄: {시각} · {휴대폰 / 다른 PC 이름 / 알 수 없는 기기} · {상태 확인 / 결재 / 지시 …} · {성공 / 코드 틀림 · 막음}
- 그 아래 다시 접이식: 개발자용 자세히 ▸ (주소·요청 원문)

**▸ 휴대폰 모두 끊기** (빨간 접이식, 접힌 줄: 새 QR을 만들고 지금 휴대폰 연결을 끊어요 · 휴대폰을 잃어버렸을 때)
- 펼친 안: 지금 연결된 휴대폰이 바로 끊기고, 예전 QR과 코드는 더는 쓸 수 없어요. 다시 쓰려면 새 QR을 찍어 주세요. 다른 PC 연결은 그대로예요.
- 버튼: [휴대폰 모두 끊기] (빨간색) → 확인: 휴대폰 연결을 모두 끊고 새 QR을 만들까요? [모두 끊기] [취소]

### 2-5. 휴대폰 앱 화면 이름 맞춤 (참고)
- PC 쪽 '코드로 연결' = 휴대폰 앱 '주소로 연결' 버튼 이름을 **'코드로 연결'**로 맞춤 (안드로이드 `strings.xml`, 1.3.1 범위에 넣을지는 정리드 판단).

---

## 3. 정해지지 않은 것
- 휴대폰 마지막 접속 시각 저장(2-4) — 추천은 추가. 안 하면 문구 대체안대로.
- 휴대폰 앱 '코드로 연결' 이름 맞춤의 1.3.1 포함 여부.
- en·ja·zh 문구는 위 한국어가 확정되면 같은 뜻으로 맞춤.
