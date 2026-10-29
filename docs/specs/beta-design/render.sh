#!/bin/sh
# 시안 HTML → PNG (크롬 헤드리스, 2배). 사용: sh docs/specs/beta-design/render.sh
cd "$(dirname "$0")" || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor="$4" --window-size="$2,$3" --screenshot="$PWD/$5" "file://$PWD/$1" 2>/dev/null; }
shot onboarding-flow.html 1920 1080 1 onboarding-flow.png
shot hero.html 1280 800 1 hero-desktop.png
shot hero-mobile.html 390 844 2 hero-mobile.png
shot gif-spec.html 1760 720 1 gif-spec.png
