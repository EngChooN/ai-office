import type { Entry } from './index.ts'

/** 직원·랩 파일(내보내기·가져오기)과 기본 직원 마켓 */
export default {
  // ── 고용 창 진입 ──
  'market.bring': { ko: '직원 마켓에서 데려오기', en: 'Bring someone from the staff market', ja: '社員マーケットから迎える', zh: '从员工市场招募' },
  'market.empty.hint': { ko: '아직 사무실에 직원이 없어요. 직원 마켓에서 바로 데려올 수 있어요.', en: 'No one is in the office yet. You can bring someone straight from the staff market.', ja: 'まだオフィスに社員がいません。社員マーケットからすぐに迎えられます。', zh: '办公室里还没有员工。可以直接从员工市场招募。' },
  'pack.hire.market': { ko: '직원 마켓', en: 'Staff market', ja: '社員マーケット', zh: '员工市场' },
  'pack.hire.import': { ko: '파일에서 가져오기', en: 'Import from file', ja: 'ファイルから読み込む', zh: '从文件导入' },
  'pack.hire.hint': {
    ko: '내보낸 직원·랩 파일을 고르면 검사 후 바로 채용해요.',
    en: 'Pick an exported staff or lab file. It is checked and the staff are hired right away.',
    ja: '書き出した社員・ラボのファイルを選ぶと、確認後にすぐ採用します。',
    zh: '选择导出的员工或实验室文件，检查后立即录用。',
  },

  // ── 직원 마켓 창 ──
  'pack.market.title': { ko: '직원 마켓', en: 'Staff market', ja: '社員マーケット', zh: '员工市场' },
  'pack.market.hint': {
    ko: '기본으로 준비된 직원 목록이에요. [채용]을 누르면 바로 고용돼요. 이름은 나중에 바꿀 수 있어요.',
    en: 'Ready-made staff. Press Hire to hire right away. You can rename them later.',
    ja: '用意された社員の一覧です。[採用]を押すとすぐ雇用されます。名前は後から変えられます。',
    zh: '内置的员工列表。点击[录用]即可立即雇用，名字之后可以修改。',
  },
  'pack.market.hire': { ko: '채용', en: 'Hire', ja: '採用', zh: '录用' },
  'pack.market.planner.name': { ko: '기획 담당', en: 'Planner', ja: '企画担当', zh: '策划负责人' },
  'pack.market.planner.desc': {
    ko: '목표·범위·완료 기준을 정리하고 빠진 정보를 묻습니다.',
    en: 'Organizes goals, scope and done criteria, and asks about missing details.',
    ja: '目標・範囲・完了基準を整理し、足りない情報を確認します。',
    zh: '整理目标、范围和完成标准，并询问缺失的信息。',
  },
  'pack.market.frontend.name': { ko: '화면 개발 담당', en: 'Frontend developer', ja: 'フロントエンド担当', zh: '前端开发负责人' },
  'pack.market.frontend.desc': {
    ko: '화면과 사용자 경험을 만들고 고칩니다.',
    en: 'Builds and fixes screens and the user experience.',
    ja: '画面と使い勝手を作成・修正します。',
    zh: '制作和修改界面与用户体验。',
  },
  'pack.market.backend.name': { ko: '서버 개발 담당', en: 'Backend developer', ja: 'バックエンド担当', zh: '后端开发负责人' },
  'pack.market.backend.desc': {
    ko: '서버와 데이터 처리를 맡고, 바꾼 범위를 알립니다.',
    en: 'Handles server and data work and reports what changed.',
    ja: 'サーバーとデータ処理を担当し、変更範囲を知らせます。',
    zh: '负责服务器和数据处理，并报告改动范围。',
  },
  'pack.market.reviewer.name': { ko: '코드 검토 담당', en: 'Code reviewer', ja: 'コードレビュー担当', zh: '代码审查负责人' },
  'pack.market.reviewer.desc': {
    ko: '변경된 코드에서 버그와 빠진 처리를 찾아 알려 줍니다.',
    en: 'Finds bugs and missing handling in changed code.',
    ja: '変更されたコードのバグや処理漏れを見つけます。',
    zh: '在改动的代码中找出错误和遗漏的处理。',
  },
  'pack.market.qa.name': { ko: '품질 확인 담당', en: 'QA', ja: 'QA担当', zh: 'QA负责人' },
  'pack.market.qa.desc': {
    ko: '시나리오대로 확인하고 재현 순서와 결과를 정리합니다.',
    en: 'Checks against scenarios and writes up repro steps and results.',
    ja: 'シナリオに沿って確認し、再現手順と結果をまとめます。',
    zh: '按场景进行检查，并整理复现步骤和结果。',
  },
  'pack.market.researcher.name': { ko: '자료 조사 담당', en: 'Researcher', ja: 'リサーチ担当', zh: '调研负责人' },
  'pack.market.researcher.desc': {
    ko: '자료를 찾아 읽고 출처와 함께 요약합니다.',
    en: 'Finds and reads material and summarizes it with sources.',
    ja: '資料を探して読み、出典つきで要約します。',
    zh: '查找并阅读资料，附上出处进行总结。',
  },

  // ── 직원 내보내기 창 ──
  'pack.export.button': { ko: '내보내기', en: 'Export', ja: '書き出し', zh: '导出' },
  'pack.export.title': { ko: '직원 내보내기', en: 'Export staff', ja: '社員の書き出し', zh: '导出员工' },
  'pack.export.hint': {
    ko: '고른 직원을 파일 하나로 저장해요. 작업 폴더와 이 컴퓨터의 경로는 빠지고, 다른 컴퓨터에서 가져오면 그곳에서 채용돼요.',
    en: 'Saves the selected staff as one file. Work folders and paths on this computer are left out. Importing on another computer hires them there.',
    ja: '選んだ社員を1つのファイルに保存します。作業フォルダとこのコンピュータのパスは除かれ、別のコンピュータで読み込むとそこで採用されます。',
    zh: '将所选员工保存为一个文件。工作文件夹和本机路径不会包含在内，在其他电脑上导入即可在那里录用。',
  },
  'pack.export.count': { ko: '{count}명 고름', en: '{count} selected', ja: '{count}人選択中', zh: '已选 {count} 人' },
  'pack.export.submit': { ko: '저장하기', en: 'Save', ja: '保存する', zh: '保存' },
  'pack.lab.export': { ko: '랩 내보내기', en: 'Export lab', ja: 'ラボを書き出す', zh: '导出实验室' },

  // ── 파일 대화상자 ──
  'pack.dialog.save': { ko: '직원 파일 저장', en: 'Save staff file', ja: '社員ファイルを保存', zh: '保存员工文件' },
  'pack.dialog.open': { ko: '직원 파일 고르기', en: 'Choose staff file', ja: '社員ファイルを選ぶ', zh: '选择员工文件' },
  'pack.dialog.filter': { ko: '직원 파일', en: 'Staff file', ja: '社員ファイル', zh: '员工文件' },

  // ── 결과 문구 ──
  'pack.done.hired': { ko: '{names} 채용했어요.', en: 'Hired {names}.', ja: '{names}を採用しました。', zh: '已录用 {names}。' },
  'pack.done.lab': { ko: '랩 "{lab}"을 꾸리고 {names} 채용했어요.', en: 'Set up lab "{lab}" and hired {names}.', ja: 'ラボ「{lab}」を作り、{names}を採用しました。', zh: '已组建实验室“{lab}”并录用 {names}。' },
  'pack.done.excluded': {
    ko: '이 컴퓨터에 없는 장비는 빼고 채용했어요: {list}',
    en: 'Hired without equipment that is not on this computer: {list}',
    ja: 'このコンピュータにない装備は外して採用しました: {list}',
    zh: '已录用，但已去掉本机没有的装备：{list}',
  },
  'pack.done.exported': { ko: '직원 {count}명을 저장했어요.', en: 'Saved {count} staff.', ja: '社員{count}人を保存しました。', zh: '已保存 {count} 名员工。' },
  'pack.done.exportedLab': {
    ko: '랩 "{lab}"과 직원 {count}명을 저장했어요.',
    en: 'Saved lab "{lab}" and {count} staff.',
    ja: 'ラボ「{lab}」と社員{count}人を保存しました。',
    zh: '已保存实验室“{lab}”和 {count} 名员工。',
  },

  // ── 오류 문구 (검사·저장 실패 — 이유를 보여 주고 아무것도 만들지 않는다) ──
  'pack.err.size': {
    ko: '파일이 너무 커요. 1MB 이하의 직원 파일만 가져올 수 있어요.',
    en: 'The file is too large. Only staff files up to 1MB can be imported.',
    ja: 'ファイルが大きすぎます。1MB以下の社員ファイルだけ読み込めます。',
    zh: '文件太大了。只能导入 1MB 以内的员工文件。',
  },
  'pack.err.read': { ko: '파일을 읽을 수 없어요.', en: 'The file cannot be read.', ja: 'ファイルを読み込めません。', zh: '无法读取文件。' },
  'pack.err.write': { ko: '파일을 저장하지 못했어요.', en: 'The file could not be saved.', ja: 'ファイルを保存できませんでした。', zh: '无法保存文件。' },
  'pack.err.parse': {
    ko: '파일 내용을 읽을 수 없어요. 직원 파일이 맞는지 확인해 주세요.',
    en: 'The file content cannot be read. Check that it is a staff file.',
    ja: 'ファイルの内容を読み取れません。社員ファイルか確認してください。',
    zh: '无法读取文件内容，请确认是员工文件。',
  },
  'pack.err.shape': {
    ko: '파일 구조가 올바르지 않아요.',
    en: 'The file structure is not valid.',
    ja: 'ファイルの構造が正しくありません。',
    zh: '文件结构不正确。',
  },
  'pack.err.format': {
    ko: 'AI Office 직원 파일이 아니에요.',
    en: 'This is not a AI Office staff file.',
    ja: 'AI Office の社員ファイルではありません。',
    zh: '这不是 AI Office 的员工文件。',
  },
  'pack.err.version': {
    ko: '이 앱 버전에서 읽을 수 없는 파일 버전이에요.',
    en: 'This file version cannot be read by this app version.',
    ja: 'このアプリのバージョンでは読み込めないファイルのバージョンです。',
    zh: '此应用版本无法读取该文件版本。',
  },
  'pack.err.staffCount': {
    ko: '직원은 1명 이상 50명 이하여야 해요.',
    en: 'There must be between 1 and 50 staff.',
    ja: '社員は1人以上50人以下である必要があります。',
    zh: '员工人数必须在 1 到 50 人之间。',
  },
  'pack.err.staffName': {
    ko: '직원 이름은 1~40글자로 적어 주세요.',
    en: 'Staff names must be 1 to 40 characters.',
    ja: '社員の名前は1〜40文字で入力してください。',
    zh: '员工名字需为 1 至 40 个字。',
  },
  'pack.err.role': {
    ko: '직무 "{role}"은(는) 이 앱에 없는 직무예요.',
    en: 'The role "{role}" is not a role in this app.',
    ja: '職務「{role}」はこのアプリにない職務です。',
    zh: '职务“{role}”不是本应用中的职务。',
  },
  'pack.err.model': {
    ko: '모델 "{model}"은(는) 이 앱에서 고를 수 없어요.',
    en: 'The model "{model}" cannot be chosen in this app.',
    ja: 'モデル「{model}」はこのアプリでは選べません。',
    zh: '此应用无法选择模型“{model}”。',
  },
  'pack.err.avatar': { ko: '직원 생김새 값이 올바르지 않아요.', en: 'The staff appearance value is not valid.', ja: '社員の見た目の値が正しくありません。', zh: '员工外观的值不正确。' },
  'pack.err.approval': { ko: '결재 방식 값이 올바르지 않아요.', en: 'The approval setting is not valid.', ja: '承認方法の値が正しくありません。', zh: '审批方式的值不正确。' },
  'pack.err.prompt': {
    ko: '업무 지침은 8,000글자 이하여야 해요.',
    en: 'Work instructions must be 8,000 characters or fewer.',
    ja: '業務指示は8,000文字以内にしてください。',
    zh: '工作指示不能超过 8,000 个字。',
  },
  'pack.err.equipment': {
    ko: '장비 정보 형식이 올바르지 않거나 목록이 너무 길어요.',
    en: 'The equipment information is not valid or the list is too long.',
    ja: '装備情報の形式が正しくないか、一覧が長すぎます。',
    zh: '装备信息格式不正确或列表太长。',
  },
  'pack.err.budget': {
    ko: '월 예산 값이 올바르지 않아요.',
    en: 'The monthly budget value is not valid.',
    ja: '月間予算の値が正しくありません。',
    zh: '月预算的值不正确。',
  },
  'pack.err.manualCount': {
    ko: '매뉴얼은 직원 한 명당 20개 이하여야 해요.',
    en: 'Each staff member can have up to 20 manuals.',
    ja: 'マニュアルは社員1人につき20個以下にしてください。',
    zh: '每名员工最多 20 份手册。',
  },
  'pack.err.manualName': {
    ko: '매뉴얼 이름은 영문 소문자·숫자·하이픈(-)으로 2~63자여야 해요.',
    en: 'Manual names must be 2 to 63 characters of lowercase letters, digits and hyphens (-).',
    ja: 'マニュアル名は英小文字・数字・ハイフン(-)で2〜63文字にしてください。',
    zh: '手册名称须为 2 至 63 个小写英文字母、数字或连字符(-)。',
  },
  'pack.err.manualBody': {
    ko: '매뉴얼 내용은 1~20,000글자여야 해요.',
    en: 'Manual content must be 1 to 20,000 characters.',
    ja: 'マニュアルの内容は1〜20,000文字にしてください。',
    zh: '手册内容需为 1 至 20,000 个字。',
  },
  'pack.err.manualConflict': {
    ko: '같은 이름("{name}")의 매뉴얼 내용이 서로 달라요.',
    en: 'Manuals named "{name}" have different content.',
    ja: '同じ名前（「{name}」）のマニュアルの内容が違います。',
    zh: '同名（“{name}”）的手册内容不一致。',
  },
  'pack.err.path': {
    ko: '파일에 폴더 위치가 들어 있어요. 이 컴퓨터의 위치는 파일에 담을 수 없어요.',
    en: 'The file contains folder locations. Locations from this computer cannot be stored in a file.',
    ja: 'ファイルにフォルダの場所が含まれています。このコンピュータの場所はファイルに入れられません。',
    zh: '文件中包含文件夹位置。本机的位置不能保存在文件里。',
  },
  'pack.err.lab': { ko: '랩 정보가 올바르지 않아요.', en: 'The lab information is not valid.', ja: 'ラボ情報が正しくありません。', zh: '实验室信息不正确。' },
  'pack.err.leader': { ko: '랩 리드가 파일의 직원 중에 없어요.', en: 'The lab lead is not among the staff in the file.', ja: 'ラボリーダーがファイルの社員にいません。', zh: '实验室负责人不在文件的员工中。' },
  'pack.err.exportTooBig': {
    ko: '내보낼 내용이 1MB를 넘어요. 매뉴얼을 줄이거나 직원을 나눠서 내보내 주세요.',
    en: 'The export is larger than 1MB. Reduce the manuals or export fewer staff at a time.',
    ja: '書き出す内容が1MBを超えています。マニュアルを減らすか、社員を分けて書き出してください。',
    zh: '导出内容超过 1MB。请减少手册或分批导出员工。',
  },
  'pack.err.noStaff': { ko: '내보낼 직원을 골라 주세요.', en: 'Choose the staff to export.', ja: '書き出す社員を選んでください。', zh: '请选择要导出的员工。' },
  'pack.err.labMissing': { ko: '랩을 찾을 수 없어요.', en: 'The lab cannot be found.', ja: 'ラボが見つかりません。', zh: '找不到该实验室。' },
  'pack.err.labNoMembers': { ko: '이 랩에는 직원이 없어 내보낼 수 없어요.', en: 'This lab has no staff, so it cannot be exported.', ja: 'このラボには社員がいないため書き出せません。', zh: '该实验室没有员工，无法导出。' },
  'pack.err.marketMissing': { ko: '마켓에서 그 직원을 찾을 수 없어요.', en: 'That staff member is not in the market.', ja: 'マーケットにその社員がいません。', zh: '员工市场中没有该员工。' },
  'pack.err.hire': {
    ko: '채용 중에 문제가 생겼어요. 다시 시도해 주세요.',
    en: 'Something went wrong while hiring. Please try again.',
    ja: '採用中に問題が起きました。もう一度お試しください。',
    zh: '录用过程中出现问题，请重试。',
  },
} satisfies Record<string, Entry>
