// 앱 확인용 로컬 원격 서버 — PC 앱의 실제 원격 코드(app/src/main/remote)를 그대로 쓰고, 사무실만 가짜로 채운다
// Electron 없이 돌아가므로 실제 사무실(직원·결재)에는 손대지 않는다
//
//   node android/tools/dev-server.mts [포트=47900] [QR에 넣을 주소=10.0.2.2]
//
// 에뮬레이터에서 PC는 10.0.2.2로 보인다. 같은 와이파이의 실기기라면 PC의 안쪽 IP를 넣는다.
// 상태 바꾸기(이 PC 안에서만 열리는 평문 관리 포트 = 포트+1):
//   curl -s localhost:47901/qr         지금 QR 내용(JSON) — adb로 앱에 넣을 때
//   curl -s localhost:47901/revoke     QR 다시 만들기 (이전 토큰 → token_revoked)
//   curl -s localhost:47901/lock       틀린 토큰 5번 → IP 잠금 (auth_locked + retryAt)
//   curl -s localhost:47901/off        원격 끄기 (포트 닫힘)   /on  다시 켜기
//   curl -s localhost:47901/newcert    인증서 키 교체 (QR 지문과 달라짐 → 인증서 불일치)
//   curl -s localhost:47901/approval   결재 1건 추가   /question  질문 1건   /plan  기획 확인 1건
//   curl -s localhost:47901/log        PC 쪽에 도착한 결정·지시 기록

import http from 'node:http'
import { AuthGuard } from '../../app/src/main/remote/auth.ts'
import { createSelfSignedCert, spkiFingerprint } from '../../app/src/main/remote/cert.ts'
import { handleRequest, type RemoteOfficePort } from '../../app/src/main/remote/handler.ts'
import { RemoteServer } from '../../app/src/main/remote/server.ts'

const PORT = Number(process.argv[2] ?? 47900)
const QR_HOST = process.argv[3] ?? '10.0.2.2'
const ADMIN_PORT = PORT + 1

const now = () => Date.now()
let seq = 0
const staff: any[] = [
  { id: 'park', kind: 'hired', name: '박개발', role: '개발자', avatar: 1, status: 'waiting', activity: '결제 화면 API 연결 중', statusSince: now() - 8 * 60_000, approvals: [] },
  { id: 'lee', kind: 'hired', name: '이디자', role: '디자이너', avatar: 2, status: 'working', activity: '안드로이드 화면 설계 정리 중', statusSince: now() - 12 * 60_000, approvals: [] },
  { id: 'jung', kind: 'hired', name: '정리드', role: '팀장', avatar: 3, status: 'working', activity: '회의 결과 카드 정리 중', statusSince: now() - 3 * 60_000, approvals: [] },
  { id: 'kim', kind: 'hired', name: '김기획', role: '기획자', avatar: 3730355052, // 실제 PC에 있는 Int 범위 밖 값 (QA 2차 0번)
    status: 'idle', activity: '', statusSince: now() - 40 * 60_000, approvals: [] },
  { id: 'han', kind: 'hired', name: '한리뷰', role: '리뷰어', avatar: 5, status: 'error', activity: '테스트 실패 확인 필요', statusSince: now() - 2 * 60_000, approvals: [] },
  { id: 'ext', kind: 'external', name: '외부세션', role: '', avatar: 0, status: 'working', activity: '', statusSince: now(), approvals: [] },
]
const tasks: any[] = []
const log: string[] = []

function addApproval(staffId = 'park') {
  const s = staff.find((x) => x.id === staffId)!
  s.approvals.push({ id: `${staffId}:ap${++seq}`, staffId, toolName: 'Edit', summary: `파일 수정: docs/specs/x${seq}.md`, createdAt: now() })
  s.status = 'waiting'
}
function addQuestion(staffId = 'lee') {
  const s = staff.find((x) => x.id === staffId)!
  s.approvals.push({
    id: `${staffId}:q${++seq}`, staffId, toolName: 'AskUserQuestion', summary: '어떤 색으로 할까요?', createdAt: now(),
    questions: [{ question: '어떤 색으로 할까요?', header: '색상', options: [{ label: '파랑', description: '차분해요' }, { label: '주황', description: '브랜드 색과 맞아요' }], multiSelect: false }],
  })
}
function addPlan() {
  tasks.push({
    id: `task${++seq}`, title: '결제 개편 기획안', assigneeId: 'jung',
    plan: {
      status: 'waiting', proposedAt: now(), feedback: '', isAggregating: false,
      spec: '## 목표\n결제 화면을 한 단계로 줄인다.\n\n## 범위\n- 화면 설계\n- API 연결\n- 검증',
      subtasks: [
        { title: '화면 설계', detail: '', assigneeId: 'lee', assigneeName: '이디자' },
        { title: 'API 연결', detail: '', assigneeId: 'park', assigneeName: '박개발' },
        { title: '검증', detail: '', assigneeId: 'han', assigneeName: '오큐에이' },
      ],
    },
  })
}
addApproval('han')
addQuestion('lee')
addPlan()

const removeApproval = (id: string) => {
  for (const s of staff) {
    const before = s.approvals.length
    s.approvals = s.approvals.filter((a: any) => a.id !== id)
    if (before !== s.approvals.length) {
      if (s.approvals.length === 0 && s.status === 'waiting') s.status = 'working'
      return true
    }
  }
  return false
}
const office: RemoteOfficePort = {
  view: () => ({ staff, tasks }),
  decide: (id, allow) => (log.push(`📱 결재 ${id} → ${allow ? '승인' : '반려'}`), removeApproval(id)),
  answerQuestion: (id, answers) => (log.push(`📱 답변 ${id} → ${JSON.stringify(answers)}`), removeApproval(id)),
  reviewPlan: (taskId, ok, fb) => {
    const t = tasks.find((x) => x.id === taskId && x.plan.status === 'waiting')
    if (!t) return false
    t.plan.status = ok ? 'approved' : 'rejected'
    log.push(`📱 기획 ${taskId} → ${ok ? '승인' : '반려'} ${fb ? `(${fb})` : ''}`)
    return true
  },
  instruct: (id, text) => {
    log.push(`📱 지시 ${id} → ${text}`)
    const s = staff.find((x) => x.id === id)!
    s.status = 'working'
    s.activity = `지시 처리 중: ${text.slice(0, 40)}`
    s.statusSince = now()
  },
}

let keys = createSelfSignedCert()
const guard = new AuthGuard({ tokenHash: null, revoked: [] }, (scope, until) => log.push(`🔒 잠금(${scope}) ~ ${new Date(until).toLocaleTimeString()}`))
let token = guard.rotate().token
const server = new RemoteServer()

const qr = () => JSON.stringify({ v: 1, host: QR_HOST, port: PORT, token, spki: spkiFingerprint(keys.certPem) })
async function start() {
  await server.start({
    keyPem: keys.keyPem, certPem: keys.certPem, port: PORT, host: '0.0.0.0',
    handle: (req) => handleRequest(req, { guard, office, serverVersion: '0.8.0-dev', now: now(), isReady: true }),
    onAccess: (e) => console.log(`${new Date(e.at).toLocaleTimeString()} ${e.ip} ${e.method} ${e.path} → ${e.status}${e.error ? ` ${e.error}` : ''}`),
  })
}

const admin: Record<string, () => Promise<string> | string> = {
  '/qr': () => qr(),
  '/revoke': () => ((token = guard.rotate().token), `새 QR: ${qr()}`),
  '/lock': () => {
    for (let i = 0; i < 5; i++) guard.check('x'.repeat(43), '10.0.2.2', now())
    for (let i = 0; i < 5; i++) guard.check('x'.repeat(43), '127.0.0.1', now())
    return `잠금: ${guard.lockedUntil('10.0.2.2', now())}`
  },
  '/off': async () => (await server.stop(), '꺼짐'),
  '/on': async () => (server.isListening ? '이미 켜짐' : (await start(), '켜짐')),
  '/newcert': async () => {
    keys = createSelfSignedCert()
    await server.stop()
    await start()
    return `새 인증서 지문 ${spkiFingerprint(keys.certPem)} (QR의 토큰은 그대로)`
  },
  '/approval': () => (addApproval(), '결재 추가'),
  '/question': () => (addQuestion(), '질문 추가'),
  '/plan': () => (addPlan(), '기획 추가'),
  '/log': () => log.join('\n'),
}

await start()
http.createServer(async (req, res) => {
  const fn = admin[req.url ?? '']
  res.writeHead(fn ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(fn ? `${await fn()}\n` : `${Object.keys(admin).join(' ')}\n`)
}).listen(ADMIN_PORT, '127.0.0.1')

console.log(`원격 서버 https://0.0.0.0:${PORT}  (관리: http://127.0.0.1:${ADMIN_PORT})`)
console.log(`QR: ${qr()}`)
