// tokens.css + contrast.md + themes.json 생성기. 실행: node gen.mjs
import fs from 'node:fs'
const hex2rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
const rgb2hex=r=>'#'+r.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase()
const lum=h=>{const [r,g,b]=hex2rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b}
const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function rgb2hsl([r,g,b]){r/=255;g/=255;b/=255;const M=Math.max(r,g,b),m=Math.min(r,g,b),l=(M+m)/2;let h=0,s=0;if(M!==m){const d=M-m;s=l>.5?d/(2-M-m):d/(M+m);h=M===r?(g-b)/d+(g<b?6:0):M===g?(b-r)/d+2:(r-g)/d+4;h*=60}return [h,s,l]}
function hsl2hex([h,s,l]){const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};return rgb2hex([f(0)*255,f(8)*255,f(4)*255])}
const rehue=(hx,hue)=>{const [,s,l]=rgb2hsl(hex2rgb(hx));return hsl2hex([hue,s,l])}
const shiftL=(hx,d)=>{const [h,s,l]=rgb2hsl(hex2rgb(hx));return hsl2hex([h,s,Math.max(0,Math.min(1,l+d))])}
// 대비가 min 이상이 될 때까지 fg 명도를 이동
function ensure(fg,bgs,min,dir){let c=fg;for(let i=0;i<100&&bgs.some(b=>cr(c,b)<min);i++)c=shiftL(c,dir*.01);return c}

// 라벤더 기준 팔레트(시안 v3 그대로) — 다른 테마는 이 중립색의 색조(hue)만 바꾼다
const LAV={light:{background:'#F6F5FB',foreground:'#221F33',card:'#FFFFFF',secondary:'#ECEAF6',muted:'#ECEAF6','muted-foreground':'#66627F',accent:'#E9E6FA',border:'#DEDAF0',input:'#CFCAE6',chrome:'#FBFAFF',sidebar:'#EFEDF8'},
 dark:{background:'#14131C',foreground:'#EDEBF8',card:'#201F2D',secondary:'#292739',muted:'#292739','muted-foreground':'#A7A3C4',accent:'#302D47',border:'#34314A',input:'#413E5C',chrome:'#181723',sidebar:'#100F17'}}
const THEMES=[
 {id:'lavender',name:{ko:'라벤더',en:'Lavender',ja:'ラベンダー',zh:'薰衣草'},hue:null,lp:'#6C5CE7',dp:'#9B8CFF',ring:['#8B7BFF','#9B8CFF'],spark:'#FF7AC6',swatch:'#6C5CE7'},
 {id:'blue',name:{ko:'스카이',en:'Sky',ja:'スカイ',zh:'天空'},hue:218,lp:'#2F6BFF',dp:'#6C9BFF',ring:['#5B8CFF','#6C9BFF'],spark:'#35D0E0'},
 {id:'terracotta',name:{ko:'노을',en:'Sunset',ja:'夕焼け',zh:'晚霞'},hue:28,lp:'#C9551F',dp:'#F08A4B',ring:['#E07A3F','#F08A4B'],spark:'#FFB35C'},
 {id:'sage',name:{ko:'숲속',en:'Moss',ja:'モス',zh:'苔绿'},hue:150,lp:'#1B7F53',dp:'#4FD6A0',ring:['#2FA374','#4FD6A0'],spark:'#C8E86A'},
 {id:'rose',name:{ko:'벚꽃',en:'Blossom',ja:'ブロッサム',zh:'樱花'},hue:340,lp:'#D6336C',dp:'#FF7FA8',ring:['#F0608F','#FF7FA8'],spark:'#FFA45C'},
]
const AB={lavender:{a:['#0B7FBF','#5CC8FF'],b:['#6C5CE7','#B6A8FF']},blue:{a:['#0A8A9E','#4FD8E8'],b:['#7A4FE0','#B79CFF']},terracotta:{a:['#B8570E','#FFB35C'],b:['#1F7A8C','#5CC8D8']},sage:{a:['#0E7C86','#5CD6C8'],b:['#7E57C2','#C3A6FF']},rose:{a:['#7C3AED','#B79CFF'],b:['#0F7C9C','#5CC8E8']}}
const STATUS={light:{working:'#1C7C46',waiting:'#9A5B00',idle:'#6B6B62',error:'#C42B2B'},dark:{working:'#4ADE80',waiting:'#F2C94C',idle:'#9A98AC',error:'#FF6B6B'}}
const DESTR={light:'#C42B2B',dark:'#FF6B6B'}
const GRAD={"lavender":["#8B7BFF","#FF7AC6"], "blue":["#6C9BFF","#35D0E0"], "terracotta":["#FFB35C","#E0642A"], "sage":["#C8E86A","#1F9A68"], "rose":["#FF9AB8","#D6336C"]}
const rows=[],out=[]
const mix=(a,b,w)=>{const x=hex2rgb(a),y=hex2rgb(b);return rgb2hex(x.map((v,i)=>v*w+y[i]*(1-w)))}
const rgba=(hx,a)=>`rgba(${hex2rgb(hx).join(',')},${a})`
const sw=[]
for(const t of THEMES){
 for(const mode of ['light','dark']){
  const base=LAV[mode];const P={}
  for(const k in base)P[k]=t.hue==null?base[k]:rehue(base[k],t.hue)
  // 글자색 대비 보정
  const L=mode==='light'
  P['muted-foreground']=ensure(P['muted-foreground'],[P.muted,P.background,P.card,P.accent],4.6,L?-1:1)
  let primary=L?t.lp:t.dp
  const pf=L?'#FFFFFF':shiftL(rehue('#1A1240',t.hue??250),0)
  primary=ensure(primary,[pf],4.6,L?-1:1) // light: 어둡게, dark: 밝게(pf가 어두우므로 +)
  const ring=L?ensure(t.ring[0],[P.background,P.card],3.1,-1):t.ring[1]
  const fg=P.foreground
  const v={background:P.background,foreground:fg,card:P.card,'card-foreground':fg,popover:P.card,'popover-foreground':fg,primary,'primary-foreground':pf,secondary:P.secondary,'secondary-foreground':fg,muted:P.muted,'muted-foreground':P['muted-foreground'],accent:P.accent,'accent-foreground':fg,destructive:DESTR[mode],'destructive-foreground':L?'#FFFFFF':ensure('#2A0A0A',[DESTR[mode]],4.6,-1),border:P.border,input:P.input,ring}
  const spark=t.spark
  const aa=ensure(AB[t.id].a[L?0:1],[v.card,v.background,v.muted,v.accent],4.6,L?-1:1),ab=ensure(AB[t.id].b[L?0:1],[v.card,v.background,v.muted,v.accent],4.6,L?-1:1)
  const gEnd=ensure(mix(primary,spark,.55),[pf],4.6,L?-1:1)
  const extra={ 'grad-primary-end':gEnd,'accent-a':aa,'accent-b':ab,'surface-chrome':P.chrome,'surface-sidebar':P.sidebar,'hud':L?'rgba(255,255,255,.92)':rgba(P.card,.92),'hud-foreground':fg,'hud-border':P.border,
   'spark-from':primary,'spark-to':spark,'shadow-color':L?rgba(primary,.28):'rgba(0,0,0,.6)',
   'status-working':STATUS[mode].working,'status-waiting':STATUS[mode].waiting,'status-idle':STATUS[mode].idle,'status-error':STATUS[mode].error}
  out.push(`[data-theme='${t.id}'][data-mode='${mode}'] {\n  color-scheme: ${mode};\n`+Object.entries({...v,...extra}).map(([k,x])=>`  --${k}: ${x};`).join('\n')+'\n}\n')
  {
   const chk=(label,a,b,min)=>rows.push({t:t.id,mode,label,a,b,r:cr(a,b),min})
   for(let i=0;i<=10;i++)chk(`기본 버튼 그라데이션 ${i*10}% 지점 / 버튼 글자`,pf,mix(primary,gEnd,1-i/10),4.5)
   chk('destructive 버튼 글자 / destructive 배경',v['destructive-foreground'],v.destructive,4.5)
   chk('구분색 accent-a / 카드',aa,v.card,4.5);chk('구분색 accent-b / 카드',ab,v.card,4.5);chk('구분색 accent-a / 배경',aa,v.background,4.5);chk('구분색 accent-b / 배경',ab,v.background,4.5)
   if(L){
   chk('본문 글자 / 배경',fg,v.background,4.5);chk('본문 글자 / 카드',fg,v.card,4.5)
   chk('보조 글자 / 배경',v['muted-foreground'],v.background,4.5);chk('보조 글자 / 카드',v['muted-foreground'],v.card,4.5);chk('보조 글자 / muted',v['muted-foreground'],v.muted,4.5)
   chk('보조 글자 / 사이드바',v['muted-foreground'],P.sidebar,4.5)
   chk('버튼 글자 / primary',pf,primary,4.5);chk('primary 글자 / 카드',primary,v.card,4.5)
   chk('글자 / 활성메뉴(accent)',fg,v.accent,4.5)
   for(const s of ['working','waiting','idle','error'])chk(`상태 ${s} / 카드`,STATUS.light[s],v.card,4.5)
   chk('destructive / 카드',DESTR.light,v.card,4.5)
   chk('포커스 링 / 배경 (비텍스트)',ring,v.background,3)
   } else {
   chk('본문 글자 / 배경',fg,v.background,4.5);chk('본문 글자 / 카드',fg,v.card,4.5)
   chk('보조 글자 / 배경',v['muted-foreground'],v.background,4.5);chk('보조 글자 / 카드',v['muted-foreground'],v.card,4.5);chk('보조 글자 / muted',v['muted-foreground'],v.muted,4.5)
   chk('보조 글자 / 사이드바',v['muted-foreground'],P.sidebar,4.5)
   chk('버튼 글자 / primary',pf,primary,4.5);chk('primary 글자 / 카드',primary,v.card,4.5)
   chk('글자 / 활성메뉴(accent)',fg,v.accent,4.5)
   for(const s of ['working','waiting','idle','error'])chk(`상태 ${s} / 카드`,STATUS.dark[s],v.card,4.5)
   chk('destructive / 카드',DESTR.dark,v.card,4.5)
   chk('포커스 링 / 배경 (비텍스트)',ring,v.background,3)
   }
  }
  if(mode==='light'&&t.id)sw.push(0)
 }
 t.swatch=t.swatch||(t.lp)
}
const dark=[]
// 다크도 참고용으로 같은 검사
const shared=`/* AI Office 테마 토큰 — 라벤더 소프트 컴포넌트 모양 + 색 테마 ${THEMES.length}종 × 라이트·다크
   구조: (1) :root 공통 모양 토큰(모든 테마 공유)  (2) [data-theme][data-mode] 색 변수.
   색은 hex 로 둔다(oklch 기존 값과 같은 역할). 사무실(Phaser) 캔버스 색은 이 파일에 없다.
   기본: data-theme='lavender', data-mode 는 설정이 '시스템'이면 prefers-color-scheme 로 정함. */

:root {
  /* 모서리 */
  --radius: 18px;                              /* shadcn 기준(카드·입력창) */
  --radius-pill: 999px;                        /* 버튼·칩·메뉴 항목 */
  --radius-card: var(--radius);
  --radius-hud: calc(var(--radius) + 2px);     /* 지도 위 패널 */
  --radius-dialog: calc(var(--radius) + 6px);
  /* 그림자 */
  --shadow-soft: 0 10px 28px -10px var(--shadow-color);
  --shadow-primary: 0 6px 16px -6px color-mix(in oklab, var(--primary) 70%, transparent);
  --shadow-dialog: var(--shadow-soft), 0 24px 60px -20px rgba(0,0,0,.5);
  /* 포커스 링 */
  --focus-ring: 0 0 0 4px color-mix(in oklab, var(--ring) 24%, transparent);
  --focus-border: var(--ring);
  /* 그라데이션(스파클): 주요 버튼·활성 메뉴·비서 버튼 테두리·대화상자 빛 */
  --grad-primary: linear-gradient(135deg, var(--spark-from), var(--grad-primary-end));
  --grad-border: linear-gradient(135deg, var(--ring), var(--spark-to));
  --grad-nav-active: linear-gradient(90deg, color-mix(in oklab, var(--ring) 22%, transparent), transparent);
  --grad-dialog-glow: radial-gradient(120% 60% at 50% -10%, color-mix(in oklab, var(--ring) 16%, transparent), transparent 70%);
  /* 버튼·칩 모양 */
  --button-font-weight: 500;
  --button-border-width: 1px;
  --chip-bg: var(--secondary);
  --chip-bg-hover: var(--accent);
  --chip-border: var(--border);
  --nav-active-font-weight: 600;
  --backdrop-blur: blur(10px);
  --overlay-bg: rgba(30,24,40,.38);
  --transition-fast: .15s;
}
[data-mode='dark'] { --overlay-bg: rgba(0,0,0,.62); }

`
const swCss='/* 설정 화면 색 테마 카드 견본(원형): 활성 테마와 무관하게 5개를 동시에 그린다. 라이트·다크 공통 */\n'+THEMES.map(t=>`.theme-swatch[data-swatch='${t.id}'] { background: linear-gradient(135deg, ${GRAD[t.id][0]}, ${GRAD[t.id][1]}); }`).join('\n')+'\n\n'
fs.writeFileSync('tokens.css',shared+swCss+out.join('\n'))
const fail=rows.filter(r=>r.r<r.min)
let md=`# 테마 글자·배경 대비 (WCAG AA) — 라이트·다크\n\n기준: 글자 4.5:1 이상, 포커스 링 등 비텍스트 3:1 이상. 자동 계산(gen.mjs). 모두 통과: **${fail.length===0?'예':'아니오 ('+fail.length+'건 미달)'}**\n\n`
for(const t of THEMES){for(const m of ['light','dark']){md+=`## ${t.name.ko} (${t.id}) · ${m==='light'?'라이트':'다크'}\n| 항목 | 글자/전경 | 배경 | 대비 | 기준 | 결과 |\n|---|---|---|---|---|---|\n`
 for(const r of rows.filter(r=>r.t===t.id&&r.mode===m))md+=`| ${r.label} | ${r.a} | ${r.b} | ${r.r.toFixed(2)} | ${r.min} | ${r.r>=r.min?'통과':'**미달**'} |\n`;md+='\n'}}
fs.writeFileSync('contrast.md',md)
const meta=THEMES.map(t=>{const g=m=>out.find(o=>o.startsWith(`[data-theme='${t.id}'][data-mode='${m}']`));const pick=(s,k)=>s.match(new RegExp(`--${k}: (#[0-9A-F]+)`))[1]
 return {id:t.id,name:t.name,gradient:{from:GRAD[t.id][0],to:GRAD[t.id][1],angle:135},accent:{light:{a:pick(g('light'),'accent-a'),b:pick(g('light'),'accent-b')},dark:{a:pick(g('dark'),'accent-a'),b:pick(g('dark'),'accent-b')}},swatch:{light:pick(g('light'),'primary'),dark:pick(g('dark'),'primary'),spark:t.spark,lightBg:pick(g('light'),'background'),darkBg:pick(g('dark'),'background')}}})
fs.writeFileSync('themes.json',JSON.stringify({default:'lavender',themes:meta},null,2))
console.log('fail',fail.map(r=>[r.t,r.label,r.r.toFixed(2)]))
