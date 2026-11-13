import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원'); 
console.log(await c.click('이 기능 시험해 줘'));
for(const ms of [300,1500]){await c.sleep(ms);
console.log(await c.ev(`JSON.stringify({inputs:[...document.querySelectorAll('[contenteditable],textarea,input')].map(t=>[t.tagName,t.offsetParent!==null,t.placeholder,t.value||t.innerText]), head:document.body.innerText.slice(0,200).replace(/\\n/g,'|')})`));}
c.close()
