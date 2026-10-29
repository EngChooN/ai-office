import fs from 'node:fs'
const OUT='/Users/pc-2311001/flitto/poc/claude-office/docs/design-refresh/v3'
const keys=process.argv[2].split(','); const which=(process.argv[3]||'main,dlg').split(',')
const list = await (await fetch('http://127.0.0.1:9447/json/list')).json()
const ws = new WebSocket(list.find(p=>p.type==='page').webSocketDebuggerUrl)
let id=0;const pend=new Map()
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m)}}
await new Promise(r=>ws.onopen=r)
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))})
const ev=async(x)=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
const esc=async()=>{for(const t of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type:t,key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
const shot=async(f,clip)=>{await sleep(500);const r=await send('Page.captureScreenshot',clip?{format:'png',clip:{x:400,y:150,width:640,height:270,scale:2}}:{format:'png'});fs.writeFileSync(f,Buffer.from(r.result.data,'base64'))}
const inject=async(css,mode)=>ev(`(()=>{let s=document.getElementById('v3css');if(!s){s=document.createElement('style');s.id='v3css';document.head.appendChild(s)};s.textContent=${JSON.stringify(css)};${mode?`document.documentElement.setAttribute('data-theme','${mode}')`:`document.documentElement.removeAttribute('data-theme')`};return 1})()`)
await esc(); await sleep(400)
for(const k of keys){
  const css = k==='base' ? '' : fs.readFileSync(`${OUT}/theme-${k}.css`,'utf8')
  for(const mode of (k==='base'?['x']:['light','dark'])){
    await inject(css, k==='base'?null:mode)
    if(which.includes('main')) await shot(`/tmp/v3-work/shots/${k}-${mode}-main.png`)
    if(which.includes('dlg')){
      await ev(`(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.includes('비서'));b&&b.click();return 1})()`)
      await sleep(600); await shot(`/tmp/v3-work/shots/${k}-${mode}-dlg.png`,true)
      await esc(); await sleep(400)
    }
  }
}
await inject('',null)
process.exit(0)
