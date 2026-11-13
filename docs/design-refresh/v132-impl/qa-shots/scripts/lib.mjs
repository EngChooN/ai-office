import fs from 'fs'
const SH='/Users/pc-2311001/flitto/poc/claude-office/docs/design-refresh/v132-impl/qa-shots/'
export async function connect(){
 const list=await fetch('http://127.0.0.1:9461/json').then(r=>r.json());
 const t=list.find(x=>x.type==='page'&&!x.url.includes('view=pet'));
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const p=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);p.get(m.id)?.(m)};
 const send=(method,params={})=>new Promise(r=>{p.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
 const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r.result?.result?.value??r.result?.exceptionDetails?.text};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 return {
  send,ev,sleep,
  async vp(w,h=860,mode){await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});if(mode)await ev(`document.documentElement.dataset.mode='${mode}'`);await sleep(400)},
  async click(text,sel='button,[role=tab],a,[role=menuitem],[role=button],summary,label'){
    const r=await ev(`(()=>{const t=${JSON.stringify(text)};const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent!==null&&((e.innerText||'').trim()===t||(e.getAttribute('aria-label')||'')===t||(e.title||'')===t));if(!els.length)return 'NONE';els[0].click();return 'ok'})()`);await sleep(500);return r},
  async shot(name){const {result}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(SH+name+'.png',Buffer.from(result.data,'base64'))},
  text:(sel='body')=>ev(`document.querySelector(${JSON.stringify(sel)})?.innerText`),
  close(){ws.close();process.exit(0)}
 }
}
