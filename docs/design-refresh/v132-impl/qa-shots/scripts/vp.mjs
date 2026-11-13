// usage: vp.mjs <w> <h> <light|dark> ; sets viewport emulation + theme
const [w,h,mode]=process.argv.slice(2);
const list=await fetch('http://127.0.0.1:9461/json').then(r=>r.json());
const t=list.find(x=>x.type==='page'&&!x.url.includes('view=pet'));
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const p=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);p.get(m.id)?.(m)};
const send=(method,params={})=>new Promise(r=>{p.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
if(w==='reset')await send('Emulation.clearDeviceMetricsOverride');
else await send('Emulation.setDeviceMetricsOverride',{width:+w,height:+h,deviceScaleFactor:1,mobile:false});
if(mode)await send('Runtime.evaluate',{expression:`document.documentElement.dataset.mode='${mode}'`});
process.exit(0)
