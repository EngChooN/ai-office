import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('이 기능 시험해 줘');await c.sleep(800);
const P=`(()=>{let p=document.querySelector('textarea');for(let i=0;i<14&&p.parentElement;i++){p=p.parentElement;const r=p.getBoundingClientRect();if(r.height>500&&r.width<720)break}return p})()`;
console.log('A folder click',await c.click('일하는 곳: qa-ocue-proj'));
console.log(await c.ev(`(${P}).innerText.slice(0,300).replace(/\\n/g,'|')`));
console.log('B 소개',await c.click('소개'));
console.log(await c.ev(`(${P}).innerText.slice(0,1400).replace(/\\n/g,'|')`));
console.log(await c.ev(`JSON.stringify([...(${P}).querySelectorAll('textarea,input')].map(t=>[t.tagName,t.placeholder.slice(0,30),t.value.slice(0,60),t.disabled]))`));
c.close()
