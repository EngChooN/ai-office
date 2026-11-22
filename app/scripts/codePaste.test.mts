// 붙여넣은 코드 자동 코드 블록 (#19): 코드만 감싸고 일반 글·목록·메모는 그대로
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fenceCode, isInsideFence, looksLikeCode } from '../src/shared/codePaste.ts'

const CODE = {
  js: 'function add(a, b) {\n  const total = a + b\n  return total\n}',
  python: 'def add(a, b):\n    total = a + b\n    return total',
  pythonImports: 'import os\nfrom pathlib import Path\n\nprint(Path.home())\nos.getcwd()',
  html: '<div class="box">\n  <p>안녕하세요</p>\n</div>',
  json: '{\n  "name": "홍길동",\n  "age": 20\n}',
  css: '.btn {\n  color: red;\n  padding: 4px;\n}',
  sql: 'SELECT name, age\nFROM users\nWHERE age > 20\nORDER BY age;',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}',
  blockComment: '/**\n * 합계를 구한다\n * @param list 숫자 목록\n */\nfunction sum(list) {\n  return list.reduce((a, b) => a + b, 0)\n}',
  koreanComments: '// 합계를 구한다\nlet sum = 0\nfor (const n of list) {\n  sum += n\n}',
}

const PROSE = {
  korean: '안녕하세요.\n오늘 회의 내용 정리해 주세요.\n내일까지 부탁드려요.',
  list: '할 일\n- 보고서 쓰기\n- 디자인 확인\n- 배포 준비',
  numbered: '1. 로그인 화면 만들기\n2. 버튼 색 바꾸기\n3. 테스트하기',
  english: 'Hi team,\nplease check the report (see above).\nIf anything is wrong, let me know;\nthanks!',
  mixed: '이 코드가 왜 안 될까요?\nconst a = 1\n에러가 나요.\n도와주세요.',
  twoLines: 'const a = 1\nconst b = 2',
  memo: '회의: 오후 3시\n장소: 3층\n참석: 김기획, 이디자',
  fenced: '```js\nconst a = 1\nconst b = 2\nconst c = 3\n```',
  tildeFenced: '~~~js\nconst a = 1\nconst b = 2\nconst c = 3\n~~~',
  starList: '* 보고서 쓰기\n* 디자인 확인\n* 배포 준비',
  starListEnglish: '* write report\n* check design\n* deploy',
}

test('코드: 여러 언어의 여러 줄 코드를 알아본다', () => {
  for (const [name, text] of Object.entries(CODE)) assert.equal(looksLikeCode(text), true, name)
})

test('코드 아님: 일반 글·목록·메모·두 줄·이미 감싼 글은 그대로', () => {
  for (const [name, text] of Object.entries(PROSE)) assert.equal(looksLikeCode(text), false, name)
})

test('감싸기: 줄 중간이면 줄을 바꿔 시작하고 끝 공백·윈도우 줄바꿈을 정리한다', () => {
  assert.equal(fenceCode('a = 1\r\nb = 2\r\n\r\n', ''), '```\na = 1\nb = 2\n```\n')
  assert.equal(fenceCode('  x()\n', '이거 봐 주세요: '), '\n```\n  x()\n```\n')
  assert.equal(fenceCode('x()', '질문\n'), '```\nx()\n```\n')
})

test('이미 코드 블록 안이면 감싸지 않는다', () => {
  assert.equal(isInsideFence('질문\n```\n'), true)
  assert.equal(isInsideFence('```\na\n```\n'), false)
})

test('물결표(~~~) 코드 블록 안, 긴 ``` 표시, 닫힌 블록 뒤를 가린다 (한리뷰 R1)', () => {
  assert.equal(isInsideFence('질문\n~~~js\nconst a = 1\n'), true)
  assert.equal(isInsideFence('~~~\na\n~~~\n'), false)
  assert.equal(isInsideFence('~~~\n```\n'), true) // 다른 문자는 닫지 못한다
  assert.equal(isInsideFence('````\n```\n'), true) // 짧은 표시는 닫지 못한다
  assert.equal(isInsideFence('````\n````\n'), false)
  assert.equal(isInsideFence('```js\r\na\r\n```\r\n'), false)
})
