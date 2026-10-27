#!/usr/bin/env python3
"""Codex app-server P0 시험 — 앱 코드와 무관한 스파이크. 사용: python3 -I spike.py <codex 바이너리> [단계...]
단계: info | mcp | turn | resume   (생략하면 전부)"""
import json, os, subprocess, sys, threading, queue, time, tempfile, http.server, socketserver

BIN = sys.argv[1]
STEPS = sys.argv[2:] or ['info', 'mcp', 'turn', 'resume']
WS = '/tmp/codex-spike-ws'
os.makedirs(WS, exist_ok=True)
OUT = {}


class Client:
    def __init__(self, extra=()):
        self.p = subprocess.Popen([BIN, *(['app-server'] if not BIN.endswith('codex-app-server') else []), *extra], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.n = 0
        self.q = queue.Queue()
        self.events = []
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in self.p.stdout:
            try:
                self.q.put(json.loads(line))
            except Exception:
                pass

    def send(self, o):
        self.p.stdin.write(json.dumps(o) + '\n')
        self.p.stdin.flush()

    def notify(self, method, params=None):
        self.send({'method': method, **({'params': params} if params is not None else {})})

    def pump(self, until, timeout=60, on_request=None):
        """메시지를 읽으며 until(msg)가 참이 될 때까지. 서버 요청은 on_request로 응답."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                m = self.q.get(timeout=0.5)
            except queue.Empty:
                continue
            self.events.append(m)
            if 'method' in m and 'id' in m and on_request:
                self.send({'id': m['id'], 'result': on_request(m)})
            if until(m):
                return m
        return None

    def call(self, method, params=None, timeout=30, on_request=None):
        self.n += 1
        i = self.n
        self.send({'id': i, 'method': method, **({'params': params} if params is not None else {})})
        m = self.pump(lambda x: x.get('id') == i and 'method' not in x, timeout, on_request)
        if m is None:
            return {'_timeout': True}
        return m.get('result', {'_error': m.get('error')})

    def init(self):
        r = self.call('initialize', {'clientInfo': {'name': 'spike', 'title': None, 'version': '0'}, 'capabilities': {'experimentalApi': True}})
        self.notify('initialized')
        return r

    def close(self):
        self.p.terminate()


def short(o, n=600):
    s = json.dumps(o, ensure_ascii=False)
    return s if len(s) <= n else s[:n] + '…'


def step_info():
    c = Client()
    OUT['initialize'] = short(c.init())
    for m, p in [('account/read', {'refreshToken': False}), ('account/rateLimits/read', None), ('account/usage/read', None),
                 ('model/list', {}), ('skills/list', {'cwds': [WS]}), ('hooks/list', {'cwds': [WS]}),
                 ('config/read', {'includeLayers': False}), ('mcpServerStatus/list', {}), ('thread/list', {'limit': 3}),
                 ('configRequirements/read', None)]:
        r = c.call(m, p)
        OUT[m] = short(r, 900)
    # 슬래시 명령·커스텀 프롬프트 목록 전용 메서드가 있는지는 스키마(ClientRequest)에서 확인한다
    c.close()


class Mcp(http.server.BaseHTTPRequestHandler):
    calls = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))) or b'{}')
        Mcp.calls.append(body.get('method'))
        m, i = body.get('method'), body.get('id')
        if i is None:
            self.send_response(202); self.end_headers(); return
        if m == 'initialize':
            res = {'protocolVersion': body['params'].get('protocolVersion', '2025-03-26'), 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'spike', 'version': '1'}}
        elif m == 'tools/list':
            res = {'tools': [{'name': 'office_ping', 'description': 'returns pong from the office', 'inputSchema': {'type': 'object', 'properties': {}}}]}
        elif m == 'tools/call':
            res = {'content': [{'type': 'text', 'text': 'pong-from-office'}]}
        else:
            res = {}
        out = json.dumps({'jsonrpc': '2.0', 'id': i, 'result': res}).encode()
        self.send_response(200)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def start_mcp():
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), Mcp)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def step_mcpstatus():
    srv, port = start_mcp()
    c = Client(['-c', f'mcp_servers.spike.url="http://127.0.0.1:{port}/mcp"'])
    c.init()
    st = c.call('mcpServerStatus/list', {})
    sp = [d for d in st.get('data', []) if d.get('name') == 'spike']
    OUT['mcp 주입(spike 서버)'] = short(sp, 700)
    OUT['MCP 서버가 받은 호출'] = Mcp.calls
    c.close()
    srv.shutdown()


def approve(m):
    OUT.setdefault('serverRequests', []).append(m['method'])
    meth = m['method']
    if meth in ('item/commandExecution/requestApproval', 'item/fileChange/requestApproval'):
        return {'decision': 'accept'}
    if meth == 'item/permissions/requestApproval':
        return {'permissions': {}, 'scope': 'turn'}
    if meth == 'mcpServer/elicitation/request':
        return {'action': 'accept', 'content': None}
    return {}


def step_mcp_and_turn():
    srv, port = start_mcp()
    c = Client(['-c', f'mcp_servers.spike.url="http://127.0.0.1:{port}/mcp"'])
    c.init()
    st = c.call('mcpServerStatus/list', {})
    OUT['mcpServerStatus(주입)'] = short(st, 700)
    t = c.call('thread/start', {'model': os.environ.get('SPIKE_MODEL', 'gpt-5.6-luna'), 'cwd': WS, 'approvalPolicy': 'untrusted', 'sandbox': 'read-only', 'ephemeral': False})
    tid = t.get('thread', {}).get('id')
    OUT['thread/start'] = short({'id': tid, 'keys': list(t.keys())})
    OUT['_threadId'] = tid
    # 1) 명령 승인 + 파일 승인 + MCP 호출 + 토큰 알림
    prompt = ('1) run the shell command `touch approved.txt`. 2) create a file note.txt containing "hi" using apply_patch. '
              '3) call the MCP tool office_ping from server spike. Then say done.')
    r = c.call('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': prompt, 'text_elements': []}]}, on_request=approve)
    OUT['turn/start'] = short(r, 300)
    c.pump(lambda m: m.get('method') == 'turn/completed', 180, approve)
    ms = [e['method'] for e in c.events if 'method' in e]
    OUT['알림 종류'] = sorted(set(ms))
    OUT['error/warning 알림'] = [short(e['params'], 400) for e in c.events if e.get('method') in ('error', 'warning', 'turn/completed')][:4]
    tok = [e for e in c.events if e.get('method') == 'thread/tokenUsage/updated']
    OUT['thread/tokenUsage/updated'] = short(tok[-1]['params'] if tok else None, 700)
    OUT['MCP 서버가 받은 호출'] = Mcp.calls
    # 2) 턴 중단
    r = c.call('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': 'write a 2000 word essay about the sea, slowly', 'text_elements': []}]}, on_request=approve)
    turn_id = r.get('turn', {}).get('id')
    c.pump(lambda m: m.get('method') == 'item/agentMessage/delta', 60, approve)
    OUT['turn/interrupt'] = short(c.call('turn/interrupt', {'threadId': tid, 'turnId': turn_id}))
    done = c.pump(lambda m: m.get('method') == 'turn/completed', 30, approve)
    OUT['중단 후 turn/completed status'] = short(done['params']['turn'].get('status') if done else None)
    # thread/read
    OUT['thread/read(includeTurns)'] = short(c.call('thread/read', {'threadId': tid, 'includeTurns': True}), 500)
    c.close()
    srv.shutdown()


def step_resume():
    tid = OUT.get('_threadId') or (sys.argv[-1] if len(sys.argv) > 2 else None)
    c = Client()
    c.init()
    r = c.call('thread/resume', {'threadId': tid, 'excludeTurns': False})
    OUT['thread/resume(새 프로세스)'] = short({'id': r.get('thread', {}).get('id'), 'turns': len(r.get('thread', {}).get('turns', [])), 'err': r.get('_error')})
    r = c.call('thread/resume', {'threadId': tid, 'model': os.environ.get('SPIKE_MODEL', 'gpt-5.6-luna')}) and c.call('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': 'reply with the single word: resumed', 'text_elements': []}]})
    c.pump(lambda m: m.get('method') == 'turn/completed', 60)
    txt = ''.join(e['params'].get('delta', '') for e in c.events if e.get('method') == 'item/agentMessage/delta')
    OUT['resume 후 응답'] = txt[:80]
    c.close()


if 'info' in STEPS:
    step_info()
if 'mcpstatus' in STEPS:
    step_mcpstatus()
if 'mcp' in STEPS or 'turn' in STEPS:
    step_mcp_and_turn()
if 'resume' in STEPS:
    step_resume()
print(json.dumps(OUT, ensure_ascii=False, indent=1))
