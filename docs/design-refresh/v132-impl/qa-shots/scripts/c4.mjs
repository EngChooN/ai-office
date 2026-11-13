import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
console.log(await c.ev(`(()=>{const d=document.querySelector('[role=dialog]');const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='닫기'||x.getAttribute('aria-label')==='닫기');b.click();return b.outerHTML.slice(0,80)})()`));await c.sleep(500);
console.log('dialog open?',await c.ev(`!!document.querySelector('[role=dialog]')`));
const key=async(k,code,vk)=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await c.sleep(150)};
const vis=`[...document.querySelectorAll('[data-room-item]')].filter(e=>e.offsetParent)`;
const act=()=>c.ev(`document.activeElement?.innerText?.replace(/\\n/g,' ').slice(0,20)`);
await c.ev(`${vis}[0].focus()`);
const seq=[await act()];for(let i=0;i<5;i++){await key('ArrowDown','ArrowDown',40);seq.push(await act())}
for(let i=0;i<5;i++){await key('ArrowUp','ArrowUp',38);seq.push(await act())}
console.log('keys',JSON.stringify(seq));
c.close()
