import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
console.log(await c.click('직원'));
const t=await c.text('main')||await c.text();
console.log(t.slice(0,1500));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim()).filter(x=>/요약|확인|전체|일하는|쉬는|문제/.test(x)).slice(0,12))`));
console.log(await c.ev(`document.querySelector('[class*=summary]')?.outerHTML?.slice(0,600)`));
c.close()
