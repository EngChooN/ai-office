// D2 렌더 — 기본 시안(?overflow 없음)과 넘침 시안이 같은 코드를 쓴다
const OV = document.documentElement.dataset.case === 'overflow';
const Q = OV ? { who: '김기획', role: '기획', title: '다음 달 정식 출시 안내 페이지의 첫 화면 문구를 어떤 방향으로 정리하는 것이 처음 방문한 고객에게 가장 부담 없이 전달될까요?',
  options: ['쉽게 시작하는 AI 사무실 — 처음 보는 사람도 바로 이해할 수 있도록 쉬운 말로', '일 맡기면 알아서 끝내요', '직원 8명이 일해 드려요, 팀 느낌을 먼저 보여 주는 안'] } : { ...D.question, options: D.question.options.map(o => o[0]) };
const chips = (o, sel = 0) => o.map((t, i) => `<span class="chip2 ${i === sel ? 'on' : ''}"><span class="ck">${i === sel ? '✓' : ''}</span><span>${t}</span></span>`).join('');
const plain = (a) => `<section class="item col" style="gap:6px">${who(a)}<div class="title">${a.title}</div><p class="sm muted">${a.desc}</p><div class="row"><button class="btn primary sm">승인</button><button class="btn sm">반려</button></div></section>`;
const extra = [
  { who: '이디자', role: '디자인', title: '로그인 화면 시안 확정', desc: '두 번째 시안으로 확정하고 개발에 넘깁니다.' },
  { who: '최가독', role: '설계', title: '설정 화면 구조 변경안 적용', desc: '탭 3개를 1개로 합치고, 기존 저장값은 그대로 옮깁니다.' },
  { who: '정리드', role: '개발', title: '이번 주 배포 일정 확정', desc: '금요일 오후 3시에 배포합니다.' }];
const list = [D.plain, ...(OV ? extra : [])];
const n = 1 + list.length;
$('#p').innerHTML = head(`<span class="pill">결재 ${n}</span>${openBtn('ghost')}`) +
  `<div class="scroll" id="sc"><section class="item col" style="gap:8px">${who(Q)}<div class="title">${Q.title}</div>
   <div class="col" style="gap:6px;align-items:flex-start">${chips(Q.options)}</div><div class="row"><button class="btn primary sm">답 보내기</button></div></section>
   ${list.map(plain).join('')}
   <section class="item col" style="gap:6px"><span class="xs muted" style="font-weight:600">비서</span><div class="bubble">${D.reply}</div></section></div><div class="fade"></div>` + composer();

