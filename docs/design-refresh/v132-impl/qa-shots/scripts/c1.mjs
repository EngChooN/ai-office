import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
console.log(await nav('대화'));await c.sleep(900);
console.log(await c.ev(`JSON.stringify({tabs:[...document.querySelectorAll('[role=tablist]')].map(t=>[t.getBoundingClientRect().top|0,t.innerText.replace(/\\n/g,'/')]),items:[...document.querySelectorAll('[data-room-item]')].map(e=>e.innerText.replace(/\\n/g,' ').slice(0,40)+'|'+['aria-current','aria-selected','data-active','data-selected'].map(a=>e.getAttribute(a)).join(',')),txt:document.body.innerText.slice(150,700).replace(/\\n/g,'|')})`));
c.close()
