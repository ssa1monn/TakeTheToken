// ───────────────────────────────────────────────
// 다시 사는 대학생활 — 게임 로직 (상태 · 시간 · 이벤트 · 평가)
// 3D 캠퍼스(world.js)는 window.Game 으로 이 파일과 통신한다.
// ───────────────────────────────────────────────
const SAVE_KEY = 'reborn-campus-save-v2';

let S = null;            // 게임 상태
let speed = 1;
let paused = true;
let modalQueue = [];
let modalOpen = false;
let rightTab = 'eval';
let panelOpen = true;

// ── 유틸
const $ = sel => document.querySelector(sel);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
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
function weekKey(s) { return `${s.stage}-${s.stageSem}-${s.week}`; }

// ── 시계: 한 주(weekT 0→1)가 06:00 → 다음 날 06:00 하루로 보인다
function hourOf(s) { return (DAY_START + (s ? s.weekT : 0.15) * 24) % 24; }
function phaseOf(h) { return TIME_PHASES.find(p => h >= p.from && h < p.to); }
function fitsTime(e, h) { return !e.time || e.time.includes(phaseOf(h).id); }
function clockText(h) {
  const m = Math.floor(h * 6) * 10;   // 10분 단위
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function visits(s, place) { return (s.semVisits && s.semVisits[place]) || 0; }
function cumGpa(s) {
  const g = s.gpas.filter(x => x.stage === 'ug');
  if (!g.length) return 0;
  return Math.round(g.reduce((a, x) => a + x.gpa, 0) / g.length * 100) / 100;
}
function papers(s) { return s.stage === 'ug' ? 0 : Math.floor(s.stageResearch / PAPER_COST); }
function who(s) { return `${MAJORS[s.major].name.replace(/과$/, '')}과 ${s.hakbun}학번`; }

// ── 상태
function newState(name, majorId) {
  const s = {
    name: name || '새내기', major: majorId, hakbun: 26,
    stage: 'ug', stageSem: 1, week: 1, weekT: 0,
    money: 30, cond: 80,
    stats: { social: 0, spec: 0, romance: 0, research: 0 },
    semStudy: 0, studyBonus: 0, stageResearch: 0,
    gpas: [], credits: 0, lastGpa: null, warnings: 0,
    rep: { prof: 50, peers: 50, seniors: 50, parents: 55 },
    flags: {}, counters: {}, seen: {}, posts: [],
    usedThisWeek: {}, semVisits: {}, recentPlaceEvents: {},
    nextEvent: randInt(...EVENT_GAP), nextEventAt: Math.random(), burnout: 0, earned: 0,
    history: ['ug'], ending: null,
  };
  for (const [k, v] of Object.entries(MAJORS[majorId].bonus)) s.stats[k] += v;
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
    else if (k in s.stats) { s.stats[k] = Math.max(0, s.stats[k] + v); if (k === 'research' && s.stage !== 'ug') s.stageResearch = Math.max(0, s.stageResearch + v); }
    else if (k === 'money') { s.money += v; if (v > 0) s.earned += v; }
    else if (k === 'cond') s.cond = clamp(s.cond + v);
    else if (k in s.rep) s.rep[k] = clamp(s.rep[k] + v);
    else if (k === 'credits') s.credits += v;
    parts.push(`${STAT_ICON[k] || ''} ${STAT_LABEL[k] || k} ${sign(v)}`);
  }
  return parts;
}

function allowance(s) {
  if (s.stage === 'ms') return 0;
  if (s.stage === 'phd') return 3;
  return [4, 4, 2, 1][year(s) - 1];
}

function studyTarget(s) {
  if (s.stage === 'ms') return 70;
  if (s.stage === 'phd') return 50;
  return 100 * (1 + 0.12 * (year(s) - 1)) * MAJORS[s.major].studyMult;
}

function gpaLetter(g) {
  if (g >= 4.3) return 'A+'; if (g >= 4.0) return 'A'; if (g >= 3.5) return 'B+'; if (g >= 3.0) return 'B';
  if (g >= 2.5) return 'C+'; if (g >= 2.0) return 'C'; if (g >= 1.5) return 'D+'; if (g >= 1.0) return 'D'; return 'F';
}

// ── 학생 개인 평가
function nickname(s) {
  const sem = Math.max(1, s.gpas.length);
  const g = cumGpa(s), soc = s.stats.social / sem, spec = s.stats.spec / sem, rom = s.stats.romance / sem;
  const res = s.stats.research / sem, lib = (s.counters.visit_library || 0) / sem;
  if (s.warnings >= 2) return '학사경고 수집가';
  if ((s.counters.burnout || 0) >= 4) return '번아웃 단골손님';
  if (s.stage !== 'ug' && res >= 40) return '연구실 붙박이장';
  if (!s.gpas.length) return '아직 아무것도 아닌 새내기';
  if (lib >= 12 && soc < 20) return '도서관 지박령';
  if (g >= 4.0 && soc >= 40) return '육각형 인간 (재수 없음)';
  if (soc >= 60 && g < 2.5) return '인싸력 만렙, 학점은 바닥';
  if (rom >= 30) return '캠퍼스 낭만 전도사';
  if (spec >= 35) return '걸어 다니는 이력서';
  if (res >= 15) return '교수님의 애제자 (노예라고도 함)';
  if (lib < 2) return '도서관 위치 모르는 사람';
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
  const growth = (s.stats.social + s.stats.spec + s.stats.romance + s.stats.research) / (sem * 40);
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
  if (fresh.length) addPost(s, pick(fresh).text, false);
}

// ── 시간: world.js의 렌더 루프가 매 프레임 Game.update(dt)를 부른다
function setSpeed(v) {
  if (v === 0) paused = true;
  else { paused = false; speed = v; }
  renderHud();
}
function timeRunning() { return S && !S.ending && !paused && !modalOpen; }

function update(dt) {
  if (!timeRunning()) return;
  S.weekT += dt * speed / WEEK_SECONDS;
  if (S.weekT >= 1) { S.weekT = 0; weekStep(); }
  else maybeTimedEvent(S);
  renderWeekBar();
  renderClock();
}

// 랜덤 이벤트: 정해 둔 주의 정해 둔 시각에, 그 시간대에 맞는 이벤트를 뽑는다
function scheduleEvent(s) {
  s.nextEvent = s.week + randInt(...EVENT_GAP);
  s.nextEventAt = 0.05 + Math.random() * 0.9;
}
function maybeTimedEvent(s) {
  if (modalOpen || s.week === 8 || s.week === WEEKS) return;   // 시험 주간엔 시험만
  const due = s.week > s.nextEvent || (s.week === s.nextEvent && s.weekT >= (s.nextEventAt ?? 0.5));
  if (!due) return;
  const ev = pickEvent(s);
  if (ev) { pushModal(() => showEvent(ev)); scheduleEvent(s); }
  else { s.nextEventAt = (s.nextEventAt ?? 0.5) + 0.08; if (s.nextEventAt > 1) { s.nextEvent++; s.nextEventAt = 0.1; } }  // 맞는 이벤트가 없으면 조금 뒤에 다시
}

function weekStep() {
  const s = S;
  if (s.burnout > 0) {
    s.burnout--;
    s.cond = clamp(s.cond + 15);
    toast('😵 번아웃 회복 중… 이번 주는 아무것도 못 했다');
  } else {
    // 매주 기본: 수업 출석 · 생활비 · 자연 회복
    applyFx(s, { study: 2, cond: 2, money: allowance(s) - 1 });
    if (s.stage !== 'ug') applyFx(s, { research: 3, cond: -2 }); // 연구실 생활
  }

  if (s.stage !== 'ug') {
    const p = papers(s);
    if (p > (s.flags.papersSeen || 0)) {
      s.flags.papersSeen = p; inc(s, 'papers');
      toast(`📄 논문 게재! (이번 과정 ${p}편)`);
      addPost(s, '우리 랩 누가 논문 붙었다던데 회식 언제임?', false);
    }
  }

  if (s.cond <= 0 && s.burnout === 0) {
    s.burnout = 2; s.cond = 5; inc(s, 'burnout');
    addPost(s, '과방 소파에서 이틀째 누워 있는 사람 있음. 깨워야 하나?');
    pushModal(() => showInfoModal('🫠', '번아웃', '컨디션이 바닥났다. 2주 동안 건물에 들어가도 아무것도 할 수 없다.'));
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
    s.usedThisWeek = {};
  }
  renderAll();
}

function pickEvent(s) {
  const h = hourOf(s);
  const pool = EVENTS.filter(e => (!e.when || e.when(s)) && !(e.once && s.seen[e.id]) && fitsTime(e, h));
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

// ── 건물 출입 (world.js가 호출)
function placeOf(name) {
  if (!name) return null;
  for (const [key, p] of Object.entries(PLACES)) if (name.includes(p.match)) return key;
  return null;
}
function placeStatus(name) {
  const key = placeOf(name);
  if (!key) return { key: null, ok: false, reason: '아직 들어갈 수 없는 건물' };
  if (!S || S.ending) return { key, ok: false, reason: '' };
  if (S.burnout > 0) return { key, ok: false, reason: '번아웃 중이라 아무것도 못 한다' };
  const place = PLACES[key];
  if (place.open && !place.open(hourOf(S))) return { key, ok: false, reason: place.closedText || '지금은 문을 닫았다' };
  if (S.usedThisWeek[key]) return { key, ok: false, reason: '이번 주에는 이미 다녀왔다' };
  return { key, ok: true };
}
function enterBuilding(name) {
  const st = placeStatus(name);
  if (!st.key) { toast(`🚧 ${name || '이 건물'}: 아직 준비 중인 건물이다`); return; }
  if (!st.ok) { if (st.reason) toast(`🚪 ${st.reason}`); return; }
  const s = S, place = PLACES[st.key];
  const h = hourOf(s);
  const all = place.events().filter(e => !e.when || e.when(s));
  const timed = all.filter(e => fitsTime(e, h));
  const pool = timed.length ? timed : all;
  const recent = s.recentPlaceEvents[st.key] || [];
  const fresh = pool.filter(e => !recent.includes(e.id));
  const ev = pick(fresh.length ? fresh : pool);
  s.recentPlaceEvents[st.key] = [ev.id, ...recent].slice(0, 3);
  s.usedThisWeek[st.key] = true;
  s.semVisits[st.key] = (s.semVisits[st.key] || 0) + 1;
  inc(s, 'visit_' + st.key);
  pushModal(() => showEvent({ ...ev, title: `${place.emoji} ${place.name} · ${ev.title}` }));
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
        <div>📚 도서관 방문 <b>${visits(s, 'library')}회</b></div>
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
    if (s.credits >= 130) return pushModal(() => showPathChoice('ug'));
    if (s.stageSem >= 12) return pushModal(() => showEnding('ugfail'));
    pushModal(() => showInfoModal('⌛', '졸업 불가 → 초과학기', `이수학점 부족 (${s.credits}/130)<br><br>한 학기 더 다닌다. 후배들이 "선배님?" 하고 쳐다본다.`));
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
  s.week = 1; s.weekT = 0;
  s.semStudy = s.studyBonus; s.studyBonus = 0;
  scheduleEvent(s);
  s.usedThisWeek = {}; s.semVisits = {};
  s.flags.brokeThisSem = false;
  s.cond = clamp(s.cond + 15);
  if (s.stage === 'ug' && year(s) > prevYear) {
    pushModal(() => showInfoModal('🎉', `${year(s)}학년이 되었다!`, '학년이 올라갔다. 목표 공부량이 늘어난다.'));
    if (year(s) === 4) addPost(s, '4학년 되니까 학교 오는 게 무서움. 아는 사람이 없음', false);
  }
  save();
  renderAll();
}

function showPathChoice(stage) {
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
  s.stage = stage; s.stageSem = 1; s.week = 1; s.weekT = 0; s.stageResearch = 0; s.flags.papersSeen = 0;
  s.semStudy = 0; scheduleEvent(s); s.history.push(stage);
  s.usedThisWeek = {}; s.semVisits = {};
  addPost(s, stage === 'ms' ? '대학원 간다는 동기한테 진심으로 물어봄. "괜찮아?"' : '박사 진학 소식 들은 랩 선배의 첫마디: "...왜?"');
  showInfoModal(stage === 'ms' ? '🔬' : '🧑‍🔬', stage === 'ms' ? '대학원 석사과정 입학' : '박사과정 진학',
    `${stage === 'ms' ? '석사 졸업 조건: 논문 1편 (4학기)' : '박사 졸업 조건: 논문 3편 (4학기, 압축판)'}<br>연구 ${PAPER_COST}포인트마다 논문 1편. 매주 연구실 생활로 연구가 조금씩 쌓인다.`,
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
        <div>📚 도서관 <b>${c.visit_library || 0}회</b></div>
        <div>🤝 인맥 <b>${fmt(s.stats.social)}</b></div>
        <div>📈 스펙 <b>${fmt(s.stats.spec)}</b></div>
        <div>🌸 낭만 <b>${fmt(s.stats.romance)}</b></div>
        <div>🔬 연구 <b>${fmt(s.stats.research)}</b></div>
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

// ── 렌더링 (HUD · 오른쪽 패널)
function renderAll() { if (!S) return; renderHud(); renderRight(); }

function renderWeekBar() {
  const s = S; if (!s) return;
  $('#week-bar').style.width = `${((s.week - 1) + s.weekT) / WEEKS * 100}%`;
}

// 시계 바: 06:00(왼쪽) → 다음 날 06:00(오른쪽), 바늘 = 지금
let lastClock = '';
function renderClock() {
  const s = S; if (!s) return;
  const h = hourOf(s), ph = phaseOf(h), txt = clockText(h);
  $('#clock-needle').style.left = `${s.weekT * 100}%`;
  if (txt === lastClock) return;
  lastClock = txt;
  $('#clock-time').textContent = txt;
  $('#clock-phase').textContent = `${ph.emoji} ${ph.name}`;
  $('#clock').dataset.phase = ph.id;
}

function renderHud() {
  const s = S; if (!s) return;
  renderClock();
  $('#sem-label').textContent = semLabel(s);
  $('#week-label').textContent = `${s.week}주차 / ${WEEKS}`;
  renderWeekBar();
  $('#money').textContent = Math.floor(s.money);
  $('#money').parentElement.classList.toggle('bad', s.money < 0);
  $('#cond').textContent = Math.round(s.cond);
  $('#cond-bar').style.width = `${s.cond}%`;
  $('#cond-bar').className = 'fill ' + (s.cond < 25 ? 'red' : s.cond < 50 ? 'yellow' : 'green');
  $('#study-now').textContent = `${fmt(Math.max(0, s.semStudy))} / ${fmt(studyTarget(s))}`;
  $('#study-bar').style.width = `${Math.min(100, Math.max(0, s.semStudy) / studyTarget(s) * 100)}%`;
  document.querySelectorAll('.speed button').forEach(b => {
    const v = +b.dataset.speed;
    b.classList.toggle('on', v === 0 ? paused : (!paused && v === speed));
  });
}

function renderRight() {
  const s = S;
  $('#right').classList.toggle('collapsed', !panelOpen);
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === rightTab));
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
    `<div class="muted" style="margin-top:10px">학부 졸업 조건: 이수학점 130.<br>학사경고 3회면 제적.</div>`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
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
      `제1기숙사 앞에서 1학년 신입생으로 다시 시작한다.<br><br>
      • <b>WASD / 방향키</b>로 걷기, <b>Shift</b>로 달리기<br>
      • 마우스를 <b>드래그</b>하면 화면이 돌아간다 (좌우: 방향, 위아래: 기울기), 휠로 줌<br>
      • 건물 <b>문 앞</b>에서 <b>E</b>를 누르면 들어간다 (지금은 📚 학산도서관만 열려 있다). 미니맵의 흰 선이 문이다<br>
      • 시간은 계속 흐른다. 한 주는 하루로 압축된다 (06:00 → 다음 날 06:00). 왼쪽 위 시계를 보자<br>
      • 낮과 밤에 일어나는 일이 다르다. 도서관은 새벽 2~6시에 문을 닫는다<br>
      • 왼쪽 위 <b>미니맵</b>은 화면 방향대로 돌아간다. 빨간 <b>!</b>가 들어갈 수 있는 건물이다<br>
      • 교수님·동기·선후배·부모님이 당신을 <b>평가</b>한다`));
  };
}

function startGame() {
  $('#start').classList.add('hidden');
  $('#game').classList.remove('hidden');
  renderAll();
  setSpeed(1);
  window.dispatchEvent(new Event('game-start'));
}

document.addEventListener('DOMContentLoaded', () => {
  initStart();
  document.querySelectorAll('.speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.onclick = () => { rightTab = b.dataset.tab; panelOpen = true; renderRight(); });
  $('#panel-toggle').onclick = () => { panelOpen = !panelOpen; renderRight(); };
  document.addEventListener('keydown', e => {
    if (!S || modalOpen || document.activeElement.tagName === 'INPUT') return;
    if (e.code === 'KeyP') setSpeed(paused ? speed : 0);   // e.code: 한글 입력 상태에서도 같은 키
  });
});

// ── 3D 월드(world.js)와의 연결
window.Game = {
  update,
  enterBuilding,
  placeStatus,
  isActive: () => !!S && !S.ending,
  hour: () => hourOf(S),               // 0~24 (게임 전에는 아침 9시대)
  inputBlocked: () => !S || !!S.ending || modalOpen,
};
