#!/bin/bash
# QA용 개발 앱 실행·종료 (직원 셸에서 쓴다). 자세한 사용법: docs/qa-dev-app.md
#   scripts/qa-start.sh start  <이름> [--cdp 9450] [--vite 5190]
#   scripts/qa-start.sh stop   <이름>
#   scripts/qa-start.sh status <이름>
# 이름마다 데이터 폴더(~/claude-office-qa-<이름>)·PID 파일·로그가 따로라, 다른 사람이 띄운 앱에 영향이 없다. pkill은 쓰지 않는다.
set -u
CMD="${1:-}"; NAME="${2:-}"
[ -n "$CMD" ] && [ -n "$NAME" ] || { sed -n 2,6p "$0"; exit 2; }
shift 2
CDP=9450; VITE=5190
while [ $# -gt 0 ]; do
  case "$1" in
    --cdp) CDP="$2"; shift 2;;
    --vite) VITE="$2"; shift 2;;
    *) echo "알 수 없는 인자: $1"; exit 2;;
  esac
done
case "$NAME" in *[!A-Za-z0-9_-]*) echo "이름은 영문·숫자·-_ 만 쓰세요"; exit 2;; esac

APP="$(cd "$(dirname "$0")/.." && pwd)"
STATE="/tmp/aioqa-$NAME"
PIDFILE="$STATE.pid"; LOG="$STATE.log"
DATA="$HOME/claude-office-qa-$NAME"

# node가 PATH에 없는 셸 대비: nvm의 가장 높은 버전을 앞에 붙인다
if ! command -v node >/dev/null 2>&1; then
  NODE_DIR="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_DIR" ] && export PATH="$NODE_DIR:$PATH"
fi
# electron-forge가 시작할 때 pnpm --version을 확인한다
command -v pnpm >/dev/null 2>&1 || { [ -x "$HOME/Library/pnpm/pnpm" ] && export PATH="$HOME/Library/pnpm:$PATH"; }
command -v node >/dev/null 2>&1 || { echo "node를 찾지 못했어요"; exit 1; }

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
# PID와 그 자손 PID를 모두 나열 (electron-forge가 Electron·vite를 별도 세션으로 띄워 그룹 종료로는 안 꺼진다)
tree() { local p; echo "$1"; for p in $(ps -axo pid=,ppid= | awk -v P="$1" '$2==P{print $1}'); do tree "$p"; done; }
port_free() { node -e "const s=require('net').createServer();s.on('error',()=>process.exit(1));s.listen($1,'127.0.0.1',()=>s.close(()=>process.exit(0)))"; }

case "$CMD" in
  start)
    alive && { echo "이미 실행 중 (pid $(cat "$PIDFILE"))"; exit 0; }
    for P in $CDP $VITE; do port_free "$P" || { echo "포트 $P 를 쓸 수 없어요 (사용 중이거나 막힘). --cdp/--vite로 다른 포트를 주세요"; exit 1; }; done
    mkdir -p "$DATA"
    # 새 세션(setsid)으로 띄워 셸·턴이 끝나도 꺼지지 않게 한다
    cd "$APP" && AI_OFFICE_USER_DATA="$DATA" AI_OFFICE_VITE_PORT="$VITE" \
      nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' \
      node_modules/.bin/electron-forge start -- --remote-debugging-port="$CDP" > "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 120); do
      alive || { echo "실행 실패. 로그: $LOG"; tail -15 "$LOG"; rm -f "$PIDFILE"; exit 1; }
      if curl -fs "http://127.0.0.1:$CDP/json/version" >/dev/null 2>&1; then
        echo "실행됨: pid $(cat "$PIDFILE"), CDP http://127.0.0.1:$CDP, vite $VITE, 데이터 $DATA, 로그 $LOG"; exit 0
      fi
      sleep 1
    done
    echo "120초 안에 준비되지 않았어요. 로그: $LOG"; tail -15 "$LOG"; exit 1;;
  stop)
    alive || { echo "실행 중이 아니에요"; rm -f "$PIDFILE"; exit 0; }
    PID="$(cat "$PIDFILE")"
    PIDS="$(tree "$PID")"
    kill -TERM $PIDS 2>/dev/null
    for _ in $(seq 1 20); do kill -0 $PIDS 2>/dev/null || break; sleep 0.5; done
    kill -KILL $PIDS 2>/dev/null
    rm -f "$PIDFILE"; echo "종료됨";;
  status)
    if alive; then echo "실행 중 (pid $(cat "$PIDFILE"))"; else echo "실행 중이 아니에요"; fi;;
  *) sed -n 2,6p "$0"; exit 2;;
esac
