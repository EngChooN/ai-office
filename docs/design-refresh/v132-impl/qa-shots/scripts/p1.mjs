import {connect} from './lib.mjs'
const c=await connect();
await c.ev(`localStorage.setItem('office:dashboardBoardOpen','0')`);
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
for(const [w,m] of [[1100,'dark'],[900,'light'],[900,'dark']]){
 await c.vp(w,860,m);await nav('직원');await c.click('이 기능 시험해 줘');await c.sleep(700);
 console.log(w,m,await c.ev(`(()=>{let p=document.querySelector('textarea');if(!p)return 'no panel';for(let i=0;i<14&&p.parentElement;i++){p=p.parentElement;const r=p.getBoundingClientRect();if(r.height>400&&r.width<800)break}
 const tabs=[...p.querySelectorAll('button')].filter(b=>['대화','바뀐 파일','도구','소개'].includes(b.innerText.trim())).map(b=>b.innerText.trim());
 return JSON.stringify({w:p.getBoundingClientRect().width|0,head:p.innerText.slice(0,90).replace(/\\n/g,'|'),tabs,more:!![...p.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='더 보기'&&b.offsetParent),over:p.scrollWidth>p.clientWidth+1})})()`));
}
c.close()
