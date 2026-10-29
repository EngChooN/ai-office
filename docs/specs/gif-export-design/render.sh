#!/bin/sh
# 시안 HTML → PNG (크롬 헤드리스). 사용: sh docs/specs/gif-export-design/render.sh
cd "$(dirname "$0")" || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --window-size="$2,$3" --screenshot="$PWD/$4" "file://$PWD/$1" 2>/dev/null; }
shot wm-variants.html 1780 1590 wm-variants.png
shot export-flow.html 1780 1110 export-flow.png
