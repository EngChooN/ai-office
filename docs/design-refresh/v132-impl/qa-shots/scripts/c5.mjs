import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
console.log(await c.ev(`(()=>{const vis=[...document.querySelectorAll('[data-room-item]')].filter(e=>e.offsetParent);vis[0].focus();const r=[];
for(const k of ['ArrowDown','ArrowDown','ArrowDown','ArrowDown','ArrowDown','ArrowUp','ArrowUp','ArrowUp','ArrowUp','ArrowUp']){document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));r.push((k==='ArrowDown'?'↓':'↑')+document.activeElement.innerText.split('\\n')[0])}return r.join(' ')})()`));
c.close()
