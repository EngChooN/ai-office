import type { Entry } from './index.ts'

// 매뉴얼 '예시에서 고르기' 템플릿 글자 (구조는 shared/manualTemplates.ts). 문구 원본: docs/design-refresh/usability-v1/manual-templates.md
// 단계 담당(role)은 직원 직무에 포함 매칭되므로 그 언어의 흔한 직무명으로 쓴다
export default {
  // ── 개인: 회의 내용 정리
  'manualTpl.meetingNotes.title': { ko: '회의 내용 정리하기', en: 'Summarize a meeting', ja: '会議内容をまとめる', zh: '整理会议内容' },
  'manualTpl.meetingNotes.desc': {
    ko: '회의 메모나 녹취 글을 주면 결정 사항과 할 일을 뽑아 줘야 할 때',
    en: 'When you hand over meeting notes or a transcript and need decisions and to-dos pulled out',
    ja: '会議のメモや書き起こしを渡して、決定事項とやることを抜き出してほしいとき',
    zh: '提供会议记录或录音文字,需要提炼出决定事项和待办时',
  },
  'manualTpl.meetingNotes.body': {
    ko: '1. 받은 글을 끝까지 읽고 회의 목적을 한 줄로 적어 주세요.\n2. 결정된 내용, 할 일(담당자·기한 포함), 아직 정해지지 않은 내용으로 나눠 정리해 주세요.\n3. 확실하지 않은 내용은 지어내지 말고 "확인 필요"라고 표시해 주세요.\n4. 전체를 10줄 안으로 짧게 써 주세요.',
    en: "1. Read the whole text and write the meeting's purpose in one line.\n2. Sort it into decisions, to-dos (with owner and due date), and open questions.\n3. Don't guess. Mark anything unclear as \"Needs confirmation\".\n4. Keep the whole summary within 10 lines.",
    ja: '1. 受け取った文章を最後まで読み、会議の目的を1行で書いてください。\n2. 決定事項、やること(担当者・期限つき)、まだ決まっていないことに分けてまとめてください。\n3. はっきりしない内容は推測せず、「要確認」と書いてください。\n4. 全体を10行以内に短くまとめてください。',
    zh: '1. 通读全文,用一句话写出会议目的。\n2. 分成"已决定事项""待办(含负责人和截止日期)""尚未决定的事项"三部分整理。\n3. 不确定的内容不要编造,标注"待确认"。\n4. 全文控制在10行以内。',
  },

  // ── 개인: 고객 응대 메일
  'manualTpl.customerEmail.title': { ko: '고객 응대 메일 쓰기', en: 'Write a customer reply email', ja: 'お客様への返信メールを書く', zh: '撰写客户答复邮件' },
  'manualTpl.customerEmail.desc': {
    ko: '고객 문의에 정중하고 짧은 답장 초안이 필요할 때',
    en: "When you need a polite, short draft reply to a customer's question",
    ja: 'お客様からの問い合わせに、丁寧で短い返信の下書きが必要なとき',
    zh: '需要为客户咨询写一封礼貌简短的答复草稿时',
  },
  'manualTpl.customerEmail.body': {
    ko: '1. 문의에서 고객이 궁금해하는 것과 기분(불만·단순 질문 등)을 먼저 파악해 주세요.\n2. 첫 문장에 인사와 문의 내용 확인, 둘째 문단에 답변, 마지막에 추가로 도울 일을 적어 주세요.\n3. 정해진 적 없는 약속(환불·일정 등)은 쓰지 말고, 필요하면 "확인 후 안내드리겠습니다"로 쓰세요.\n4. 존댓말로, 200자 안팎으로 써 주세요.',
    en: "1. First identify what the customer is asking and how they feel (complaint, simple question, etc.).\n2. Open with a greeting and a restatement of the question, answer in the next paragraph, and close by offering further help.\n3. Don't promise anything not already decided (refunds, dates). If needed, write \"We'll check and get back to you.\"\n4. Keep a courteous tone and about 100 words.",
    ja: '1. 問い合わせの内容と、お客様の気持ち(不満・単純な質問など)をまず把握してください。\n2. 冒頭に挨拶と問い合わせ内容の確認、次の段落に回答、最後に追加でお手伝いできることを書いてください。\n3. 決まっていない約束(返金・日程など)は書かず、必要なら「確認のうえご案内いたします」と書いてください。\n4. 丁寧な言葉づかいで、300字前後にしてください。',
    zh: '1. 先弄清客户想问什么,以及客户的情绪(不满、普通提问等)。\n2. 开头问候并确认咨询内容,第二段给出答复,最后说明还可以提供哪些帮助。\n3. 不要写尚未确定的承诺(退款、日程等),必要时写"确认后再回复您"。\n4. 用礼貌的语气,字数在150字左右。',
  },

  // ── 개인: 하루 업무 보고
  'manualTpl.dailyReport.title': { ko: '하루 업무 보고 정리하기', en: 'Tidy up a daily work report', ja: '1日の業務報告をまとめる', zh: '整理每日工作汇报' },
  'manualTpl.dailyReport.desc': {
    ko: '오늘 한 일을 어수선하게 적어 주면 보고용으로 깔끔하게 정리해야 할 때',
    en: "When you give messy notes on today's work and need a clean report",
    ja: '今日やったことを雑に書いて渡し、報告用にきれいに整えてほしいとき',
    zh: '把今天做的事随手写给员工,需要整理成清晰的汇报时',
  },
  'manualTpl.dailyReport.body': {
    ko: '1. 받은 내용을 "한 일 / 진행 중 / 막힌 일 / 내일 할 일" 네 묶음으로 나눠 주세요.\n2. 각 항목은 한 줄로, 결과가 있으면 숫자나 결과를 함께 적어 주세요.\n3. 막힌 일에는 필요한 도움이 무엇인지 꼭 적어 주세요.\n4. 받은 내용에 없는 일은 추가하지 마세요.',
    en: "1. Sort the notes into four groups: Done / In progress / Blocked / Tomorrow.\n2. Write each item in one line, and include numbers or results where there are any.\n3. For blocked items, always say what help is needed.\n4. Don't add anything that isn't in the notes.",
    ja: '1. 受け取った内容を「やったこと/進行中/困っていること/明日やること」の4つに分けてください。\n2. 各項目は1行で書き、結果があれば数字や成果も添えてください。\n3. 困っていることには、必要な助けが何かを必ず書いてください。\n4. 受け取った内容にないことは追加しないでください。',
    zh: '1. 把内容分成"已完成 / 进行中 / 遇到阻碍 / 明天计划"四组。\n2. 每项用一句话写,有结果的附上数字或成果。\n3. 遇到阻碍的事项,务必写明需要什么帮助。\n4. 不要添加原内容中没有的事项。',
  },

  // ── 프로세스: 쓰고 검토받기 (2단계)
  'manualTpl.writeReview.title': { ko: '쓰고 검토받기', en: 'Write, then get it reviewed', ja: '書いてレビューしてもらう', zh: '撰写并审核' },
  'manualTpl.writeReview.desc': {
    ko: '글이나 문서를 한 사람이 쓰고, 다른 사람이 읽어 보고 고칠 곳을 짚어 줘야 할 때',
    en: 'When one person writes a piece and another reads it and points out what to fix',
    ja: '文章や資料を1人が書き、別の人が読んで直す点を指摘する必要があるとき',
    zh: '由一个人撰写文章或文档,另一个人阅读并指出需要修改的地方时',
  },
  'manualTpl.writeReview.body': {
    ko: '읽는 사람이 누구인지 먼저 떠올리고, 모르는 내용은 지어내지 마세요.',
    en: "Picture the reader first, and never make up what you don't know.",
    ja: '読む人を先に思い浮かべ、わからないことは作らないでください。',
    zh: '先想好读者是谁,不知道的内容不要编造。',
  },
  'manualTpl.writeReview.s1.title': { ko: '초안 쓰기', en: 'Write the draft', ja: '下書きを書く', zh: '撰写初稿' },
  'manualTpl.writeReview.s1.role': { ko: '작성자', en: 'Writer', ja: 'ライター', zh: '撰稿人' },
  'manualTpl.writeReview.s1.instr': {
    ko: '요청한 주제로 초안을 써 주세요. 대상 독자와 목적을 첫 줄에 적고, 확실하지 않은 내용은 "확인 필요"로 표시해 주세요.',
    en: 'Write a draft on the requested topic. State the target reader and purpose on the first line, and mark anything uncertain as "Needs confirmation".',
    ja: '依頼されたテーマで下書きを書いてください。想定する読者と目的を1行目に書き、はっきりしない内容は「要確認」と書いてください。',
    zh: '按要求的主题写出初稿。第一行写明目标读者和目的,不确定的内容标注"待确认"。',
  },
  'manualTpl.writeReview.s2.title': { ko: '검토하기', en: 'Review', ja: 'レビューする', zh: '审核' },
  'manualTpl.writeReview.s2.role': { ko: '리뷰어', en: 'Reviewer', ja: 'レビュアー', zh: '审核员' },
  'manualTpl.writeReview.s2.instr': {
    ko: '초안을 읽고 틀린 내용·빠진 내용·읽기 어려운 곳을 번호를 붙여 짚어 주세요. 고칠 게 있으면 "고쳐야 함"과 이유를, 없으면 "통과"라고 써 주세요.',
    en: 'Read the draft and point out errors, missing parts, and hard-to-read spots, with numbers. If something must change, write "Needs changes" with the reason; otherwise write "Approved".',
    ja: '下書きを読み、間違い・抜け・読みにくい箇所に番号をつけて指摘してください。直す点があれば「要修正」と理由を、なければ「合格」と書いてください。',
    zh: '阅读初稿,为错误、遗漏和难读之处编号并指出。需要修改的写"需修改"和理由,没有问题则写"通过"。',
  },

  // ── 프로세스: 기획 → 만들기 → 확인 (3단계)
  'manualTpl.planBuildQA.title': { ko: '기획하고 만들고 확인하기', en: 'Plan, build, and check', ja: '企画して、作って、確認する', zh: '策划、开发并验证' },
  'manualTpl.planBuildQA.desc': {
    ko: '새 기능이나 작은 개선을 정리하고, 만들고, 제대로 되는지 확인까지 해야 할 때',
    en: 'When a new feature or small improvement needs to be defined, built, and verified',
    ja: '新しい機能や小さな改善を整理して、作って、きちんと動くか確認まで行うとき',
    zh: '新功能或小改进需要先梳理、再开发、最后确认是否正常时',
  },
  'manualTpl.planBuildQA.body': {
    ko: '이번 요청 범위 밖의 것은 건드리지 말고, 끝난 일은 결과 위주로 짧게 보고해 주세요.',
    en: "Don't touch anything outside this request, and report finished work briefly, focusing on results.",
    ja: '今回の依頼の範囲外には手を出さず、終わったことは結果を中心に短く報告してください。',
    zh: '不要改动本次需求范围之外的内容,完成后简短汇报,以结果为主。',
  },
  'manualTpl.planBuildQA.s1.title': { ko: '요구사항 정리', en: 'Define the requirements', ja: '要件をまとめる', zh: '梳理需求' },
  'manualTpl.planBuildQA.s1.role': { ko: '기획자', en: 'Planner', ja: '企画担当', zh: '策划' },
  'manualTpl.planBuildQA.s1.instr': {
    ko: '요청을 읽고 목적, 해야 할 일, 하지 않을 일, 끝났다고 볼 기준을 짧게 정리해 주세요. 모르는 것은 "확인 필요"로 표시해 주세요.',
    en: 'Read the request and briefly write the goal, what to do, what not to do, and the criteria for "done". Mark unknowns as "Needs confirmation".',
    ja: '依頼を読み、目的、やること、やらないこと、完了とみなす基準を短くまとめてください。わからないことは「要確認」と書いてください。',
    zh: '阅读需求,简要写出目标、要做的事、不做的事以及"完成"的标准。不清楚的标注"待确认"。',
  },
  'manualTpl.planBuildQA.s2.title': { ko: '만들기', en: 'Build', ja: '作る', zh: '开发' },
  'manualTpl.planBuildQA.s2.role': { ko: '개발자', en: 'Developer', ja: '開発者', zh: '开发工程师' },
  'manualTpl.planBuildQA.s2.instr': {
    ko: '정리된 요구사항대로 만들어 주세요. 범위를 넘는 변경은 하지 말고, 끝나면 무엇을 바꿨는지 짧게 알려 주세요.',
    en: 'Build it exactly as the requirements say. Make no changes beyond the scope, and briefly report what you changed when done.',
    ja: 'まとまった要件どおりに作ってください。範囲を超える変更はせず、終わったら何を変えたか短く知らせてください。',
    zh: '按梳理好的需求开发。不要做超出范围的改动,完成后简要说明改了什么。',
  },
  'manualTpl.planBuildQA.s3.title': { ko: '확인하기', en: 'Check', ja: '確認する', zh: '验证' },
  'manualTpl.planBuildQA.s3.role': { ko: 'QA', en: 'QA Engineer', ja: 'QAエンジニア', zh: '测试工程师' },
  'manualTpl.planBuildQA.s3.instr': {
    ko: '끝났다고 본 기준을 하나씩 직접 확인해 주세요. 안 되는 게 있으면 재현 방법과 함께 적고 "고쳐야 함", 모두 되면 "통과"라고 써 주세요.',
    en: 'Check each "done" criterion yourself. If something fails, write how to reproduce it and "Needs fixing"; if all pass, write "Passed".',
    ja: '完了とみなす基準を1つずつ自分で確認してください。動かないものは再現手順とともに「要修正」、すべて問題なければ「合格」と書いてください。',
    zh: '亲自逐条验证"完成"标准。有问题的写明复现方法和"需修复",全部正常则写"通过"。',
  },

  // ── 프로세스: 글 쓰고 다듬고 내가 확인 (3단계)
  'manualTpl.contentPublish.title': { ko: '글 쓰고 다듬은 뒤 내가 확인하기', en: 'Write, polish, then I check it', ja: '書いて整えて、最後に私が確認する', zh: '撰写、润色,最后由我确认' },
  'manualTpl.contentPublish.desc': {
    ko: '공지·소개글처럼 밖에 나가는 글을 쓰고, 다듬고, 마지막에 내가 직접 보고 내보내야 할 때',
    en: 'For notices or intro posts that go public: write, polish, and have me look at it last before it goes out',
    ja: 'お知らせや紹介文など外に出る文章を、書いて、整えて、最後に私が直接見てから出すとき',
    zh: '公告、介绍文等对外发布的文章,写好、润色后,最后由我亲自确认再发布时',
  },
  'manualTpl.contentPublish.body': {
    ko: '밖에 나가는 글이므로 사실이 아닌 내용, 정해지지 않은 일정·가격은 쓰지 마세요.',
    en: "This goes public, so don't include anything untrue or any date or price that isn't final.",
    ja: '外に出る文章なので、事実でない内容や、決まっていない日程・価格は書かないでください。',
    zh: '这是对外发布的内容,不要写不实信息,也不要写尚未确定的日程或价格。',
  },
  'manualTpl.contentPublish.s1.title': { ko: '초안 쓰기', en: 'Write the draft', ja: '下書きを書く', zh: '撰写初稿' },
  'manualTpl.contentPublish.s1.role': { ko: '작성자', en: 'Writer', ja: 'ライター', zh: '撰稿人' },
  'manualTpl.contentPublish.s1.instr': {
    ko: '요청한 주제로 초안을 써 주세요. 제목 후보 3개와 본문을 함께 적어 주세요.',
    en: 'Write a draft on the requested topic, with 3 title options and the body.',
    ja: '依頼されたテーマで下書きを書いてください。タイトル案を3つと本文を一緒に書いてください。',
    zh: '按要求的主题写出初稿,同时给出3个标题备选和正文。',
  },
  'manualTpl.contentPublish.s2.title': { ko: '다듬기', en: 'Polish', ja: '整える', zh: '润色' },
  'manualTpl.contentPublish.s2.role': { ko: '편집자', en: 'Editor', ja: '編集者', zh: '编辑' },
  'manualTpl.contentPublish.s2.instr': {
    ko: '초안의 맞춤법, 어색한 문장, 사실과 다를 수 있는 부분을 고쳐 주세요. 크게 고쳐야 해서 다시 써야 한다면 이유를 적어 처음으로 돌려보내 주세요.',
    en: 'Fix spelling, awkward sentences, and anything that may be factually wrong. If it needs a major rewrite, explain why and send it back to the start.',
    ja: '下書きの誤字脱字、不自然な文、事実と違うかもしれない部分を直してください。大きく書き直す必要がある場合は理由を書いて最初に戻してください。',
    zh: '修改初稿中的错别字、生硬的句子以及可能与事实不符的地方。如果需要大幅重写,请写明原因并退回到最开始。',
  },
  'manualTpl.contentPublish.s3.title': { ko: '내 최종 확인', en: 'My final check', ja: '私の最終確認', zh: '我的最终确认' },
  'manualTpl.contentPublish.s3.role': { ko: '편집자', en: 'Editor', ja: '編集者', zh: '编辑' },
  'manualTpl.contentPublish.s3.instr': {
    ko: '다듬은 글을 최종본으로 정리해 제게 보여 주세요. 제가 승인하기 전에는 어디에도 올리지 마세요. 고칠 점을 말씀드리면 그대로 반영해 주세요.',
    en: "Prepare the polished piece as the final version and show it to me. Don't post it anywhere before I approve, and apply the changes I ask for.",
    ja: '整えた文章を最終版としてまとめ、私に見せてください。私が承認するまではどこにも公開しないでください。直す点を伝えたらそのまま反映してください。',
    zh: '把润色后的文章整理成最终稿并给我看。在我批准前不要发布到任何地方,我提出修改意见后请照办。',
  },

  // ── 프로세스: 문제 찾고 고치고 확인 (4단계)
  'manualTpl.bugFix.title': { ko: '문제 원인 찾고 고치고 확인하기', en: 'Find the cause, fix it, and verify', ja: '原因を探して、直して、確認する', zh: '找原因、修复并验证' },
  'manualTpl.bugFix.desc': {
    ko: '제대로 안 되는 것을 원인부터 찾고, 고치고, 다른 사람이 검토·확인한 뒤 내가 마지막으로 확인해야 할 때',
    en: "When something isn't working: find the cause, fix it, have it reviewed and tested, then I do the final check",
    ja: 'うまく動かないものについて、原因を探して直し、別の人が確認したあと、最後に私が確認するとき',
    zh: '某处运行不正常,需要先找原因、再修复,经他人审核和测试后,最后由我确认时',
  },
  'manualTpl.bugFix.body': {
    ko: '고치는 범위는 이 문제에 필요한 만큼만으로 하고, 다른 곳은 건드리지 마세요.',
    en: "Limit the fix to what this problem needs, and don't touch anything else.",
    ja: '直す範囲はこの問題に必要な分だけにとどめ、ほかには手を出さないでください。',
    zh: '修复范围仅限于解决这个问题所需,不要改动其他地方。',
  },
  'manualTpl.bugFix.s1.title': { ko: '원인 찾기', en: 'Find the cause', ja: '原因を探す', zh: '查找原因' },
  'manualTpl.bugFix.s1.role': { ko: '개발자', en: 'Developer', ja: '開発者', zh: '开发工程师' },
  'manualTpl.bugFix.s1.instr': {
    ko: '문제가 생기는 방법을 먼저 똑같이 재현하고, 원인이 되는 곳과 이유를 짧게 적어 주세요. 아직 고치지는 마세요.',
    en: "First reproduce the problem exactly, then briefly write where the cause is and why. Don't fix it yet.",
    ja: 'まず問題が起きる手順をそのまま再現し、原因となる箇所と理由を短く書いてください。まだ直さないでください。',
    zh: '先按原样复现问题,再简要写出原因所在和理由。先不要修复。',
  },
  'manualTpl.bugFix.s2.title': { ko: '고치기', en: 'Fix it', ja: '直す', zh: '修复' },
  'manualTpl.bugFix.s2.role': { ko: '개발자', en: 'Developer', ja: '開発者', zh: '开发工程师' },
  'manualTpl.bugFix.s2.instr': {
    ko: '찾은 원인만 고쳐 주세요. 무엇을 왜 바꿨는지, 영향이 갈 수 있는 곳이 어디인지 적어 주세요.',
    en: 'Fix only the cause you found. Write what you changed and why, and what else might be affected.',
    ja: '見つけた原因だけを直してください。何をなぜ変えたか、影響が出そうな箇所はどこかを書いてください。',
    zh: '只修复找到的原因。写明改了什么、为什么改,以及可能受影响的地方。',
  },
  'manualTpl.bugFix.s3.title': { ko: '고친 내용 검토', en: 'Review the fix', ja: '直した内容をレビューする', zh: '审核修复内容' },
  'manualTpl.bugFix.s3.role': { ko: '리뷰어', en: 'Reviewer', ja: 'レビュアー', zh: '审核员' },
  'manualTpl.bugFix.s3.instr': {
    ko: '고친 내용이 원인에 맞는지, 범위를 넘은 변경이나 새 문제 가능성이 없는지 살펴 주세요. 고칠 게 있으면 "고쳐야 함"과 이유, 없으면 "통과"라고 써 주세요.',
    en: 'Check that the fix matches the cause and has no out-of-scope changes or new risks. If something must change, write "Needs changes" with the reason; otherwise "Approved".',
    ja: '直した内容が原因に合っているか、範囲を超えた変更や新しい問題の可能性がないかを確認してください。直す点があれば「要修正」と理由を、なければ「合格」と書いてください。',
    zh: '检查修复是否对应原因,有没有超出范围的改动或引入新问题的可能。需要修改的写"需修改"和理由,没有问题则写"通过"。',
  },
  'manualTpl.bugFix.s4.title': { ko: '확인하고 내 최종 확인', en: 'Test, then my final check', ja: '確認して、私の最終確認', zh: '验证并由我最终确认' },
  'manualTpl.bugFix.s4.role': { ko: 'QA', en: 'QA Engineer', ja: 'QAエンジニア', zh: '测试工程师' },
  'manualTpl.bugFix.s4.instr': {
    ko: '처음 재현한 방법으로 이제 문제가 없는지 확인하고, 주변 기능도 함께 살펴 주세요. 결과를 제게 보여 주고, 제가 확인하기 전에는 끝났다고 하지 마세요.',
    en: "Using the original steps, confirm the problem is gone and check nearby features too. Show me the result, and don't call it done before I confirm.",
    ja: '最初に再現した手順で問題がなくなったか確認し、周りの機能も見てください。結果を私に見せ、私が確認するまで完了としないでください。',
    zh: '用最初的复现方法确认问题已消失,同时检查相关功能。把结果给我看,在我确认前不要宣布完成。',
  },
} satisfies Record<string, Entry>
