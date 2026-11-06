// ───────────────────────────────────────────────
// 다시 사는 대학생활 — 게임 로직
// ───────────────────────────────────────────────
const SAVE_KEY = 'reborn-campus-save-v1';
const TICK_MS = 1500;

let S = null;            // 게임 상태
let tool = null;         // 선택한 건물 id 또는 'bulldoze'
let selectedCell = null; // 정보 패널에 표시할 칸
let speed = 1;
let paused = true;
let timer = null;
let modalQueue = [];
let modalOpen = false;
let rightTab = 'eval';

// ── 유틸
const $ = sel => document.querySelector(sel);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const idx = (r, c) => r * N + c;
const rc = i => [Math.floor(i / N), i % N];
const fmt = v => (Math.round(v * 10) / 10).toString();
const sign = v => (v > 0 ? '+' : '') + fmt(v);
function inc(s, key, n = 1) { s.counters[key] = (s.counters[key] || 0) + n; }
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function year(s) { return s.stage === 'ug' ? Math.min(4, Math.ceil(s.stageSem / 2)) : 4; }
function semOfYear(s) { return ((s.stageSem - 1) % 2) + 1; }
function semLabel(s) {
  if (s.stage === 'ug') return s.stageSem > 8 ? `4학년 초과학기 ${s.stageSem - 8}` : `${year(s)}학년 ${semOfYear(s)}학기`;
  return `${s.stage === 'ms' ? '석사' : '박사'} ${s.stageSem}학기`;
}
function countTile(s, id) { return s.grid.filter(t => t === id).length; }
function cumGpa(s) {
  const g = s.gpas.filter(x => x.stage === 'ug');
  if (!g.length) return 0;
  return Math.round(g.reduce((a, x) => a + x.gpa, 0) / g.length * 100) / 100;
}
function papers(s) { return s.stage === 'ug' ? 0 : Math.floor(s.stageResearch / PAPER_COST); }
function who(s) { return `${MAJORS[s.major].name.replace(/과$/, '')}과 ${s.hakbun}학번`; }
function landRadius(s) {
  if (s.stage !== 'ug') return 4;
  return [2, 3, 4, 4][year(s) - 1];
}
function isUnlockedCell(s, i) {
  const [r, c] = rc(i);
  return Math.max(Math.abs(r - 4), Math.abs(c - 4)) <= landRadius(s);
}
function neighbors(i) {
  const [r, c] = rc(i), out = [];
  if (r > 0) out.push(idx(r - 1, c));
  if (r < N - 1) out.push(idx(r + 1, c));
  if (c > 0) out.push(idx(r, c - 1));
  if (c < N - 1) out.push(idx(r, c + 1));
  return out;
}

// ── 상태
function newState(name, majorId) {
  const s = {
    name: name || '새내기', major: majorId, hakbun: 26,
    stage: 'ug', stageSem: 1, week: 1,
    money: 30, cond: 80,
    stats: { social: 0, spec: 0, romance: 0, research: 0 },
    semStudy: 0, studyBonus: 0, stageResearch: 0,
    gpas: [], credits: 0, lastGpa: null, warnings: 0,
    rep: { prof: 50, peers: 50, seniors: 50, parents: 55 },
    grid: Array(N * N).fill(null),
    flags: {}, counters: {}, seen: {}, posts: [],
    nextEvent: randInt(2, 4), burnout: 0, earned: 0,
    history: ['ug'], ending: null,
  };
  for (const [k, v] of Object.entries(MAJORS[majorId].bonus)) s.stats[k] += v;
  s.grid[idx(4, 4)] = 'home';
  s.grid[idx(4, 3)] = 'lecture';
  addPost(s, '새 학기 시작! 새내기들 환영합니다 🌸 (학생회)', false);
  return s;
}

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function loadSave() { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

// ── 효과 적용
function applyFx(s, fx) {
  const parts = [];
  for (const [k, v0] of Object.entries(fx)) {
    const v = Math.round(v0 * 10) / 10;
    if (!v) continue;
    if (k === 'study') s.semStudy += v;
    else if (k in s.stats) { s.stats[k] = Math.max(0, s.stats[k] + v); if (k === 'research') s.stageResearch = Math.max(0, s.stageResearch + v); }
    else if (k === 'money') { s.money += v; if (v > 0) s.earned += v; }
    else if (k === 'cond') s.cond = clamp(s.cond + v);
    else if (k in s.rep) s.rep[k] = clamp(s.rep[k] + v);
    else if (k === 'credits') s.credits += v;
    parts.push(`${STAT_ICON[k] || ''} ${STAT_LABEL[k] || k} ${sign(v)}`);
  }
  return parts;
}

// ── 건물
function tileStatus(s, id) {
  const t = TILES[id];
  if (!t.stages.includes(s.stage)) {
    return { ok: false, hidden: false, reason: s.stage === 'ug' ? '대학원 전용' : '학부 전용' };
  }
  if (t.needFlag && !s.flags[t.needFlag]) return { ok: false, reason: t.flagHint };
  if (s.stage === 'ug' && year(s) < t.minYear && !(t.earlyFlag && s.flags[t.earlyFlag])) {
    return { ok: false, reason: `${t.minYear}학년부터` };
  }
  if (t.max && countTile(s, id) >= t.max) return { ok: false, reason: `최대 ${t.max}개` };
  if (s.money < t.cost) return { ok: false, reason: '돈 부족' };
  return { ok: true };
}

function tileOutput(s, i) {
  const id = s.grid[i];
  if (!id) return null;
  const t = TILES[id];
  const eff = { ...t.eff };
  const notes = [];
  for (const syn of t.syn || []) {
    let n = 0;
    for (const j of neighbors(i)) {
      const nid = s.grid[j];
      if (!nid) continue;
      if (syn.with === '*' || syn.with.includes(nid)) n++;
    }
    if (n) {
      for (const [k, v] of Object.entries(syn.eff)) eff[k] = (eff[k] || 0) + v * n;
      notes.push(`${syn.note} ×${n}`);
    }
  }
  return { eff, notes, hours: t.hours, rep: t.rep || {} };
}

function computeWeek(s) {
  const total = {}, rep = {};
  let hours = 0;
  const mult = s.cond < 25 ? 0.5 : s.cond < 50 ? 0.8 : 1;
  s.grid.forEach((id, i) => {
    if (!id) return;
    const o = tileOutput(s, i);
    hours += o.hours;
    for (const [k, v] of Object.entries(o.eff)) {
      const m = (v > 0 && k !== 'cond') ? mult : 1;
      total[k] = (total[k] || 0) + v * m;
    }
    for (const [k, v] of Object.entries(o.rep)) rep[k] = (rep[k] || 0) + v;
  });
  return { total, rep, hours, mult };
}

function hoursUsed(s) { return s.grid.reduce((a, id) => a + (id ? TILES[id].hours : 0), 0); }

function allowance(s) {
  if (s.stage === 'ms') return 0;
  if (s.stage === 'phd') return 3;
  return [4, 4, 2, 1][year(s) - 1];
}

function studyTarget(s) {
  if (s.stage === 'ms') return 80;
  if (s.stage === 'phd') return 60;
  return 150 * (1 + 0.15 * (year(s) - 1)) * MAJORS[s.major].studyMult;
}

function gpaLetter(g) {
  if (g >= 4.3) return 'A+'; if (g >= 4.0) return 'A'; if (g >= 3.5) return 'B+'; if (g >= 3.0) return 'B';
  if (g >= 2.5) return 'C+'; if (g >= 2.0) return 'C'; if (g >= 1.5) return 'D+'; if (g >= 1.0) return 'D'; return 'F';
}

// ── 학생 개인 평가
function nickname(s) {
  const sem = Math.max(1, s.gpas.length);
  const g = cumGpa(s), soc = s.stats.social / sem, spec = s.stats.spec / sem, rom = s.stats.romance / sem;
  const res = s.stats.research / sem, earnPer = s.earned / sem;
  if (s.warnings >= 2) return '학사경고 수집가';
  if ((s.counters.burnout || 0) >= 4) return '번아웃 단골손님';
  if (s.stage !== 'ug' && res >= 40) return '연구실 붙박이장';
  if (!s.gpas.length) return '아직 아무것도 아닌 새내기';
  if (g >= 4.0 && soc >= 40) return '육각형 인간 (재수 없음)';
  if (g >= 4.0 && soc < 20) return '도서관 지박령';
  if (soc >= 60 && g < 2.5) return '인싸력 만렙, 학점은 바닥';
  if (rom >= 45) return '캠퍼스 낭만 전도사';
  if (earnPer >= 110) return '알바 장인';
  if (spec >= 35) return '걸어 다니는 이력서';
  if (res >= 25) return '교수님의 애제자 (노예라고도 함)';
  if (g < 2.0) return '출석부의 유령';
  return '평범한 대학생 (가장 어려운 것)';
}

const REP_COMMENTS = {
  prof:    ['이름이 뭐였더라?', '출석부에서 본 이름', '수업 열심히 듣는 학생', '눈여겨보는 학생', '추천서 써줄게'],
  peers:   ['단톡방 읽씹 대상', '그런 애 있었나?', '같이 밥 먹는 사이', '과 행사 필참 멤버', '과의 얼굴'],
  seniors: ['인사 안 하는 애', '얼굴만 아는 사이', '밥 사주고 싶은 후배', '족보 공유하는 사이', '학교 레전드'],
  parents: ['등록금 얘기만 나오면 조용해짐', '전화 좀 자주 해라', '밥은 먹고 다니지?', '우리 애가 말이야~', '동네 자랑'],
};
function repComment(key, v) { return REP_COMMENTS[key][v < 30 ? 0 : v < 50 ? 1 : v < 70 ? 2 : v < 85 ? 3 : 4]; }

function overallScore(s) {
  const sem = Math.max(1, s.gpas.length);
  const g = s.gpas.length ? cumGpa(s) : 0;
  const repAvg = (s.rep.prof + s.rep.peers + s.rep.seniors + s.rep.parents) / 4;
  const growth = (s.stats.social + s.stats.spec + s.stats.romance + s.stats.research) / (sem * 110);
  return Math.round(g / 4.5 * 35 + repAvg / 100 * 30 + Math.min(1, growth) * 35);
}
function overallGrade(score) {
  if (score >= 85) return 'S'; if (score >= 72) return 'A'; if (score >= 60) return 'B';
  if (score >= 48) return 'C'; if (score >= 35) return 'D'; return 'F';
}

// ── 대나무숲
function addPost(s, text, isEvent = true) {
  s.posts.unshift({ when: semLabel(s) + ` ${s.week}주차`, text: text.replace('{who}', who(s)), likes: randInt(3, 180), hot: isEvent });
  if (s.posts.length > 40) s.posts.pop();
}
function maybeRandomPost(s) {
  if (Math.random() > 0.28) return;
  const pool = POST_TEMPLATES.filter(p => p.when(s));
  const recent = new Set(s.posts.slice(0, 6).map(p => p.text));
  const fresh = pool.filter(p => !recent.has(p.text.replace('{who}', who(s))));
  if (fresh.length) { addPost(s, pick(fresh).text, false); renderRight(); }
}

// ── 게임 루프
function setSpeed(v) {
  if (v === 0) { paused = true; }
  else { paused = false; speed = v; }
  clearInterval(timer);
  timer = setInterval(tick, TICK_MS / speed);
  renderHud();
}
function tick() { if (paused || modalOpen || !S || S.ending) return; weekStep(); }

function weekStep() {
  const s = S;
  const prod = computeWeek(s);
  if (s.burnout > 0) {
    s.burnout--;
    s.cond = clamp(s.cond + 12);
    toast('😵 번아웃 회복 중… 이번 주는 아무것도 못 했다');
  } else {
    applyFx(s, prod.total);
    applyFx(s, prod.rep);
    floatGains(prod.total);
  }
  s.money += allowance(s);
  if (s.burnout === 0) {
    if (prod.hours > HOURS_CAP) s.cond = clamp(s.cond - (prod.hours - HOURS_CAP) * 0.4);
    else if (prod.hours < 45) s.cond = clamp(s.cond + (45 - prod.hours) * 0.08);
  }

  if (s.stage !== 'ug') {
    const p = papers(s);
    if (p > (s.flags.papersSeen || 0)) {
      s.flags.papersSeen = p; inc(s, 'papers');
      toast(`📄 논문 게재! (이번 과정 ${p}편)`);
      addPost(s, '우리 랩 누가 논문 붙었다던데 회식 언제임?', false);
    }
  }
  if (s.grid.includes('capstone')) s.flags.capstoneWeeks = (s.flags.capstoneWeeks || 0) + 1;

  if (s.cond <= 0 && s.burnout === 0) {
    s.burnout = 2; s.cond = 5; inc(s, 'burnout');
    addPost(s, '과방 소파에서 이틀째 누워 있는 사람 있음. 깨워야 하나?');
    pushModal(() => showInfoModal('🫠', '번아웃', '컨디션이 바닥났다. 2주 동안 아무 건물도 효과가 없다.<br><small>주당 시간이 70시간을 넘으면 컨디션이 빠르게 닳는다.</small>'));
  }
  if (s.money < 0 && !s.flags.brokeThisSem) { s.flags.brokeThisSem = true; pushModal(() => showEvent(BROKE_EVENT)); }

  maybeRandomPost(s);

  const w = s.week;
  if (w === 8) pushModal(() => showEvent(examEvent('mid')));
  if (w === WEEKS) {
    pushModal(() => showEvent(examEvent('final')));
    pushModal(semesterEnd);
  } else {
    s.week++;
    if (w === s.nextEvent && w !== 8) {
      const ev = pickEvent(s);
      if (ev) pushModal(() => showEvent(ev));
      s.nextEvent = w + randInt(2, 4);
    }
  }
  renderAll();
}

function pickEvent(s) {
  const pool = EVENTS.filter(e => (!e.when || e.when(s)) && !(e.once && s.seen[e.id]));
  const recent = s.recentEvents || [];
  const fresh = pool.filter(e => !recent.includes(e.id));
  const ev = pick(fresh.length ? fresh : pool);
  if (!ev) return null;
  s.seen[ev.id] = true;
  s.recentEvents = [ev.id, ...recent].slice(0, 4);
  return ev;
}

const BROKE_EVENT = {
  emoji: '🪫', title: '통장 잔고 마이너스', text: '카드가 결제되지 않았다. 편의점 직원이 측은한 눈으로 본다.',
  choices: [
    { label: '부모님께 SOS', run: s => ({ fx: { money: 30, parents: -10 }, msg: '"이번이 마지막이다." (이번이 세 번째 마지막이다)' }) },
    { label: '학자금 대출', run: s => { inc(s, 'loan'); return { fx: { money: 30, cond: -5 }, msg: '미래의 내가 갚아줄 것이다.' }; } },
  ],
};

function examEvent(kind) {
  const s = S;
  if (s.stage === 'phd') {
    return { emoji: '📊', title: kind === 'mid' ? '중간 랩미팅 발표' : '학기말 연구 보고', text: '슬라이드가 아직 3장밖에 없다.',
      choices: [
        { label: '밤새 준비한다', run: s => { inc(s, 'allnighter'); return { fx: { research: 10, prof: 5, cond: -15 }, msg: '"좋네. 그런데 이건 왜 이렇게 했지?" 1시간 동안 질문을 받았다.' }; } },
        { label: '있는 걸로 버틴다', run: s => ({ fx: { prof: -8 }, msg: '교수님이 한숨을 쉬셨다. 연구실 전체가 들었다.' }) },
      ] };
  }
  const isMid = kind === 'mid';
  const choices = [
    { label: '밤샘 공부', sub: '공부 +25 · 컨디션 -15', run: s => { inc(s, 'allnighter'); return { fx: { study: 25, cond: -15 }, msg: '에너지 드링크 4캔. 시험 중에 손이 떨렸다.' }; } },
    { label: '족보를 구한다', sub: '선후배 평판 60+ 또는 인맥 60+', req: s => s.rep.seniors >= 60 || s.stats.social >= 60,
      run: s => { inc(s, 'jokbo'); return { fx: { study: 30, seniors: -2 }, msg: '족보와 문제가 90% 일치했다. 선배에게 커피를 샀다.' }; } },
    { label: '평소 실력으로 간다', sub: '공부 +8', run: s => ({ fx: { study: 8 }, msg: '평소 실력이 문제였다.' }) },
  ];
  if (!isMid) choices.push({ label: '시험 째고 여행', sub: '공부 -20 · 낭만 +12', run: s => { inc(s, 'skipExam'); return { fx: { study: -20, romance: 12, prof: -10, cond: 10 }, msg: '바다는 예뻤다. 성적표는 예쁘지 않을 것이다.', post: '기말 당일에 부산 간 사람 인스타에 올라옴 ㅋㅋㅋ' }; } });
  return { emoji: isMid ? '📝' : '🔥', title: isMid ? '중간고사 주간' : '기말고사 주간', text: isMid ? '중간고사다. 강의 자료가 300페이지다.' : '기말고사다. 이번 학기 성적이 결정된다.', choices };
}

// ── 학기 종료
function semesterEnd() {
  const s = S;
  const target = studyTarget(s);
  const ratio = Math.max(0, s.semStudy) / target;
  const gpa = Math.round(4.5 * Math.pow(Math.min(1, ratio), 0.8) * 100) / 100;
  const credits = s.stage === 'ug' ? (gpa >= 1.0 ? 18 : 6) : 0;
  s.credits += credits;
  s.gpas.push({ label: semLabel(s), gpa, stage: s.stage });
  s.lastGpa = gpa;
  const lines = [];
  applyFx(s, { parents: (gpa - 3) * 5, prof: (gpa - 3) * 3 });
  if (s.stage === 'ug' && gpa >= 4.0) { s.money += 25; s.earned += 25; s.rep.parents = clamp(s.rep.parents + 5); lines.push('🏅 성적장학금 +25'); addPost(s, '이번 학기 장학금 받은 사람 밥 사라 (진심)', false); }
  if (s.stage === 'ug' && gpa < 1.75) { s.warnings++; lines.push(`⚠️ 학사경고 (${s.warnings}/3)`); addPost(s, '학사경고 문자 받으면 부모님한테도 가는 거 맞음? 급함'); }

  const grad = s.stage !== 'ug';
  const body = `
    <div class="report">
      <div class="report-gpa"><span class="big">${gpa.toFixed(2)}</span><span class="letter">${gpaLetter(gpa)}</span></div>
      <div class="report-rows">
        <div>이번 학기 공부량 <b>${fmt(Math.max(0, s.semStudy))}</b> / 목표 ${fmt(target)}</div>
        ${s.stage === 'ug' ? `<div>이수학점 <b>${s.credits}</b> / 130 · 누적 평점 <b>${cumGpa(s).toFixed(2)}</b></div>` : ''}
        ${grad ? `<div>이번 과정 연구 <b>${fmt(s.stageResearch)}</b> · 논문 <b>${papers(s)}편</b></div>` : ''}
        <div>별명: <b>${esc(nickname(s))}</b></div>
        ${lines.map(l => `<div class="hl">${l}</div>`).join('')}
      </div>
    </div>`;
  showInfoModal('🧾', `${semLabel(s)} 성적표`, body, () => afterReport());
}

function afterReport() {
  const s = S;
  if (s.warnings >= 3) return pushModal(() => showEnding('expelled'));
  if (s.stage === 'ug' && s.stageSem >= 8) {
    const capOk = (s.flags.capstoneWeeks || 0) >= 8;
    if (s.credits >= 130 && capOk) return pushModal(() => showPathChoice('ug'));
    if (s.stageSem >= 12) return pushModal(() => showEnding('ugfail'));
    const why = [];
    if (s.credits < 130) why.push(`이수학점 부족 (${s.credits}/130)`);
    if (!capOk) why.push(`졸업 프로젝트 미완료 (${s.flags.capstoneWeeks || 0}/8주)`);
    pushModal(() => showInfoModal('⌛', '졸업 불가 → 초과학기', `${why.join('<br>')}<br><br>한 학기 더 다닌다. 후배들이 "선배님?" 하고 쳐다본다.`));
  }
  if (s.stage === 'ms' && s.stageSem >= 4) {
    if (papers(s) >= 1) return pushModal(() => showPathChoice('ms'));
    if (s.stageSem >= 6) return pushModal(() => showEnding('msfail'));
    pushModal(() => showInfoModal('📎', '졸업 연기', '논문이 아직 없다. 한 학기 더.'));
  }
  if (s.stage === 'phd' && s.stageSem >= 4) {
    if (papers(s) >= 3) return pushModal(() => showPathChoice('phd'));
    if (s.stageSem >= 8) return pushModal(() => showEnding('phdfail'));
    pushModal(() => showInfoModal('♾️', '졸업 연기', `박사 졸업에는 논문 3편이 필요하다. (지금 ${papers(s)}편)`));
  }
  pushModal(showVacation);
}

function showVacation() {
  const s = S;
  const opts = [
    { label: '계절학기', sub: '돈 -15 · 이수학점 +3 · 다음 학기 공부 +20', show: s.stage === 'ug',
      run: s => { s.studyBonus += 20; return { fx: { money: -15, credits: 3 }, msg: '여름의 강의실은 에어컨이 너무 세다.' }; } },
    { label: '알바 몰빵', sub: '돈 +40 · 컨디션 -10', show: true, run: s => ({ fx: { money: 40, cond: -10 }, msg: '방학 내내 일했다. 통장은 따뜻하고 몸은 차갑다.' }) },
    { label: '여행', sub: '돈 -25 · 낭만 +10 · 컨디션 +40', show: true, run: s => ({ fx: { money: -25, romance: 10, cond: 40 }, msg: '사진 800장. 다시 볼 일은 없겠지만.' }) },
    { label: '본가에서 쉬기', sub: '컨디션 최대 · 부모님 +5 · 용돈 +10', show: true, run: s => ({ fx: { cond: 100, parents: 5, money: 10 }, msg: '엄마 밥은 사기다.' }) },
    { label: '대외활동', sub: '스펙 +15 · 인맥 +10 · 컨디션 -5', show: s.stage === 'ug' && year(s) >= 2, run: s => ({ fx: { spec: 15, social: 10, cond: -5 }, msg: '서포터즈 단체티가 하나 늘었다.' }) },
    { label: '방학에도 연구실', sub: '연구 +15 · 교수님 +5 · 컨디션 -10', show: s.stage !== 'ug' || s.flags.labOffer, run: s => ({ fx: { research: 15, prof: 5, cond: -10 }, msg: '방학이 뭐였더라.' }) },
  ].filter(o => o.show);
  showEvent({ emoji: '🏖️', title: '방학', text: '방학을 어떻게 보낼까?', choices: opts }, () => startNextSemester());
}

function startNextSemester() {
  const s = S;
  if (s.flags.leave) {
    s.flags.leave = false; inc(s, 'leave');
    s.cond = 100; s.money += 40; s.earned += 40;
    pushModal(() => showInfoModal('🛌', '휴학 학기', '한 학기를 쉬었다. 컨디션 완전 회복, 알바로 돈 +40.<br>동기들은 한 학기 앞서갔다.'));
  }
  const prevYear = year(s);
  s.stageSem++;
  s.week = 1;
  s.semStudy = s.studyBonus; s.studyBonus = 0;
  s.nextEvent = randInt(2, 4);
  s.flags.brokeThisSem = false;
  s.cond = clamp(s.cond + 15);
  if (s.stage === 'ug' && year(s) > prevYear) {
    const fresh = Object.entries(TILES).filter(([, t]) => t.stages.includes('ug') && t.minYear === year(s)).map(([, t]) => `${t.emoji} ${t.name}`);
    pushModal(() => showInfoModal('🎉', `${year(s)}학년이 되었다!`, `${landRadius(s) > [2, 3, 4, 4][prevYear - 1] ? '활동 영역이 넓어졌다.<br>' : ''}새로 열린 건물: ${fresh.join(', ') || '없음'}`));
    if (year(s) === 4) addPost(s, '4학년 되니까 학교 오는 게 무서움. 아는 사람이 없음', false);
  }
  save();
  renderAll();
}

function showPathChoice(stage) {
  const s = S;
  const titles = { ug: '🎓 학부 졸업! 다음 진로는?', ms: '📜 석사 졸업! 다음 진로는?', phd: '🎓 박사 학위 취득! 다음 진로는?' };
  const choices = PATHS[stage].map(p => ({
    label: `${p.emoji} ${p.name}`, sub: p.reqText, req: p.req,
    run: () => ({ fx: {}, msg: '', path: p }),
  }));
  showEvent({ emoji: '🧭', title: titles[stage], text: '조건을 만족한 진로만 고를 수 있다.', choices }, null, res => {
    const p = res.path;
    if (p.next) { enterStage(p.next); return true; }
    showEnding(p.id); return true;
  });
}

function enterStage(stage) {
  const s = S;
  s.stage = stage; s.stageSem = 1; s.week = 1; s.stageResearch = 0; s.flags.papersSeen = 0;
  s.semStudy = 0; s.nextEvent = randInt(2, 4); s.history.push(stage);
  const removed = [];
  s.grid = s.grid.map(id => { if (id && !TILES[id].stages.includes(stage)) { removed.push(TILES[id].name); return null; } return id; });
  addPost(s, stage === 'ms' ? '대학원 간다는 동기한테 진심으로 물어봄. "괜찮아?"' : '박사 진학 소식 들은 랩 선배의 첫마디: "...왜?"');
  showInfoModal(stage === 'ms' ? '🔬' : '🧑‍🔬', stage === 'ms' ? '대학원 석사과정 입학' : '박사과정 진학',
    `${stage === 'ms' ? '석사 졸업 조건: 논문 1편 (4학기)' : '박사 졸업 조건: 논문 3편 (4학기, 압축판)'}<br>연구 ${PAPER_COST}포인트마다 논문 1편.<br>새 건물: 📄 논문 작성실, 🧑‍🏫 조교실, 🎤 학회 발표, 🌙 연구실 야근, 👨‍🏫 지도교수 미팅` +
    (removed.length ? `<br><br><small>정리된 학부 시절 건물: ${removed.join(', ')}</small>` : ''),
    () => { save(); renderAll(); });
}

// ── 모달
function pushModal(fn) { modalQueue.push(fn); if (!modalOpen) nextModal(); }
function nextModal() {
  const fn = modalQueue.shift();
  if (!fn) { modalOpen = false; $('#modal').classList.add('hidden'); renderAll(); return; }
  modalOpen = true;
  $('#modal').classList.remove('hidden');
  fn();
}
function modalHtml(emoji, title, body, buttons) {
  const m = $('#modal-card');
  m.innerHTML = `<div class="m-emoji">${emoji}</div><h2>${esc(title)}</h2><div class="m-body">${body}</div><div class="m-choices"></div>`;
  const wrap = m.querySelector('.m-choices');
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'choice' + (b.disabled ? ' disabled' : '') + (b.primary ? ' primary' : '');
    el.innerHTML = `<span>${esc(b.label)}</span>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}`;
    if (!b.disabled) el.onclick = b.onClick;
    wrap.appendChild(el);
  });
}
function showInfoModal(emoji, title, body, after) {
  modalHtml(emoji, title, body, [{ label: '확인', primary: true, onClick: () => { if (after) after(); nextModal(); } }]);
}
// after: 결과 확인 후 실행 / custom: 결과를 직접 처리 (true 반환 시 결과 화면 생략)
function showEvent(ev, after, custom) {
  const s = S;
  modalHtml(ev.emoji, ev.title, `<p>${esc(ev.text)}</p>`, ev.choices.map(c => {
    const ok = !c.req || c.req(s);
    return {
      label: c.label, sub: c.sub, disabled: !ok,
      onClick: () => {
        const res = c.run(s) || {};
        if (custom && custom(res)) return;
        const parts = applyFx(s, res.fx || {});
        if (res.post) addPost(s, res.post);
        renderAll();
        const body = `<p>${esc(res.msg || '')}</p>${parts.length ? `<div class="fx">${parts.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}`;
        modalHtml(ev.emoji, ev.title, body, [{ label: '확인', primary: true, onClick: () => { if (after) after(); nextModal(); } }]);
      },
    };
  }));
}

// ── 엔딩
function showEnding(id) {
  const s = S;
  s.ending = id;
  paused = true;
  localStorage.removeItem(SAVE_KEY);
  const e = ENDINGS[id];
  const score = overallScore(s), grade = overallGrade(score);
  const c = s.counters;
  const stageName = { ug: '학부', ms: '석사', phd: '박사' };
  const years = Math.ceil((s.gpas.length + (c.leave || 0)) / 2);
  const best = s.posts.filter(p => p.hot).sort((a, b) => b.likes - a.likes)[0];
  const body = `
    <p class="ending-text">${esc(e.text)}</p>
    <div class="final-card">
      <div class="final-head">
        <div><div class="muted">최종 인생 평가서</div><div class="final-name">${esc(s.name)} · ${esc(MAJORS[s.major].name)} ${s.hakbun}학번</div>
        <div class="muted">${s.history.map(h => stageName[h]).join(' → ')} · 총 ${years}년</div></div>
        <div class="grade grade-${grade}">${grade}<small>${score}점</small></div>
      </div>
      <div class="final-nick">“${esc(nickname(s))}”</div>
      <div class="final-grid">
        <div>🧾 학부 평점 <b>${cumGpa(s).toFixed(2)}</b></div>
        <div>🤝 인맥 <b>${fmt(s.stats.social)}</b></div>
        <div>📈 스펙 <b>${fmt(s.stats.spec)}</b></div>
        <div>🌸 낭만 <b>${fmt(s.stats.romance)}</b></div>
        <div>🔬 연구 <b>${fmt(s.stats.research)}</b></div>
        <div>💰 번 돈 <b>${fmt(s.earned)}</b></div>
      </div>
      <div class="final-rep">${Object.keys(s.rep).map(k => `<div>${STAT_ICON[k]} ${STAT_LABEL[k]}: <i>“${repComment(k, s.rep[k])}”</i></div>`).join('')}</div>
      <div class="final-stats">🍻 술자리 ${c.drinks || 0}회 · 🌙 밤샘 ${c.allnighter || 0}회 · 🫠 번아웃 ${c.burnout || 0}회 · 📸 박제 ${c.expose || 0}회 · 🛌 휴학 ${c.leave || 0}회 · 📄 논문 ${c.papers || 0}편</div>
      ${best ? `<div class="final-post">🎋 나를 가장 유명하게 만든 글<br><b>“${esc(best.text)}”</b> ♥ ${best.likes}</div>` : ''}
    </div>`;
  $('#modal').classList.remove('hidden');
  modalOpen = true;
  modalQueue = [];
  modalHtml(e.emoji, `엔딩: ${e.title}`, body, [{ label: '🔁 다시 살기', primary: true, onClick: () => location.reload() }]);
}

// ── 맵 조작
function onCellClick(i) {
  const s = S;
  if (!s || s.ending) return;
  if (!isUnlockedCell(s, i)) { toast('🔒 아직 활동 영역 밖이다. 학년이 오르면 넓어진다.'); return; }
  const cur = s.grid[i];
  if (tool === 'bulldoze') {
    if (!cur) return;
    const refund = Math.floor(TILES[cur].cost / 2);
    s.grid[i] = null; s.money += refund;
    toast(`🧹 ${TILES[cur].name} 철거${refund ? ` (+${refund})` : ''}`);
    renderAll(); return;
  }
  if (tool && !cur) {
    const st = tileStatus(s, tool);
    if (!st.ok) { toast(`❌ ${st.reason}`); return; }
    const t = TILES[tool];
    s.money -= t.cost;
    s.grid[i] = tool;
    selectedCell = i;
    if (t.max && countTile(s, tool) >= t.max) tool = null;
    renderAll(); return;
  }
  selectedCell = cur ? i : null;
  renderInfo();
  renderBoard();
}

// ── 렌더링
function renderAll() { if (!S) return; renderHud(); renderPalette(); renderBoard(); renderInfo(); renderRight(); }

function renderHud() {
  const s = S; if (!s) return;
  const used = hoursUsed(s);
  $('#sem-label').textContent = semLabel(s);
  $('#week-label').textContent = `${s.week}주차 / ${WEEKS}`;
  $('#week-bar').style.width = `${(s.week - 1) / (WEEKS - 1) * 100}%`;
  $('#money').textContent = Math.floor(s.money);
  $('#money').parentElement.classList.toggle('bad', s.money < 0);
  $('#cond').textContent = Math.round(s.cond);
  $('#cond-bar').style.width = `${s.cond}%`;
  $('#cond-bar').className = 'fill ' + (s.cond < 25 ? 'red' : s.cond < 50 ? 'yellow' : 'green');
  $('#hours').textContent = `${used} / ${HOURS_CAP}h`;
  $('#hours-bar').style.width = `${Math.min(100, used / HOURS_CAP * 100)}%`;
  $('#hours-bar').className = 'fill ' + (used > HOURS_CAP ? 'red' : used > 60 ? 'yellow' : 'blue');
  $('#study-now').textContent = `${fmt(Math.max(0, s.semStudy))} / ${fmt(studyTarget(s))}`;
  $('#study-bar').style.width = `${Math.min(100, Math.max(0, s.semStudy) / studyTarget(s) * 100)}%`;
  document.querySelectorAll('.speed button').forEach(b => {
    const v = +b.dataset.speed;
    b.classList.toggle('on', v === 0 ? paused : (!paused && v === speed));
  });
}

function renderPalette() {
  const s = S;
  const el = $('#palette-list');
  el.innerHTML = '';
  const order = Object.keys(TILES).sort((a, b) => {
    const ta = TILES[a], tb = TILES[b];
    const sa = ta.stages.includes(s.stage) ? 0 : 1, sb = tb.stages.includes(s.stage) ? 0 : 1;
    return sa - sb || ta.minYear - tb.minYear;
  });
  for (const id of order) {
    const t = TILES[id], st = tileStatus(s, id);
    if (!t.stages.includes(s.stage) && s.stage !== 'ug') continue; // 대학원에선 학부 전용 숨김
    const b = document.createElement('button');
    b.className = 'pal' + (tool === id ? ' on' : '') + (st.ok ? '' : ' locked');
    b.style.setProperty('--cat', CATS[t.cat].color);
    b.innerHTML = `<span class="pe">${t.emoji}</span><span class="pn">${t.name}<small>${st.ok ? `💰${t.cost} · ⏱${t.hours}h` : '🔒 ' + st.reason}</small></span>`;
    b.onclick = () => { tool = tool === id ? null : id; selectedCell = null; renderPalette(); renderInfo(); renderBoard(); };
    b.title = t.desc;
    el.appendChild(b);
  }
  $('#tool-bulldoze').classList.toggle('on', tool === 'bulldoze');
}

function renderBoard() {
  const s = S;
  const el = $('#board');
  if (!el.children.length) {
    for (let i = 0; i < N * N; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.onclick = () => onCellClick(i);
      el.appendChild(c);
    }
  }
  const synIdx = new Set();
  if (selectedCell != null && s.grid[selectedCell]) neighbors(selectedCell).forEach(j => synIdx.add(j));
  [...el.children].forEach((c, i) => {
    const id = s.grid[i];
    const unlocked = isUnlockedCell(s, i);
    c.className = 'cell' + (unlocked ? '' : ' locked') + (id ? ' built' : '') +
      (selectedCell === i ? ' sel' : '') + (synIdx.has(i) ? ' near' : '') +
      (tool && tool !== 'bulldoze' && unlocked && !id ? ' can' : '') + (tool === 'bulldoze' && id ? ' doze' : '');
    if (id) {
      const t = TILES[id];
      c.style.setProperty('--cat', CATS[t.cat].color);
      c.innerHTML = `<span class="ce">${t.emoji}</span><span class="cn">${t.name}</span>`;
    } else {
      c.style.removeProperty('--cat');
      c.innerHTML = unlocked ? '' : '<span class="lock">·</span>';
    }
  });
}

function effLine(eff) {
  return Object.entries(eff).filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => `<span class="${v > 0 ? 'pos' : 'neg'}">${STAT_ICON[k]} ${STAT_LABEL[k]} ${sign(v)}</span>`).join('');
}

function renderInfo() {
  const s = S;
  const el = $('#info');
  if (tool === 'bulldoze') { el.innerHTML = `<b>🧹 철거 모드</b> — 건물을 누르면 철거한다. 설치비의 절반을 돌려받는다.`; return; }
  if (tool) {
    const t = TILES[tool], st = tileStatus(s, tool);
    el.innerHTML = `<div class="info-h"><span class="ie">${t.emoji}</span><div><b>${t.name}</b> <span class="muted">${CATS[t.cat].name}</span><div class="muted">${esc(t.desc)}</div></div></div>
      <div class="effs">${effLine(t.eff)}<span>⏱ 주 ${t.hours}시간</span><span>💰 설치 ${t.cost}</span></div>
      ${(t.syn || []).map(x => `<div class="syn">✨ ${esc(x.note)}</div>`).join('')}
      ${st.ok ? '<div class="muted">빈 칸을 눌러 설치하기</div>' : `<div class="neg">🔒 ${esc(st.reason)}</div>`}`;
    return;
  }
  if (selectedCell != null && s.grid[selectedCell]) {
    const t = TILES[s.grid[selectedCell]], o = tileOutput(s, selectedCell);
    el.innerHTML = `<div class="info-h"><span class="ie">${t.emoji}</span><div><b>${t.name}</b> <span class="muted">주간 효과</span><div class="muted">${esc(t.desc)}</div></div></div>
      <div class="effs">${effLine(o.eff)}<span>⏱ 주 ${t.hours}시간</span></div>
      ${o.notes.map(n => `<div class="syn on">✨ ${esc(n)}</div>`).join('')}
      ${(t.syn || []).length && !o.notes.length ? `<div class="muted">시너지: ${(t.syn || []).map(x => esc(x.note)).join(' / ')}</div>` : ''}`;
    return;
  }
  const m = computeWeek(s);
  el.innerHTML = `<b>이번 주 예상</b> ${m.mult < 1 ? `<span class="neg">(컨디션이 낮아서 효율 ${m.mult * 100}%)</span>` : ''}
    <div class="effs">${effLine({ ...m.total, money: (m.total.money || 0) + allowance(s) })}</div>
    <div class="muted">왼쪽에서 건물을 고르고 맵에 배치하세요. 상하좌우로 붙은 건물끼리 시너지가 생깁니다.</div>`;
}

function renderRight() {
  const s = S;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === rightTab));
  const el = $('#right-body');
  if (rightTab === 'eval') el.innerHTML = evalHtml(s);
  else if (rightTab === 'board') el.innerHTML = boardHtml(s);
  else el.innerHTML = treeHtml(s);
}

function evalHtml(s) {
  const score = overallScore(s), grade = overallGrade(score);
  const repRows = Object.keys(s.rep).map(k => `
    <div class="rep">
      <div class="rep-top"><span>${STAT_ICON[k]} ${STAT_LABEL[k]}</span><b>${Math.round(s.rep[k])}</b></div>
      <div class="bar"><div class="fill ${s.rep[k] < 30 ? 'red' : s.rep[k] < 60 ? 'yellow' : 'green'}" style="width:${s.rep[k]}%"></div></div>
      <div class="rep-c">“${repComment(k, s.rep[k])}”</div>
    </div>`).join('');
  const gp = s.gpas.slice(-8).map(g => `<div class="gp" title="${esc(g.label)} ${g.gpa}"><div style="height:${g.gpa / 4.5 * 100}%"></div><small>${g.gpa.toFixed(1)}</small></div>`).join('');
  return `
    <div class="student-card">
      <div class="sc-top">
        <div><div class="muted">${esc(MAJORS[s.major].emoji)} ${esc(MAJORS[s.major].name)} · ${s.hakbun}학번</div>
          <div class="sc-name">${esc(s.name)}</div>
          <div class="sc-nick">“${esc(nickname(s))}”</div></div>
        ${s.gpas.length ? `<div class="grade grade-${grade}">${grade}<small>종합</small></div>` : `<div class="grade" title="첫 학기가 끝나면 평가된다">?<small>평가 전</small></div>`}
      </div>
      <div class="sc-stats">
        <div><small>누적 평점</small><b>${s.gpas.some(g => g.stage === 'ug') ? cumGpa(s).toFixed(2) : '-'}</b></div>
        <div><small>이수학점</small><b>${s.credits}</b></div>
        <div><small>학사경고</small><b class="${s.warnings ? 'neg' : ''}">${s.warnings}</b></div>
        ${s.stage !== 'ug' ? `<div><small>논문</small><b>${papers(s)}편</b></div>` : ''}
      </div>
      <div class="sc-stats four">
        <div><small>🤝 인맥</small><b>${fmt(s.stats.social)}</b></div>
        <div><small>📈 스펙</small><b>${fmt(s.stats.spec)}</b></div>
        <div><small>🌸 낭만</small><b>${fmt(s.stats.romance)}</b></div>
        <div><small>🔬 연구</small><b>${fmt(s.stats.research)}</b></div>
      </div>
    </div>
    <h4>남들이 보는 나</h4>${repRows}
    ${gp ? `<h4>학기별 평점</h4><div class="gpas">${gp}</div>` : ''}`;
}

function boardHtml(s) {
  return `<div class="bamboo-h">🎋 캠퍼스 대나무숲 <span class="muted">익명</span></div>` +
    s.posts.map(p => `<div class="post ${p.hot ? 'hot' : ''}"><div class="post-t">${esc(p.text)}</div><div class="post-m">${esc(p.when)} · ♥ ${p.likes}</div></div>`).join('');
}

function treeHtml(s) {
  const order = ['ug', 'ms', 'phd'];
  const names = { ug: '🏫 학부 (4년)', ms: '🔬 석사 (2년)', phd: '🧑‍🔬 박사 (2년 압축)' };
  const curI = order.indexOf(s.stage);
  return `<div class="muted" style="margin-bottom:8px">졸업할 때 조건을 만족한 진로만 고를 수 있다. 대학원 루트는 연구·평점·교수님 평판이 핵심.</div>` +
    order.map((st, i) => {
      const state = i < curI ? 'done' : i === curI ? 'cur' : 'future';
      const nodes = PATHS[st].map(p => {
        const live = i === curI;
        const ok = live ? p.req(s) : null;
        return `<div class="node ${p.next ? 'branch' : ''}">
          <span>${p.emoji} ${p.name}${p.next ? ' →' : ''}</span>
          <small>${p.reqText}</small>
          <em>${live ? (ok ? '✅ 충족' : '⬜ 미충족') : i < curI ? '' : '🔒'}</em></div>`;
      }).join('');
      return `<div class="tier ${state}"><div class="tier-h">${names[st]}${state === 'cur' ? ' <span class="badge">현재</span>' : state === 'done' ? ' <span class="badge done">수료</span>' : ''}</div>${nodes}</div>`;
    }).join('<div class="tier-arrow">↓ 대학원 진학 시</div>') +
    `<div class="muted" style="margin-top:10px">학부 졸업 조건: 이수학점 130 + 🎓 졸업 프로젝트 8주 이상.<br>학사경고 3회면 제적.</div>`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}

function floatGains(total) {
  const keys = ['study', 'social', 'spec', 'romance', 'research', 'money'];
  const txt = keys.filter(k => (total[k] || 0) >= 0.5).map(k => `${STAT_ICON[k]}+${fmt(total[k])}`).join(' ');
  if (!txt) return;
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = txt;
  $('#board-wrap').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ── 시작 화면
function initStart() {
  let major = 'cs';
  const list = $('#major-list');
  list.innerHTML = Object.entries(MAJORS).map(([id, m]) =>
    `<button class="major ${id === major ? 'on' : ''}" data-id="${id}"><span>${m.emoji}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('');
  list.querySelectorAll('.major').forEach(b => b.onclick = () => {
    major = b.dataset.id;
    list.querySelectorAll('.major').forEach(x => x.classList.toggle('on', x === b));
  });
  const saved = loadSave();
  if (saved && !saved.ending) {
    $('#btn-continue').classList.remove('hidden');
    $('#btn-continue').textContent = `이어하기 (${saved.name} · ${semLabel(saved)})`;
    $('#btn-continue').onclick = () => { S = saved; startGame(); };
  }
  $('#btn-start').onclick = () => {
    S = newState($('#name').value.trim(), major);
    startGame();
    pushModal(() => showInfoModal('🌸', '입학을 축하합니다!',
      `1학년 신입생으로 다시 시작한다. 목표는 졸업, 그 너머는 테크트리에 있다.<br><br>
      • 왼쪽에서 건물을 골라 맵에 배치 → 매주 자동으로 효과<br>
      • ⏱ 주당 <b>70시간</b>을 넘기면 컨디션이 빠르게 닳는다<br>
      • 📖 공부량이 학기말 평점을 결정한다<br>
      • 상하좌우로 붙은 건물끼리 ✨시너지<br>
      • 교수님·동기·선후배·부모님이 당신을 <b>평가</b>한다`));
  };
}

function startGame() {
  $('#start').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#board').innerHTML = '';
  renderAll();
  setSpeed(1);
}

document.addEventListener('DOMContentLoaded', () => {
  initStart();
  document.querySelectorAll('.speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
  $('#tool-bulldoze').onclick = () => { tool = tool === 'bulldoze' ? null : 'bulldoze'; selectedCell = null; renderAll(); };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { rightTab = b.dataset.tab; renderRight(); });
  document.addEventListener('keydown', e => {
    if (!S || modalOpen) return;
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); setSpeed(paused ? speed : 0); }
    if (e.key === 'Escape') { tool = null; selectedCell = null; renderAll(); }
  });
});
