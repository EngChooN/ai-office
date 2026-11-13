import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('이 기능 시험해 줘');await c.sleep(800);
console.log(await c.ev(`(()=>{const ta=document.querySelector('textarea');if(!ta)return 'no textarea';let p=ta;for(let i=0;i<14&&p.parentElement;i++){p=p.parentElement;const r=p.getBoundingClientRect();if(r.height>500&&r.width<720)break}
return JSON.stringify({w:p.getBoundingClientRect().width,txt:p.innerText.slice(0,700).replace(/\\n/g,'|'),btns:[...p.querySelectorAll('button,[role=tab]')].filter(b=>b.offsetParent).map(b=>(b.innerText.trim()||b.getAttribute('aria-label')||b.title||'?')).slice(0,30)})})()`));
c.close()
