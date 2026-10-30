# 소개 페이지 다음 버전 구성안·문구 (한·영·일·중)

> 작성: 김기획(PM) · 대상: `site/index.html`의 `T` 사전(`ko/en/ja/zh`) · 코드는 바꾸지 않았다.
> 기준: `docs/site-0.14.0-copy.md`(이미 `site/index.html`에 반영돼 있음을 키 단위로 확인) + CHANGELOG 0.14.1~0.15.1 + `git log v0.14.0..HEAD`.
> 쓰기 규칙: 개발 용어는 쓰지 않는다. 확인 못 한 것은 넣지 않고 0절에 모아 둔다.

## 0. 근거와 반영 범위

### 0-1. 넣는 것 (근거 확인함)

| 항목 | 근거 | 배포 상태 |
|---|---|---|
| 색 테마 6종(라벤더·스카이·노을·숲속·벚꽃·모노), 라이트/다크/기기 따르기 | CHANGELOG 0.15.0 | 0.15.0 배포됨 |
| 설정 화면 왼쪽 분류(일반·AI·업무·사무실·연결), 휴대폰은 위쪽 탭 | CHANGELOG 0.15.0 | 배포됨 |
| 둥근 버튼·카드, 입력칸 강조 등 화면 손질 | CHANGELOG 0.15.0 | 배포됨 |
| 직접 적은 직무 직원도 직원 팩으로 내보내기·가져오기 | CHANGELOG 0.15.0 | 배포됨 |
| 사무실 장면을 PNG·10초 GIF로 내보내기(말풍선 글 가리기 선택) | CHANGELOG 0.14.3 | 배포됨 |
| 첫 실행 안내: 마지막에 예제 업무를 실제로 맡기고, 실패 원인 안내, Claude 없으면 GPT로 진행 | CHANGELOG 0.14.3 | 배포됨 |
| 휴대폰 직원 마켓, 데모데이 배너(지금 열기), 직원 엔진 나중에 바꾸기 | CHANGELOG 0.14.3 | 배포됨 |
| 회의·데모데이에서 직원이 각자 자기 AI(Claude/GPT)로 발언 | CHANGELOG 0.14.1 | 배포됨 |
| 비서에게 GPT 직원 고용을 부탁 | CHANGELOG 0.14.2 | 배포됨 |
| 상단바 플랜 사용률에 Claude·GPT 병기 | CHANGELOG 0.14.4 | 배포됨 |
| 층별 계단 그림, 윈도우 설치형(Setup.exe)·앱 안 업데이트 | CHANGELOG 0.14.4 | 배포됨(사이트 다운로드 카드는 이미 반영) |
| 직원 상호작용 연출 7종(일 넘기기·보고, 어깨 너머 검토 👀, 막힌 동료 돕기 ?, 완료 축하(하이파이브·박수), 업무 수다, 커피 심부름, 클릭 반응) + 승인 👍 | 커밋 3a063c3·7b43116·2f92238, `shared/iso/interactions.ts` | **미배포**(CHANGELOG `[미정]`이 비어 있음) |
| 직원 새 도트 캐릭터, 감정 말풍선, 건물 외관 주변 그림 새 단장 | 커밋 67def09·2f92238·61a13f9 | **미배포** |
| 새 가구 12종(낮은 파티션·원목·벽돌·식물·유리 가벽 등 6, 책 더미·택배 상자·우산꽂이·간식 바구니·코르크 메모판·미니 냉장고 6) | 커밋 368c1cd, `shared/economy.ts` | **미배포** |
| 안드로이드 사진 첨부 꺼짐 수정, 입력란 테두리 수정 | CHANGELOG 0.15.1 | 배포됨(소개 문구에는 넣지 않음, 버그 수정) |

### 0-2. 넣지 않는 것

- **디자인 개편 시안 v3~v8**: 커밋 2d2e54f는 `docs/design-refresh/` 시안 파일만 추가했다. 앱에 적용됐다는 근거가 없어 문구에 쓰지 않는다. 위 "새 캐릭터·건물 그림"만 코드에 연결된 것이 확인된다.
- 직원 상호작용의 "개발용 미리보기"(설정): 개발 빌드 전용이라 제외.
- 작업 중인 미커밋 변경(결재 칸 높이 조절 등): 확정 전이라 제외.
- 윈도우 zip·서명 경고 안내: 현재 사이트에 이미 있다(`win.1`·`win.2`·`q4`). 변경 없음.

### 0-3. 확인 필요 (정리드·대표)

1. **미배포 3종(상호작용·새 그림·가구)을 이번 소개에 넣을지.** 아래에서 `[미배포]`로 표시했다. 다음 버전에 실려 나가는 것이 확정된 뒤에만 반영한다. 안 실리면 해당 키는 건너뛴다.
2. 새 가구 12종이 특정 레벨에서 열리는지 확인하지 못했다. 문구는 레벨을 말하지 않는다.
3. 테마별 스크린샷은 6종 전부 찍지 않고 설정 화면 한 장(칩 6개 보임)으로 충분하다고 가정했다. 6종 모자이크를 원하면 알려 달라.
4. 다음 버전 번호·날짜는 대표 지시 전이라 쓰지 않았다. `data-version` 기본값은 건드리지 않는다.

## 1. 페이지 구성 (위에서 아래로)

현재 구성(히어로 → #how → #features → #grow → #screens → #download → #faq → 마지막 권유)을 유지하고 **한 섹션을 새로 넣는다**. 디자인은 앱과 같은 느낌(알약 버튼·둥근 카드·라벤더 강조색·라이트/다크)으로 맞춘다는 대표 코멘트를 따른다.

| # | 섹션 | id | 현재 대비 | 캡처 |
|---|---|---|---|---|
| 1 | 히어로 | (hero) | 문구 유지, 캡처만 재촬영 | office |
| 2 | 사용 흐름 | #how | 유지(글만) | 없음 |
| 3 | 핵심 기능 8개 | #features | f1·f5·f7·f8 문구 보강 | staff-mix · chat · inbox · board · meeting · computer · secretary · dashboard |
| 4 | **내 스타일로(신설)** | **#look** | **새 섹션**: 테마 6종·화면 모드·설정 분류 | theme · settings |
| 5 | 꾸미기·레벨 | #grow | g1 유지, g2 보강, **g4 장면 내보내기·g5 직원 상호작용 추가** | exterior · decorate · demoday · export · interaction |
| 6 | 휴대폰 | #screens | 설명 한 줄 보강 | phone-dashboard · phone-inbox · phone-chat |
| 7 | 다운로드 | #download | 변경 없음 | 없음 |
| 8 | FAQ | #faq | 9개 → 11개(q10 테마·모드, q11 피드백) | 없음 |
| 9 | 마지막 권유 | (final) | 유지 | 없음 |

내비게이션: 사용법 · 기능 · **스타일(신설)** · 꾸미기 · 휴대폰 · 다운로드 · FAQ.

## 2. 문구 (바뀌거나 새로 생기는 키만)

없는 키는 현재 `site/index.html` 그대로 둔다.

### 2-1. 내비·메타

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| nav.look (신설) | 스타일 | Style | スタイル | 风格 |

`meta.title`·`meta.desc`·`hero.*`: 변경 없음.

### 2-2. 핵심 기능 보강 (#features) — 기존 키 교체

**f1.p**
- ko: 직원마다 Claude와 GPT 중 어느 쪽 두뇌로 일할지 고를 수 있어요. 한 사무실에서 두 종류 직원이 같이 일하고, 일에 어울리는 직원을 추천도 해 줘요. 뽑은 뒤에도 쓰는 AI를 바꿀 수 있어요. 둘 중 하나만 있어도 바로 시작할 수 있고, GPT 직원은 아직 베타예요.
- en: Choose, per employee, whether they work on Claude or GPT. Both kinds work side by side in one office, and the app suggests who fits a task. You can switch an employee's AI after hiring, too. One account is enough to start. GPT staff are still in beta.
- ja: 社員ごとに、ClaudeとGPTのどちらで働くかを選べます。1つのオフィスで両方が一緒に働き、仕事に合う社員をおすすめもします。雇ったあとからAIを切り替えることもできます。どちらか一方だけでも始められ、GPT社員はまだベータ版です。
- zh: 每位员工都可以选择用 Claude 还是 GPT 工作。两种员工在同一间办公室里协作,还会为任务推荐合适的人选。雇用之后也可以更换员工使用的 AI。只有其中一个账号也能马上开始,GPT 员工目前为测试版。

**f2.p** (비서가 GPT 직원을 뽑아 주는 것 추가)
- ko: 직무와 모습을 고르면 바로 일할 준비 끝. 단체방에서 @이름 · @팀 · @전체로 부르거나, 아무도 안 부르면 일에 맞는 직원이 받아요. 직원 마켓에서 준비된 직원 여섯 명을 뽑거나, 비서에게 “GPT 직원 한 명 뽑아 줘”라고 말해도 돼요.
- en: Pick a role and a look and they’re ready. Call @name, @team, or @everyone in the group chat — or just ask, and the best-fit person picks it up. Hire one of six ready-made staff from the staff market, or just tell the secretary, “Hire me a GPT employee.”
- ja: 職種と見た目を選べば準備完了。グループチャットで @名前・@チーム・@全員 と呼ぶか、誰も呼ばなければ合う社員が受けます。社員マーケットから用意済みの6人を雇うことも、秘書に「GPT社員を1人雇って」と頼むこともできます。
- zh: 选好职位和形象即可开工。在群聊里用 @姓名、@团队、@全员 点名,不点名时由最合适的员工接手。可以从员工市场里六位现成的员工中雇用,也可以直接对秘书说“帮我雇一位 GPT 员工”。

**f5.p** (회의에서 각자 자기 AI)
- ko: 보고와 허락 요청이 채팅으로 흐르고, 결재함이나 단체방에서 바로 승인하거나 답할 수 있어요. 회의실에서는 직원들이 각자 자기 AI(Claude 또는 GPT)로 돌아가며 의견을 내고, 회의록과 할 일이 자동으로 정리돼요.
- en: Reports and permission requests flow through chat, and you can approve or reply right there. In the meeting room, each employee speaks with their own AI (Claude or GPT) in turn, and the minutes and to-dos are written up for you.
- ja: 報告や許可の依頼がチャットで流れ、その場で承認や返信ができます。会議室では社員がそれぞれ自分のAI(ClaudeまたはGPT)で順番に意見を出し、議事録とやることが自動でまとまります。
- zh: 汇报和许可请求通过聊天流转,可以直接在群聊里批准或回复。会议室里每位员工用各自的 AI(Claude 或 GPT)轮流发言,会议纪要和待办会自动整理好。

**f7.p** (첫 실행 안내가 예제 업무를 실제로 맡김)
- ko: 처음 켜면 안내가 사무실 쓰는 법을 알려 주고, 마지막에 직원 한 명에게 예제 업무를 실제로 맡겨 결과까지 확인해요. 잘 안 되면 로그인·사용 한도·시간 초과·네트워크 중 무엇이 원인인지 알려 줘요. 그다음부터는 비서에게 말로 부탁하세요 — 팀 옮기기, 업무 보드 정리, 사무실 꾸미기, 직원 지침 점검까지, 바꾸기 전과 후를 나란히 보여 줘요.
- en: On first launch, a guided tour shows you around and finishes by handing a sample task to an employee, so you see a real result. If it fails, it tells you the cause: login, usage limit, timeout, or network. After that, just ask the secretary — moving people between teams, tidying the task board, redecorating, checking staff instructions — with before and after shown side by side.
- ja: 初回起動時はツアーで使い方を案内し、最後に社員1人へサンプル業務を実際に任せて結果まで確認します。うまくいかないときは、ログイン・使用上限・タイムアウト・ネットワークのどれが原因かを知らせます。そのあとは秘書に話しかけるだけ。チームの異動、業務ボードの整理、オフィスの模様替え、社員の指示の点検まで、変更前と変更後を並べて見せてくれます。
- zh: 首次启动时,导览会带你熟悉办公室,最后真的把一个示例任务交给一位员工,让你看到实际结果。如果失败,会告诉你原因:登录、用量上限、超时还是网络。之后直接对秘书说就行:调整团队、整理任务看板、布置办公室、检查员工指令,改动前后并排展示。

**f8.p** (상단바 병기)
- ko: 누가 일하고 누가 확인을 기다리는지 한눈에 보고, 직원별 사용량과 Claude·GPT 각각의 플랜 사용량을 카드로 확인해요. 상단바에서도 두 사용률을 함께 볼 수 있어요. 사용량이 거의 다 차면 예약 업무를 잠시 멈춰 알려 줘요. 터미널에서 따로 돌리는 Claude·GPT 작업도 ‘일하는 중’으로 보여요.
- en: See at a glance who’s working and who’s waiting, with per-employee usage and a card for each of your Claude and GPT plans. The top bar shows both usage rates side by side. When usage runs near the limit, scheduled work pauses and you’re told. Claude and GPT sessions you start in a terminal also show up as “working.”
- ja: 誰が働き、誰が確認待ちかをひと目で確認。社員ごとの使用量と、ClaudeとGPTそれぞれのプラン使用量をカードで見られます。上部のバーにも両方の使用率が並びます。使用量が上限に近づくと予約作業を一時停止してお知らせします。ターミナルで別に動かしているClaude・GPTの作業も「作業中」と表示されます。
- zh: 一眼看清谁在工作、谁在等你确认,员工用量以及 Claude 和 GPT 各自的套餐用量都以卡片显示。顶部栏也会并排显示两者的使用率。用量快满时会暂停定时任务并提醒你。在终端里另外运行的 Claude、GPT 工作,也会显示为“工作中”。

### 2-3. 내 스타일로 (#look) — 신설

| 키 | ko | en | ja | zh |
|---|---|---|---|---|
| look.eyebrow | 스타일 | Style | スタイル | 风格 |
| look.title | 내 취향에 맞는 사무실 | An office that fits your taste | 好みに合うオフィス | 符合你喜好的办公室 |
| look.sub | 색 테마 여섯 가지와 라이트·다크 모드로 앱의 분위기를 바꿔요. | Change the app’s mood with six color themes and light or dark mode. | 6つのカラーテーマとライト・ダークモードでアプリの雰囲気を変えられます。 | 用六种颜色主题和浅色/深色模式改变应用的氛围。 |
| l1.t | 색 테마 6종 | Six color themes | 6つのカラーテーマ | 六种颜色主题 |
| l1.p | 라벤더·스카이·노을·숲속·벚꽃·모노 중에서 설정에서 골라요. 버튼과 강조 색만 바뀌고 화면 구성은 그대로라 금방 익숙해져요. | Pick from Lavender, Sky, Sunset, Forest, Blossom, and Mono in Settings. Only buttons and accent colors change; the layout stays the same. | ラベンダー・スカイ・夕焼け・森・桜・モノから設定で選べます。ボタンと強調色だけが変わり、画面構成はそのままです。 | 在设置中从薰衣草、天空、晚霞、森林、樱花、单色里选择。只改变按钮和强调色,界面布局不变。 |
| l2.t | 라이트·다크 모드 | Light and dark mode | ライト・ダークモード | 浅色与深色模式 |
| l2.p | 기기 설정 따르기·라이트·다크 중에서 골라요. 기기 설정을 따르면 기기가 바뀔 때 앱도 바로 바뀌고, 창 제목 표시줄과 배경도 함께 맞춰져요. | Choose follow-device, light, or dark. When following the device, the app switches the moment your device does, and the window title bar and background match. | 端末の設定に合わせる・ライト・ダークから選べます。端末設定に合わせると、端末が切り替わった瞬間にアプリも切り替わり、ウィンドウのタイトルバーと背景も揃います。 | 可选择跟随设备、浅色或深色。跟随设备时,设备切换的同时应用也会立即切换,窗口标题栏和背景也会一并统一。 |
| l3.t | 정리된 설정 화면 | A tidier Settings screen | すっきりした設定画面 | 更清爽的设置页面 |
| l3.p | 왼쪽 분류(일반·AI·업무·사무실·연결)에서 고르면 그 항목만 오른쪽에 보여요. 휴대폰에서는 위쪽 탭으로 보여요. | Choose a category on the left (General, AI, Work, Office, Connections) and only its items appear on the right. On a phone they show as tabs along the top. | 左側の分類(一般・AI・業務・オフィス・接続)を選ぶと、その項目だけが右に表示されます。スマホでは上部のタブで表示されます。 | 在左侧分类(常规、AI、工作、办公室、连接)中选择,右侧只显示该分类的内容。手机上显示为顶部标签。 |
| alt.look1 | 설정 > 화면에서 색 테마 6종과 화면 모드를 고르는 모습 | Choosing one of six color themes and a display mode in Settings | 設定で6つのカラーテーマと画面モードを選ぶ様子 | 在设置中选择六种颜色主题和显示模式 |
| alt.look2 | 왼쪽 분류가 있는 설정 화면 | The Settings screen with a left-hand category list | 左側に分類がある設定画面 | 左侧带分类列表的设置页面 |
| co.look(캡처 위 번호) | ① 테마 6칸 ② 화면 모드 ③ 왼쪽 분류 | ① Six theme chips ② Display mode ③ Left-hand categories | ① テーマ6種 ② 画面モード ③ 左の分類 | ① 六个主题 ② 显示模式 ③ 左侧分类 |

보조 한 줄(`l.note`, 캡처 아래)
- ko: 색 테마와 화면 모드는 PC에서 바꾸고, 휴대폰은 PC에서 정한 대로 보여요. 사무실 그림의 낮·밤은 따로 정해요.
- en: Change theme and mode on your PC; the phone follows your PC’s choice. Day and night in the office scene are set separately.
- ja: カラーテーマと画面モードはPCで変更し、スマホはPCの設定に合わせて表示されます。オフィスの昼夜は別に設定します。
- zh: 颜色主题和显示模式在电脑上更改,手机会跟随电脑的设置。办公室画面的昼夜另行设置。

### 2-4. 꾸미기·레벨 보강 (#grow)

**g2.p** 교체 (`[미배포]` 가구 12종 문장은 확정 뒤에만 포함)
- ko: 상점에서 가구·벽지·칸막이·고양이와 강아지를 사서 꾸며요. 책상과 의자는 한 세트로 돌려 놓고, 직원 자리에 앉힐 수 있어요. 커피머신·수족관 같은 소품은 움직이고 반응해요. “알아서 예쁘게 배치해줘”는 비서에게 맡기세요. `[미배포]` 낮은 파티션과 원목·벽돌·식물·유리 가벽, 책 더미·미니 냉장고 같은 새 가구와 소품 12종도 들어와요.
- en: Buy furniture, wallpaper, partitions, cats and dogs in the shop. Rotate a desk and chair as one set and assign it to a person. Props like the coffee machine and aquarium move and react. Or ask the secretary to “arrange it nicely.” `[unreleased]` Twelve new pieces arrive too, from low partitions and wood, brick, plant, and glass walls to a book stack and a mini fridge.
- ja: ショップで家具・壁紙・パーテーション・猫や犬を買って飾れます。机と椅子はセットで回転でき、社員の席に置けます。コーヒーマシンや水槽などの小物は動いて反応します。「おしゃれに配置して」は秘書にお任せ。`[未リリース]` 低いパーテーションや木・レンガ・植物・ガラスの間仕切り壁、本の山やミニ冷蔵庫など、新しい家具と小物12種も加わります。
- zh: 在商店购买家具、壁纸、隔断和猫狗来装饰。桌椅可作为一套整体旋转,并分配给员工的座位。咖啡机、水族箱等摆设会动起来并有反应。“帮我漂亮地布置一下”也可以交给秘书。`[未发布]` 还新增了 12 件家具和摆设,包括矮隔断和原木、砖、植物、玻璃隔墙,以及书堆、迷你冰箱等。

**g4 장면 내보내기 (신설)**
- ko: 제목: 사무실을 사진·GIF로 / 본문: 지금 사무실 장면을 사진(PNG)이나 10초짜리 움직이는 GIF로 저장해요. 말풍선 글을 가릴지 고를 수 있어서 그대로 공유하기 좋아요. PC 앱에서 쓸 수 있어요.
- en: Title: Save your office as a photo or GIF / Body: Save the current office scene as a photo (PNG) or a 10-second animated GIF. You can choose to hide the speech-bubble text, so it’s ready to share. Available in the PC app.
- ja: タイトル: オフィスを写真・GIFで / 本文: 今のオフィスの様子を、写真(PNG)または10秒の動くGIFとして保存できます。吹き出しの文字を隠すかどうかも選べるので、そのまま共有できます。PCアプリで使えます。
- zh: 标题:把办公室保存为照片或 GIF / 正文:可以把当前的办公室画面保存为照片(PNG)或 10 秒的动态 GIF。还能选择是否遮住气泡里的文字,方便直接分享。仅在电脑端应用中可用。
- alt: 사무실 장면 내보내기 창 / The office scene export dialog / オフィス画面の書き出しダイアログ / 办公室画面导出窗口
- 키: `g4.t` `g4.p` `alt.g4`, 번호: `co.export` = ① PNG·GIF 선택 ② 말풍선 글 가리기 (EN ① Choose PNG or GIF ② Hide bubble text / JA ① PNGかGIFを選ぶ ② 吹き出しの文字を隠す / ZH ① 选择 PNG 或 GIF ② 遮住气泡文字)

**g5 직원 상호작용 (신설, `[미배포]`)**
- ko: 제목: 직원들이 서로 일해요 / 본문: 팀장이 팀원에게 일을 넘기고 팀원이 보고하러 가요. 동료 화면을 어깨 너머로 들여다보고(👀), 막힌 동료를 도우러 가고(?), 끝나면 하이파이브와 박수로 축하해요. 가끔 일 얘기로 수다를 떨고, 커피를 심부름하고, 직원을 클릭하면 손을 흔들어요. 화면에서 보여 주는 연출이라 업무와 기록에는 영향이 없어요.
- en: Title: Staff work with each other / Body: A team lead hands work to a teammate, and the teammate walks over to report. Colleagues peek over a shoulder (👀), go help someone who’s stuck (?), and celebrate with high-fives and applause. They sometimes chat about the work, run for coffee, and wave when you click them. It’s only shown on screen, so your work and records aren’t affected.
- ja: タイトル: 社員同士が関わり合います / 本文: リーダーがメンバーに仕事を渡し、メンバーが報告に向かいます。同僚の画面を肩越しにのぞいたり(👀)、詰まった同僚を手伝いに行ったり(?)、完了するとハイタッチや拍手でお祝いします。ときどき仕事の雑談をしたり、コーヒーのお使いに行ったり、クリックすると手を振ります。画面上の演出なので、業務や記録には影響しません。
- zh: 标题:员工之间也会互动 / 正文:组长把工作交给组员,组员走过去汇报。同事会从身后看一眼屏幕(👀)、去帮卡住的同事(?)、完成时击掌鼓掌庆祝。偶尔还会聊聊工作、跑腿买咖啡,点击员工会向你挥手。这只是画面上的演出,不影响工作和记录。
- alt: 직원이 동료 자리로 가서 일을 넘기는 사무실 장면 / A staff member walking to a colleague’s desk to hand off work / 社員が同僚の席へ行って仕事を渡すオフィスの様子 / 员工走到同事座位交接工作的办公室画面
- 키: `g5.t` `g5.p` `alt.g5`, 번호: `co.interaction` = ① 일 넘기기 ② 어깨 너머 검토 👀 ③ 완료 축하 (EN ① Handing off work ② Peeking over a shoulder 👀 ③ Celebrating (JA ① 仕事を渡す ② 肩越しにのぞく 👀 ③ 完了のお祝い / ZH ① 交接工作 ② 身后查看 👀 ③ 庆祝完成)

### 2-5. 휴대폰 보강 (#screens)

`ph.note` 뒤에 한 줄 추가 (`ph.note2`)
- ko: 휴대폰에서도 직원 마켓을 열어 직원을 뽑을 수 있고, 데모데이가 열리면 화면 위 배너에서 바로 발표장으로 들어가요. PC 앱이 예전 버전이면 업데이트 안내가 떠요.
- en: You can open the staff market and hire from your phone too, and when a demo day starts, a banner takes you straight to the stage. If your PC app is out of date, the phone shows an update notice.
- ja: スマホからも社員マーケットを開いて雇えます。デモデイが始まると、画面上のバナーからそのまま発表会場に入れます。PCアプリが古い場合は、スマホに更新のお知らせが出ます。
- zh: 在手机上也能打开员工市场雇人;演示日开始时,点屏幕上方的横幅就能直接进入舞台。如果电脑端应用版本较旧,手机会弹出更新提示。

(팩 가져오기·내보내기는 PC 전용이라 문구에 넣지 않는다.)

### 2-6. FAQ 추가 (#faq)

| # | ko | en | ja | zh |
|---|---|---|---|---|
| q10 | **화면 색이나 어두운 모드를 바꿀 수 있나요?** 네. 설정에서 색 테마 6종과 라이트·다크·기기 설정 따르기 중에서 골라요. 휴대폰 앱은 PC에서 정한 대로 보여요. | **Can I change the colors or use dark mode?** Yes. In Settings, pick one of six color themes and light, dark, or follow-device mode. The phone app follows your PC’s choice. | **画面の色やダークモードは変えられますか?** はい。設定で6つのカラーテーマと、ライト・ダーク・端末設定に合わせるから選べます。スマホアプリはPCの設定に合わせて表示されます。 | **可以更换界面颜色或使用深色模式吗?** 可以。在设置里从六种颜色主题和浅色、深色、跟随设备中选择。手机应用会跟随电脑端的设置。 |
| q11 | **문제나 바라는 점은 어디에 알리나요?** 앱 왼쪽 사이드바의 ‘피드백 보내기’를 누르면 앱 버전과 운영체제가 미리 채워진 GitHub 작성 화면이 열려요. | **Where do I report a problem or request something?** Press “Send feedback” in the app’s left sidebar. It opens a GitHub form with your app version and operating system already filled in. | **不具合や要望はどこに伝えればいいですか?** アプリ左のサイドバーにある「フィードバックを送る」を押すと、アプリのバージョンとOSが入力済みのGitHub作成画面が開きます。 | **遇到问题或有建议该去哪里反馈?** 点击应用左侧边栏的“发送反馈”,会打开已自动填好应用版本和操作系统的 GitHub 提交页面。 |

## 3. 캡처 목록 (모두 **라벤더 테마·다크 모드**)

규격은 `site/assets/screens/README.md` 그대로(PC 2720×1720 WebP, 휴대폰 1170×2532 WebP, 언어별 4폴더 `ko/en/ja/zh`, 같은 데모 데이터). 모든 캡처는 앱 설정에서 테마=라벤더, 화면 모드=다크로 고정한 뒤 찍는다. 개인정보(이메일·작업 폴더·고객명)는 샘플 데이터로 대체한다.

| 파일 | 위치 | 상태 | 담을 장면 |
|---|---|---|---|
| `office.webp` | 히어로 | 재촬영 | 사무실 전경. Claude·GPT 직원이 함께 앉고 머리 위 상태 말풍선이 보이게 |
| `staff-mix.webp` | f1 | 재촬영 | 고용 창: Claude/GPT 선택, 베타 표시, 추천 |
| `providers.webp` | f1 보조 | 재촬영 | 설정 > AI: Claude·GPT 연결 상태 |
| `chat.webp` | f2 | 재촬영 | 단체방 @이름 지시와 GPT 직원 답 |
| `inbox.webp` | f3 | 재촬영 | 결재 카드와 ‘작업 전으로 되돌리기’ |
| `board.webp` | f4 | 재촬영 | 팀장 계획 + 카드별 비용 |
| `meeting.webp` | f5 | 재촬영 | 회의실 발언(직원 이름 옆 엔진 표시가 보이면 좋음) |
| `computer.webp` | f6 | 재촬영 | 컴퓨터 조작 클릭 승인 카드 + 장비 탭 |
| `secretary.webp` | f7 | 재촬영 | 비서 확인 카드(전·후 비교) |
| `dashboard.webp` | f8 | 재촬영 | 직원별 사용량 + Claude·GPT 카드 + **상단바 Claude\|GPT 병기가 보이게** |
| `theme.webp` | #look l1·l2 | **새로** | 설정 > 화면(일반): 테마 칩 6개와 화면 모드 선택 |
| `settings.webp` | #look l3 | **새로** | 왼쪽 분류가 보이는 설정 화면(AI 분류 선택 상태) |
| `exterior.webp` | g1 | 재촬영 | 레벨 20 건물 외관. `[미배포]` 새 주변 건물 그림이 적용된 상태로 |
| `decorate.webp` | g2 | 재촬영 | 꾸미기 모드: 책상 세트·칸막이. `[미배포]` 새 가구가 보이면 함께 |
| `demoday.webp` | g3 | 재촬영 | 무대와 뒷벽 스크린 |
| `export.webp` | g4 | **새로** | 사무실 장면 내보내기 창(PNG/GIF 선택, 글 가리기) |
| `interaction.webp` | g5 `[미배포]` | **새로** | 직원이 동료 자리에서 일을 넘기거나 👀·? 말풍선을 띄운 장면(층 안 직원 2명 이상) |
| `phone-dashboard.webp` `phone-inbox.webp` `phone-chat.webp` | 휴대폰 | 재촬영 | 같은 화면, GPT 직원 포함, 다크·라벤더 |
| `og.png` | 링크 미리보기 | 변경 없음 | 제목 문구가 바뀌지 않았으므로 그대로 |

- 기존 16개 재촬영 + 새 4개(`theme`·`settings`·`export`·`interaction`). `interaction`은 `[미배포]` 확정 시에만 찍는다.
- 촬영 기준 날짜는 데모 데이터 고정. 4개 언어 같은 구도.
- `site/build-langs.mjs`의 `SHOTS`(JSON-LD 스크린샷, 현재 5개)는 office·staff-mix·chat·inbox·board 그대로 둬도 된다. 새 캡처는 JSON-LD에 넣지 않는다.

## 4. 구현 메모 (최가독용)

- **새 `T` 키**: `nav.look`, `look.*`, `l1~l3.t/p`, `alt.look1/2`, `co.look`, `l.note`, `g4.t/p`, `alt.g4`, `co.export`, `g5.t/p`, `alt.g5`, `co.interaction`, `ph.note2`, `q10/a10`, `q11/a11`. 4개 언어 모두 채운다.
- **교체 키**: `f1.p`, `f2.p`, `f5.p`, `f7.p`, `f8.p`, `g2.p`. (g2의 `[미배포]` 문장은 배포 확정 전까지 빼도 된다. 문장 단위로 분리했다.)
- 내비에 `#look` 추가. `#grow` 블록이 3개에서 4~5개가 되므로 모바일 폭 줄바꿈을 확인한다(특히 ja).
- `[미배포]` 표시는 문구 안에 남기지 말고 반영 시 지운다.
- 디자인(색·모서리·그림자)은 앱의 0.15.0 토큰(라벤더 강조색, 알약 버튼, 둥근 카드)과 맞춘다는 대표 지시를 따른다. 본 문서는 문구·구성만 정한다.
- 버전 번호·`data-version`·배포·커밋은 건드리지 않는다.
