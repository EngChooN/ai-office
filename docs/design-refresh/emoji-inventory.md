# 이모지 전수 조사 (UI 사용처)

> 이디자 아이콘 시안용 기초 자료. 코드는 고치지 않았습니다. 조사 기준: `app/src` 전체 + `android` + `site` (2026-11-11, 앱 1.1.5)

## 0. 읽는 법·집계 기준

- **사용 횟수** = 화면에 나오는 코드 위치 수. 번역 사전(`i18n/dict`)은 4개 언어에 같은 이모지가 반복되므로 **한국어 값만** 1회로 셉니다(영·일·중에서 이모지가 달라지는 곳은 없는지 아래 §6에서 확인).
- 코드 주석 속 이모지는 화면에 안 나오므로 횟수에서 뺐습니다(주석만 있는 이모지는 §5).
- ✓ ★ ⚠ ⏸ ⬆ ➤ ✕ ♪ 는 그림 이모지가 아니라 **글자형 기호**입니다. 아이콘으로 바꿀 대상이지만 표에서 따로 표시했습니다.
- `{emoji}`처럼 **데이터에 이모지를 담아 화면이 꺼내 쓰는 곳**(상점 세트·미션, 코치 투어 등)은 데이터 정의 위치를 적었습니다. 화면에서의 표시 위치는 "화면" 열을 보세요.

**합계**: 화면 노출 380곳(그림 이모지 348곳 + 글자형 기호 32곳), 서로 다른 이모지 125종 + 기호 8종. 주석 속 41곳은 제외.

## 1. 이모지별 사용 횟수 (많은 순)

| 이모지 | 횟수 | 쓰이는 화면 | 구분 |
|---|---:|---|---|
| 🤖 | 19 | 사무실 지도, 시스템 메시지(채팅 알림 문구), 시스템 알림(토스트), 자동결재 표시·설정, 자율 진행 표시, 직원 기록(로그), 트레이 메뉴, 트레이 아이콘 옆 글자 | 이모지 |
| ✅ | 15 | 사무실 지도, 상점, 시스템 메시지(채팅 알림 문구), 업무 보드, 온보딩(첫 실행), 직원 패널, 채팅, 코치 투어(둘러보기) | 이모지 |
| 📘 | 13 | 랩(실험실) 화면, 매뉴얼, 사무실 지도, 슬래시 메뉴, 시스템 메시지(채팅 알림 문구), 업무 보드, 직원 패널, 코치 투어(둘러보기) | 이모지 |
| 🔁 | 11 | 랩(실험실) 화면, 매뉴얼, 업무 보드, 직원 패널, 채팅, 채팅(말풍선 부속) | 이모지 |
| 🎉 | 11 | 결재함, 레벨업 연출, 레벨업 팝업, 사무실 지도, 상점, 새 소식 팝업, 시스템 메시지(채팅 알림 문구), 시스템 알림(토스트), 온보딩(첫 실행), 지식 창고(갤러리), 튜토리얼 | 이모지 |
| 💰 | 10 | 레벨업 연출, 레벨업 팝업, 사무실 지도, 상단 바, 상점, 튜토리얼 | 이모지 |
| ✓ | 10 | 개발용 미리보기(앱 화면 아님), 꾸미기 서랍, 사무실 지도 버튼·배지, 상점, 설정, 채팅(말풍선 부속) | 기호 |
| ⚠ | 10 | MCP 추가 창, 변경 검토 카드, 시스템 알림(토스트), 직원 패널, 채팅, 채팅(말풍선 부속), 회의 | 기호 |
| 🙋 | 9 | 매뉴얼, 사무실 지도, 사무실 지도 버튼·배지, 시스템 메시지(채팅 알림 문구), 업무 보드, 회의 | 이모지 |
| 💬 | 8 | 데모데이 무대, 상점, 시스템 메시지(채팅 알림 문구), 업무 보드, 온보딩(첫 실행), 채팅, 코치 투어(둘러보기) | 이모지 |
| ☕ | 8 | 사무실 지도, 상점 | 이모지 |
| 🧪 | 7 | 고용 창, 대시보드, 랩(실험실) 화면, 매뉴얼, 시스템 메시지(채팅 알림 문구), 업무 보드, 직원 패널 | 이모지 |
| 📋 | 7 | 결재함, 사무실 지도 버튼·배지, 시스템 메시지(채팅 알림 문구), 채팅, 채팅(말풍선 부속), 코치 투어(둘러보기) | 이모지 |
| 🗂 | 6 | 업무 보드, 직원 도구 결과 문구, 채팅, 코치 투어(둘러보기) | 이모지 |
| 🏢 | 6 | 레벨업 연출, 레벨업 팝업, 상점, 온보딩(첫 실행), 코치 투어(둘러보기) | 이모지 |
| 👍 | 6 | 사무실 지도, 채팅 | 이모지 |
| 🎯 | 5 | 랩(실험실) 화면, 사무실 지도, 상점 | 이모지 |
| 🏆 | 5 | 데모데이 무대, 상점, 시스템 메시지(채팅 알림 문구), 직원 카드 | 이모지 |
| 🚀 | 5 | 사무실 지도, 상점, 시스템 메시지(채팅 알림 문구), 코치 투어(둘러보기) | 이모지 |
| ✨ | 5 | 레벨업 연출, 매뉴얼, 새 소식, 지식 창고(갤러리), 코치 투어(둘러보기) | 이모지 |
| 📱 | 5 | 시스템 알림(토스트), 트레이 메뉴, 휴대폰 미리보기 가짜 데이터, 휴대폰 원격 지시 표시 | 이모지 |
| 🌐 | 4 | 사무실 지도, 직원 패널, 채팅 | 이모지 |
| 🎤 | 4 | 데모데이 무대, 상점 | 이모지 |
| 🕹 | 4 | 사무실 지도, 상점 | 이모지 |
| 🛋 | 4 | 사무실 지도, 상점 | 이모지 |
| 📚 | 4 | 상점, 직원 기록(로그), 채팅 | 이모지 |
| 📁 | 3 | 대시보드, 랩(실험실) 화면, 조직도 | 이모지 |
| 🛍 | 3 | 상점, 코치 투어(둘러보기) | 이모지 |
| 🗣 | 3 | 상점, 코치 투어(둘러보기) | 이모지 |
| ★ | 3 | 사무실 지도, 직원 카드, 직원 패널 | 기호 |
| 🔌 | 3 | 직원 패널, 채팅 | 이모지 |
| ⏸ | 3 | 대기 사유 줄(직원 상태), 시스템 메시지(채팅 알림 문구), 업무 보드 | 기호 |
| 🕘 | 3 | 채팅, 채팅(말풍선 부속) | 이모지 |
| 💡 | 3 | 레벨업 팝업, 사무실 지도 | 이모지 |
| 👀 | 3 | 사무실 지도 | 이모지 |
| ❓ | 3 | 사무실 지도, 시스템 메시지(채팅 알림 문구) | 이모지 |
| 🐠 | 3 | 사무실 지도 | 이모지 |
| 🎁 | 3 | 사무실 지도, 상점 | 이모지 |
| 🎃 | 3 | 사무실 지도, 상점 | 이모지 |
| ⛄ | 3 | 사무실 지도, 상점 | 이모지 |
| 🎨 | 3 | 사무실 지도, 튜토리얼 | 이모지 |
| 🎬 | 3 | 시스템 메시지(채팅 알림 문구) | 이모지 |
| 🔥 | 2 | 상점 | 이모지 |
| 🏅 | 2 | 상점 | 이모지 |
| 🧑‍💼 | 2 | 온보딩(첫 실행), 코치 투어(둘러보기) | 이모지 |
| 📈 | 2 | 상점, 코치 투어(둘러보기) | 이모지 |
| 📣 | 2 | 상점, 코치 투어(둘러보기) | 이모지 |
| 👏 | 2 | 데모데이 무대, 직원 카드 | 이모지 |
| 💦 | 2 | 사무실 지도 | 이모지 |
| 🐶 | 2 | 사무실 지도 | 이모지 |
| 🐱 | 2 | 사무실 지도 | 이모지 |
| 🐟 | 2 | 사무실 지도 | 이모지 |
| 🦜 | 2 | 사무실 지도 | 이모지 |
| 🧸 | 2 | 사무실 지도 | 이모지 |
| 🌸 | 2 | 사무실 지도 | 이모지 |
| 🎵 | 2 | 사무실 지도 | 이모지 |
| 🎶 | 2 | 사무실 지도 | 이모지 |
| 🎹 | 2 | 사무실 지도 | 이모지 |
| 🎱 | 2 | 사무실 지도 | 이모지 |
| 🏓 | 2 | 사무실 지도 | 이모지 |
| ⚽ | 2 | 사무실 지도 | 이모지 |
| 🥊 | 2 | 사무실 지도 | 이모지 |
| 🏃 | 2 | 사무실 지도 | 이모지 |
| 🦖 | 2 | 사무실 지도 | 이모지 |
| 🥽 | 2 | 사무실 지도 | 이모지 |
| 🍦 | 2 | 사무실 지도 | 이모지 |
| 🍿 | 2 | 사무실 지도 | 이모지 |
| 🎄 | 2 | 사무실 지도 | 이모지 |
| 🕰 | 2 | 사무실 지도 | 이모지 |
| 📖 | 2 | 사무실 지도 | 이모지 |
| 🌍 | 2 | 사무실 지도 | 이모지 |
| 💎 | 2 | 상점 | 이모지 |
| 👑 | 2 | 상점 | 이모지 |
| ⚡ | 2 | 상점 | 이모지 |
| 🏙 | 2 | 상점 | 이모지 |
| 🏬 | 2 | 상점 | 이모지 |
| 📄 | 2 | 사무실 지도 | 이모지 |
| ♪ | 2 | 사무실 지도 | 기호 |
| 🟡 | 2 | 트레이 메뉴 | 이모지 |
| ⬆ | 2 | 트레이 메뉴, 트레이 아이콘 옆 글자 | 기호 |
| 📦 | 2 | 시스템 메시지(채팅 알림 문구), 시스템 알림(토스트) | 이모지 |
| 📊 | 2 | 시스템 메시지(채팅 알림 문구), 시스템 알림(토스트) | 이모지 |
| 🗓 | 1 | 상점 | 이모지 |
| 💼 | 1 | 상점 | 이모지 |
| 🧑‍💻 | 1 | 코치 투어(둘러보기) | 이모지 |
| 🧭 | 1 | 코치 투어(둘러보기) | 이모지 |
| ⏰ | 1 | 코치 투어(둘러보기) | 이모지 |
| 📑 | 1 | 코치 투어(둘러보기) | 이모지 |
| 💳 | 1 | 코치 투어(둘러보기) | 이모지 |
| ⚙ | 1 | 코치 투어(둘러보기) | 이모지 |
| 🖱 | 1 | 직원 패널 | 이모지 |
| 👉 | 1 | 튜토리얼 | 이모지 |
| ✕ | 1 | MCP 추가 창 | 기호 |
| 🧰 | 1 | 직원 패널 | 이모지 |
| 🛡 | 1 | 직원 패널 | 이모지 |
| 🎊 | 1 | 레벨업 연출 | 이모지 |
| ⭐ | 1 | 레벨업 연출 | 이모지 |
| ➤ | 1 | 채팅(말풍선 부속) | 기호 |
| 💤 | 1 | 사무실 지도 | 이모지 |
| 🌿 | 1 | 상점 | 이모지 |
| 💪 | 1 | 상점 | 이모지 |
| 🐾 | 1 | 상점 | 이모지 |
| 🖊 | 1 | 상점 | 이모지 |
| 🥉 | 1 | 상점 | 이모지 |
| 🥈 | 1 | 상점 | 이모지 |
| 🥇 | 1 | 상점 | 이모지 |
| 👥 | 1 | 상점 | 이모지 |
| 🧩 | 1 | 상점 | 이모지 |
| 🗼 | 1 | 상점 | 이모지 |
| 🎖 | 1 | 상점 | 이모지 |
| 🎙 | 1 | 상점 | 이모지 |
| 🖼 | 1 | 상점 | 이모지 |
| 💵 | 1 | 상점 | 이모지 |
| 🏦 | 1 | 상점 | 이모지 |
| 🔧 | 1 | 새 소식 | 이모지 |
| 🐞 | 1 | 새 소식 | 이모지 |
| 📒 | 1 | 상점 | 이모지 |
| 🏁 | 1 | 채팅 | 이모지 |
| 🚪 | 1 | 사무실 지도 버튼·배지 | 이모지 |
| 🪑 | 1 | 사무실 지도 버튼·배지 | 이모지 |
| 🔍 | 1 | 채팅 | 이모지 |
| 📥 | 1 | 업무 보드 | 이모지 |
| 🪙 | 1 | 업무 보드 | 이모지 |
| ⛔ | 1 | 채팅 | 이모지 |
| 🟢 | 1 | 트레이 메뉴 | 이모지 |
| 🔴 | 1 | 트레이 메뉴 | 이모지 |
| ⚪ | 1 | 트레이 메뉴 | 이모지 |
| ⚫ | 1 | 트레이 메뉴 | 이모지 |
| 🙏 | 1 | 시스템 메시지(채팅 알림 문구) | 이모지 |
| 🤝 | 1 | 시스템 메시지(채팅 알림 문구) | 이모지 |
| ⏹ | 1 | 시스템 메시지(채팅 알림 문구) | 이모지 |
| ⏳ | 1 | 시스템 메시지(채팅 알림 문구) | 이모지 |
| 🔒 | 1 | 시스템 알림(토스트) | 이모지 |

## 2. 의미별로 묶어 본 아이콘 후보 (이디자 시안용 제안)

같은 뜻에 여러 이모지가 섞이거나, 한 이모지가 여러 뜻으로 쓰이는 곳을 정리했습니다. 아이콘 세트를 만들 때 이 단위로 통일하면 가짓수가 크게 줄어듭니다.

| 의미 | 현재 이모지 | 비고 |
|---|---|---|
| 성공·완료·승인 | ✅ ✓ 👍 🏁 | ✅(결재 승인·완료 말풍선·직원 상태), ✓(배송 상태·완료 배지·구입 표시·체크), 👍(확인함 반응) |
| 경고·오류·반려 | ⚠ ⚠️ ⛔ 💦 ❓ | ⚠ 경고 줄, ⛔ 반려, 💦 지도 오류 말풍선 |
| 질문·내 확인 필요 | 🙋 ❓ | 지도 대기 말풍선·결재 질문·회의 결정 대기 |
| 자동결재·자율·AI | 🤖 | 한 이모지가 자동결재·자율 진행·트레이·직원 기록·채팅 알림에 두루 쓰임 — 가장 많이 쓰인 그림 이모지 |
| 반복·다시 하기·단계 진행 | 🔁 🕘 | 🔁이 반복 지시·매뉴얼 단계·다시 해 줘·대체됨 등 여러 뜻으로 쓰임(뜻 분리 필요) |
| 매뉴얼(스킬) | 📘 | 매뉴얼·스킬 라벨 전반 |
| 랩 | 🧪 | 랩 라벨 전반 |
| 회의·기록·카드 | 📋 🗣️ 🎤 📑 | 회의/기획/카드 열기 |
| 기획안 | 🗂️ | 업무 보드·채팅 기획안, 코치 투어 대시보드 |
| 돈·보상 | 💰 🪙 💵 🏦 💳 | 자금 표시·토큰 비용·미션 보상 |
| 연결·인터넷·휴대폰 | 📱 🌐 🔌 | 원격 직원은 🌐 이름표, 휴대폰은 📱 |
| 축하 | 🎉 🎊 ✨ ⭐ 🏆 🏅 👏 | 레벨업·온보딩·MVP·빈 결재함 |
| 상태 점(트레이) | 🟢 🟡 🔴 ⚪️ ⚫️ | working/waiting/error/idle/offline 색깔 점. 색 의미 그대로 아이콘화 필요 |
| 시스템 메시지 접두 | 📦 🔧 🐞 ✨ 🚀 🎬 🤝 | 채팅·변경 기록 접두 |
| 사무실 지도 말풍선 | 💡 💤 ☕ 🎵 등 40여 종 | 가구·직원 상호작용 연출(§3-C). 이미 `emoteArt.ts`가 이모지 → 그린 그림(done·idea·ask 등 11종)으로 변환해 그림. |

> 참고: 사무실 지도 말풍선은 **이미 이모지를 그림 종류(done·idea·ask·sweat·look·good·question·coffee·love·note·excited·happy·relax)로 바꿔 그리는 구조**(`app/src/renderer/map/iso/emoteArt.ts`)입니다. 시안은 이 13종 그림 단위로 보면 되고, 사전에 없는 이모지는 이모지 글자 그대로 나옵니다.

## 3. 화면별 사용처 (파일:줄)

### MCP 추가 창 — 3곳 (⚠×2 ✕×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/McpAddDialog.tsx:188` | ⚠ (기호) | ⚠ {t('mcpAdd.shadow', { source: s.source, name: s.name })} |
| `renderer/features/McpAddDialog.tsx:192` | ⚠ (기호) | {(error \|\| (tab === 'json' && json.trim() && previewError)) && <p className="text-status-error text- |
| `renderer/features/McpAddDialog.tsx:219` | ✕ (기호) | ✕ |

### 결재함 — 2곳 (📋×1 🎉×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/InboxPage.tsx:79` | 📋 | <span className="text-muted-foreground text-xs">📋 {meeting.topic}</span> |
| `shared/i18n/dict/featuresA.ts:187` `inbox.empty` | 🎉 | ko: '결재할 건이 없어요. 🎉' |

### 고용 창 — 1곳 (🧪×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/HireDialog.tsx:295` | 🧪 | 🧪 {l.name} |

### 꾸미기 서랍 — 1곳 (✓×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/shell.ts:131` `drawer.hintTouch` | ✓ (기호) | ko: '끌어서 옮기고 ✓로 놓아요' |

### 대기 사유 줄(직원 상태) — 1곳 (⏸×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/WaitReasonLine.tsx:23` | ⏸ (기호) | return <div className={cn('text-muted-foreground text-xs', className)}>⏸ {t(WAIT_REASON_KEY[reason]) |

### 대시보드 — 2곳 (🧪×1 📁×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/Dashboard.tsx:21` | 🧪 | const GROUP_EMOJI: Record<GroupKind, string> = { team: '', lab: '🧪 ', project: '📁 ', none: '' } |
| `renderer/features/Dashboard.tsx:21` | 📁 | const GROUP_EMOJI: Record<GroupKind, string> = { team: '', lab: '🧪 ', project: '📁 ', none: '' } |

### 데모데이 무대 — 7곳 (🎤×3 💬×2 👏×1 🏆×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/DemoStage.tsx:369` | 💬 | <span className="line-clamp-3 whitespace-pre-line">💬 {plainSpeech(text)}</span> |
| `renderer/features/DemoStage.tsx:409` | 👏 | 👏 {t('stage.react.clap')} |
| `renderer/features/DemoStage.tsx:412` | 🏆 | 🏆 {t('stage.react.mvp')} |
| `renderer/features/DemoStage.tsx:429` | 💬 | 💬 {t('stage.react.comment')} |
| `renderer/features/DemoStage.tsx:461` | 🎤 | 🎤 {t('stage.banner')} |
| `renderer/features/DemoStage.tsx:487` | 🎤 | 🎤 {t('stage.openNow')} |
| `shared/i18n/dict/gallery.ts:72` `stage.title` | 🎤 | ko: '🎤 데모데이' |

### 랩(실험실) 화면 — 5곳 (🧪×1 🎯×1 📁×1 🔁×1 📘×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/LabSection.tsx:84` | 🧪 | <h2 className="text-sm font-semibold">🧪 {t('lab.title')}</h2> |
| `renderer/features/LabSection.tsx:194` | 🎯 | {lab.goal && <p className="text-muted-foreground text-xs">🎯 {lab.goal}</p>} |
| `renderer/features/LabSection.tsx:195` | 📁 | {lab.cwd && <p className="text-muted-foreground text-xs">📁 {shortPath(lab.cwd)}</p>} |
| `renderer/features/LabSection.tsx:273` | 🔁 | <div className="text-xs font-semibold">🔁 {t('lab.work.title')}</div> |
| `renderer/features/LabSection.tsx:278` | 📘 | 📘 {m} |

### 레벨업 연출 — 6곳 (🎉×1 ✨×1 🎊×1 💰×1 🏢×1 ⭐×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/LevelUp.tsx:15` | 🎉 | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |
| `renderer/features/LevelUp.tsx:15` | ✨ | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |
| `renderer/features/LevelUp.tsx:15` | 🎊 | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |
| `renderer/features/LevelUp.tsx:15` | 💰 | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |
| `renderer/features/LevelUp.tsx:15` | 🏢 | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |
| `renderer/features/LevelUp.tsx:15` | ⭐ | const CONFETTI = ['🎉', '✨', '🎊', '💰', '🏢', '⭐'] |

### 레벨업 팝업 — 6곳 (💰×3 🏢×1 🎉×1 💡×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/featuresA.ts:799` `levelUp.revamp.title` | 🏢 | ko: '🏢 사무실이 새로 바뀌었어요' |
| `shared/i18n/dict/featuresA.ts:833` `levelUp.title` | 🎉 | ko: '🎉 회사 Lv.{level} 달성!' |
| `shared/i18n/dict/featuresA.ts:841` `levelUp.drawerNote` | 💡 | ko: '💡 사무실 모양이 바뀌면서 바닥 밖으로 나가거나 회의실 자리가 된 가구는 꾸미기 서랍에 들어가요. 서랍에서 다시 놓을 수 있어요.', |
| `shared/i18n/dict/featuresA.ts:847` `levelUp.reward.kept` | 💰 | ko: '💰 받은 레벨업 보상은 그대로예요. 아직 받지 않은 레벨에 처음 오르면 보상이 들어와요', |
| `shared/i18n/dict/featuresA.ts:853` `levelUp.reward.newLevels` | 💰 | ko: '💰 새로 오른 레벨 보상 {amount}이 회사 자금에 들어왔어요', |
| `shared/i18n/dict/featuresA.ts:859` `levelUp.reward.received` | 💰 | ko: '💰 레벨업 보상 {amount}이 회사 자금에 들어왔어요', |

### 매뉴얼 — 6곳 (📘×2 🧪×1 🔁×1 ✨×1 🙋×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ManualsPage.tsx:342` | 🧪 | 🧪 {l.name} |
| `shared/i18n/dict/featuresA.ts:317` `manuals.section.process` | 🔁 | ko: '🔁 단계 진행 매뉴얼 — 팀·랩에 교육' |
| `shared/i18n/dict/featuresA.ts:318` `manuals.section.personal` | 📘 | ko: '📘 개인 매뉴얼 — 직원에게 교육' |
| `shared/i18n/dict/featuresA.ts:337` `manuals.editor.draftLabel` | ✨ | ko: '✨ 직원에게 초안 맡기기' |
| `shared/i18n/dict/featuresA.ts:363` `manuals.editor.needsMyCheck` | 🙋 | ko: '끝나면 내 확인 🙋' |
| `shared/i18n/dict/featuresA.ts:371` `manuals.train.title` | 📘 | ko: '📘 {name} 교육' |

### 변경 검토 카드 — 1곳 (⚠×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ChangesetCard.tsx:176` | ⚠ (기호) | {file.verdict === 'conflict' && file.conflict && <span className="text-status-waiting font-medium">⚠ |

### 사무실 지도 · 가구 상호작용 말풍선 — 39곳 (🕹×2 ♪×2 🐠×2 🛋×2 ☕×1 📖×1 🎯×1 🎨×1 🥊×1 🍿×1 🎵×1 🍦×1 🎶×1 🎁×1 🦜×1 ⚽×1 🏃×1 🐟×1 🐱×1 🐶×1 🎱×1 🧸×1 🎹×1 🥽×1 🤖×1 🌍×1 🕰×1 🚀×1 🦖×1 💰×1 🎄×1 🎃×1 ⛄×1 🌸×1 🏓×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/iso/actions.ts:9` | ☕ | 'coffee-machine': { emote: '☕', say: ['샷 추가!', '라떼 한 잔', '카페인 충전'] }, |
| `shared/iso/actions.ts:10` | 📖 | bookshelf: { emote: '📖', say: ['이 책 재밌네', '클린 코드 다시 읽기'] }, |
| `shared/iso/actions.ts:11` | 🎯 | dartboard: { emote: '🎯', say: ['불스아이!', '아깝다…'] }, |
| `shared/iso/actions.ts:12` | 🎨 | easel: { emote: '🎨', say: ['오늘의 작품', '추상화예요'] }, |
| `shared/iso/actions.ts:13` | 🥊 | 'punching-bag': { emote: '🥊', say: ['버그 나가!', '스트레스 해소!'] }, |
| `shared/iso/actions.ts:14` | 🍿 | popcorn: { emote: '🍿', say: ['팝콘 냠냠', '고소하다'] }, |
| `shared/iso/actions.ts:15` | 🕹️ | arcade: { emote: '🕹️', say: ['최고 기록!', '한 판만 더'] }, |
| `shared/iso/actions.ts:16` | 🎵 | 'record-shelf': { emote: '🎵', say: ['오늘은 재즈', 'LP 감성'] }, |
| `shared/iso/actions.ts:17` | 🍦 | icecream: { emote: '🍦', say: ['민초 최고', '하나만 먹을게요'] }, |
| `shared/iso/actions.ts:18` | 🎶 | jukebox: { emote: '🎶', say: ['신청곡 틀었어요', '♪ 둠칫 둠칫'] }, |
| `shared/iso/actions.ts:18` | ♪ (기호) | jukebox: { emote: '🎶', say: ['신청곡 틀었어요', '♪ 둠칫 둠칫'] }, |
| `shared/iso/actions.ts:19` | 🎁 | gacha: { emote: '🎁', say: ['레어 나와라!', '또 꽝…'] }, |
| `shared/iso/actions.ts:20` | 🦜 | parrot: { emote: '🦜', say: ['커밋해! 커밋해!', '안녕 앵무야'] }, |
| `shared/iso/actions.ts:21` | ⚽ | foosball: { emote: '⚽', say: ['골!', '한 판 붙자'] }, |
| `shared/iso/actions.ts:22` | 🏃 | treadmill: { emote: '🏃', say: ['5km 완주', '헉헉'] }, |
| `shared/iso/actions.ts:23` | 🐠 | aquarium: { emote: '🐠', say: ['물고기 귀엽다', '힐링 중'] }, |
| `shared/iso/actions.ts:24` | 🐟 | fishbowl: { emote: '🐟', say: ['밥 줄게'] }, |
| `shared/iso/actions.ts:25` | 🐱 | 'cat-tower': { emote: '🐱', say: ['냥냥아~', '털 묻었다'] }, |
| `shared/iso/actions.ts:26` | 🐶 | 'dog-bed': { emote: '🐶', say: ['멍멍이 산책 갈까?', '착하다~'] }, |
| `shared/iso/actions.ts:27` | 🎱 | 'pool-table': { emote: '🎱', say: ['8번 공 넣는다', '나이스 샷'] }, |
| `shared/iso/actions.ts:28` | 🧸 | claw: { emote: '🧸', say: ['이번엔 잡는다', '아 놓쳤어'] }, |
| `shared/iso/actions.ts:29` | 🎹 | piano: { emote: '🎹', say: ['♪ 엘리제를 위하여', '연주 중'] }, |
| `shared/iso/actions.ts:29` | ♪ (기호) | piano: { emote: '🎹', say: ['♪ 엘리제를 위하여', '연주 중'] }, |
| `shared/iso/actions.ts:30` | 🥽 | 'vr-booth': { emote: '🥽', say: ['우주 여행 중', '어지러워…'] }, |
| `shared/iso/actions.ts:31` | 🤖 | robot: { emote: '🤖', say: ['로봇아 커피 줘', '삐빅 안녕하세요'] }, |
| `shared/iso/actions.ts:32` | 🌍 | globe: { emote: '🌍', say: ['여기 가 보고 싶다'] }, |
| `shared/iso/actions.ts:33` | 🛋️ | 'sofa-green': { emote: '🛋️', say: ['잠깐 쉬는 중'] }, |
| `shared/iso/actions.ts:34` | 🛋️ | 'sofa-pink': { emote: '🛋️', say: ['폭신하다'] }, |
| `shared/iso/actions.ts:35` | 🕰️ | 'clock-tower': { emote: '🕰️', say: ['벌써 시간이…'] }, |
| `shared/iso/actions.ts:36` | 🚀 | rocket: { emote: '🚀', say: ['언젠가 우주로', '발사 카운트다운'] }, |
| `shared/iso/actions.ts:37` | 🦖 | dino: { emote: '🦖', say: ['크다…', '쥬라기 오피스'] }, |
| `shared/iso/actions.ts:38` | 💰 | 'gold-bar': { emote: '💰', say: ['회사 금고 든든', '보너스 나오려나'] }, |
| `shared/iso/actions.ts:39` | 🎄 | 'xmas-tree': { emote: '🎄', say: ['메리 크리스마스!'] }, |
| `shared/iso/actions.ts:40` | 🎃 | pumpkin: { emote: '🎃', say: ['트릭 오어 트릿!'] }, |
| `shared/iso/actions.ts:41` | ⛄ | snowman: { emote: '⛄', say: ['눈사람 귀엽다'] }, |
| `shared/iso/actions.ts:42` | 🌸 | 'cherry-tree': { emote: '🌸', say: ['벚꽃 엔딩~'] }, |
| `shared/iso/actions.ts:44` | 🏓 | 'prop-pingpong': { emote: '🏓', say: ['핑퐁!', '한 세트 더'] }, |
| `shared/iso/actions.ts:45` | 🕹️ | 'prop-arcade': { emote: '🕹️', say: ['최고 기록!', '한 판만 더'] }, |
| `shared/iso/actions.ts:46` | 🐠 | 'prop-aquarium': { emote: '🐠', say: ['물고기 귀엽다', '힐링 중'] }, |

### 사무실 지도 · 말풍선 그림 매핑 — 42곳 (✅×1 💡×1 🙋×1 💦×1 📘×1 👀×1 👍×1 ❓×1 ☕×1 🐶×1 🐱×1 🐟×1 🐠×1 🦜×1 🧸×1 🌸×1 🎵×1 🎶×1 🎹×1 🎯×1 🕹×1 🎱×1 🏓×1 ⚽×1 🥊×1 🏃×1 🚀×1 🦖×1 🤖×1 🥽×1 🎁×1 🍦×1 🍿×1 💰×1 🎄×1 🎃×1 ⛄×1 🛋×1 🕰×1 📖×1 🎨×1 🌍×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/map/iso/emoteArt.ts:12` | ✅ | '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea', |
| `renderer/map/iso/emoteArt.ts:12` | 💡 | '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea', |
| `renderer/map/iso/emoteArt.ts:12` | 🙋 | '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea', |
| `renderer/map/iso/emoteArt.ts:12` | 💦 | '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea', |
| `renderer/map/iso/emoteArt.ts:12` | 📘 | '✅': 'done', '💡': 'idea', '🙋': 'ask', '💦': 'sweat', '📘': 'idea', |
| `renderer/map/iso/emoteArt.ts:14` | 👀 | '👀': 'look', '👍': 'good', '?': 'question', '❓': 'question', '☕': 'coffee', |
| `renderer/map/iso/emoteArt.ts:14` | 👍 | '👀': 'look', '👍': 'good', '?': 'question', '❓': 'question', '☕': 'coffee', |
| `renderer/map/iso/emoteArt.ts:14` | ❓ | '👀': 'look', '👍': 'good', '?': 'question', '❓': 'question', '☕': 'coffee', |
| `renderer/map/iso/emoteArt.ts:14` | ☕ | '👀': 'look', '👍': 'good', '?': 'question', '❓': 'question', '☕': 'coffee', |
| `renderer/map/iso/emoteArt.ts:16` | 🐶 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🐱 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🐟 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🐠 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🦜 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🧸 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:16` | 🌸 | '🐶': 'love', '🐱': 'love', '🐟': 'love', '🐠': 'love', '🦜': 'love', '🧸': 'love', '🌸': 'love', |
| `renderer/map/iso/emoteArt.ts:18` | 🎵 | '🎵': 'note', '🎶': 'note', '🎹': 'note', |
| `renderer/map/iso/emoteArt.ts:18` | 🎶 | '🎵': 'note', '🎶': 'note', '🎹': 'note', |
| `renderer/map/iso/emoteArt.ts:18` | 🎹 | '🎵': 'note', '🎶': 'note', '🎹': 'note', |
| `renderer/map/iso/emoteArt.ts:20` | 🎯 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🕹️ | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🎱 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🏓 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | ⚽ | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🥊 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🏃 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🚀 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🦖 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🤖 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🥽 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:20` | 🎁 | '🎯': 'excited', '🕹️': 'excited', '🎱': 'excited', '🏓': 'excited', '⚽': 'excited', '🥊': 'excited', '🏃' |
| `renderer/map/iso/emoteArt.ts:22` | 🍦 | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:22` | 🍿 | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:22` | 💰 | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:22` | 🎄 | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:22` | 🎃 | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:22` | ⛄ | '🍦': 'happy', '🍿': 'happy', '💰': 'happy', '🎄': 'happy', '🎃': 'happy', '⛄': 'happy', |
| `renderer/map/iso/emoteArt.ts:24` | 🛋️ | '🛋️': 'relax', '🕰️': 'relax', |
| `renderer/map/iso/emoteArt.ts:24` | 🕰️ | '🛋️': 'relax', '🕰️': 'relax', |
| `renderer/map/iso/emoteArt.ts:26` | 📖 | '📖': 'idea', '🎨': 'idea', '🌍': 'idea', |
| `renderer/map/iso/emoteArt.ts:26` | 🎨 | '📖': 'idea', '🎨': 'idea', '🌍': 'idea', |
| `renderer/map/iso/emoteArt.ts:26` | 🌍 | '📖': 'idea', '🎨': 'idea', '🌍': 'idea', |

### 사무실 지도 · 말풍선/이름표 — 9곳 (✅×1 💡×1 🙋×1 💦×1 💤×1 📘×1 ★×1 🌐×1 ☕×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/map/IsoOfficeScene.ts:79` | ✅ | const EMOTES: Partial<Record<string, string>> = { 'working>idle': '✅', 'idle>working': '💡', '*>waiti |
| `renderer/map/IsoOfficeScene.ts:79` | 💡 | const EMOTES: Partial<Record<string, string>> = { 'working>idle': '✅', 'idle>working': '💡', '*>waiti |
| `renderer/map/IsoOfficeScene.ts:79` | 🙋 | const EMOTES: Partial<Record<string, string>> = { 'working>idle': '✅', 'idle>working': '💡', '*>waiti |
| `renderer/map/IsoOfficeScene.ts:79` | 💦 | const EMOTES: Partial<Record<string, string>> = { 'working>idle': '✅', 'idle>working': '💡', '*>waiti |
| `renderer/map/IsoOfficeScene.ts:110` | 💤 | sleep: ['💤', '잠깐만 눈 좀…'], |
| `renderer/map/IsoOfficeScene.ts:461` | 📘 | if (s.activity.startsWith('Skill') && prev.activity !== s.activity && !this.isFirstSync) this.showEm |
| `renderer/map/IsoOfficeScene.ts:469` | ★ (기호) | const mark = teams.some((t) => t.leadId === s.id) ? '★ ' : '' |
| `renderer/map/IsoOfficeScene.ts:470` | 🌐 | actor.name.setText('${s.remote ? '🌐 ' : ''}${mark}${shortName}') |
| `renderer/map/IsoOfficeScene.ts:1819` | ☕ | const machines = this.spots.filter((s) => (s.emote === '☕' \|\| COFFEE_ITEMS.has(itemOf(s.uid))) && (! |

### 사무실 지도 · 직원 간 상호작용 — 12곳 (👍×3 ☕×3 👀×2 📄×2 🎉×1 ✅×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/iso/interactions.ts:268` | 👀 | return [{ do: 'walk', to: 'behind' }, { do: 'act', anim: 'peek', ms: 2800, emote: '👀' }, { do: 'walk |
| `shared/iso/interactions.ts:270` | 👍 | return [{ do: 'act', anim: 'keep', ms: 600, emote: '👍', partnerEmote: '👍' }] |
| `shared/iso/interactions.ts:270` | 👍 | return [{ do: 'act', anim: 'keep', ms: 600, emote: '👍', partnerEmote: '👍' }] |
| `shared/iso/interactions.ts:276` | 🎉 | return [{ do: 'act', anim: opts.isSitting ? 'keep' : 'clap', ms: 1800, ...(opts.isSitting ? { emote: |
| `shared/iso/interactions.ts:282` | ☕ | { do: 'act', anim: 'cup', ms: 1500, emote: '☕' }, |
| `shared/iso/interactions.ts:283` | ☕ | ...(ix.target ? [{ do: 'walk', to: 'target', carry: 'cup' } as IxStep, { do: 'act', anim: 'cupPut',  |
| `shared/iso/interactions.ts:296` | 📄 | return { say: side === 'actor' ? '📄 → ${name}' : '📄 ← ${name}' } |
| `shared/iso/interactions.ts:296` | 📄 | return { say: side === 'actor' ? '📄 → ${name}' : '📄 ← ${name}' } |
| `shared/iso/interactions.ts:298` | 👀 | return { emote: '👀' } |
| `shared/iso/interactions.ts:300` | 👍 | return { emote: '👍' } |
| `shared/iso/interactions.ts:302` | ✅ | return { emote: '✅' } |
| `shared/iso/interactions.ts:306` | ☕ | return { emote: '☕' } |

### 사무실 지도 버튼·배지 — 5곳 (🚪×1 🙋×1 📋×1 ✓×1 🪑×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/shell.ts:74` `map.enter` | 🚪 | ko: '🚪 들어가기' |
| `shared/i18n/dict/shell.ts:105` `map.meetingWaiting` | 🙋 | ko: '🙋 회의 결정 대기' |
| `shared/i18n/dict/shell.ts:106` `map.meetingRunning` | 📋 | ko: '📋 회의 중: {topic}' |
| `shared/i18n/dict/shell.ts:107` `map.decorEnd` | ✓ (기호) | ko: '✓ 꾸미기 끝내기' |
| `shared/i18n/dict/shell.ts:108` `map.decorStart` | 🪑 | ko: '🪑 꾸미기' |

### 상단 바 — 2곳 (💰×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/App.tsx:141` | 💰 | 💰 {formatWon(funds)} |
| `renderer/layout/PhoneShell.tsx:79` | 💰 | 💰 {formatWon(funds)} |

### 상점 — 14곳 (🔥×2 ✓×2 🎯×2 🗓×1 🏆×1 🏅×1 💼×1 ✅×1 🎉×1 🛍×1 📒×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ShopPage.tsx:160` | 🔥 | <h2 className="text-sm font-semibold">🔥 {t('shop.deals.title')} <span className="text-muted-foregrou |
| `renderer/features/ShopPage.tsx:169` | 🗓️ | <h2 className="text-sm font-semibold">🗓️ {t('shop.seasonal.title')} <span className="text-muted-fore |
| `renderer/features/ShopPage.tsx:311` | ✓ (기호) | {owned[id] ? '✓ ' : ''} |
| `renderer/features/ShopPage.tsx:316` | 🏆 | <div className={cn('text-xs', isDone ? 'font-semibold text-status-waiting' : 'text-muted-foreground' |
| `renderer/features/ShopPage.tsx:365` | 🎯 | <h2 className="text-sm font-semibold">🎯 {t('shop.mission.daily')} <span className="text-muted-foregr |
| `renderer/features/ShopPage.tsx:369` | 🏅 | <h2 className="text-sm font-semibold">🏅 {t('shop.mission.achievements')}</h2> |
| `renderer/features/ShopPage.tsx:410` | ✓ (기호) | {shop.gear[s.id]?.[slot] === item.id ? ' ✓' : ''} |
| `renderer/features/ShopPage.tsx:481` | 💼 | const LEDGER_ICON: Record<LedgerRow['kind'], string> = { wage: '💼', bonus: '✅', levelup: '🎉', purcha |
| `renderer/features/ShopPage.tsx:481` | ✅ | const LEDGER_ICON: Record<LedgerRow['kind'], string> = { wage: '💼', bonus: '✅', levelup: '🎉', purcha |
| `renderer/features/ShopPage.tsx:481` | 🎉 | const LEDGER_ICON: Record<LedgerRow['kind'], string> = { wage: '💼', bonus: '✅', levelup: '🎉', purcha |
| `renderer/features/ShopPage.tsx:481` | 🛍️ | const LEDGER_ICON: Record<LedgerRow['kind'], string> = { wage: '💼', bonus: '✅', levelup: '🎉', purcha |
| `shared/i18n/dict/featuresB.ts:956` `shop.tab.deals` | 🔥 | ko: '🔥 오늘의 특가' |
| `shared/i18n/dict/featuresB.ts:963` `shop.tab.collection` | 📒 | ko: '📒 도감' |
| `shared/i18n/dict/featuresB.ts:964` `shop.tab.missions` | 🎯 | ko: '🎯 미션·업적' |

### 상점 · 세트·미션·업적 데이터 — 49곳 (☕×2 📚×2 💎×2 👑×2 ✅×2 ⚡×2 🗣×2 🏢×2 🏙×2 🏬×2 🌿×1 🕹×1 💪×1 🐾×1 🎃×1 ⛄×1 🖊×1 💬×1 🛍×1 🥉×1 🥈×1 🥇×1 👥×1 📈×1 🚀×1 🛋×1 🧩×1 🏆×1 💰×1 🎤×1 🗼×1 🏅×1 🎖×1 📣×1 🎙×1 🖼×1 🎁×1 💵×1 🏦×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/economy.ts:367` | 🌿 | { id: 'garden', name: '정원 세트', emoji: '🌿', itemIds: ['fern', 'cactus', 'flower-pot', 'monstera', 'fi |
| `shared/economy.ts:368` | ☕ | { id: 'cafe', name: '카페 세트', emoji: '☕', itemIds: ['coffee-machine', 'popcorn', 'icecream', 'flower- |
| `shared/economy.ts:369` | 📚 | { id: 'library', name: '서재 세트', emoji: '📚', itemIds: ['bookshelf', 'record-shelf', 'globe', 'easel', |
| `shared/economy.ts:370` | 🕹️ | { id: 'game', name: '게임 세트', emoji: '🕹️', itemIds: ['arcade', 'pool-table', 'foosball', 'dartboard', |
| `shared/economy.ts:371` | 💪 | { id: 'fitness', name: '헬스 세트', emoji: '💪', itemIds: ['treadmill', 'punching-bag', 'chair-ball'], re |
| `shared/economy.ts:372` | 🐾 | { id: 'pets', name: '펫 세트', emoji: '🐾', itemIds: ['cat-tower', 'dog-bed', 'parrot', 'fishbowl', 'aqu |
| `shared/economy.ts:373` | 💎 | { id: 'luxury', name: '럭셔리 세트', emoji: '💎', itemIds: ['piano', 'statue', 'rug-persian', 'clock-tower |
| `shared/economy.ts:374` | 👑 | { id: 'legend', name: '전설 세트', emoji: '👑', itemIds: ['robot', 'rocket', 'dino', 'gold-bar'], reward: |
| `shared/economy.ts:375` | 🎃 | { id: 'halloween', name: '할로윈 세트', emoji: '🎃', itemIds: ['pumpkin', 'ghost', 'wall-halloween', 'floo |
| `shared/economy.ts:376` | ⛄ | { id: 'winter', name: '겨울 세트', emoji: '⛄', itemIds: ['xmas-tree', 'snowman', 'wall-xmas', 'floor-sno |
| `shared/economy.ts:477` | ✅ | { id: 'tasks3', emoji: '✅', label: '업무 카드 3건 완료', metric: 'tasks', target: 3, reward: 15 * M }, |
| `shared/economy.ts:478` | ✅ | { id: 'tasks1', emoji: '✅', label: '업무 카드 1건 완료', metric: 'tasks', target: 1, reward: 5 * M }, |
| `shared/economy.ts:479` | ⚡ | { id: 'tokens500k', emoji: '⚡', label: '토큰 50만 사용', metric: 'tokens', target: 500_000, reward: 8 * M |
| `shared/economy.ts:480` | ⚡ | { id: 'tokens2m', emoji: '⚡', label: '토큰 200만 사용', metric: 'tokens', target: 2_000_000, reward: 20 * |
| `shared/economy.ts:481` | 🗣️ | { id: 'meeting1', emoji: '🗣️', label: '회의 1번 열기', metric: 'meetings', target: 1, reward: 6 * M }, |
| `shared/economy.ts:482` | 🖊️ | { id: 'approvals5', emoji: '🖊️', label: '결재 5건 처리', metric: 'approvals', target: 5, reward: 6 * M }, |
| `shared/economy.ts:483` | 💬 | { id: 'instructions5', emoji: '💬', label: '직원에게 5번 지시', metric: 'instructions', target: 5, reward: 6 |
| `shared/economy.ts:484` | 🛍️ | { id: 'purchase1', emoji: '🛍️', label: '상점에서 1개 사기', metric: 'purchases', target: 1, reward: 4 * M } |
| `shared/economy.ts:488` | 🥉 | { id: 'tasks10', emoji: '🥉', label: '업무 10건 완료', metric: 'tasks', target: 10, reward: 20 * M }, |
| `shared/economy.ts:489` | 🥈 | { id: 'tasks50', emoji: '🥈', label: '업무 50건 완료', metric: 'tasks', target: 50, reward: 80 * M }, |
| `shared/economy.ts:490` | 🥇 | { id: 'tasks200', emoji: '🥇', label: '업무 200건 완료', metric: 'tasks', target: 200, reward: 300 * M }, |
| `shared/economy.ts:491` | 👥 | { id: 'staff5', emoji: '👥', label: '직원 5명 고용', metric: 'staff', target: 5, reward: 15 * M }, |
| `shared/economy.ts:492` | 🏢 | { id: 'staff10', emoji: '🏢', label: '직원 10명 고용', metric: 'staff', target: 10, reward: 50 * M }, |
| `shared/economy.ts:493` | 🗣️ | { id: 'meetings10', emoji: '🗣️', label: '회의 10번', metric: 'meetings', target: 10, reward: 30 * M }, |
| `shared/economy.ts:494` | 📈 | { id: 'level5', emoji: '📈', label: '회사 Lv.5', metric: 'level', target: 5, reward: 30 * M }, |
| `shared/economy.ts:495` | 🚀 | { id: 'level8', emoji: '🚀', label: '회사 Lv.8', metric: 'level', target: 8, reward: 150 * M }, |
| `shared/economy.ts:496` | 🏙️ | { id: 'level10', emoji: '🏙️', label: '회사 Lv.10 3층 오피스', metric: 'level', target: 10, reward: 1_000 * |
| `shared/economy.ts:499` | ☕ | { id: 'level15', emoji: '☕', label: '회사 Lv.15 카페테리아', metric: 'level', target: 15, reward: 3_000 * M |
| `shared/economy.ts:500` | 👑 | { id: 'level20', emoji: '👑', label: '회사 Lv.20 캠퍼스', metric: 'level', target: 20, reward: 10_000 * M  |
| `shared/economy.ts:501` | 🛋️ | { id: 'items10', emoji: '🛋️', label: '물건 10종 모으기', metric: 'items', target: 10, reward: 20 * M }, |
| `shared/economy.ts:502` | 🏬 | { id: 'items40', emoji: '🏬', label: '물건 40종 모으기', metric: 'items', target: 40, reward: 120 * M }, |
| `shared/economy.ts:503` | 🧩 | { id: 'sets1', emoji: '🧩', label: '세트 1개 완성', metric: 'sets', target: 1, reward: 20 * M }, |
| `shared/economy.ts:504` | 🏆 | { id: 'sets5', emoji: '🏆', label: '세트 5개 완성', metric: 'sets', target: 5, reward: 200 * M }, |
| `shared/economy.ts:505` | 💰 | { id: 'earned1b', emoji: '💰', label: '누적 수당 ₩10억', metric: 'earned', target: 1_000 * M, reward: 100  |
| `shared/economy.ts:508` | 📚 | { id: 'level12', emoji: '📚', label: '회사 Lv.12 사내 도서관', metric: 'level', target: 12, reward: 1_500 *  |
| `shared/economy.ts:509` | 🏢 | { id: 'level14', emoji: '🏢', label: '회사 Lv.14 4층 유리 사옥', metric: 'level', target: 14, reward: 2_400  |
| `shared/economy.ts:510` | 🎤 | { id: 'level16', emoji: '🎤', label: '회사 Lv.16 강당', metric: 'level', target: 16, reward: 4_000 * M }, |
| `shared/economy.ts:511` | 🗼 | { id: 'level18', emoji: '🗼', label: '회사 Lv.18 5층 타워', metric: 'level', target: 18, reward: 6_000 * M |
| `shared/economy.ts:512` | 🏅 | { id: 'tasks500', emoji: '🏅', label: '업무 500건 완료', metric: 'tasks', target: 500, reward: 800 * M }, |
| `shared/economy.ts:513` | 🎖️ | { id: 'tasks1000', emoji: '🎖️', label: '업무 1,000건 완료', metric: 'tasks', target: 1_000, reward: 2_000 |
| `shared/economy.ts:514` | 🏬 | { id: 'staff20', emoji: '🏬', label: '직원 20명 고용', metric: 'staff', target: 20, reward: 150 * M }, |
| `shared/economy.ts:515` | 🏙️ | { id: 'staff30', emoji: '🏙️', label: '직원 30명 고용', metric: 'staff', target: 30, reward: 300 * M }, |
| `shared/economy.ts:516` | 📣 | { id: 'meetings50', emoji: '📣', label: '회의 50번', metric: 'meetings', target: 50, reward: 150 * M }, |
| `shared/economy.ts:517` | 🎙️ | { id: 'meetings100', emoji: '🎙️', label: '회의 100번', metric: 'meetings', target: 100, reward: 300 * M |
| `shared/economy.ts:518` | 🖼️ | { id: 'items80', emoji: '🖼️', label: '물건 80종 모으기', metric: 'items', target: 80, reward: 400 * M }, |
| `shared/economy.ts:519` | 💎 | { id: 'items120', emoji: '💎', label: '물건 120종 모으기', metric: 'items', target: 120, reward: 1_000 * M  |
| `shared/economy.ts:520` | 🎁 | { id: 'sets10', emoji: '🎁', label: '세트 10개 완성', metric: 'sets', target: 10, reward: 600 * M }, |
| `shared/economy.ts:521` | 💵 | { id: 'earned5b', emoji: '💵', label: '누적 수당 ₩50억', metric: 'earned', target: 5_000 * M, reward: 500  |
| `shared/economy.ts:522` | 🏦 | { id: 'earned20b', emoji: '🏦', label: '누적 수당 ₩200억', metric: 'earned', target: 20_000 * M, reward: 2 |

### 새 소식 · 변경 기록 — 3곳 (✨×1 🔧×1 🐞×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/featuresB.ts:901` `updates.kind.feature` | ✨ | ko: '✨ 새 기능' |
| `shared/i18n/dict/featuresB.ts:902` `updates.kind.improve` | 🔧 | ko: '🔧 개선' |
| `shared/i18n/dict/featuresB.ts:903` `updates.kind.fix` | 🐞 | ko: '🐞 버그 수정' |

### 새 소식 팝업 — 1곳 (🎉×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/WhatsNew.tsx:72` | 🎉 | <DialogTitle>🎉 {t('whatsNew.title', { version: APP_VERSION })}</DialogTitle> |

### 설정 · 휴대폰 연결 — 2곳 (✓×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/RemoteSection.tsx:234` | ✓ (기호) | {isRunning ? '✓ ' : ''} |
| `renderer/features/RemoteSection.tsx:336` | ✓ (기호) | {i < step ? '✓' : i + 1} {t(key)} |

### 슬래시 메뉴 — 2곳 (📘×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/components/slash-menu.tsx:39` | 📘 | label: '📘 ${name}', |
| `shared/i18n/dict/featuresB.ts:1231` `slashMenu.manualButton` | 📘 | ko: '📘 매뉴얼' |

### 시스템 메시지(채팅 알림 문구) — 27곳 (✅×3 🎬×3 ❓×2 🤖×2 🙋×2 📋×2 🎉×1 📦×1 ⏸×1 🙏×1 🧪×1 📘×1 🚀×1 💬×1 🏆×1 🤝×1 ⏹×1 ⏳×1 📊×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `main/office.ts:458` | ❓ | this.postChat(s.id, '질문이 있어요 ❓ ${a.summary}'.slice(0, CHAT_TEXT_MAX), undefined, { id: a.id }) |
| `main/office.ts:848` | 🎉 | this.postChat('me', '🎉 회사가 성장했어요! Lv.${c.level} ${c.title} — 사무실이 넓어졌습니다.') |
| `main/office.ts:873` | 📦 | this.postChat('me', '📦 ${text}') |
| `main/office.ts:1389` | ⏸ (기호) | this.postChat('me', '⏸ "${t.title}" 기획을 멈췄어요. 업무 보드에서 "다시 진행"을 누르면 이어서 해요.'.slice(0, CHAT_TEXT_MAX)) |
| `main/office.ts:2108` | ❓ | this.postChat(s.id, '질문이 있어요 ❓ ${a.summary}'.slice(0, CHAT_TEXT_MAX), undefined, { id: a.id }) |
| `main/office.ts:2113` | 🙏 | this.postChat(s.id, '결재 부탁드려요 🙏 ${a.toolName} ${a.summary}'.slice(0, CHAT_TEXT_MAX), undefined, { id |
| `main/office.ts:2192` | 🤖 | this.postChat('me', '🤖 자동결재를 시작해요${until ? ' (${until}까지, ${formatRemaining(endsAt! - Date.now())})' |
| `main/office.ts:2212` | 🤖 | const lines = ['🤖 자동결재를 마쳤어요 — ${text}', ...answers.map((h) => '· ${h.staffName}: ${h.summary}')] |
| `main/office.ts:3006` | 🧪 | this.postChat('me', '🧪 ${lab.name} 랩을 꾸렸어요: ${names.join(', ')}${lab.goal ? ' — 목표: ${lab.goal}' : ' |
| `main/office.ts:3210` | 📘 | if (want) this.postChat(s.id, '📘 "${manualName}" 매뉴얼 교육을 받았어요!') |
| `main/office.ts:3340` | 🙋 | this.postChat(run.currentStaffId ?? 'me', '🙋 "${run.manualName}" ${step.title} 단계를 확인해 주세요 (업무 보드·결재 |
| `main/office.ts:3579` | ✅ | this.postChat(staffId, '✅ 커밋을 결재받았어요: ${message.split('\n')[0]}') |
| `main/office.ts:3590` | 🚀 | this.postChat(staffId, '🚀 PR을 올렸어요: ${title}') |
| `main/office.ts:3991` | ✅ | this.postChat('me', '✅ "${t.title}" 기획안 승인 — 하위 업무 ${childIds.length}건을 순서대로 진행해요.${feedback ? ' 코멘트 |
| `main/office.ts:4234` | 🎬 | this.postChat('me', '🎬 ${t('gallery.demo.empty')}\n${link}') |
| `main/office.ts:4253` | 🎬 | this.postChat('me', '🎬 ${t('gallery.demo.start')}') |
| `main/office.ts:4326` | 💬 | m.summary = remark ? '${summary}\n\n💬 ${remark.name}: ${remark.text}' : summary |
| `main/office.ts:4329` | 🎬 | if (end.isSaved) this.postChat('me', '🎬 ${m.summary}\n${link}'.slice(0, CHAT_TEXT_MAX * 2), demoCove |
| `main/office.ts:4365` | 🏆 | this.postChat('me', '🏆 ${t('gallery.demo.mvpChat', { name })}') |
| `main/office.ts:4451` | 📋 | this.postChat('me', '📋 회의 시작: ${meeting.topic}') |
| `main/office.ts:4552` | 📋 | this.postChat(chair?.id ?? 'me', '📋 회의록 — ${m.topic}\n${m.summary}'.slice(0, CHAT_TEXT_MAX * 2)) |
| `main/office.ts:4571` | 🙋 | this.postChat(p.id, '🙋 회의 "${m.topic}" 결정 부탁드려요: ${question}${options.length ? ' (${options.join(' / |
| `main/office.ts:4579` | ✅ | if (!this.meetingStops.has(m.id)) this.postChat('me', '✅ 결정: ${question} → ${answer \|\| '알아서 정해 주세요'} |
| `main/office.ts:4602` | 🤝 | this.postChat(chair.id, '🤝 위임 결정(${chair.name}): ${d.question} → ${picked.choice}${picked.reason ? ' |
| `main/office.ts:4639` | ⏹ | this.postChat('me', '⏹ 회의를 끝내요${mode === 'wrapup' ? ' — 지금까지 이야기로 회의록을 정리할게요' : ''}: ${m.topic}'.sli |
| `main/office.ts:4707` | ⏳ | this.postChat('me', '⏳ ${body}') |
| `main/office.ts:5143` | 📊 | this.postChat('me', '📊 ${body}') |

### 시스템 알림(토스트) — 5곳 (🎉×1 📦×1 🤖×1 📱×1 📊×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/main.ts:92` `notify.levelUp` | 🎉 | ko: '🎉 회사 레벨 업' |
| `shared/i18n/dict/main.ts:93` `notify.stowedTitle` | 📦 | ko: '📦 가구를 서랍에 넣었어요' |
| `shared/i18n/dict/main.ts:109` `notify.autoSummary` | 🤖 | ko: '🤖 자동결재 요약' |
| `shared/i18n/dict/main.ts:114` `notify.remoteChange` | 📱 | ko: '📱 휴대폰에서 설정이 바뀌었어요' |
| `shared/i18n/dict/main.ts:120` `notify.planUsage` | 📊 | ko: '📊 AI 요금제 사용량' |

### 시스템 알림(토스트) · 원격 접속 경고 — 2곳 (⚠×1 🔒×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `main/remote/service.ts:241` | ⚠️ (기호) | this.deps.alert('⚠️ 원격 접속 실패가 많아요', '여러 곳에서 틀린 열쇠로 ${count}번 이상 연결하려 했어요. 내가 한 일이 아니라면 휴대폰 연결을 끄거나 Q |
| `main/remote/service.ts:242` | 🔒 | else this.deps.alert('🔒 원격 접속을 잠갔어요', count > 1 ? '연결 실패가 많은 ${count}곳을 15분씩 막았어요 (마지막은 ${at}까지).' : |

### 업무 보드 — 8곳 (🔁×2 🧪×1 💬×1 🗂×1 ⏸×1 📥×1 🪙×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/BoardPage.tsx:286` | 🧪 | 🧪 {lab.name} |
| `shared/i18n/dict/chatMessenger.ts:59` `board.fromChat` | 💬 | ko: '💬 {room}' |
| `shared/i18n/dict/featuresA.ts:33` `board.runProcess` | 🔁 | ko: '🔁 매뉴얼 단계대로 진행…' |
| `shared/i18n/dict/featuresA.ts:53` `board.plan.waiting` | 🗂️ | ko: '🗂️ 기획 확인 대기' |
| `shared/i18n/dict/featuresA.ts:55` `board.plan.paused` | ⏸ (기호) | ko: '⏸ 멈춤' |
| `shared/i18n/dict/featuresA.ts:56` `board.plan.aggregating` | 📥 | ko: '📥 취합 중' |
| `shared/i18n/dict/featuresA.ts:64` `board.card.usage` | 🪙 | ko: '🪙 {tokens} 토큰 · {cost}' |
| `shared/i18n/dict/featuresA.ts:65` `board.activeRuns` | 🔁 | ko: '🔁 진행 중인 매뉴얼 단계 진행 {count}' |

### 업무 보드 · 기획안 카드 — 1곳 (🗂×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/PlanCard.tsx:48` | 🗂️ | <span className="font-semibold">🗂️ {task.title}</span> |

### 업무 보드 · 매뉴얼 진행 카드 — 4곳 (🙋×2 📘×1 ✅×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/RunCard.tsx:37` | 📘 | <span className="flex-1 truncate font-medium">📘 {run.manualName}</span> |
| `renderer/features/RunCard.tsx:52` | 🙋 | {s.needsMyCheck && ' 🙋'} |
| `renderer/features/RunCard.tsx:65` | 🙋 | <div className="text-xs font-semibold">🙋 {t('runCard.pleaseCheck', { step: step?.title ?? '' })}</di |
| `renderer/features/RunCard.tsx:85` | ✅ | {run.steps.find((s) => s.id === h.stepId)?.title} · {h.staffName} {h.verdict === 'revise' ? '↩️ revi |

### 온보딩(첫 실행) — 5곳 (🧑‍💼×1 💬×1 ✅×1 🎉×1 🏢×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/Onboarding.tsx:326` | 🧑‍💼 | { icon: '🧑‍💼', title: t('onboarding.card.hire.title'), body: t('onboarding.card.hire.body') }, |
| `renderer/features/Onboarding.tsx:327` | 💬 | { icon: '💬', title: t('onboarding.card.instruct.title'), body: t('onboarding.card.instruct.body') }, |
| `renderer/features/Onboarding.tsx:328` | ✅ | { icon: '✅', title: t('onboarding.card.approve.title'), body: t('onboarding.card.approve.body') }, |
| `renderer/features/Onboarding.tsx:543` | 🎉 | <span className="text-5xl">🎉</span> |
| `renderer/features/Onboarding.tsx:575` | 🏢 | <span className="text-5xl">🏢</span> |

### 자동결재 표시·설정 — 2곳 (🤖×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/AutoApprove.tsx:89` | 🤖 | <span className={auto.isActive ? 'text-status-working font-medium' : 'text-muted-foreground'}>🤖 {tex |
| `renderer/features/AutoApprove.tsx:252` | 🤖 | <summary className="text-muted-foreground cursor-pointer text-sm font-semibold">🤖 {t('autoApprove.ha |

### 자율 진행 표시 — 2곳 (🤖×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/autonomy.ts:88` `autonomy.via` | 🤖 | ko: '🤖 자율 진행' |
| `shared/i18n/dict/autonomy.ts:109` `autonomy.fullStart` | 🤖 | ko: '🤖 완전 자율 단계예요 — 모든 직원이 묻지 않고 끝까지 진행하고, 위험 작업은 건너뛰고 보고에 남겨요.', |

### 조직도 — 1곳 (📁×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/OrgPage.tsx:63` | 📁 | <h2 className="text-muted-foreground mt-8 mb-3 text-sm font-semibold">📁 {t('org.projects')}</h2> |

### 지식 창고(갤러리) — 2곳 (✨×1 🎉×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/gallery.ts:136` | ✨ | return '✨ ${e.title}${note}' |
| `shared/i18n/dict/gallery.ts:50` `gallery.demo.mvpChat` | 🎉 | ko: '오늘의 MVP는 {name} 님! 축하해요 🎉' |

### 직원 기록(로그) — 7곳 (🤖×6 📚×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/autonomy.ts:39` `log.autonomousSkip` | 🤖 | ko: '🤖 자율 진행: 위험 작업이라 건너뜀 — {tool} {summary}', |
| `shared/i18n/dict/autonomy.ts:75` `log.autonomousAnswer` | 🤖 | ko: '🤖 자율 진행: 비서가 답하지 못해 추천(첫 번째) 선택지로 답함 — {text}', |
| `shared/i18n/dict/autonomy.ts:81` `log.autonomousTextAsk` | 🤖 | ko: '🤖 자율 진행: 글 질문을 결재함에 올리지 않고 스스로 판단해 계속하라고 다시 지시함 ({n}/{max}) — {question}', |
| `shared/i18n/dict/logs.ts:61` `log.pastDecision` | 📚 | ko: '📚 지난 결정으로 자동 답함 ({name} 님이 받은 결정): {text}' |
| `shared/i18n/dict/logs.ts:62` `log.autoWait` | 🤖 | ko: '🤖 자동결재: 이 질문은 대표님 답을 기다려요 ({took} 만에 판정)' |
| `shared/i18n/dict/logs.ts:63` `log.autoAnswer` | 🤖 | ko: '🤖 자동결재 답변 ({took}): {text}' |
| `shared/i18n/dict/logs.ts:65` `log.autoApprove` | 🤖 | ko: '🤖 자동결재 승인: {tool} {summary}' |

### 직원 도구 결과 문구 — 1곳 (🗂×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/staff.ts:483` `staff.tool.plan.posted` | 🗂️ | ko: '🗂️ "{title}" 기획안을 올렸어요. 하위 업무 {n}건 — 결재함에서 확인 부탁드려요.', |

### 직원 카드 — 3곳 (★×1 🏆×1 👏×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/StaffCard.tsx:88` | ★ (기호) | if (!isWorkMode) return <span className="shrink-0 text-status-waiting">★</span> |
| `renderer/features/StaffCard.tsx:184` | 🏆 | {staff.praise.mvps > 0 && '🏆${staff.praise.mvps} '}👏{staff.praise.claps} |
| `renderer/features/StaffCard.tsx:184` | 👏 | {staff.praise.mvps > 0 && '🏆${staff.praise.mvps} '}👏{staff.praise.claps} |

### 직원 패널 — 7곳 (📘×3 🔁×2 🧪×1 ★×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/StaffPanel.tsx:437` | 🔁 | m.scope ? { ...manualItem(m.name), key: 'run:${m.label}', label: '🔁 ${m.label}', tag: t('staffPanel. |
| `renderer/features/StaffPanel.tsx:833` | 📘 | <span className="text-muted-foreground">📘 {t('staffPanel.profile.skills')}</span> |
| `renderer/features/StaffPanel.tsx:842` | 📘 | 📘 {n} |
| `renderer/features/StaffPanel.tsx:1129` | 🧪 | .flatMap((l) => (l.manuals ?? []).map((m): ManualChoice => ({ name: m, label: '${m} · 🧪 ${l.name}',  |
| `renderer/features/StaffPanel.tsx:1141` | 🔁 | {manual.scope ? '🔁' : '📘'} {manual.label} |
| `renderer/features/StaffPanel.tsx:1141` | 📘 | {manual.scope ? '🔁' : '📘'} {manual.label} |
| `shared/i18n/dict/featuresB.ts:90` `staffPanel.profile.leader` | ★ (기호) | ko: '· ★ 팀장' |

### 직원 패널 · 검토 탭 — 4곳 (✅×2 ⚠×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ReviewTab.tsx:42` | ✅ | setOutput('${r.ok ? '✅' : '⚠️'} ${r.output}') |
| `renderer/features/ReviewTab.tsx:42` | ⚠️ (기호) | setOutput('${r.ok ? '✅' : '⚠️'} ${r.output}') |
| `renderer/features/ReviewTab.tsx:51` | ✅ | setOutput('${r.ok ? '✅' : '⚠️'} ${r.output}') |
| `renderer/features/ReviewTab.tsx:51` | ⚠️ (기호) | setOutput('${r.ok ? '✅' : '⚠️'} ${r.output}') |

### 직원 패널 · 장비 탭 — 2곳 (🧰×1 🛡×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/EquipmentTab.tsx:65` | 🧰 | <h3 className="text-xs font-semibold">🧰 {t('equipment.skills.title')}</h3> |
| `renderer/features/EquipmentTab.tsx:117` | 🛡️ | <h3 className="text-xs font-semibold">🛡️ {t('equipment.tools.title')}</h3> |

### 직원 패널 · 장비 탭(MCP) — 4곳 (🌐×2 🔌×1 🖱×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/McpSection.tsx:109` | 🔌 | <h3 className="text-xs font-semibold">🔌 {t('equipment.mcp.title')}</h3> |
| `renderer/features/McpSection.tsx:136` | 🌐 | <span>🌐 {t('equip.browser.sepWhy')}</span> |
| `renderer/features/McpSection.tsx:225` | 🖱️ | const name = m.isBuiltin ? (m.name === COMPUTER_EQUIPMENT ? '🖱️ ${t('equip.computer.name')}' : '🌐 ${ |
| `renderer/features/McpSection.tsx:225` | 🌐 | const name = m.isBuiltin ? (m.name === COMPUTER_EQUIPMENT ? '🖱️ ${t('equip.computer.name')}' : '🌐 ${ |

### 채팅 — 1곳 (🌐×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ChatPage.tsx:224` | 🌐 | 🌐 {t('peer.chatLine', { name })} |

### 채팅 · 결재 카드 — 1곳 (📚×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/featuresA.ts:81` `chat.pastDecision` | 📚 | ko: '📚 지난 결정으로 자동 답함 — {question} → {answer} ({name} 님이 받은 결정)', |

### 채팅 · 결재 카드 결과 — 4곳 (✅×1 ⛔×1 💬×1 🔁×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/featuresA.ts:73` `chat.approval.approved` | ✅ | ko: '✅ 승인됨' |
| `shared/i18n/dict/featuresA.ts:74` `chat.approval.rejected` | ⛔ | ko: '⛔ 반려됨' |
| `shared/i18n/dict/featuresA.ts:75` `chat.approval.answered` | 💬 | ko: '💬 답함: {answer}' |
| `shared/i18n/dict/featuresA.ts:79` `chat.approval.superseded` | 🔁 | ko: '🔁 대체됨 (새 질문으로)' |

### 채팅 · 기획안 카드 — 2곳 (🗂×2)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/chatMessenger.ts:122` `chat.plan.title` | 🗂️ | ko: '🗂️ 기획안 확인 요청' |
| `shared/i18n/dict/chatMessenger.ts:123` `chat.plan.titleDone` | 🗂️ | ko: '🗂️ 기획안' |

### 채팅 · 말풍선 빠른 답 버튼 — 5곳 (👍×2 🔁×1 🔍×1 📋×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/chatMessenger.ts:43` `chat.quick.like` | 👍 | ko: '👍 좋아요' |
| `shared/i18n/dict/chatMessenger.ts:45` `chat.quick.liked` | 👍 | ko: '👍 확인했어요 · {time}' |
| `shared/i18n/dict/chatMessenger.ts:47` `chat.quick.redo` | 🔁 | ko: '🔁 다시 해 줘' |
| `shared/i18n/dict/chatMessenger.ts:49` `chat.quick.more` | 🔍 | ko: '🔍 더 자세히' |
| `shared/i18n/dict/chatMessenger.ts:51` `chat.quick.openCard` | 📋 | ko: '📋 카드 열기' |

### 채팅 · 시스템 알림 — 3곳 (🔌×2 🏁×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/main.ts:103` `chat.netParked` | 🔌 | ko: '🔌 인터넷이 끊겨 하던 일을 잠시 멈췄어요. 연결되면 이어서 할게요.' |
| `shared/i18n/dict/main.ts:104` `chat.netResumed` | 🔌 | ko: '🔌 인터넷이 다시 연결돼서 하던 일을 이어서 할게요.' |
| `shared/i18n/dict/main.ts:106` `chat.runFinished` | 🏁 | ko: '🏁 "{manual}" 매뉴얼 단계 진행을 마쳤어요 ({scope})' |

### 채팅 · 예약 지시 — 5곳 (🕘×2 🔁×2 ⚠×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `shared/i18n/dict/chatMessenger.ts:66` `chat.reserve.onceGroup` | 🕘 | ko: '🕘 예약 보내기' |
| `shared/i18n/dict/chatMessenger.ts:67` `chat.reserve.repeatGroup` | 🔁 | ko: '🔁 반복 지시' |
| `shared/i18n/dict/chatMessenger.ts:95` `chat.reserve.missed` | ⚠ (기호) | ko: '⚠ 놓친 예약 · {when}' |
| `shared/i18n/dict/chatMessenger.ts:98` `chat.reserve.sentOnce` | 🕘 | ko: '🕘 예약' |
| `shared/i18n/dict/chatMessenger.ts:99` `chat.reserve.sentRepeat` | 🔁 | ko: '🔁 반복' |

### 채팅(말풍선 부속) — 8곳 (✓×3 ⚠×1 📋×1 ➤×1 🕘×1 🔁×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/ChatExtras.tsx:45` | ✓ (기호) | if (state === 'done') return <span className="text-status-working">✓</span> |
| `renderer/features/ChatExtras.tsx:46` | ✓ (기호) | if (state === 'received') return <span className="text-status-working/70">✓</span> |
| `renderer/features/ChatExtras.tsx:47` | ⚠ (기호) | if (state === 'error') return <span className="text-status-error">⚠</span> |
| `renderer/features/ChatExtras.tsx:67` | 📋 | 📋 {card.title} |
| `renderer/features/ChatExtras.tsx:79` | ✓ (기호) | <span className="flex items-center gap-1"><span className="text-status-working">✓</span>{t('chat.del |
| `renderer/features/ChatExtras.tsx:299` | ➤ (기호) | <span>➤ {t('chat.reserve.sendNow')}</span> |
| `renderer/features/ChatExtras.tsx:405` | 🕘 | {r.kind === 'once' ? '🕘' : '🔁'} {when} |
| `renderer/features/ChatExtras.tsx:405` | 🔁 | {r.kind === 'once' ? '🕘' : '🔁'} {when} |

### 코치 투어(둘러보기) — 19곳 (🏢×1 🧑‍💼×1 💬×1 ✅×1 🚀×1 📈×1 ✨×1 🧑‍💻×1 🗂×1 🧭×1 📋×1 🗣×1 📘×1 ⏰×1 📑×1 💳×1 🛍×1 ⚙×1 📣×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/CoachTour.tsx:53` | 🏢 | menuStep('office', 'map', '🏢', 'coachTour.map.body'), |
| `renderer/features/CoachTour.tsx:54` | 🧑‍💼 | { chapter: 'office', target: 'hire', icon: '🧑‍💼', title: 'coachTour.hire.title', body: 'coachTour.hi |
| `renderer/features/CoachTour.tsx:55` | 💬 | menuStep('work', 'chat', '💬', 'coachTour.chat.body'), |
| `renderer/features/CoachTour.tsx:56` | ✅ | menuStep('review', 'inbox', '✅', 'coachTour.inbox.body', false), |
| `renderer/features/CoachTour.tsx:58` | 🚀 | const LAST_STEP: TourStep = { chapter: 'company', target: 'hire', icon: '🚀', title: 'coachTour.first |
| `renderer/features/CoachTour.tsx:61` | 📈 | { chapter: 'office', target: 'hud', view: 'map', icon: '📈', title: 'coachTour.hud.title', body: 'coa |
| `renderer/features/CoachTour.tsx:62` | ✨ | menuStep('office', 'secretary', '✨', 'coachTour.secretary.body'), |
| `renderer/features/CoachTour.tsx:63` | 🧑‍💻 | { chapter: 'office', target: '', icon: '🧑‍💻', title: 'coachTour.deskPet.title', body: 'coachTour.des |
| `renderer/features/CoachTour.tsx:64` | 🗂️ | menuStep('office', 'dashboard', '🗂️', 'coachTour.dashboard.body'), |
| `renderer/features/CoachTour.tsx:65` | 🧭 | menuStep('office', 'org', '🧭', 'coachTour.org.body'), |
| `renderer/features/CoachTour.tsx:66` | 📋 | menuStep('work', 'board', '📋', 'coachTour.board.body'), |
| `renderer/features/CoachTour.tsx:67` | 🗣️ | menuStep('work', 'meeting', '🗣️', 'coachTour.meeting.body'), |
| `renderer/features/CoachTour.tsx:68` | 📘 | menuStep('work', 'manuals', '📘', 'coachTour.manuals.body'), |
| `renderer/features/CoachTour.tsx:69` | ⏰ | menuStep('work', 'schedule', '⏰', 'coachTour.schedule.body'), |
| `renderer/features/CoachTour.tsx:70` | 📑 | menuStep('review', 'report', '📑', 'coachTour.report.body'), |
| `renderer/features/CoachTour.tsx:71` | 💳 | menuStep('review', 'payroll', '💳', 'coachTour.payroll.body'), |
| `renderer/features/CoachTour.tsx:72` | 🛍️ | menuStep('company', 'shop', '🛍️', 'coachTour.shop.body', false), |
| `renderer/features/CoachTour.tsx:73` | ⚙️ | menuStep('company', 'settings', '⚙️', 'coachTour.settings.body'), |
| `renderer/features/CoachTour.tsx:74` | 📣 | menuStep('company', 'updates', '📣', 'coachTour.updates.body'), |

### 튜토리얼 — 4곳 (👉×1 💰×1 🎨×1 🎉×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/Tutorial.tsx:156` | 👉 | {tut.hint && <p className="text-sm font-medium">👉 {t(tut.hint)}</p>} |
| `renderer/features/Tutorial.tsx:206` | 💰 | {tut.reward > 0 && <div className="bg-accent mx-auto rounded-full px-3 py-1 text-sm font-semibold ta |
| `shared/i18n/dict/tutorial.ts:63` `tutorial.task.designer.working` | 🎨 | ko: '로그인 화면 디자인을 그리는 중이에요 🎨' |
| `shared/i18n/dict/tutorial.ts:96` `tutorial.done.title` | 🎉 | ko: '해냈어요! 🎉' |

### 트레이 메뉴 — 12곳 (🤖×3 🟡×2 📱×2 🟢×1 🔴×1 ⚪×1 ⚫×1 ⬆×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `main/trayMenu.ts:13` | 🟢 | working: '🟢', |
| `main/trayMenu.ts:14` | 🟡 | waiting: '🟡', |
| `main/trayMenu.ts:15` | 🔴 | error: '🔴', |
| `main/trayMenu.ts:16` | ⚪️ | idle: '⚪️', |
| `main/trayMenu.ts:17` | ⚫️ | offline: '⚫️', |
| `shared/i18n/dict/main.ts:8` `tray.autoActive` | 🤖 | ko: '🤖 자동결재 중 · 남은 {left}' |
| `shared/i18n/dict/main.ts:9` `tray.autoDaily` | 🤖 | ko: '🤖 자동결재 매일 {start}–{end}' |
| `shared/i18n/dict/main.ts:11` `tray.autoOff` | 🤖 | ko: '🤖 자동결재 꺼짐' |
| `shared/i18n/dict/main.ts:33` `tray.externalWaiting` | 🟡 | ko: '🟡 {name} — 앱 밖(터미널 등) 창에서 확인 필요' |
| `shared/i18n/dict/main.ts:38` `tray.phone` | 📱 | ko: '📱 휴대폰 연결 · {state}' |
| `shared/i18n/dict/main.ts:42` `tray.phoneSoon` | 📱 | ko: '📱 휴대폰 연결 · 준비 중' |
| `shared/i18n/dict/main.ts:46` `tray.updateAvailable` | ⬆ (기호) | ko: '⬆ 새 버전 {version} · 지금 업데이트' |

### 트레이 아이콘 옆 글자 — 2곳 (🤖×1 ⬆×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `main/tray.ts:52` | 🤖 | this.tray.setTitle('${isAuto ? ' 🤖' : ''}${count ? ' ${count}' : ''}${update ? ' ⬆' : ''}') |
| `main/tray.ts:52` | ⬆ (기호) | this.tray.setTitle('${isAuto ? ' 🤖' : ''}${count ? ' ${count}' : ''}${update ? ' ⬆' : ''}') |

### 회의 — 3곳 (⚠×2 🙋×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/features/MeetingPage.tsx:309` | 🙋 | <span className="font-semibold">🙋 {decision.askedByName}</span> |
| `shared/i18n/dict/featuresA.ts:380` `meeting.notice.full` | ⚠ (기호) | ko: '⚠ 회의실 최대 {capacity}명이 다 차서 추가하지 못했어요.' |
| `shared/i18n/dict/featuresA.ts:381` `meeting.notice.partial` | ⚠ (기호) | ko: '⚠ 최대 {capacity}명이라 {total}명 중 {added}명만 추가했어요.' |

### 휴대폰 원격 지시 표시 — 1곳 (📱×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `main/remoteContext.ts:8` | 📱 | export const REMOTE_MARK = '📱 원격' |

### 휴대폰 미리보기 가짜 데이터 — 1곳 (📱×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/mobile/preview/fakeShell.ts:397` | 📱 | { id: 1, staffId: id, ts: now - 20 * min, type: 'instruction', text: '📱 원격 폰 배치안을 만들어 주세요' }, |

### 개발용 미리보기(앱 화면 아님) — 1곳 (✓×1)

| 파일:줄 | 이모지 | 코드·문구 |
|---|---|---|
| `renderer/map/iso/preview/IsoPrototypeApp.tsx:144` | ✓ (기호) | <span>{isTouchDevice ? '눌러 꺼내고, 끌어서 옮긴 뒤 ✓로 놓아요. 놓인 가구를 누르면 다시 집어요.' : '눌러 꺼내 클릭으로 놓아요 · R·오른쪽 클릭 돌리 |

## 4. 안드로이드 · 사이트 · 개발 도구

| 파일:줄 | 이모지 | 위치 | 내용 |
|---|---|---|---|
| `android/tools/dev-server.mts:83` | 📱 | 개발용 도구(앱 화면 아님) | decide: (id, allow) => (log.push('📱 결재 ${id} → ${allow ? '승인' : '반려'}'), removeApproval(id)), |
| `android/tools/dev-server.mts:84` | 📱 | 개발용 도구(앱 화면 아님) | answerQuestion: (id, answers) => (log.push('📱 답변 ${id} → ${JSON.stringify(answers)}'), removeApprova |
| `android/tools/dev-server.mts:89` | 📱 | 개발용 도구(앱 화면 아님) | log.push('📱 기획 ${taskId} → ${ok ? '승인' : '반려'} ${fb ? '(${fb})' : ''}') |
| `android/tools/dev-server.mts:93` | 📱 | 개발용 도구(앱 화면 아님) | log.push('📱 지시 ${id} → ${text}') |
| `android/tools/dev-server.mts:102` | 🔒 | 개발용 도구(앱 화면 아님) | const guard = new AuthGuard({ tokenHash: null, revoked: [] }, (scope, until) => log.push('🔒 잠금(${sco |
| `android/tools/dev-server-v2.mts:38` | 📱 | 개발용 도구(앱 화면 아님) | calls.push('📱 ${method}(${JSON.stringify(args).slice(0, 120)})') |
| `android/tools/dev-server-v2.mts:61` | 📎 | 개발용 도구(앱 화면 아님) | calls.push('📎 첨부 ${name} ${data.length}B') |
| `android/tools/dev-server-v2.mts:73` | 🔔 | 개발용 도구(앱 화면 아님) | alert: (t, b) => console.log('🔔 ${t} ${b}'), |
| `android/tools/fake-office.mts:101` | 📱 | 개발용 도구(앱 화면 아님) | getRecord: (id: string) => ({ staffId: id, logs: [{ id: 1, staffId: id, ts: now - 20 * min, type: 'i |
| `android/app/src/main/res/values-zh-rCN/strings.xml:25` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="btn_approve">✓ 批准</string> |
| `android/app/src/main/res/values-zh-rCN/strings.xml:148` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="onb_battery_ok">✓ 已排除在电池优化之外</string> |
| `android/app/src/main/res/values-ja/strings.xml:25` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="btn_approve">✓ 承認</string> |
| `android/app/src/main/res/values-ja/strings.xml:148` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="onb_battery_ok">✓ バッテリー最適化から除外されています</string> |
| `android/app/src/main/res/values/strings.xml:25` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="btn_approve">✓ 승인</string> |
| `android/app/src/main/res/values/strings.xml:148` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="onb_battery_ok">✓ 배터리 최적화에서 빠져 있어요</string> |
| `android/app/src/main/res/values-en/strings.xml:25` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="btn_approve">✓ Approve</string> |
| `android/app/src/main/res/values-en/strings.xml:148` | ✓ | 휴대폰 앱 버튼·텍스트(승인 버튼 `btn_approve`, 배터리 안내 `onb_battery_ok` 4개 언어) | <string name="onb_battery_ok">✓ Excluded from battery optimization</string> |
| `android/app/src/main/java/com/claudeoffice/remote/ui/DecisionScreens.kt:152` | ✓ | 휴대폰 앱 화면(결재 완료·언어 선택 체크) | Text("✓", style = Type.titleLarge, color = c.statusWorking) |
| `android/app/src/main/java/com/claudeoffice/remote/ui/SettingsScreen.kt:143` | ✓ | 휴대폰 앱 화면(결재 완료·언어 선택 체크) | if (code == saved) Text("✓", style = Type.bodyLarge, color = c.primary) |
| `site/index.html:417` | 👀 | 사이트 본문 | <div class="row rv"><div class="txt"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke=" |
| `site/index.html:566` | 👀 | 사이트 본문 | 'g5.t': '직원들이 서로 일해요', 'g5.p': '팀장이 팀원에게 일을 넘기고 팀원이 보고하러 가요. 동료 화면을 어깨 너머로 들여다보고(👀), 막힌 동료를 도우러 가고(? |
| `site/index.html:660` | 👀 | 사이트 본문 | 'g5.t': 'Staff work with each other', 'g5.p': 'A team lead hands work to a teammate, and the teammat |
| `site/index.html:754` | 👀 | 사이트 본문 | 'g5.t': '社員同士が関わり合います', 'g5.p': 'リーダーがメンバーに仕事を渡し、メンバーが報告に向かいます。同僚の画面を肩越しにのぞいたり（👀）、詰まった同僚を手伝いに行ったり（?） |
| `site/index.html:848` | 👀 | 사이트 본문 | 'g5.t': '员工之间也会互动', 'g5.p': '组长把工作交给组员，组员走过去汇报。同事会从身后看一眼屏幕（👀）、去帮卡住的同事（?）、完成时击掌鼓掌庆祝。偶尔还会聊聊工作、跑腿买咖啡，点击 |
| `site/ja/index.html:404` | 👀 | 사이트 본문 | <div class="row rv"><div class="txt"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke=" |
| `site/ja/index.html:547` | 👀 | 사이트 본문 | 'g5.t': '직원들이 서로 일해요', 'g5.p': '팀장이 팀원에게 일을 넘기고 팀원이 보고하러 가요. 동료 화면을 어깨 너머로 들여다보고(👀), 막힌 동료를 도우러 가고(? |
| `site/ja/index.html:635` | 👀 | 사이트 본문 | 'g5.t': 'Staff work with each other', 'g5.p': 'A team lead hands work to a teammate, and the teammat |
| `site/ja/index.html:723` | 👀 | 사이트 본문 | 'g5.t': '社員同士が関わり合います', 'g5.p': 'リーダーがメンバーに仕事を渡し、メンバーが報告に向かいます。同僚の画面を肩越しにのぞいたり（👀）、詰まった同僚を手伝いに行ったり（?） |
| `site/ja/index.html:811` | 👀 | 사이트 본문 | 'g5.t': '员工之间也会互动', 'g5.p': '组长把工作交给组员，组员走过去汇报。同事会从身后看一眼屏幕（👀）、去帮卡住的同事（?）、完成时击掌鼓掌庆祝。偶尔还会聊聊工作、跑腿买咖啡，点击 |
| `site/zh/index.html:404` | 👀 | 사이트 본문 | <div class="row rv"><div class="txt"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke=" |
| `site/zh/index.html:547` | 👀 | 사이트 본문 | 'g5.t': '직원들이 서로 일해요', 'g5.p': '팀장이 팀원에게 일을 넘기고 팀원이 보고하러 가요. 동료 화면을 어깨 너머로 들여다보고(👀), 막힌 동료를 도우러 가고(? |
| `site/zh/index.html:635` | 👀 | 사이트 본문 | 'g5.t': 'Staff work with each other', 'g5.p': 'A team lead hands work to a teammate, and the teammat |
| `site/zh/index.html:723` | 👀 | 사이트 본문 | 'g5.t': '社員同士が関わり合います', 'g5.p': 'リーダーがメンバーに仕事を渡し、メンバーが報告に向かいます。同僚の画面を肩越しにのぞいたり（👀）、詰まった同僚を手伝いに行ったり（?） |
| `site/zh/index.html:811` | 👀 | 사이트 본문 | 'g5.t': '员工之间也会互动', 'g5.p': '组长把工作交给组员，组员走过去汇报。同事会从身后看一眼屏幕（👀）、去帮卡住的同事（?）、完成时击掌鼓掌庆祝。偶尔还会聊聊工作、跑腿买咖啡，点击 |
| `site/en/index.html:404` | 👀 | 사이트 본문 | <div class="row rv"><div class="txt"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke=" |
| `site/en/index.html:547` | 👀 | 사이트 본문 | 'g5.t': '직원들이 서로 일해요', 'g5.p': '팀장이 팀원에게 일을 넘기고 팀원이 보고하러 가요. 동료 화면을 어깨 너머로 들여다보고(👀), 막힌 동료를 도우러 가고(? |
| `site/en/index.html:635` | 👀 | 사이트 본문 | 'g5.t': 'Staff work with each other', 'g5.p': 'A team lead hands work to a teammate, and the teammat |
| `site/en/index.html:723` | 👀 | 사이트 본문 | 'g5.t': '社員同士が関わり合います', 'g5.p': 'リーダーがメンバーに仕事を渡し、メンバーが報告に向かいます。同僚の画面を肩越しにのぞいたり（👀）、詰まった同僚を手伝いに行ったり（?） |
| `site/en/index.html:811` | 👀 | 사이트 본문 | 'g5.t': '员工之间也会互动', 'g5.p': '组长把工作交给组员，组员走过去汇报。同事会从身后看一眼屏幕（👀）、去帮卡住的同事（?）、完成时击掌鼓掌庆祝。偶尔还会聊聊工作、跑腿买咖啡，点击 |
| `site/assets/screens/README.md:25` | 👀 | 사이트 본문 | interaction.webp      PC 직원 상호작용(👀 어깨 너머 검토·👍 승인) — 꾸미기 5 |
| `site/assets/screens/README.md:25` | 👍 | 사이트 본문 | interaction.webp      PC 직원 상호작용(👀 어깨 너머 검토·👍 승인) — 꾸미기 5 |

## 5. 코드 주석에만 나오거나 화면에 안 나오는 이모지

주석 속 41곳(예: `🔁`·`📘`·`🎲`·`👀` 설명). 화면에는 안 나오므로 아이콘 교체 대상이 아닙니다. 다만 **주석이 가리키는 버튼에는 이모지가 있습니다** — 🎲(생김새 무작위 버튼, `AvatarEditor.tsx:44` 주석 속 설명) 같은 항목은 실제 버튼이 이모지가 아닌 다른 방식으로 그려졌는지 확인이 필요합니다. 상세: ★, ☕, ✓, 🌐, 🎉, 🎤, 🎲, 🏆, 👀, 👍, 👏, 💬, 📘, 📱, 🔁, 🔍, 🤖

## 6. 확인하지 못했거나 주의할 점

- 이모지를 **런타임에 문자열로 조립**하는 곳(예: `ShopPage`의 `set.emoji`, `m.emoji`, `LEDGER_ICON`, `CoachTour`의 `icon`)은 정의 위치로 센 것이라 실제 화면 노출 횟수는 더 많을 수 있습니다(세트 10종·미션/업적 약 45종이 각각 상점 화면에 1번씩 노출).
- 번역 사전은 한국어 값만 셌습니다. 영·일·중 값에만 이모지가 있고 한국어에는 없는 항목이 있다면 빠졌을 수 있습니다(아래 스크립트 기준 확인).
- 코드 주석·`docs`·`CHANGELOG` 문서 속 이모지는 UI가 아니라서 세지 않았습니다. `site/index.html`의 👀는 사이트 소개 본문입니다.
- 앱은 이미 `lucide-react` 아이콘을 쓰는 파일이 61개 있습니다. 이모지를 바꿀 때 같은 라이브러리에서 고를지, 새로 그린 SVG를 쓸지는 이디자·정리드가 정할 사항이라 이번 조사 범위 밖입니다.
- 지도 말풍선의 `actions.ts`(39곳)·`emoteArt.ts`(42곳 매핑)·`interactions.ts`는 같은 이모지를 매핑과 사용처에서 중복해 세므로 §1 횟수가 실제 노출보다 크게 보일 수 있습니다.
