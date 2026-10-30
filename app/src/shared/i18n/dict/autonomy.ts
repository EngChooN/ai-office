import type { Entry } from './index.ts'

/** 자율 진행(묻지 않고 끝까지): 직원 안내문 · 기록 · 화면 문구 */
export default {
  // ── 직원이 읽는 글 ──
  'staff.ctx.autonomyGuide': {
    ko: '[자율 진행] 대표가 자리에 없습니다. 묻지 말고 합리적인 기본값으로 끝까지 진행하세요(AskUserQuestion도, 답변 글 속 질문도 쓰지 마세요). 정한 가정은 결과 보고의 "가정" 칸에 적으세요. 막히면 다른 방법으로 우회하세요. 삭제·배포·push·외부 전송·스크립트 실행 같은 위험 작업은 하지 말고 결과 보고의 "대표 확인 필요" 목록에 그 명령을 남기세요. 기획안(propose_plan)은 자동으로 승인됩니다.',
    en: '[Autonomous] The owner is away. Do not ask — carry the work through to the end with sensible defaults (no AskUserQuestion and no questions in your reply). Write the assumptions you made under "Assumptions" in your final report. If you get stuck, find another way around. Do not perform risky actions such as deleting, deploying, pushing, sending data out or running scripts — list those commands under "Needs owner check" in your final report instead. Plans (propose_plan) are approved automatically.',
    ja: '[自律進行] 代表は不在です。質問せず、妥当な既定値で最後まで進めてください（AskUserQuestion も返答文中の質問も使わないでください）。置いた前提は結果報告の「前提」欄に書いてください。行き詰まったら別の方法で回避してください。削除・デプロイ・push・外部送信・スクリプト実行などの危険な作業は行わず、そのコマンドを結果報告の「代表の確認が必要」リストに残してください。企画案（propose_plan）は自動で承認されます。',
    zh: '[自主推进] 代表不在。不要提问，请用合理的默认值一直推进到完成（不要使用 AskUserQuestion，回复中也不要提问）。所做的假设请写在结果汇报的“假设”一栏。遇到阻碍时请换个方法绕过。删除、部署、push、对外发送、执行脚本等危险操作不要做，请把这些命令写进结果汇报的“需代表确认”列表。规划方案（propose_plan）会自动批准。',
  },
  'staff.msg.autonomous': {
    ko: '[자율 진행] 대표가 자리에 없어요. 묻지 말고 합리적인 기본값으로 끝까지 진행하세요. 정한 가정은 결과 보고의 "가정" 칸에, 하지 못한 위험 작업(삭제·배포·push·외부 전송·스크립트 실행)은 "대표 확인 필요" 목록에 명령째 적으세요. 막히면 우회하세요.',
    en: '[Autonomous] The owner is away. Do not ask — carry on to the end with sensible defaults. Put your assumptions under "Assumptions" in the final report, and list any risky actions you skipped (delete, deploy, push, sending data out, running scripts) with their commands under "Needs owner check". If you get stuck, go around it.',
    ja: '[自律進行] 代表は不在です。質問せず、妥当な既定値で最後まで進めてください。置いた前提は結果報告の「前提」欄に、行わなかった危険な作業（削除・デプロイ・push・外部送信・スクリプト実行）はコマンドごと「代表の確認が必要」リストに書いてください。行き詰まったら回避してください。',
    zh: '[自主推进] 代表不在。不要提问，请用合理的默认值推进到完成。所做的假设写在结果汇报的“假设”一栏，未执行的危险操作（删除、部署、push、对外发送、执行脚本）连同命令写进“需代表确认”列表。遇到阻碍请绕过。',
  },
  'staff.msg.autonomousContinue': {
    ko: '[자율 진행] 대표가 자리에 없어 답할 수 없어요. 방금 물은 것("{question}")은 추천안대로 스스로 판단해 계속 진행하고, 그렇게 정한 가정은 결과 보고의 "가정" 칸에 적으세요.',
    en: '[Autonomous] The owner is away and cannot answer. For what you just asked ("{question}"), decide for yourself along the recommended option and keep going; note that assumption under "Assumptions" in your final report.',
    ja: '[自律進行] 代表は不在のため回答できません。いま質問したこと（「{question}」）はおすすめ案どおり自分で判断して続けてください。その前提は結果報告の「前提」欄に書いてください。',
    zh: '[自主推进] 代表不在，无法回答。刚才问的问题（“{question}”）请按推荐方案自行判断并继续推进，并把这一假设写在结果汇报的“假设”一栏。',
  },
  'staff.deny.autonomous': {
    ko: '자율 모드: 이 작업은 하지 않음 ({action}). 결과 보고의 "대표 확인 필요" 목록에 명령을 남기고 나머지를 계속하라.',
    en: 'Autonomous mode: this action was not performed ({action}). Leave the command in the "Needs owner check" list of your final report and continue with the rest.',
    ja: '自律モード: この作業は行いません（{action}）。結果報告の「代表の確認が必要」リストにコマンドを残し、残りを続けてください。',
    zh: '自主模式：不执行此操作（{action}）。请把该命令留在结果汇报的“需代表确认”列表中，然后继续其余工作。',
  },
  'staff.tool.plan.autoApproved': {
    ko: '자율 진행이라 기획안이 자동 승인됐어요. 하위 업무 {n}건을 순서대로 진행하고, 모두 끝나면 결과를 모아 보내 드려요. 이번 턴은 여기서 마치세요.{note}',
    en: 'Because this is autonomous work, your plan was approved automatically. The {n} subtasks will run in order, and the results will be sent to you when they are all done. End this turn here.{note}',
    ja: '自律進行のため企画案は自動で承認されました。サブタスク {n} 件を順に進め、すべて終わったら結果をまとめてお送りします。このターンはここで終えてください。{note}',
    zh: '由于是自主推进，规划方案已自动批准。{n} 个子任务将按顺序进行，全部完成后会把结果汇总发给你。本轮请就此结束。{note}',
  },

  // ── 기록 ──
  'log.autonomousSkip': {
    ko: '🤖 자율 진행: 위험 작업이라 건너뜀 — {tool} {summary}',
    en: '🤖 Autonomous: skipped a risky action — {tool} {summary}',
    ja: '🤖 自律進行: 危険な作業のためスキップ — {tool} {summary}',
    zh: '🤖 自主推进：危险操作已跳过 — {tool} {summary}',
  },
  'log.autonomousAnswer': {
    ko: '🤖 자율 진행: 비서가 답하지 못해 추천(첫 번째) 선택지로 답함 — {text}',
    en: '🤖 Autonomous: the secretary could not answer, so the recommended (first) option was chosen — {text}',
    ja: '🤖 自律進行: 秘書が回答できなかったため、おすすめ（最初の）選択肢で回答 — {text}',
    zh: '🤖 自主推进：秘书未能回答，已按推荐（第一个）选项作答 — {text}',
  },
  'log.autonomousTextAsk': {
    ko: '🤖 자율 진행: 글 질문을 결재함에 올리지 않고 스스로 판단해 계속하라고 다시 지시함 ({n}/{max}) — {question}',
    en: '🤖 Autonomous: instead of filing the written question, told the employee to decide and continue ({n}/{max}) — {question}',
    ja: '🤖 自律進行: 文中の質問を決裁箱に上げず、自分で判断して続けるよう再指示 ({n}/{max}) — {question}',
    zh: '🤖 自主推进：未把文字提问放进审批箱，已重新指示其自行判断并继续 ({n}/{max}) — {question}',
  },

  // ── 화면 ──
  'autonomy.via': { ko: '🤖 자율 진행', en: '🤖 Autonomous', ja: '🤖 自律進行', zh: '🤖 自主推进' },
  'autonomy.label': { ko: '자율 진행', en: 'Autonomous', ja: '自律進行', zh: '自主推进' },
  'autonomy.hint': {
    ko: '묻지 않고 끝까지 진행 · 위험 작업은 건너뛰고 보고',
    en: 'Runs to the end without asking · skips risky actions and reports them',
    ja: '質問せず最後まで進行 · 危険な作業はスキップして報告',
    zh: '不提问、推进到完成 · 跳过危险操作并汇报',
  },
  'autonomy.badge': { ko: '자율 진행 중 — 묻지 않고 끝까지', en: 'Autonomous — runs to the end without asking', ja: '自律進行中 — 質問せず最後まで', zh: '自主推进中 — 不提问、推进到完成' },
  'autonomy.turnOff': { ko: '자율 진행 끄기', en: 'Turn off autonomous', ja: '自律進行をオフ', zh: '关闭自主推进' },
  'autonomy.turnOn': { ko: '자율 진행 켜기', en: 'Turn on autonomous', ja: '自律進行をオン', zh: '开启自主推进' },
  'autonomy.pcOnly': { ko: '자율 진행은 PC에서만 켤 수 있어요', en: 'Autonomous mode can only be turned on from the PC', ja: '自律進行は PC でのみオンにできます', zh: '自主推进只能在电脑上开启' },
  'autonomy.full': { ko: '완전 자율', en: 'Fully autonomous', ja: '完全自律', zh: '完全自主' },
  'autonomy.fullActive': { ko: '완전 자율 중', en: 'Fully autonomous', ja: '完全自律中', zh: '完全自主中' },
  'autonomy.fullHint': {
    ko: '켜져 있는 동안 모든 고용 직원이 묻지 않고 끝까지 진행해요. 질문은 비서가(안 되면 추천안으로) 대신 답하고, 기획안은 자동 승인하고, 위험 작업은 결재함에 올리지 않고 건너뛰어 결과 보고의 "대표 확인 필요"에 남겨요. 위험 명령 금지도 함께 켜져요. PC에서만 켤 수 있어요.',
    en: 'While on, every hired employee carries on to the end without asking. Questions are answered for them (by the secretary, or with the recommended option), plans are approved automatically, and risky actions are skipped instead of going to Approvals — they are listed under "Needs owner check" in the report. "No risky commands" is forced on. Can only be turned on from the PC.',
    ja: 'オンの間、すべての雇用社員が質問せず最後まで進めます。質問は秘書が（無理ならおすすめ案で）代わりに答え、企画案は自動承認し、危険な作業は決裁箱に上げずスキップして結果報告の「代表の確認が必要」に残します。危険コマンド禁止も強制的にオンになります。PC でのみオンにできます。',
    zh: '开启期间，所有雇佣员工都会不提问、推进到完成。问题由秘书代答（不行则按推荐项），规划方案自动批准，危险操作不进审批箱而是跳过，并写进结果汇报的“需代表确认”。“禁止危险命令”也会强制开启。只能在电脑上开启。',
  },
  'autonomy.fullStart': {
    ko: '🤖 완전 자율 단계예요 — 모든 직원이 묻지 않고 끝까지 진행하고, 위험 작업은 건너뛰고 보고에 남겨요.',
    en: '🤖 Fully autonomous — every employee carries on to the end without asking; risky actions are skipped and listed in the reports.',
    ja: '🤖 完全自律モードです — すべての社員が質問せず最後まで進め、危険な作業はスキップして報告に残します。',
    zh: '🤖 完全自主模式 — 所有员工都不提问、推进到完成；危险操作会跳过并写进汇报。',
  },
  'autonomy.skipped': { ko: '건너뜀(자율)', en: 'Skipped (autonomous)', ja: 'スキップ（自律）', zh: '已跳过（自主）' },
  'autonomy.planApproved': { ko: '기획안 자동 승인', en: 'Plan auto-approved', ja: '企画案を自動承認', zh: '规划方案已自动批准' },
  'tray.autoFull': { ko: '완전 자율 (묻지 않고 끝까지)', en: 'Fully autonomous (no questions, run to the end)', ja: '完全自律（質問せず最後まで）', zh: '完全自主（不提问、推进到完成）' },
} satisfies Record<string, Entry>
