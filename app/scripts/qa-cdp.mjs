#!/usr/bin/env node
// 실행 중인 개발 앱을 CDP로 조작하는 작은 도우미 (의존성 없음, node 22+ 기본 WebSocket 사용). 사용법: docs/qa-dev-app.md
//   node scripts/qa-cdp.mjs [--port 9450] <명령> [인자]
//   --target <주소 일부>    조작할 창 고르기 (기본: 메인 창, 바탕화면 비서 창 ?view=pet 은 제외)
//   tabs                    열린 창(타깃) 목록
//   buttons                 화면의 버튼·탭·링크 글자 목록
//   open <글자>             그 글자가 보이는 버튼·탭·링크를 눌러 화면을 연다 (click text=<글자> 와 같음)
//   click <CSS선택자 | text=글자>
//   text [CSS선택자]        화면(또는 선택한 곳)의 글자 읽기
//   shot <파일.png>         스크린샷
//   eval <자바스크립트식>   페이지에서 실행한 값 출력
const args = process.argv.slice(2)
let port = 9450
const pi = args.indexOf('--port')
if (pi >= 0) { port = Number(args[pi + 1]); args.splice(pi, 2) }
let target = ''
const ti = args.indexOf('--target')
if (ti >= 0) { target = args[ti + 1]; args.splice(ti, 2) }
const [cmd, ...rest] = args
const die = (m) => { console.error(m); process.exit(1) }
if (!cmd) die('명령이 필요해요: tabs | buttons | open | click | text | shot | eval')

const base = `http://127.0.0.1:${port}`
const list = await fetch(`${base}/json`).then((r) => r.json()).catch(() => die(`CDP ${base} 에 연결하지 못했어요. 앱이 떠 있나요?`))
if (cmd === 'tabs') {
  for (const t of list) console.log(`${t.type}\t${t.title}\t${t.url}`)
  process.exit(0)
}
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools:') && (target ? t.url.includes(target) : !t.url.includes('view='))) ?? die('열린 앱 창이 없어요')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('웹소켓 연결 실패')) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
}
const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
// 선택자 또는 text=글자 로 요소를 찾아 가운데 좌표를 돌려주는 식
const locate = (target) => `(() => {
  const t = ${JSON.stringify(target)}
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  let el
  if (t.startsWith('text=')) {
    const want = t.slice(5).trim()
    const all = [...document.querySelectorAll('button,[role=tab],[role=button],a,summary,label,[onclick]')].filter(vis)
    el = all.find((e) => e.innerText.trim() === want) ?? all.find((e) => e.innerText.trim().includes(want))
  } else el = [...document.querySelectorAll(t)].find(vis)
  if (!el) return null
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})()`
const click = async (target) => {
  let pos = null
  for (let i = 0; i < 20 && !pos; i++) { // 화면이 그려지는 중일 수 있어 최대 10초 기다린다
    pos = await ev(locate(target))
    if (!pos) await new Promise((r) => setTimeout(r, 500))
  }
  if (!pos) die(`찾지 못했어요: ${target}`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  await new Promise((r) => setTimeout(r, 400))
}

try {
  if (cmd === 'buttons') {
    console.log(await ev(`[...document.querySelectorAll('button,[role=tab],a')].map(b=>b.innerText.trim()||b.getAttribute('aria-label')||'').filter(Boolean).join('\\n')`))
  } else if (cmd === 'open') {
    await click(`text=${rest.join(' ')}`)
    console.log('눌렀어요:', rest.join(' '))
  } else if (cmd === 'click') {
    await click(rest.join(' '))
    console.log('눌렀어요:', rest.join(' '))
  } else if (cmd === 'text') {
    console.log(await ev(rest[0] ? `document.querySelector(${JSON.stringify(rest[0])})?.innerText ?? ''` : 'document.body.innerText'))
  } else if (cmd === 'shot') {
    const file = rest[0] ?? die('저장할 파일 이름이 필요해요')
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log('저장:', file)
  } else if (cmd === 'eval') {
    console.log(JSON.stringify(await ev(rest.join(' ')), null, 2))
  } else die(`알 수 없는 명령: ${cmd}`)
} catch (e) {
  die(String(e.message ?? e))
} finally {
  ws.close()
}
