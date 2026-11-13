import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
await nav('대화');await c.sleep(600);
const vis=`[...document.querySelectorAll('[data-room-item]')].filter(e=>e.offsetParent)`;
console.log(await c.ev(`JSON.stringify(${vis}.map(e=>[e.innerText.replace(/\\n/g,' '),e.tagName,Math.round(e.getBoundingClientRect().x),e.getBoundingClientRect().width|0, e.className.includes('accent')||e.className.includes('bg-primary')]))`));
console.log(await c.ev(`(()=>{const m=${vis}.find(e=>e.innerText.includes('회의실'));m.click();return 1})()`));await c.sleep(900);
console.log(await c.ev(`JSON.stringify({vis:${vis}.map(e=>e.innerText.replace(/\\n/g,' ')+'|'+e.className.split(' ').filter(x=>/accent|primary|bg-/.test(x)).join(',')),top:[...document.querySelectorAll('[role=tablist]')].map(t=>[t.getBoundingClientRect().top|0,t.innerText.replace(/\\n/g,'/')]),txt:document.body.innerText.slice(150,600).replace(/\\n/g,'|')})`));
// arrow keys
const act=()=>c.ev(`document.activeElement?.innerText?.replace(/\\n/g,' ').slice(0,30)`);
await c.ev(`${vis}[0].focus()`);
const key=async(k,code,vk)=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await c.sleep(150)};
const seq=[await act()];for(let i=0;i<5;i++){await key('ArrowDown','ArrowDown',40);seq.push(await act())}
for(let i=0;i<2;i++){await key('ArrowUp','ArrowUp',38);seq.push(await act())}
console.log('keys',JSON.stringify(seq));
c.close()
