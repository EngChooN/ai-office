import type { Entry } from './index.ts'

// 매뉴얼실 개편: 새 매뉴얼 3갈래(말로 설명·예시·직접)·편집 창 표시 이름·저장할 수 없는 이유·저장 후 쓸 수 있게 하기·빈 화면
export default {
  'manualStart.button': { ko: '새 매뉴얼', en: 'New manual', ja: '新しいマニュアル', zh: '新建手册' },
  'manualStart.title': { ko: '새 매뉴얼 만들기', en: 'Create a manual', ja: 'マニュアルを作る', zh: '创建手册' },
  'manualStart.hint': { ko: '어떻게 시작할까요?', en: 'How would you like to start?', ja: 'どう始めますか?', zh: '想怎么开始?' },
  'manualStart.back': { ko: '뒤로', en: 'Back', ja: '戻る', zh: '返回' },
  'manualStart.describe.title': { ko: '✨ 말로 설명해서 만들기', en: '✨ Describe it in words', ja: '✨ 言葉で説明して作る', zh: '✨ 用文字描述来创建' },
  'manualStart.describe.desc': { ko: '하고 싶은 일을 한두 문장으로 적으면 AI가 초안을 써 줘요', en: 'Write one or two sentences and AI drafts it for you', ja: 'やりたいことを1〜2文で書くと、AI が下書きを作ります', zh: '用一两句话写下想做的事,AI 会帮你起草' },
  'manualStart.describe.badge': { ko: '추천', en: 'Recommended', ja: 'おすすめ', zh: '推荐' },
  'manualStart.template.title': { ko: '📋 예시에서 고르기', en: '📋 Pick from examples', ja: '📋 例から選ぶ', zh: '📋 从示例中选择' },
  'manualStart.template.desc': { ko: '자주 쓰는 업무 예시를 골라 내 상황에 맞게 고쳐요', en: 'Choose a common example and adjust it to your needs', ja: 'よく使う業務の例を選んで、自分に合わせて直します', zh: '选一个常用示例,再按自己的情况修改' },
  'manualStart.direct.title': { ko: '✍️ 직접 쓰기', en: '✍️ Write it yourself', ja: '✍️ 自分で書く', zh: '✍️ 自己写' },
  'manualStart.direct.desc': { ko: '빈 양식에서 처음부터 적어요', en: 'Start from a blank form', ja: '空の様式から書き始めます', zh: '从空白表单开始填写' },
  'manualStart.direct.start': { ko: '빈 양식 열기', en: 'Open blank form', ja: '空の様式を開く', zh: '打开空白表单' },
  'manualStart.kind.question': { ko: '어떤 업무인가요?', en: 'What kind of task is it?', ja: 'どんな業務ですか?', zh: '是什么样的工作?' },
  'manualStart.kind.oneDesc': { ko: '한 직원이 처음부터 끝까지 해요', en: 'One staff member does it from start to finish', ja: '1人のスタッフが最初から最後まで行います', zh: '由一名员工从头做到尾' },
  'manualStart.kind.manyDesc': { ko: '단계마다 다른 직원에게 넘겨요 (예: 쓰기 → 검토)', en: 'Each step passes to a different staff member (e.g. write → review)', ja: 'ステップごとに別のスタッフへ渡します (例: 書く → レビュー)', zh: '每个步骤交给不同的员工(例:撰写 → 审核)' },
  'manualStart.describe.label': { ko: '어떤 일을 맡기고 싶나요?', en: 'What work do you want to hand over?', ja: 'どんな仕事を任せたいですか?', zh: '想交给员工什么工作?' },
  'manualStart.describe.placeholderOne': { ko: '예: 고객 문의 메일에 답장 초안을 써 줘', en: 'e.g. Draft replies to customer inquiry emails', ja: '例: お客様の問い合わせメールに返信の下書きを書いて', zh: '例:为客户咨询邮件起草回复' },
  'manualStart.describe.placeholderMany': { ko: '예: 블로그 글을 쓰고, 다른 사람이 검토한 뒤 내가 마지막에 확인', en: 'e.g. Write a blog post, have someone review it, then I check it last', ja: '例: ブログ記事を書き、別の人がレビューしてから最後に私が確認', zh: '例:写一篇博客,由他人审核后最后由我确认' },
  'manualStart.describe.make': { ko: '초안 만들기', en: 'Create draft', ja: '下書きを作る', zh: '生成草稿' },
  'manualStart.describe.making': { ko: '초안을 쓰는 중…', en: 'Writing the draft…', ja: '下書きを作成中…', zh: '正在起草…' },
  'manualStart.describe.moreDesc': { ko: '초안을 쓸 직원 고르기', en: 'Choose who writes the draft', ja: '下書きを書くスタッフを選ぶ', zh: '选择起草的员工' },
  'manualStart.describe.drafter': { ko: '누가 초안을 쓸까요?', en: 'Who writes the draft?', ja: '誰が下書きを書きますか?', zh: '由谁起草?' },
  'manualStart.describe.drafterAuto': { ko: '앱이 알아서', en: 'Let the app do it', ja: 'アプリにおまかせ', zh: '交给应用' },
  'manualStart.template.stepsCount': { ko: '{n}단계', en: '{n} steps', ja: '{n}ステップ', zh: '{n}个步骤' },

  // 편집 창
  'manuals.editor.titleLabel': { ko: '이름', en: 'Name', ja: '名前', zh: '名称' },
  'manuals.editor.titlePlaceholder': { ko: '예: 주간 보고 정리하기', en: 'e.g. Tidy up the weekly report', ja: '例: 週報をまとめる', zh: '例:整理周报' },
  'manuals.editor.fileNameAuto': { ko: '비워 두면 저장할 때 자동으로 정해요', en: 'Leave it blank to set it automatically when saving', ja: '空のままなら保存時に自動で決めます', zh: '留空则保存时自动生成' },
  'manuals.editor.fileNameLocked': { ko: '이미 만든 매뉴얼의 파일 이름은 바꿀 수 없어요 (쓰는 직원·랩 연결이 끊어져요)', en: "An existing manual's file name can't be changed (it would disconnect the staff and labs using it)", ja: '作成済みマニュアルのファイル名は変えられません (使っているスタッフ・ラボとのつながりが切れます)', zh: '已创建手册的文件名不能修改(否则会与正在使用的员工·实验室断开)' },
  'manuals.editor.moreDesc': { ko: '어디서 쓰는지 · 파일 이름 · 공통 안내', en: 'Where it is used · File name · General notes', ja: '使う場所 · ファイル名 · 共通の案内', zh: '使用范围 · 文件名 · 通用说明' },
  'manuals.editor.moreDescPersonal': { ko: '어디서 쓰는지 · 파일 이름', en: 'Where it is used · File name', ja: '使う場所 · ファイル名', zh: '使用范围 · 文件名' },
  'manuals.editor.stepMoreDesc': { ko: '내 확인 · 앞 단계로 다시 보내기', en: 'My check · Send back to an earlier step', ja: '私の確認 · 前のステップに戻す', zh: '由我确认 · 退回前面的步骤' },
  'manuals.editor.confirmClose': { ko: '고친 내용이 저장되지 않았어요. 닫을까요?', en: "Your changes haven't been saved. Close anyway?", ja: '変更が保存されていません。閉じますか?', zh: '修改尚未保存。确定要关闭吗?' },

  // 저장할 수 없는 이유
  'manuals.problem.header': { ko: '아직 채우지 않은 곳이 있어요: {list}', en: 'Some fields still need filling in: {list}', ja: 'まだ入力されていない所があります: {list}', zh: '还有未填写的地方:{list}' },
  'manuals.problem.more': { ko: '외 {n}개', en: 'and {n} more', ja: 'ほか {n} 件', zh: '等 {n} 处' },
  'manuals.problem.title': { ko: '이름', en: 'Name', ja: '名前', zh: '名称' },
  'manuals.problem.description': { ko: '언제 쓰나요', en: 'When is it used', ja: 'いつ使うか', zh: '什么时候使用' },
  'manuals.problem.body': { ko: '절차·주의점', en: 'Procedure & cautions', ja: '手順・注意点', zh: '步骤·注意事项' },
  'manuals.problem.steps': { ko: '단계 (하나 이상)', en: 'Steps (at least one)', ja: 'ステップ (1つ以上)', zh: '步骤(至少一个)' },
  'manuals.problem.stepTitle': { ko: '{n}단계 이름', en: 'Step {n} name', ja: 'ステップ{n}の名前', zh: '第{n}步名称' },
  'manuals.problem.stepRole': { ko: '{n}단계 담당', en: 'Step {n} owner', ja: 'ステップ{n}の担当', zh: '第{n}步负责人' },
  'manuals.problem.stepInstruction': { ko: '{n}단계 지시', en: 'Step {n} instructions', ja: 'ステップ{n}の指示', zh: '第{n}步指示' },
  'manuals.problem.fileName': { ko: '파일 이름 (영문 소문자·숫자·- 2~63자)', en: 'File name (2–63 lowercase letters, digits, -)', ja: 'ファイル名 (英小文字・数字・- の2〜63文字)', zh: '文件名(2~63个小写英文字母·数字·-)' },

  // 저장 후 쓸 수 있게 하기
  'manuals.train.justSaved': { ko: '저장했어요. 누가 쓰게 할까요?', en: 'Saved. Who should use it?', ja: '保存しました。誰が使いますか?', zh: '已保存。要让谁使用?' },
  'manuals.train.selectAll': { ko: '모두 선택', en: 'Select all', ja: 'すべて選択', zh: '全选' },
  'manuals.train.noStaff': { ko: '아직 고용한 직원이 없어요. 직원을 고용한 뒤 여기서 고르면 돼요.', en: "You haven't hired any staff yet. Hire someone, then pick them here.", ja: 'まだスタッフを雇っていません。雇ってからここで選んでください。', zh: '还没有雇用员工。雇用后再在这里选择即可。' },
  'manuals.train.noGroups': { ko: '아직 팀이나 랩이 없어요. 만든 뒤 여기서 고르면 돼요.', en: 'There are no teams or labs yet. Create one, then pick it here.', ja: 'まだチームやラボがありません。作ってからここで選んでください。', zh: '还没有团队或实验室。创建后再在这里选择即可。' },

  // 매뉴얼이 하나도 없을 때
  'manuals.emptyGuide.title': { ko: '아직 매뉴얼이 없어요', en: 'No manuals yet', ja: 'まだマニュアルがありません', zh: '还没有手册' },
  'manuals.emptyGuide.what': { ko: '매뉴얼은 직원이 일하는 순서를 적어 둔 문서예요. 한 번 만들어 두면 같은 일을 매번 설명하지 않아도 돼요.', en: "A manual lays out the steps staff follow. Make it once and you won't have to explain the same work every time.", ja: 'マニュアルは、スタッフが仕事を進める手順を書いた文書です。一度作れば、同じ仕事を毎回説明しなくて済みます。', zh: '手册是写明员工做事步骤的文档。做好一次,同样的工作就不用每次都解释了。' },
  'manuals.emptyGuide.when': { ko: '만든 매뉴얼은 여기에 모이고, 쓸 수 있게 한 직원·팀이 그 순서대로 일해요.', en: 'Manuals you create gather here, and the staff or teams you make them available to work by those steps.', ja: '作ったマニュアルはここに集まり、使えるようにしたスタッフ・チームがその手順どおりに働きます。', zh: '创建的手册会集中在这里,开放给的员工·团队会按这些步骤工作。' },
} satisfies Record<string, Entry>
