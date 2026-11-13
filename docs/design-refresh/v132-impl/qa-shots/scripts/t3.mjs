import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
const cnt=()=>c.ev(`document.querySelectorAll('[data-staff-card], article').length`);
console.log('cards',await cnt());
// summary filter
console.log(await c.click('4명 일하는 중'));
console.log('after 일하는 중 filter', (await c.text('main')||'').split('\n').slice(0,12).join('|'));
console.log(await c.ev(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/^(전체|일하는|쉬는|대표님)/.test(b.innerText)).map(b=>b.innerText.trim()+':'+b.getAttribute('aria-pressed')).join(' / ')`));
console.log(await c.click('13명 쉬는 중'));
console.log('rest', (await c.text('main')).split('\n').filter(x=>/^(일하는 중|쉬는 중)$/.test(x)).length, (await c.text('main')).includes('일하는 중\n'));
console.log(await c.click('전체 17'));
// example click
console.log(await c.click('이 기능 시험해 줘'));
await c.sleep(600);
console.log(await c.ev(`JSON.stringify([document.activeElement?.tagName, document.activeElement?.value||document.activeElement?.innerText, location.hash, [...document.querySelectorAll('textarea')].filter(t=>t.offsetParent).map(t=>t.value)])`));
console.log((await c.text()).slice(0,600));
c.close()
