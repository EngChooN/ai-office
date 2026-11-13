import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');
console.log('open',await c.click('직원 추가'));
await c.sleep(500);
const dlg=`(document.querySelector('[role=dialog]')||document.body)`;
const dump=async(l)=>{console.log('---',l);console.log(await c.ev(`${dlg}.innerText.slice(0,900).replace(/\\n/g,'|')`));console.log(await c.ev(`JSON.stringify([...${dlg}.querySelectorAll('button,input,select')].filter(b=>b.offsetParent).map(b=>(b.innerText||b.placeholder||b.value||'').trim().slice(0,14)+(b.disabled?'[X]':'')).slice(0,40))`))};
await dump('step1');
c.close()
