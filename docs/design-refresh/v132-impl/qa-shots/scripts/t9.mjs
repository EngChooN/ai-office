import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('이 기능 시험해 줘');await c.sleep(800);
console.log(await c.click('더 보기'));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/터미널|이어/.test(b.innerText)).map(b=>[b.innerText,b.disabled,b.getAttribute('role')]))`));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/^(고치기|저장|취소)$/.test(b.innerText.trim())).map(b=>b.innerText))`));
console.log(await c.click('소개'));
console.log(await c.click('고치기'));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('textarea')].map(t=>[t.placeholder.slice(0,30),t.value.slice(0,40),t.disabled]))+document.body.innerText.match(/업무 지침[\\s\\S]{0,300}/)?.[0].replace(/\\n/g,'|')`));
c.close()
