import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
await c.click('직원');await c.click('이 기능 시험해 줘');await c.sleep(800);
console.log('more',await c.click('더 보기'));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('[role=menu],[role=menuitem]')].map(e=>e.innerText.trim()))`));
await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
console.log('folder',await c.click('일하는 곳: qa-ocue-proj'));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('[role=tooltip],[role=dialog],[role=status]')].map(e=>e.innerText.slice(0,200)))+' title='+[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('일하는 곳'))?.title`));
console.log('intro',await c.click('소개'));
console.log(await c.ev(`(()=>{const ta=[...document.querySelectorAll('textarea')];return JSON.stringify(ta.map(t=>[t.placeholder.slice(0,40),t.value.slice(0,80),t.disabled,t.readOnly]))+'||'+document.body.innerText.split('소개')[2]?.slice(0,900).replace(/\\n/g,'|')})()`));
c.close()
