// 시안 공통 내용 — 모든 시안이 같은 데이터를 쓴다
const D = {
  question: { who: '김기획', role: '기획', title: '랜딩 첫 문구는 어느 쪽이 좋을까요?',
    options: [['쉽게 시작하는 AI 사무실', '처음 보는 사람에게 부담이 적어요'], ['일 맡기면 알아서 끝내요', '결과 중심으로 짧게 말해요'], ['직원 8명이 일해 드려요', '팀 느낌을 먼저 보여 줘요']], picked: 0 },
  plain: { who: '박개발', role: '개발', title: '고객 안내 메일 3통 발송', desc: '신규 가입 고객 3명에게 시작 안내 메일을 보냅니다. 되돌릴 수 없어요.' },
  reply: '결재 2건이 기다려요. 급한 것부터 보여 드릴게요.',
  ph: '비서에게 말하기…',
};
const mode = new URLSearchParams(location.search).get('mode');
if (mode) document.documentElement.dataset.mode = mode;
const $ = (s) => document.querySelector(s);
const head = (extra = '') => `<div class="head"><span class="av">🐾</span><h1>비서</h1>${extra}<button class="btn icon" aria-label="숨기기">–</button><button class="btn icon" aria-label="닫기">✕</button></div>`;
const openBtn = (cls = 'ghost sm') => `<button class="btn ${cls}">앱에서 열기 ↗</button>`;
const composer = () => `<div class="composer"><div class="input">${D.ph}</div><div class="send">↑</div></div>`;
const options = (sel = D.question.picked, desc = true) => D.question.options.map(([t, d], i) => `<div class="opt ${i === sel ? "sel" : ""} ${desc ? "" : "big"}"><span class="dot"></span><span><span class="sm" style="font-weight:600">${t}</span>${desc ? `<br><span class="xs muted">${d}</span>` : ""}</span></div>`).join('');
const who = (a) => `<span class="xs muted">${a.who} · ${a.role}</span>`;
