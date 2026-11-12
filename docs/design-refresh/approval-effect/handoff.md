# 결재 카드 '결과 한 줄' 제목 — 디자인 규칙 (2026-11-11 이디자 → 정리드)

시안: `approval-effect.png` (원본 `approval-effect.html`). 새 색·새 부품 없음.

## ① 효과 문장 제목
- `text-sm font-medium`, 색은 기본 전경색(foreground). 지금 도구 이름 줄(`toolDisplayName`) 자리를 대신함 → 효과 문장이 있으면 도구 이름 줄은 그리지 않음.
- 대시보드 '내 확인 필요' 줄만 예외: 지금 `도구 이름 · 원문` 자리에 효과 문장(`text-xs`, 전경색, `line-clamp-2`). 토글 없이 원문은 `title`(마우스를 올렸을 때)로만.
- 풀어 쓸 수 없는 명령은 **지금 모양 그대로**(도구 이름 `text-sm font-medium` + 원문 고정폭 박스 항상 보임, 토글 없음).

## ② 원본 명령 접기
- 기본 접힘. 토글은 대화 말풍선 '더보기' 버튼(`ChatPage.tsx` FoldableText)과 같은 모양: `text-xs font-medium opacity-70 hover:opacity-100` + `ChevronDownIcon size-3.5`, 펼치면 180° 회전. `aria-expanded`/`aria-controls` 포함.
- 문구: 명령 실행은 '명령 보기 / 명령 접기', 다른 도구는 '내용 보기 / 내용 접기'(4개 언어 문구 필요).
- 펼친 박스: 결재함의 기존 `pre` 스타일과 같게 `bg-muted text-muted-foreground font-mono text-[11px] rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-auto selectable`.
- 직원 패널 결재 칸은 카드 바탕이 `bg-muted`(분할이 아닐 때·폰)라서 박스만 `bg-card`로 뒤집음. 분할(side) 카드는 `bg-card`라 `bg-muted` 그대로.
- 펼침 상태는 카드별로 기억하지 않아도 됨(새로 그리면 접힘).

## ③ 순서 (위→아래)
누가·언제 → 요청자 줄(있을 때) → **효과 제목** → 이유 한 줄(waitReason) → 복원됨(있을 때) → 명령 보기 토글 → (펼친 박스) → 버튼.
- 무엇을 하는지 먼저 읽고, 왜 기다리는지 다음에 읽게 함. 지금은 이유가 제목보다 위에 있음 → 아래로 내림.
- 대화 승인 말풍선: 말풍선 본문 첫 줄이 효과 제목, 그 아래 이유·토글, 버튼은 지금처럼 `border-t` 아래.
- 질문(QuestionBox)·다른 PC 파일 변경 카드(ChangesetCard)는 이번 범위 아님(그대로).

## ④ 좁은 화면 줄바꿈 (폰·분할 왼쪽 200px)
- 효과 제목과 이유 한 줄: `break-keep [overflow-wrap:anywhere]` — 한국어는 낱말 단위로 줄바꿈, 긴 경로·파일 이름만 아무 데서나 끊음. 말줄임(`truncate`·`line-clamp`) 안 함(결재 판단 근거라 잘리면 안 됨). 대시보드만 2줄 제한.
  - 이유 줄에도 꼭 넣을 것: 200px에서 '기다려요'의 '요'만 다음 줄로 떨어지는 것을 시안에서 확인함.
- 글자 크기는 좁아도 줄이지 않음(제목 14px, 이유·토글 12px, 박스 11px).
- 토글은 한 줄 고정(`whitespace-nowrap`). 버튼 줄은 지금처럼 `flex-wrap`.
- 원문 박스는 `break-all` 유지 + 최대 높이 128px 안에서 스크롤.

## 확인 필요 (정리드 판단)
- 대시보드의 '바로 승인/결재함으로' 구분(`isLongApproval`)은 지금처럼 **원문 길이** 기준 유지를 권함(효과 문장이 짧아도 원문이 길면 결재함에서 보게).
- 효과 문장에 파일 이름을 넣을지 개수만 넣을지는 문장 생성 쪽 규칙. 디자인은 어느 쪽이든 위 줄바꿈 규칙으로 버팀.
