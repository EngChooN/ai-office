import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('직원 추가');await c.sleep(500);
const D=`(document.querySelector('[role=dialog]')||document.body)`;
const btn=(re)=>c.ev(`JSON.stringify([...${D}.querySelectorAll('button')].filter(x=>x.offsetParent&&${re}.test(x.innerText)).map(x=>x.innerText.trim().slice(0,14)+(x.disabled?'[X]':'[O]')))`);
const pick=(t)=>c.ev(`[...${D}.querySelectorAll('button')].find(b=>b.innerText.startsWith(${JSON.stringify(t)})).click()`);
await pick('자유 직무');await c.sleep(300);
console.log('free role',await btn(/다음|일 시작/), await c.ev(`${D}.innerText.slice(0,300).replace(/\\n/g,'|')`));
await pick('품질 검수');await c.click('다음 ›');
await c.ev(`(()=>{const i=${D}.querySelector('input[placeholder^="예"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'QA테스트');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await c.click('다음 ›');await c.sleep(300);
await c.click('폴더 정하기');await c.sleep(300);
console.log('folder mode',await btn(/일 시작|이전/),await c.ev(`${D}.innerText.slice(100,500).replace(/\\n/g,'|')`));
await c.click('자세히 설정');await c.sleep(400);
console.log('detail',await c.ev(`${D}.innerText.slice(100,1400).replace(/\\n/g,'|')`));
c.close()
