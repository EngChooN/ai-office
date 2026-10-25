// 브리지 계약(docs/specs/android-bridge.md)을 그대로 쓰는 작은 시험 화면. 최가독의 원격 어댑터가 할 일을 흉내 낸다
const $ = (id) => document.getElementById(id)
const pending = new Map()
let seq = 0

function log(text, cls = '') {
  const li = document.createElement('li')
  li.textContent = `${new Date().toLocaleTimeString()} ${text}`
  if (cls) li.className = cls
  $('log').prepend(li)
}

function send(msg) {
  OfficeBridge.postMessage(JSON.stringify(msg))
}

// window.office.<method>(...args) 와 같은 모양: 결과를 돌려주거나 오류를 던진다
function call(method, args = [], confirm = false) {
  const id = `c${++seq}`
  send({ type: 'call', id, method, args, confirm })
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

OfficeBridge.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  switch (msg.type) {
    case 'hello':
      log(`hello: android ${msg.appVersion}, 태블릿=${msg.isTablet}`, 'ok')
      break
    case 'result': {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (!p) return
      msg.ok ? p.resolve(msg.result) : p.reject(msg.error)
      break
    }
    case 'event':
      if (msg.name === 'snapshot') renderStaff(msg.data)
      log(`이벤트 ${msg.name}`, 'muted')
      break
    case 'connection':
      $('conn').textContent = msg.state + (msg.reason ? ` (${msg.reason})` : '')
      $('conn').className = 'pill' + (msg.state === 'open' ? ' open' : '')
      break
    case 'resync':
      log('resync: chatHistory·timeline 다시 읽기', 'warn')
      break
    case 'insets':
      $('ime').textContent = `키보드 ${msg.ime}px · --ime=${getComputedStyle(document.documentElement).getPropertyValue('--ime') || '없음'}`
      break
    case 'back': {
      const isOpen = !$('sheet').classList.contains('hidden')
      $('sheet').classList.add('hidden')
      send({ type: 'backResult', handled: isOpen })
      break
    }
  }
}

function renderStaff(snap) {
  const list = $('staffList')
  list.innerHTML = ''
  for (const s of snap.staff ?? []) {
    const li = document.createElement('li')
    li.textContent = `${s.name} · ${s.role ?? ''} · ${s.status ?? ''}`
    list.append(li)
  }
}

$('snap').onclick = async () => {
  try {
    const snap = await call('snapshot')
    renderStaff(snap)
    log(`snapshot(): 직원 ${snap.staff?.length ?? 0}명`, 'ok')
    $('sheet').classList.remove('hidden')
  } catch (e) {
    log(`snapshot 실패 ${e.status} ${e.code} ${e.message}`, 'err')
  }
}

$('pc').onclick = async () => {
  try {
    await call('pickFolder')
  } catch (e) {
    log(`pickFolder → ${e.status} ${e.code} (대신: ${e.alternative}) "${e.message}"`, 'warn')
  }
}

$('qr').onclick = async () => {
  try {
    await call('regenerateRemoteQr')
  } catch (e) {
    if (e.code !== 'confirm_required') return log(`${e.code} ${e.message}`, 'err')
    // 셸이 confirm()을 네이티브 창으로 보여 준다
    if (confirm(e.message || '이 폰의 연결이 끊어져요. 계속할까요?')) {
      try { await call('regenerateRemoteQr', [], true); log('QR 다시 만들기 요청함', 'warn') } catch (e2) { log(`${e2.code} ${e2.message}`, 'err') }
    } else log('취소함', 'muted')
  }
}

$('send').onclick = async () => {
  const text = $('text').value.trim()
  if (!text) return
  try {
    await call('instruct', ['kim', text])
    log(`instruct 전달: ${text}`, 'ok')
    $('text').value = ''
  } catch (e) {
    log(`instruct 실패 ${e.code} ${e.message}`, 'err')
  }
}

// 사진 선택기 → 바이트를 셸로 → /v2/attachments → office-file 주소로 다시 보기
$('file').onchange = async () => {
  const f = $('file').files[0]
  if (!f) return
  const buf = new Uint8Array(await f.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  const id = `u${++seq}`
  send({ type: 'upload', id, name: f.name, mime: f.type, base64: btoa(bin) })
  pending.set(id, {
    resolve: (a) => {
      log(`첨부 올림 ${a.name} ${a.size}B`, 'ok')
      $('preview').src = `https://appassets.androidplatform.net/office-file/${a.id}`
    },
    reject: (e) => log(`첨부 실패 ${e.code} ${e.message}`, 'err'),
  })
}

$('close').onclick = () => $('sheet').classList.add('hidden')

const showLayout = () => ($('layout').textContent = `${innerWidth}px · ${innerWidth >= 840 ? '태블릿' : '폰'} 배치`)
addEventListener('resize', showLayout)
showLayout()
// ?ime=0 이면 예전 방식(셸이 WebView를 줄임), 기본은 화면이 --ime로 직접 비키는 방식
const imeByScreen = new URLSearchParams(location.search).get('ime') !== '0'
send({ type: 'ready', ...(imeByScreen ? { features: ['ime'] } : {}) })
log(`ready 보냄 (키보드: ${imeByScreen ? '화면이 --ime로' : '셸이 WebView 줄임'})`)
