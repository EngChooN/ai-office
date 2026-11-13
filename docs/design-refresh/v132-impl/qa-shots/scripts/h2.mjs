import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('직원 추가');await c.sleep(500);
const D=`(document.querySelector('[role=dialog]')||document.body)`;
const info=async(l)=>{console.log('---',l,await c.ev(`(()=>{const d=${D};const b=[...d.querySelectorAll('button')].filter(x=>/^(다음|이전|‹|일 시작하기|‹ 이전)/.test(x.innerText.trim()));return JSON.stringify({step:(d.innerText.match(/\\d \\/ 3단계/)||[])[0],btns:b.map(x=>x.innerText.trim()+(x.disabled?'[비활성]':'[활성]')),det:[...d.querySelectorAll('details')].map(x=>x.innerText.slice(0,20)+':'+x.open),inputs:[...d.querySelectorAll('input,textarea,select')].filter(x=>x.offsetParent).map(x=>(x.placeholder||x.type)+'='+x.value.slice(0,20)),txt:d.innerText.slice(0,500).replace(/\\n/g,'|')})})()`))};
await info('1 nothing selected');
console.log(await c.click('다음 ›'));await info('after 다음 w/o role');
console.log(await c.ev(`(()=>{const d=${D};const b=[...d.querySelectorAll('button')].find(x=>x.innerText.startsWith('품질 검수'));b.click();return 'picked'})()`));
await c.sleep(300);await info('role picked');
console.log(await c.click('다음 ›'));await info('step2');
c.close()
