import {connect} from './lib.mjs'
const c=await connect();
const nav=(t)=>c.ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.offsetParent&&x.innerText.trim().split('\\n')[0]===${JSON.stringify(t)});b?.click();return !!b})()`);
const WORDS=['고용','대시보드','조직도','작업 중','외부','장비','휴식'];
const hits={};
for(const [w,mode] of [[1400,'light'],[1100,'dark'],[900,'light']]){
 await c.vp(w,860,mode);
 for(const v of ['사무실','직원','팀 구성','직원 목록','업무','결재함','대화','노하우','기록','상점','설정']){
  const ok=await nav(v);await c.sleep(500);
  const r=JSON.parse(await c.ev(`(()=>{const t=document.body.innerText;const lines=t.split('\\n');const f={};${JSON.stringify(WORDS)}.forEach(wd=>{const l=lines.filter(x=>x.includes(wd));if(l.length)f[wd]=[...new Set(l)].slice(0,3).map(x=>x.slice(0,50))});
   const ov=[...document.querySelectorAll('*')].filter(e=>e.offsetParent&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX==='visible'&&e.clientWidth>0).length;
   return JSON.stringify({f,ov,docOver:document.documentElement.scrollWidth>innerWidth})})()`));
  console.log(w,mode,v,ok,JSON.stringify(r));
 }
}
c.close()
