#!/bin/zsh
# 사용: shot.sh 이름 "쿼리" 폭 높이  — 정확한 폭을 위해 같은 크기의 iframe 안에 띄운다
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W=/Users/pc-2311001/claude-office-mockups/pc-layout/wrap
mkdir -p $W
cat > $W/$1.html <<H
<html><body style="margin:0;background:#000"><iframe src="http://localhost:5199/harness.html?$2" style="border:0;width:${3}px;height:${4}px;display:block"></iframe></body></html>
H
"$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=$3,$4 --virtual-time-budget=20000 --user-data-dir=/tmp/co3-$1-$RANDOM --screenshot=/Users/pc-2311001/claude-office-mockups/pc-layout/raw/$1.png "http://localhost:5199/@fs$W/$1.html" 2>&1 | grep -o 'written.*'
