import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
const key=async(k,code,vk)=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await c.sleep(150)};
await key('Escape','Escape',27);
console.log('dialog open?',await c.ev(`!!document.querySelector('[role=dialog]')`));
const vis=`[...document.querySelectorAll('[data-room-item]')].filter(e=>e.offsetParent)`;
const act=()=>c.ev(`document.activeElement?.innerText?.replace(/\\n/g,' ').slice(0,20)`);
await c.ev(`${vis}[0].focus()`);
const seq=[await act()];for(let i=0;i<5;i++){await key('ArrowDown','ArrowDown',40);seq.push(await act())}
for(let i=0;i<5;i++){await key('ArrowUp','ArrowUp',38);seq.push(await act())}
console.log('keys',JSON.stringify(seq));
// collapse list -> 56px strip w/ meeting badge
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/접|펼|고정|목록/.test((b.getAttribute('aria-label')||'')+b.title)).map(b=>b.getAttribute('aria-label')||b.title))`));
c.close()
