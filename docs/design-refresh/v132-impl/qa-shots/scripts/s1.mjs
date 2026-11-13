import {connect} from './lib.mjs'
const c=await connect();
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
for(const [w,m] of [[1400,'dark'],[1100,'light'],[900,'dark']]){
 await c.vp(w,860,m);await nav('직원');await nav('직원 목록');await c.sleep(500);
 console.log(w,m,await c.ev(`(()=>{const cards=[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='자세히 ›').map(b=>b.closest('div[class*=rounded]'));const xs=[...new Set(cards.map(e=>Math.round(e.getBoundingClientRect().x)))];
 const sum=document.querySelector('[class*=summary]');const board=[...document.querySelectorAll('button,summary')].find(b=>b.innerText.startsWith('상황판'));
 return JSON.stringify({cols:xs.length,cardW:Math.round(cards[0].getBoundingClientRect().width),bodyOver:document.documentElement.scrollWidth>innerWidth,board:board?.innerText.replace(/\\n/g,' '),boardExp:board?.getAttribute('aria-expanded')||board?.closest('details')?.open,key:localStorage.getItem('office:dashboardBoardOpen'),
 clip:cards.filter(e=>e.scrollWidth>e.clientWidth+1).length})})()`));
}
await c.vp(1400,860,'light');await nav('직원');
console.log(await c.ev(`(()=>{const b=[...document.querySelectorAll('button,summary')].find(b=>b.offsetParent&&b.innerText.startsWith('상황판'));b.click();return 1})()`));await c.sleep(500);
console.log((await c.ev(`(()=>{const b=[...document.querySelectorAll('button,summary')].find(b=>b.innerText.startsWith('상황판'));return (b.closest('section,div')?.innerText||'').slice(0,300).replace(/\\n/g,'|')+' key='+localStorage.getItem('office:dashboardBoardOpen')+' exp='+b.getAttribute('aria-expanded')})()`)));
c.close()
