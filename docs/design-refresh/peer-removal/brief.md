# 다른 PC 직원 빌려주기·데려오기 삭제 + 연결 카드 합치기 — 설계 요청서 (정리드)

대표 결정(2026-11-13): '이 PC 직원 빌려주기 / 다른 PC 직원 데려오기' 기능을 화면·코드에서 완전히 삭제하고, 설정 › 연결의 두 카드('휴대폰·PC 연결' `connect/ConnectSection.tsx` + '연결한 PC' `workspace/ConnectedPcSection.tsx`)를 한 카드 흐름으로 합친다.
- 'PC 추가' 입구는 하나. 첫 카드 ③의 '내 다른 PC' 칸은 PC 추가 창(`WorkspaceWizard`)으로 이어 준다.
- PC 추가 창의 '휴대폰으로 이 PC 보기'(what.phone)와 첫 카드의 휴대폰 흐름이 겹치는 것을 정리한다.
- 이미 쓰는 사람의 연결·저장 데이터가 깨지지 않게 마이그레이션 여부를 확인한다(데려온 직원 `peer_staff`·대기 중 일·파일 맞추기 결재·피어 기록 `PeerRecord`·워크스페이스 목록).
- 4개 언어(ko/en/ja/zh) 문구, 죽은 코드, 테스트도 함께 정리한다.
- 배경: 1.3.0 결정 `docs/design-refresh/connect-workspace/impl-design-decision.md`('추가→이전→삭제, 삭제는 다음 릴리스'), `impl-design-readable.md` 6-4·7절(대체 범위·지우는 순서).

## 반드시 남길 것
워크스페이스(다른 PC 사무실을 창으로 보기)가 쓰는 짝짓기·연결 코드·기기별 열쇠(피어 슬롯·`view` 권한)·`HostPart`/`ClientPart` 연결 부품·`PeerRecord`·hello/재연결, 휴대폰 연결 전부.

## 지켜야 할 것
- CONTEXT.md·SPEC.md 규칙, i18n 사전 구조, 새 색 없음.
- 작업본에 v1.3.1·v1.3.2 미커밋 변경이 있다(StaffCard·StaffRow·StaffPanel·HireDialog·SettingsPage·dict 등). 그 위에 얹는다. 커밋 금지. 구현은 정리드가 v1.3.2 마무리 뒤 한다.
- 휴대폰 앱(안드로이드)·원격 v2 API에서 이 기능에 해당하는 부분도 범위에 포함하는지 판단해 적는다.

## 설계안에 넣을 것 (각자 관점으로, 서로 합의하지 말 것)
1. 지울 파일·함수·IPC 핸들러·DB 테이블·사전 키·시험 목록, 남길 것과의 경계(특히 `main/peer/` 안).
2. 저장 데이터 처리: 업데이트한 사람의 DB·설정에 남은 데려온 직원·대기 일·결재·동기화 파일을 어떻게 할지(지우기/무시/1회 정리), 앱이 옛 데이터를 만나도 죽지 않게 하는 방법. 상대 PC가 옛 버전일 때의 동작.
3. 합친 연결 카드의 화면 흐름(단계·버튼·기기 목록 하나로), PC 추가 창 변경(what 단계 정리 포함).
4. 검증 방법(시험·타입검사·실제 앱 확인 항목).
5. 변경 영향이 큰 곳과 순서.

결과는 `docs/design-refresh/peer-removal/design-choi.md`(최가독) / `design-park.md`(박패턴)에 쓴다.
