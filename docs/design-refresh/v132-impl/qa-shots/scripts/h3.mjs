import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('직원 추가');await c.sleep(500);
const D=`(document.querySelector('[role=dialog]')||document.body)`;
console.log('selected role btns',await c.ev(`JSON.stringify([...${D}.querySelectorAll('button')].filter(b=>b.getAttribute('aria-pressed')==='true'||b.getAttribute('aria-checked')==='true'||b.dataset.state==='on'||b.className.includes('border-primary')).map(b=>b.innerText.split('\\n')[0]))`));
await c.click('다음 ›');
await c.ev(`(()=>{const i=${D}.querySelector('input[placeholder^="예"]');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,'QA테스트');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await c.sleep(300);
console.log(await c.ev(`JSON.stringify([...${D}.querySelectorAll('button')].filter(x=>/다음|이전/.test(x.innerText)).map(x=>x.innerText+(x.disabled?'[X]':'[O]')))`));
await c.click('다음 ›');await c.sleep(400);
console.log(await c.ev(`(()=>{const d=${D};return JSON.stringify({step:(d.innerText.match(/\\d \\/ 3단계/)||[])[0],btns:[...d.querySelectorAll('button')].filter(x=>x.offsetParent).map(x=>x.innerText.trim().slice(0,16)+(x.disabled?'[X]':'')),det:[...d.querySelectorAll('details')].map(x=>x.innerText.slice(0,16)+':'+x.open),txt:d.innerText.slice(0,900).replace(/\\n/g,'|')})})()`));
c.close()
