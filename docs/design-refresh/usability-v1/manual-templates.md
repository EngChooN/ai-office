# 매뉴얼 '예시에서 고르기' 템플릿 문구 (ko·en·ja·zh)

작성: 김기획 · 대상: 정리드(구현) · 근거: design-readable.md 4-4절, design-decision.md

## 0. 구현 메모

- 템플릿 7개: 한 명이 하는 업무(`personal`) 3 + 여러 명이 이어서 하는 업무(`process`) 4.
- 구조(코드 `manualTemplates.ts`)와 글자(사전 `dict/manualTemplates.ts`)를 나누는 설계를 따름. 아래 "구조" 표가 코드, 언어별 블록이 사전.
- 사전 키: 개인 `manualTpl.<id>.title|desc|body`, 프로세스 `manualTpl.<id>.title|desc|body`(공통 안내, 선택) + `manualTpl.<id>.s<N>.title|role|instr` (N은 1부터).
- `kind` 값은 코드의 실제 종류명(개인/프로세스)에 맞춰 쓰세요(여기선 `personal`/`process`로 표기 — 확인 필요).
- `needsMyCheck`가 켜진 템플릿은 고급 설정 자동 펼침 대상. `onRevise`는 "되돌릴 단계 번호(1부터)"이며 `-`는 되돌리지 않음. 첫 단계는 항상 `-`.
- 담당 직무(role)는 직원 직무에 **포함 매칭**되므로 각 언어의 흔한 직무명만 사용. 직원에 해당 직무가 없으면 매칭 안 됨(기존 한계, 범위 밖).
- 개발 용어(스킬·토큰 등) 미사용. 본문은 "~해 주세요" 체, 단계 지시는 그 단계 담당자에게 바로 건네는 문장.

## 1. 구조 (코드)

| id | 종류 | 단계 | 단계별 (role키 / 내 확인 / 되돌릴 단계) |
|---|---|---|---|
| `meetingNotes` | personal | - | - |
| `customerEmail` | personal | - | - |
| `dailyReport` | personal | - | - |
| `writeReview` | process | 2 | s1 작성자 / 아니오 / - ; s2 리뷰어 / 아니오 / 1 |
| `planBuildQA` | process | 3 | s1 기획자 / 아니오 / - ; s2 개발자 / 아니오 / - ; s3 QA / 아니오 / 2 |
| `contentPublish` | process | 3 | s1 작성자 / 아니오 / - ; s2 편집자 / 아니오 / 1 ; s3 (편집자) / **예** / 1 |
| `bugFix` | process | 4 | s1 분석(개발자) / 아니오 / - ; s2 수정(개발자) / 아니오 / - ; s3 리뷰어 / 아니오 / 2 ; s4 QA / **예** / 2 |

> `contentPublish` s3는 "대표(나)가 최종 확인"하는 단계라 담당은 편집자로 두고 `needsMyCheck`만 켭니다.

---

## 2. 문구

### 2-1. `meetingNotes` — 회의 내용 정리 (personal)

**ko**
- 제목: 회의 내용 정리하기
- 언제 쓰나요: 회의 메모나 녹취 글을 주면 결정 사항과 할 일을 뽑아 줘야 할 때
- 본문:
  1. 받은 글을 끝까지 읽고 회의 목적을 한 줄로 적어 주세요.
  2. 결정된 내용, 할 일(담당자·기한 포함), 아직 정해지지 않은 내용으로 나눠 정리해 주세요.
  3. 확실하지 않은 내용은 지어내지 말고 "확인 필요"라고 표시해 주세요.
  4. 전체를 10줄 안으로 짧게 써 주세요.

**en**
- Title: Summarize a meeting
- When to use: When you hand over meeting notes or a transcript and need decisions and to-dos pulled out
- Body:
  1. Read the whole text and write the meeting's purpose in one line.
  2. Sort it into decisions, to-dos (with owner and due date), and open questions.
  3. Don't guess. Mark anything unclear as "Needs confirmation".
  4. Keep the whole summary within 10 lines.

**ja**
- タイトル: 会議内容をまとめる
- 使う場面: 会議のメモや書き起こしを渡して、決定事項とやることを抜き出してほしいとき
- 本文:
  1. 受け取った文章を最後まで読み、会議の目的を1行で書いてください。
  2. 決定事項、やること(担当者・期限つき)、まだ決まっていないことに分けてまとめてください。
  3. はっきりしない内容は推測せず、「要確認」と書いてください。
  4. 全体を10行以内に短くまとめてください。

**zh**
- 标题: 整理会议内容
- 适用场景: 提供会议记录或录音文字,需要提炼出决定事项和待办时
- 正文:
  1. 通读全文,用一句话写出会议目的。
  2. 分成"已决定事项""待办(含负责人和截止日期)""尚未决定的事项"三部分整理。
  3. 不确定的内容不要编造,标注"待确认"。
  4. 全文控制在10行以内。

### 2-2. `customerEmail` — 고객 응대 메일 쓰기 (personal)

**ko**
- 제목: 고객 응대 메일 쓰기
- 언제 쓰나요: 고객 문의에 정중하고 짧은 답장 초안이 필요할 때
- 본문:
  1. 문의에서 고객이 궁금해하는 것과 기분(불만·단순 질문 등)을 먼저 파악해 주세요.
  2. 첫 문장에 인사와 문의 내용 확인, 둘째 문단에 답변, 마지막에 추가로 도울 일을 적어 주세요.
  3. 정해진 적 없는 약속(환불·일정 등)은 쓰지 말고, 필요하면 "확인 후 안내드리겠습니다"로 쓰세요.
  4. 존댓말로, 200자 안팎으로 써 주세요.

**en**
- Title: Write a customer reply email
- When to use: When you need a polite, short draft reply to a customer's question
- Body:
  1. First identify what the customer is asking and how they feel (complaint, simple question, etc.).
  2. Open with a greeting and a restatement of the question, answer in the next paragraph, and close by offering further help.
  3. Don't promise anything not already decided (refunds, dates). If needed, write "We'll check and get back to you."
  4. Keep a courteous tone and about 100 words.

**ja**
- タイトル: お客様への返信メールを書く
- 使う場面: お客様からの問い合わせに、丁寧で短い返信の下書きが必要なとき
- 本文:
  1. 問い合わせの内容と、お客様の気持ち(不満・単純な質問など)をまず把握してください。
  2. 冒頭に挨拶と問い合わせ内容の確認、次の段落に回答、最後に追加でお手伝いできることを書いてください。
  3. 決まっていない約束(返金・日程など)は書かず、必要なら「確認のうえご案内いたします」と書いてください。
  4. 丁寧な言葉づかいで、300字前後にしてください。

**zh**
- 标题: 撰写客户答复邮件
- 适用场景: 需要为客户咨询写一封礼貌简短的答复草稿时
- 正文:
  1. 先弄清客户想问什么,以及客户的情绪(不满、普通提问等)。
  2. 开头问候并确认咨询内容,第二段给出答复,最后说明还可以提供哪些帮助。
  3. 不要写尚未确定的承诺(退款、日程等),必要时写"确认后再回复您"。
  4. 用礼貌的语气,字数在150字左右。

### 2-3. `dailyReport` — 하루 업무 보고 정리 (personal)

**ko**
- 제목: 하루 업무 보고 정리하기
- 언제 쓰나요: 오늘 한 일을 어수선하게 적어 주면 보고용으로 깔끔하게 정리해야 할 때
- 본문:
  1. 받은 내용을 "한 일 / 진행 중 / 막힌 일 / 내일 할 일" 네 묶음으로 나눠 주세요.
  2. 각 항목은 한 줄로, 결과가 있으면 숫자나 결과를 함께 적어 주세요.
  3. 막힌 일에는 필요한 도움이 무엇인지 꼭 적어 주세요.
  4. 받은 내용에 없는 일은 추가하지 마세요.

**en**
- Title: Tidy up a daily work report
- When to use: When you give messy notes on today's work and need a clean report
- Body:
  1. Sort the notes into four groups: Done / In progress / Blocked / Tomorrow.
  2. Write each item in one line, and include numbers or results where there are any.
  3. For blocked items, always say what help is needed.
  4. Don't add anything that isn't in the notes.

**ja**
- タイトル: 1日の業務報告をまとめる
- 使う場面: 今日やったことを雑に書いて渡し、報告用にきれいに整えてほしいとき
- 本文:
  1. 受け取った内容を「やったこと/進行中/困っていること/明日やること」の4つに分けてください。
  2. 各項目は1行で書き、結果があれば数字や成果も添えてください。
  3. 困っていることには、必要な助けが何かを必ず書いてください。
  4. 受け取った内容にないことは追加しないでください。

**zh**
- 标题: 整理每日工作汇报
- 适用场景: 把今天做的事随手写给员工,需要整理成清晰的汇报时
- 正文:
  1. 把内容分成"已完成 / 进行中 / 遇到阻碍 / 明天计划"四组。
  2. 每项用一句话写,有结果的附上数字或成果。
  3. 遇到阻碍的事项,务必写明需要什么帮助。
  4. 不要添加原内容中没有的事项。

---

### 2-4. `writeReview` — 쓰고 검토받기 (process, 2단계)

**ko**
- 제목: 쓰고 검토받기
- 언제 쓰나요: 글이나 문서를 한 사람이 쓰고, 다른 사람이 읽어 보고 고칠 곳을 짚어 줘야 할 때
- 공통 안내: 읽는 사람이 누구인지 먼저 떠올리고, 모르는 내용은 지어내지 마세요.
- s1 제목: 초안 쓰기 / 담당: 작성자 / 지시: 요청한 주제로 초안을 써 주세요. 대상 독자와 목적을 첫 줄에 적고, 확실하지 않은 내용은 "확인 필요"로 표시해 주세요.
- s2 제목: 검토하기 / 담당: 리뷰어 / 지시: 초안을 읽고 틀린 내용·빠진 내용·읽기 어려운 곳을 번호를 붙여 짚어 주세요. 고칠 게 있으면 "고쳐야 함"과 이유를, 없으면 "통과"라고 써 주세요. / 되돌릴 단계: 1(초안 쓰기)

**en**
- Title: Write, then get it reviewed
- When to use: When one person writes a piece and another reads it and points out what to fix
- Shared note: Picture the reader first, and never make up what you don't know.
- s1 Title: Write the draft / Role: Writer / Instruction: Write a draft on the requested topic. State the target reader and purpose on the first line, and mark anything uncertain as "Needs confirmation".
- s2 Title: Review / Role: Reviewer / Instruction: Read the draft and point out errors, missing parts, and hard-to-read spots, with numbers. If something must change, write "Needs changes" with the reason; otherwise write "Approved". / Send back to: step 1 (Write the draft)

**ja**
- タイトル: 書いてレビューしてもらう
- 使う場面: 文章や資料を1人が書き、別の人が読んで直す点を指摘する必要があるとき
- 共通の案内: 読む人を先に思い浮かべ、わからないことは作らないでください。
- s1 タイトル: 下書きを書く / 担当: ライター / 指示: 依頼されたテーマで下書きを書いてください。想定する読者と目的を1行目に書き、はっきりしない内容は「要確認」と書いてください。
- s2 タイトル: レビューする / 担当: レビュアー / 指示: 下書きを読み、間違い・抜け・読みにくい箇所に番号をつけて指摘してください。直す点があれば「要修正」と理由を、なければ「合格」と書いてください。 / 戻す先: 1(下書きを書く)

**zh**
- 标题: 撰写并审核
- 适用场景: 由一个人撰写文章或文档,另一个人阅读并指出需要修改的地方时
- 共同说明: 先想好读者是谁,不知道的内容不要编造。
- s1 标题: 撰写初稿 / 负责人: 撰稿人 / 指示: 按要求的主题写出初稿。第一行写明目标读者和目的,不确定的内容标注"待确认"。
- s2 标题: 审核 / 负责人: 审核员 / 指示: 阅读初稿,为错误、遗漏和难读之处编号并指出。需要修改的写"需修改"和理由,没有问题则写"通过"。 / 退回到: 第1步(撰写初稿)

### 2-5. `planBuildQA` — 기획 → 만들기 → 확인 (process, 3단계)

**ko**
- 제목: 기획하고 만들고 확인하기
- 언제 쓰나요: 새 기능이나 작은 개선을 정리하고, 만들고, 제대로 되는지 확인까지 해야 할 때
- 공통 안내: 이번 요청 범위 밖의 것은 건드리지 말고, 끝난 일은 결과 위주로 짧게 보고해 주세요.
- s1 제목: 요구사항 정리 / 담당: 기획자 / 지시: 요청을 읽고 목적, 해야 할 일, 하지 않을 일, 끝났다고 볼 기준을 짧게 정리해 주세요. 모르는 것은 "확인 필요"로 표시해 주세요.
- s2 제목: 만들기 / 담당: 개발자 / 지시: 정리된 요구사항대로 만들어 주세요. 범위를 넘는 변경은 하지 말고, 끝나면 무엇을 바꿨는지 짧게 알려 주세요.
- s3 제목: 확인하기 / 담당: QA / 지시: 끝났다고 본 기준을 하나씩 직접 확인해 주세요. 안 되는 게 있으면 재현 방법과 함께 적고 "고쳐야 함", 모두 되면 "통과"라고 써 주세요. / 되돌릴 단계: 2(만들기)

**en**
- Title: Plan, build, and check
- When to use: When a new feature or small improvement needs to be defined, built, and verified
- Shared note: Don't touch anything outside this request, and report finished work briefly, focusing on results.
- s1 Title: Define the requirements / Role: Planner / Instruction: Read the request and briefly write the goal, what to do, what not to do, and the criteria for "done". Mark unknowns as "Needs confirmation".
- s2 Title: Build / Role: Developer / Instruction: Build it exactly as the requirements say. Make no changes beyond the scope, and briefly report what you changed when done.
- s3 Title: Check / Role: QA Engineer / Instruction: Check each "done" criterion yourself. If something fails, write how to reproduce it and "Needs fixing"; if all pass, write "Passed". / Send back to: step 2 (Build)

**ja**
- タイトル: 企画して、作って、確認する
- 使う場面: 新しい機能や小さな改善を整理して、作って、きちんと動くか確認まで行うとき
- 共通の案内: 今回の依頼の範囲外には手を出さず、終わったことは結果を中心に短く報告してください。
- s1 タイトル: 要件をまとめる / 担当: 企画担当 / 指示: 依頼を読み、目的、やること、やらないこと、完了とみなす基準を短くまとめてください。わからないことは「要確認」と書いてください。
- s2 タイトル: 作る / 担当: 開発者 / 指示: まとまった要件どおりに作ってください。範囲を超える変更はせず、終わったら何を変えたか短く知らせてください。
- s3 タイトル: 確認する / 担当: QAエンジニア / 指示: 完了とみなす基準を1つずつ自分で確認してください。動かないものは再現手順とともに「要修正」、すべて問題なければ「合格」と書いてください。 / 戻す先: 2(作る)

**zh**
- 标题: 策划、开发并验证
- 适用场景: 新功能或小改进需要先梳理、再开发、最后确认是否正常时
- 共同说明: 不要改动本次需求范围之外的内容,完成后简短汇报,以结果为主。
- s1 标题: 梳理需求 / 负责人: 策划 / 指示: 阅读需求,简要写出目标、要做的事、不做的事以及"完成"的标准。不清楚的标注"待确认"。
- s2 标题: 开发 / 负责人: 开发工程师 / 指示: 按梳理好的需求开发。不要做超出范围的改动,完成后简要说明改了什么。
- s3 标题: 验证 / 负责人: 测试工程师 / 指示: 亲自逐条验证"完成"标准。有问题的写明复现方法和"需修复",全部正常则写"通过"。 / 退回到: 第2步(开发)

### 2-6. `contentPublish` — 글 쓰고 다듬고 내가 확인 (process, 3단계)

**ko**
- 제목: 글 쓰고 다듬은 뒤 내가 확인하기
- 언제 쓰나요: 공지·소개글처럼 밖에 나가는 글을 쓰고, 다듬고, 마지막에 내가 직접 보고 내보내야 할 때
- 공통 안내: 밖에 나가는 글이므로 사실이 아닌 내용, 정해지지 않은 일정·가격은 쓰지 마세요.
- s1 제목: 초안 쓰기 / 담당: 작성자 / 지시: 요청한 주제로 초안을 써 주세요. 제목 후보 3개와 본문을 함께 적어 주세요.
- s2 제목: 다듬기 / 담당: 편집자 / 지시: 초안의 맞춤법, 어색한 문장, 사실과 다를 수 있는 부분을 고쳐 주세요. 크게 고쳐야 해서 다시 써야 한다면 이유를 적어 처음으로 돌려보내 주세요. / 되돌릴 단계: 1(초안 쓰기)
- s3 제목: 내 최종 확인 / 담당: 편집자 / 내 확인: 예 / 지시: 다듬은 글을 최종본으로 정리해 제게 보여 주세요. 제가 승인하기 전에는 어디에도 올리지 마세요. 고칠 점을 말씀드리면 그대로 반영해 주세요. / 되돌릴 단계: 1(초안 쓰기)

**en**
- Title: Write, polish, then I check it
- When to use: For notices or intro posts that go public: write, polish, and have me look at it last before it goes out
- Shared note: This goes public, so don't include anything untrue or any date or price that isn't final.
- s1 Title: Write the draft / Role: Writer / Instruction: Write a draft on the requested topic, with 3 title options and the body.
- s2 Title: Polish / Role: Editor / Instruction: Fix spelling, awkward sentences, and anything that may be factually wrong. If it needs a major rewrite, explain why and send it back to the start. / Send back to: step 1 (Write the draft)
- s3 Title: My final check / Role: Editor / My check: Yes / Instruction: Prepare the polished piece as the final version and show it to me. Don't post it anywhere before I approve, and apply the changes I ask for. / Send back to: step 1 (Write the draft)

**ja**
- タイトル: 書いて整えて、最後に私が確認する
- 使う場面: お知らせや紹介文など外に出る文章を、書いて、整えて、最後に私が直接見てから出すとき
- 共通の案内: 外に出る文章なので、事実でない内容や、決まっていない日程・価格は書かないでください。
- s1 タイトル: 下書きを書く / 担当: ライター / 指示: 依頼されたテーマで下書きを書いてください。タイトル案を3つと本文を一緒に書いてください。
- s2 タイトル: 整える / 担当: 編集者 / 指示: 下書きの誤字脱字、不自然な文、事実と違うかもしれない部分を直してください。大きく書き直す必要がある場合は理由を書いて最初に戻してください。 / 戻す先: 1(下書きを書く)
- s3 タイトル: 私の最終確認 / 担当: 編集者 / 私の確認: あり / 指示: 整えた文章を最終版としてまとめ、私に見せてください。私が承認するまではどこにも公開しないでください。直す点を伝えたらそのまま反映してください。 / 戻す先: 1(下書きを書く)

**zh**
- 标题: 撰写、润色,最后由我确认
- 适用场景: 公告、介绍文等对外发布的文章,写好、润色后,最后由我亲自确认再发布时
- 共同说明: 这是对外发布的内容,不要写不实信息,也不要写尚未确定的日程或价格。
- s1 标题: 撰写初稿 / 负责人: 撰稿人 / 指示: 按要求的主题写出初稿,同时给出3个标题备选和正文。
- s2 标题: 润色 / 负责人: 编辑 / 指示: 修改初稿中的错别字、生硬的句子以及可能与事实不符的地方。如果需要大幅重写,请写明原因并退回到最开始。 / 退回到: 第1步(撰写初稿)
- s3 标题: 我的最终确认 / 负责人: 编辑 / 我来确认: 是 / 指示: 把润色后的文章整理成最终稿并给我看。在我批准前不要发布到任何地方,我提出修改意见后请照办。 / 退回到: 第1步(撰写初稿)

### 2-7. `bugFix` — 문제 찾고 고치고 확인 (process, 4단계)

**ko**
- 제목: 문제 원인 찾고 고치고 확인하기
- 언제 쓰나요: 제대로 안 되는 것을 원인부터 찾고, 고치고, 다른 사람이 검토·확인한 뒤 내가 마지막으로 확인해야 할 때
- 공통 안내: 고치는 범위는 이 문제에 필요한 만큼만으로 하고, 다른 곳은 건드리지 마세요.
- s1 제목: 원인 찾기 / 담당: 개발자 / 지시: 문제가 생기는 방법을 먼저 똑같이 재현하고, 원인이 되는 곳과 이유를 짧게 적어 주세요. 아직 고치지는 마세요.
- s2 제목: 고치기 / 담당: 개발자 / 지시: 찾은 원인만 고쳐 주세요. 무엇을 왜 바꿨는지, 영향이 갈 수 있는 곳이 어디인지 적어 주세요.
- s3 제목: 고친 내용 검토 / 담당: 리뷰어 / 지시: 고친 내용이 원인에 맞는지, 범위를 넘은 변경이나 새 문제 가능성이 없는지 살펴 주세요. 고칠 게 있으면 "고쳐야 함"과 이유, 없으면 "통과"라고 써 주세요. / 되돌릴 단계: 2(고치기)
- s4 제목: 확인하고 내 최종 확인 / 담당: QA / 내 확인: 예 / 지시: 처음 재현한 방법으로 이제 문제가 없는지 확인하고, 주변 기능도 함께 살펴 주세요. 결과를 제게 보여 주고, 제가 확인하기 전에는 끝났다고 하지 마세요. / 되돌릴 단계: 2(고치기)

**en**
- Title: Find the cause, fix it, and verify
- When to use: When something isn't working: find the cause, fix it, have it reviewed and tested, then I do the final check
- Shared note: Limit the fix to what this problem needs, and don't touch anything else.
- s1 Title: Find the cause / Role: Developer / Instruction: First reproduce the problem exactly, then briefly write where the cause is and why. Don't fix it yet.
- s2 Title: Fix it / Role: Developer / Instruction: Fix only the cause you found. Write what you changed and why, and what else might be affected.
- s3 Title: Review the fix / Role: Reviewer / Instruction: Check that the fix matches the cause and has no out-of-scope changes or new risks. If something must change, write "Needs changes" with the reason; otherwise "Approved". / Send back to: step 2 (Fix it)
- s4 Title: Test, then my final check / Role: QA Engineer / My check: Yes / Instruction: Using the original steps, confirm the problem is gone and check nearby features too. Show me the result, and don't call it done before I confirm. / Send back to: step 2 (Fix it)

**ja**
- タイトル: 原因を探して、直して、確認する
- 使う場面: うまく動かないものについて、原因を探して直し、別の人が確認したあと、最後に私が確認するとき
- 共通の案内: 直す範囲はこの問題に必要な分だけにとどめ、ほかには手を出さないでください。
- s1 タイトル: 原因を探す / 担当: 開発者 / 指示: まず問題が起きる手順をそのまま再現し、原因となる箇所と理由を短く書いてください。まだ直さないでください。
- s2 タイトル: 直す / 担当: 開発者 / 指示: 見つけた原因だけを直してください。何をなぜ変えたか、影響が出そうな箇所はどこかを書いてください。
- s3 タイトル: 直した内容をレビューする / 担当: レビュアー / 指示: 直した内容が原因に合っているか、範囲を超えた変更や新しい問題の可能性がないかを確認してください。直す点があれば「要修正」と理由を、なければ「合格」と書いてください。 / 戻す先: 2(直す)
- s4 タイトル: 確認して、私の最終確認 / 担当: QAエンジニア / 私の確認: あり / 指示: 最初に再現した手順で問題がなくなったか確認し、周りの機能も見てください。結果を私に見せ、私が確認するまで完了としないでください。 / 戻す先: 2(直す)

**zh**
- 标题: 找原因、修复并验证
- 适用场景: 某处运行不正常,需要先找原因、再修复,经他人审核和测试后,最后由我确认时
- 共同说明: 修复范围仅限于解决这个问题所需,不要改动其他地方。
- s1 标题: 查找原因 / 负责人: 开发工程师 / 指示: 先按原样复现问题,再简要写出原因所在和理由。先不要修复。
- s2 标题: 修复 / 负责人: 开发工程师 / 指示: 只修复找到的原因。写明改了什么、为什么改,以及可能受影响的地方。
- s3 标题: 审核修复内容 / 负责人: 审核员 / 指示: 检查修复是否对应原因,有没有超出范围的改动或引入新问题的可能。需要修改的写"需修改"和理由,没有问题则写"通过"。 / 退回到: 第2步(修复)
- s4 标题: 验证并由我最终确认 / 负责人: 测试工程师 / 我来确认: 是 / 指示: 用最初的复现方法确认问题已消失,同时检查相关功能。把结果给我看,在我确认前不要宣布完成。 / 退回到: 第2步(修复)

---

## 3. 검증 체크

- 개인 3 + 프로세스 4 = 7개, 프로세스 단계 2~4개 ✔
- 4개 언어 전부 작성(제목·언제 쓰나요·본문 / 단계 제목·담당·지시·내 확인·되돌릴 단계) ✔
- `needsMyCheck` 켠 단계: `contentPublish` s3, `bugFix` s4 (2곳) ✔
- 개발 용어(스킬·토큰 등) 미사용. 직무명: 작성자·편집자·리뷰어·기획자·개발자·QA / Writer·Editor·Reviewer·Planner·Developer·QA Engineer / ライター·編集者·レビュアー·企画担当·開発者·QAエンジニア / 撰稿人·编辑·审核员·策划·开发工程师·测试工程师.
- 확인 필요: 코드의 실제 `kind` 값 이름, 한국어 직무 "QA"가 직원 직무(예: "QA 엔지니어")와 포함 매칭되는지.
