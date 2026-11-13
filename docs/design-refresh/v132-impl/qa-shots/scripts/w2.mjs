import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
const find=(wd)=>c.ev(`JSON.stringify([...document.querySelectorAll('*')].filter(e=>e.offsetParent&&e.children.length===0&&e.innerText&&e.innerText.includes(${JSON.stringify(wd)})).slice(0,4).map(e=>e.tagName+'.'+(e.className+'').slice(0,40)+' <'+e.parentElement.innerText.slice(0,60).replace(/\\n/g,'|')+'>'))`);
await nav('사무실');await c.sleep(500);console.log('office 작업 중',await find('작업 중'));
await nav('직원');await c.sleep(500);console.log('staff 작업 중',await find('작업 중'));
await nav('팀 구성');await c.sleep(500);console.log('org 조직도',await find('조직도'));
console.log('org text',(await c.text('main')||'').slice(0,300).replace(/\n/g,'|'));
c.close()
