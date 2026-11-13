import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
console.log(await c.click('이 기능 시험해 줘'));
await c.sleep(800);
console.log(await c.ev(`JSON.stringify({ta:[...document.querySelectorAll('textarea,input[type=text]')].map(t=>[t.offsetParent!==null,t.placeholder,t.value]), dialogs:[...document.querySelectorAll('[role=dialog],aside')].map(d=>d.innerText.slice(0,200))})`));
c.close()
