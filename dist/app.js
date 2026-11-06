import { VERSION, DEPARTMENTS, RATING_LABELS, gpaWeight, ratingScore, createState, createGameState, portfolio, indexHistory, queueReview, previewReview, closeMarket, courseConflicts, dateForDay, ensureMarketData } from './market.js';

import { currentClock, evaluationWindow, timeLabel } from './campus.js';
import { advanceSimulation, initializeSimulation, processCampus, ensureDemoContent } from './simulation.js';
import { createLiveUI } from './live-ui.js';
import { createStockDetailUI } from './stock-detail.js';
import { createMarketBoard } from './market-board.js';
import { createMarketOverview } from './market-overview.js';
import { loadDemo, saveDemo } from './store.js';
import { createPortfolioUI } from './portfolio-ui.js';
import { priceLinePath } from './candle-chart.js';
import { newsTitle, newsText } from './campus-copy.js';
import { createReviewRibbon } from './review-ribbon.js';
import { createGameClockReader, normalizeGameClock, gameStorageKey, applyGameClock } from './game-clock.js';

const STORAGE_KEY = 'inu-exchange-demo-v3';
const CLOCK_CURSOR_KEY = 'inu-exchange-game-clock-cursor-v1';
const embedded = window.parent !== window;
let legacyCursor;
try { legacyCursor = JSON.parse(localStorage.getItem(CLOCK_CURSOR_KEY)); } catch { /* Storage is optional. */ }
const gameClockReader = createGameClockReader(window, { legacyCursor });
const firstGameClock = gameClockReader.read();
let storageKey = normalizeGameClock(firstGameClock) ? gameStorageKey(firstGameClock) : embedded ? null : STORAGE_KEY;
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const catalog = await fetch('./data/catalog.json').then(r => { if (!r.ok) throw new Error('강의 데이터를 읽을 수 없어요.'); return r.json(); }).catch(error => {
  app.innerHTML = `<div class="loading">${error.message} 페이지를 새로고침해주세요.</div>`;
  throw error;
});
let state;
const validState = (saved, snapshot) => saved?.version === VERSION && Number.isInteger(saved.day) && saved.day >= 0 && Array.isArray(saved.selectedCourseIds) && catalog.professors.every(p => saved.stocks?.[p.id]?.history?.length === saved.stocks?.[catalog.professors[0].id]?.history?.length && saved.stocks?.[p.id]?.history?.length > 0) && saved.selectedCourseIds.every(id => catalog.courses.some(c => c.id === id)) && (!normalizeGameClock(snapshot) || saved.gameClock?.sessionId === snapshot.sessionId);
try {
  const saved = storageKey ? await loadDemo(storageKey) : null;
  if (validState(saved, firstGameClock)) state = saved;
} catch { /* A fresh demo is available when browser storage is unavailable. */ }
if (!state) {
  state = normalizeGameClock(firstGameClock) ? createGameState(catalog, firstGameClock) : createState(catalog);
  if (!embedded) initializeSimulation(state, catalog);
}
ensureMarketData(state, catalog);
function processGameCampus(target, source) {
  ensureDemoContent(target, source);
  return processCampus(target, source);
}
function applyHostTime(snapshot) {
  const result = applyGameClock(state, catalog, snapshot, { process: processGameCampus });
  // Character selection chooses the storage key. A clock tick must never reset it.
  if (result.resetRequired) return result;
  state.playing = snapshot.active !== false && !snapshot.paused;
  if (snapshot.legacyCursor) {
    try { localStorage.setItem(CLOCK_CURSOR_KEY, JSON.stringify(snapshot.legacyCursor)); } catch { /* Optional cursor cache. */ }
  }
  return result;
}
if (normalizeGameClock(firstGameClock)) { applyHostTime(firstGameClock); ensureDemoContent(state, catalog); }
else {
  ensureDemoContent(state, catalog);
  state.playing = !embedded;
}
let view = 'market';
let department = 'all';
let query = '';
let page = 0;
let range = 'month';
let sort = 'name';
let overviewRange = 'week';
let discoveryIndex = 0;
let discoveryPaused = false;
let ribbonPaused = false;
let onlyMine = false;
let feedMine = false;
let communityTone = 'all';
let communityQuery = '';
let communityLimit = 24;
let communitySort = 'recent';
let ranking = 'all';
let currentStock = null;
let stockRange = 'month';
let chartType = 'candle';
let selectedCandleKey = null;
let stockTab = 'community';
let commentSort = 'recent';
let commentLimit = 12;
let reviewCourse = 'all';
let draftCourses = new Set();
let editorQuery = '';
let currentReview = null;
let toastTimer;

const icons = {
  bars: '<path d="M5 19V11m7 8V5m7 14V8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h4m-4 4h4m3-4h3m-3 4h3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  trend: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  book: '<path d="M12 6C8 3 4 4 3 5v15c3-2 6-1 9 1 3-2 6-3 9-1V5c-1-1-5-2-9 1Zm0 0v15"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.bars}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => Number(value).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => `${value > 0.000001 ? '+' : ''}${(value * 100).toFixed(2)}%`;
const direction = value => value > 0.000001 ? 'up' : value < -0.000001 ? 'down' : 'flat';
const prof = id => catalog.professors.find(p => p.id === id);
const course = id => catalog.courses.find(c => c.id === id);
const deptShort = value => ({ '컴퓨터공학부': '컴공', '정보통신공학과': '정통', '임베디드시스템공학과': '임베디드' })[value] ?? value;
const colorFor = id => ['#f16b3d', '#647de0', '#38a393', '#b483d2', '#d5a340'][catalog.professors.findIndex(p => p.id === id) % 5];
const live = createLiveUI({ getState: () => state, catalog, icon, esc, pct, number, direction, prof, course, colorFor });
const detail = createStockDetailUI({ getState: () => state, catalog, icon, esc, pct, number, direction, prof, course, colorFor, live });
const overview = createMarketOverview({ getState: () => state, catalog, esc, icon, number, pct, direction });
const ribbon = createReviewRibbon({ getState: () => state, catalog, esc, icon, prof, course });
const board = createMarketBoard({ getState: () => state, catalog, icon, esc, pct, number, direction, colorFor, course, live, overview, ribbon, reviewsFor: id => detail.reviewsFor(id) });
const assets = createPortfolioUI({ getState: () => state, catalog, icon, esc, pct, number, direction, colorFor, prof, course, chart });

let storageErrorShown = false;
function save() {
  if (!storageKey) return Promise.resolve();
  return saveDemo(storageKey, state).catch(() => {
    if (!storageErrorShown) toast('기록을 저장하지 못했어요. 현재 화면에서는 계속 체험할 수 있지만 새로고침하면 새 변경이 사라질 수 있어요.');
    storageErrorShown = true;
  });
}
function toast(message) {
  clearTimeout(toastTimer);
  const box = document.querySelector('#toast');
  box.textContent = message;
  box.classList.add('show');
  toastTimer = setTimeout(() => box.classList.remove('show'), 4500);
}
function openModal(html, size = '') {
  modal.className = size;
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.querySelector('[data-autofocus]')?.focus();
}
const modalHead = (eyebrow, title) => `<div class="modal-heading"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button class="icon-button" data-action="dismiss" aria-label="닫기">${icon('close')}</button></div>`;

function sparkline(history, color = '#f16b3d') {
  const values = history.slice(-16).map(p => p.price);
  const min = Math.min(...values) - 0.12;
  const spread = Math.max(...values) - min + 0.12;
  const points = values.map((v, i) => `${i / Math.max(1, values.length - 1) * 100},${31 - (v - min) / spread * 28}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 100 34" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="miter"/></svg>`;
}

function chart(history, name, id = 'main', selectedRange = range) {
  const now = currentClock(state);
  const cutoff = new Date(`${now.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (selectedRange === 'week' ? 7 : 30));
  const visible = history.filter(point => !point.date || point.date <= now.date);
  const index = visible.findIndex(point => point.date >= cutoff.toISOString().slice(0,10));
  const data = selectedRange === 'all' ? visible : index < 0 ? visible.slice(-1) : visible.slice(Math.max(0,index-1));
  const values = data.map(p => p.price);
  const min = Math.floor((Math.min(...values) - 0.3) * 2) / 2;
  const max = Math.ceil((Math.max(...values) + 0.3) * 2) / 2;
  const width = id === 'stock' ? 690 : view === 'timetable' ? 500 : Math.max(480, Math.min(1450, document.documentElement.clientWidth - 60) - 380), height = 200, left = 4, right = 58, top = 12, bottom = 25;
  const x = i => left + i / Math.max(1, values.length - 1) * (width - left - right);
  const y = v => top + (max - v) / (max - min) * (height - top - bottom);
  const path = priceLinePath(values.map((v,i)=>({x:x(i),y:y(v)})));
  const area = `${path} L${x(values.length - 1)},${height - bottom} L${left},${height - bottom} Z`;
  const grids = Array.from({ length: 4 }, (_, i) => {
    const value = min + (max - min) * i / 3;
    return `<line x1="0" x2="${width - right + 8}" y1="${y(value)}" y2="${y(value)}" stroke="#e8ebf0" stroke-dasharray="3 5"/><text x="${width - 1}" y="${y(value) + 4}" text-anchor="end" fill="#8b929e" font-size="11">${value.toFixed(1)}</text>`;
  }).join('');
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].map(i => `<text x="${x(i)}" y="${height - 2}" text-anchor="${i === 0 ? 'start' : 'middle'}" fill="#939aa5" font-size="11">${esc(data[i].label ?? dateForDay(data[i].day))}</text>`).join('');
  return `<div class="chart-wrap"><svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(name)}. 시작 ${number(values[0])}, 현재 ${number(values.at(-1))}."><defs><linearGradient id="fill-${id}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#5471b5" stop-opacity=".15"/><stop offset="1" stop-color="#5471b5" stop-opacity="0"/></linearGradient></defs>${grids}<path d="${area}" fill="url(#fill-${id})"/><path d="${path}" fill="none" stroke="#4967aa" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="miter"/><circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="4" fill="#4967aa" stroke="white" stroke-width="2"/>${labels}</svg></div>`;
}

function sidebar() { return live.topbar(view); }

function header() {
  const titles = { market: ['교수님 증시', '수업이 끝나면, 새로운 장이 열린다.'], timetable: ['내 시간표', '이번 학기 수업이 나만의 자산으로.'] };
  return `${live.sessionBar()}${titles[view] ? `<header class="page-header"><div><h1>${titles[view][0]}</h1><p>${titles[view][1]}</p></div>${view === 'market' ? '<span class="market-season">2026 가을학기 <span>정보기술대학</span></span>' : ''}</header>` : ''}`;
}

function portfolioCard() { return assets.compact(); }

function marketView() {
  return board.render({ department, query, page, sort, onlyMine, ranking, overviewRange, discoveryIndex, discoveryPaused, ribbonPaused });
}
function marketTable() { return board.table({ department, query, page, sort, onlyMine, ranking }); }

function mergedMeetings(selected) {
  return selected.flatMap(c => {
    const groups = [];
    for (const m of [...c.meetings].sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start))) {
      const previous = groups.at(-1);
      const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      const shortPeriod = minutes(m.end) - minutes(m.start) <= 50;
      if (previous && previous.mergeShortPeriods && shortPeriod && previous.day === m.day && minutes(m.start) - minutes(previous.end) >= 0 && minutes(m.start) - minutes(previous.end) <= 20) previous.end = m.end;
      else groups.push({ ...m, mergeShortPeriods: shortPeriod });
    }
    return groups.map(m => ({ ...m, course: c }));
  });
}

function timetableView() {
  const etf = portfolio(state, catalog);
  const meetings = mergedMeetings(etf.selected);
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const startHour = Math.min(9, ...meetings.map(m => Math.floor(minutes(m.start) / 60)));
  const endHour = Math.max(18, ...meetings.map(m => Math.ceil(minutes(m.end) / 60)));
  const days = ['월', '화', '수', '목', '금', ...(['토', '일'].filter(d => meetings.some(m => m.day === d)))];
  const height = (endHour - startHour) * 60;
  return `<div class="timetable-summary"><div><span class="eyebrow">2026 FALL SEMESTER</span><h2>${etf.selected.length}개 강의가 <span>${etf.holdings.length}명 교수님</span>으로 연결돼요.</h2><p>총 ${etf.totalCredits}학점 · 같은 교수님의 수업은 학점을 합쳐 비중을 계산해요.</p></div><button class="button primary" data-action="edit">${icon('plus')}시간표 편집</button></div><div class="timetable-layout"><section class="card timetable-card"><div class="section-head"><h2>나의 주간 시간표</h2><span class="small-badge">편람의 실제 수업 시간</span></div><div class="timetable-scroll"><div class="timetable-grid" style="--days:${days.length}"><div class="time-axis"><div class="day-head"></div><div class="hours" style="height:${height}px">${Array.from({ length: endHour - startHour + 1 }, (_, i) => `<span style="top:${i * 60}px">${String(startHour + i).padStart(2, '0')}:00</span>`).join('')}</div></div>${days.map(day => `<div class="day-column"><div class="day-head">${day}</div><div class="day-content" style="height:${height}px">${meetings.filter(m => m.day === day).map(m => `<button class="class-block" style="top:${minutes(m.start) - startHour * 60}px;height:${minutes(m.end) - minutes(m.start)}px;--class-color:${colorFor(m.course.professorId)}" data-action="stock" data-id="${m.course.professorId}"><strong>${esc(m.course.name)}</strong><span>${esc(prof(m.course.professorId).name)}</span><small>${m.start}–${m.end}</small></button>`).join('')}</div></div>`).join('')}</div></div>${etf.selected.some(c => !c.meetings.length) ? '<p class="hint">시간이 없는 강의는 아래 목록에서 확인할 수 있어요.</p>' : ''}</section><div class="timetable-side">${portfolioCard()}<section class="card course-list"><div class="section-head"><h3>내 강의 실적 리포트</h3><span class="heading-count">${etf.selected.length}</span></div>${etf.selected.map(c => `<div class="my-course"><div><strong>${esc(c.name)}</strong><span>${esc(prof(c.professorId).name)} · ${c.credits}학점</span></div><button class="button ${state.pendingReviews[c.id] ? 'subtle' : 'outline'} small" data-action="review" data-id="${c.id}" ${live.statusFor(c).canRate ? '' : 'disabled'}>${live.statusFor(c).submitted ? '완료' : live.statusFor(c).canRate ? '평가하기' : '잠김'}</button></div>`).join('') || '<p class="muted">시간표에 첫 강의를 담아주세요.</p>'}</section></div></div>`;
}

function newsView() { return live.news(); }

function render() {
  detail.invalidateReviews();
  app.innerHTML = `<div class="app-shell">${sidebar()}<main id="main" class="main-content">${header()}${view === 'stock' ? detail.render(currentStock, {range:stockRange,tab:stockTab,commentSort,commentLimit,chartType,selectedCandleKey,reviewCourse}) : view === 'market' ? marketView() : view === 'portfolio' ? assets.render({range}) : view === 'timetable' ? timetableView() : view === 'community' ? live.community(feedMine, {tone:communityTone,query:communityQuery,limit:communityLimit,sort:communitySort}) : newsView()}<footer class="page-footer"><span>INU EXCHANGE · 2026 바이브코딩 <span>수업의 순간이 캠퍼스의 흐름으로</span></span><button data-action="about">데이터·서비스 안내 ${icon('info')}</button></footer></main></div>`;
  if (view === 'stock') detail.mount();
  if (view === 'market') overview.mount();
  document.title = view === 'stock' ? `${prof(currentStock).name} · 인천대 거래소` : '인천대 거래소 — 교수님 증시';
}

function refreshTable() { detail.invalidateReviews(); const region = document.querySelector('#market-table-region'); if (region) region.innerHTML = marketTable(); }

function showEditor() {
  draftCourses = new Set(state.selectedCourseIds);
  editorQuery = '';
  openModal(`${modalHead('BUILD YOUR PORTFOLIO', '내 시간표 구성하기')}<p class="modal-description">실제 개설 강의를 골라보세요. 같은 교수님의 강의는 학점을 합쳐 계산해요.</p><div class="editor-toolbar"><label class="search-box">${icon('search')}<input id="course-search" type="search" placeholder="강의명, 교수님, 학수번호 검색" aria-label="강의 검색" data-autofocus></label><button class="text-button" data-action="clear-courses">선택 비우기</button></div><div id="editor-list" class="editor-list"></div><div class="editor-summary" id="editor-summary"></div><div class="modal-footer"><span class="hint">구성을 바꾸면 같은 시즌의 지수를 다시 계산해요.</span><button id="apply-courses" class="button primary" data-action="apply-courses">포트폴리오 적용 ${icon('arrow')}</button></div>`, 'wide');
  renderEditorList();
}

function meetingLabel(c) {
  if (!c.meetings.length) return '시간 미지정';
  return [...new Set(c.meetings.map(m => m.day))].map(day => {
    const ms = c.meetings.filter(m => m.day === day);
    return `${day} ${ms[0].start}–${ms.at(-1).end}`;
  }).join(' · ');
}

function renderEditorList() {
  const filtered = catalog.courses.filter(c => `${c.name} ${prof(c.professorId).name} ${c.code} ${c.department}`.includes(editorQuery));
  document.querySelector('#editor-list').innerHTML = filtered.map(c => `<label class="course-option ${draftCourses.has(c.id) ? 'chosen' : ''}"><input type="checkbox" data-course="${c.id}" ${draftCourses.has(c.id) ? 'checked' : ''}><span class="course-option-text"><strong>${esc(c.name)}<span>${esc(prof(c.professorId).name)}</span></strong><small>${esc(c.code)} · ${esc(meetingLabel(c))}</small></span><span class="course-credit">${c.credits}학점<small>${deptShort(c.department)}</small></span></label>`).join('') || '<p class="empty-state">일치하는 강의가 없어요.</p>';
  updateEditorSummary();
}

function updateEditorSummary() {
  const selected = catalog.courses.filter(c => draftCourses.has(c.id));
  const conflicts = courseConflicts(selected);
  const credits = selected.reduce((sum, c) => sum + c.credits, 0);
  const count = new Set(selected.map(c => c.professorId)).size;
  document.querySelector('#editor-summary').innerHTML = `<strong>${selected.length}개 강의 <span>→</span> ${count}명 교수님</strong><span>${credits}학점 선택</span>${conflicts.length ? `<p class="conflict">${esc(course(conflicts[0][0]).name)} / ${esc(course(conflicts[0][1]).name)} 수업 시간이 겹쳐요.</p>` : ''}`;
  document.querySelector('#apply-courses').disabled = conflicts.length > 0;
}

function showGpa() {
  openModal(`${modalHead('MY ANALYST PROFILE', '평가 영향력 설정')}<p class="modal-description">GPA는 내 수업 평가의 반영 가중치예요. 자산 구성은 내 시간표의 학점으로 정해져요.</p><form id="gpa-form"><label class="field-label" for="gpa-input">나의 GPA</label><div class="gpa-input-wrap"><input id="gpa-input" name="gpa" type="number" min="0" max="4.5" step="0.01" value="${state.gpa}" required data-autofocus><span>/ 4.5</span></div><div class="weight-preview"><span>평가 반영 가중치</span><strong id="gpa-weight">×${gpaWeight(state.gpa).toFixed(3)}</strong></div><p class="hint">가중치 = 1 + 0.5 × GPA / 4.5<br>직접 입력한 GPA를 다음 평가부터 반영해요.</p><div class="modal-footer"><button type="button" class="button outline" data-action="dismiss">닫기</button><button class="button primary" type="submit">저장하기</button></div></form>`);
}

function showReview(courseId) {
  const now = currentClock(state);
  const today = live.todayCourses();
  const available = today.filter(c => live.statusFor(c).canRate);
  const requested = today.find(c => c.id === courseId);
  const c = requested ?? available[0];
  if (!c || !live.statusFor(c).canRate) {
    openModal(`${modalHead('AFTER CLASS ONLY', '수업이 끝나면 만나요.')}<p class="modal-description">${now.date.replaceAll('-', '.')} (${now.weekday}) ${timeLabel(now.minute)} · 기준이에요. 당일 마지막 수업이 끝난 강의만 평가할 수 있어요.</p>${live.todayClasses()}<div class="modal-footer"><button class="button primary" data-action="dismiss">확인했어요</button></div>`);
    return;
  }
  currentReview = { courseId: c.id, ratings: [...(state.pendingReviews[c.id]?.ratings ?? [4,4,4,4,4,4])], comment: state.pendingReviews[c.id]?.comment ?? '' };
  openModal(`${modalHead('AFTER-CLASS REPORT', '오늘 수업, 한 줄로 어땠나요?')}<p class="modal-description">${now.weekday}요일 수업 종료 확인. GPA 가중치를 더해 수업 경험을 주가에 반영해요.</p><label class="field-label" for="review-course">종료된 오늘의 수업</label><select id="review-course" class="full-select">${available.map(item => `<option value="${item.id}" ${c.id === item.id ? 'selected' : ''}>${esc(item.name)} · ${esc(prof(item.professorId).name)}</option>`).join('')}</select><form id="review-form"><div class="rating-list">${RATING_LABELS.map((label, i) => `<label class="rating-row"><span>${label}</span><input aria-label="${label}" type="range" name="rating-${i}" data-rating="${i}" min="1" max="5" step="1" value="${currentReview.ratings[i]}"><output id="rating-output-${i}">${currentReview.ratings[i]}<small>/5</small></output></label>`).join('')}</div><label class="field-label" for="review-comment">한 줄 평가 <span class="optional-label">선택 · 120자</span></label><textarea id="review-comment" name="comment" rows="2" maxlength="120" placeholder="이해 완. 오늘은 나도 제법 전공생일지도?">${esc(currentReview.comment)}</textarea><div class="comment-counter"><span>점수로 담기 어려운 오늘의 경험을 남겨보세요.</span><span id="comment-count">${currentReview.comment.length}/120</span></div><div class="review-preview"><div><span>나의 평가 점수</span><strong id="my-review-score"></strong></div><div><span>GPA ${state.gpa.toFixed(2)} 반영</span><strong>×${gpaWeight(state.gpa).toFixed(2)}</strong></div><div><span>회차 보정점수 예상</span><strong id="aggregate-preview"></strong></div></div><p class="hint" id="review-cohort"></p><div class="modal-footer"><span class="hint">반영 후에는 같은 수업을 오늘 다시 평가할 수 없어요.</span><button class="button primary" type="submit">${state.pendingReviews[c.id] ? '평가 수정하기' : '한 줄과 함께 제출'} ${icon('arrow')}</button></div></form>`);
  updateReviewPreview();
}

function updateReviewPreview() {
  document.querySelector('#my-review-score').textContent = ratingScore(currentReview.ratings).toFixed(1);
  const preview = previewReview(state, currentReview.courseId, currentReview.ratings);
  document.querySelector('#aggregate-preview').textContent = preview.score.toFixed(1);
  document.querySelector('#review-cohort').textContent = `다른 수강생 ${preview.count - 1}명의 응답에 내 평가를 더하고 표본 수를 보정해요.`;
}

function showNews(id) {
  const event = state.events.find(e => e.id === id);
  if (!event) return;
  openModal(`${modalHead('CAMPUS NEWS', esc(newsTitle(event.title)))}<span class="small-badge">${event.displayOnly ? '이전 소식 · ' : ''}${esc(newsText(event.source))}</span><p class="news-body">${esc(newsText(event.summary))}</p><div class="weight-preview"><span>${event.displayOnly ? '참고용 소식 · 시세 미반영' : event.type === 'department' ? '학과 내 교수님 전체' : '해당 교수님'}</span><strong class="${direction(event.impact)}">${event.displayOnly || !event.impact ? '정보 알림' : pct(event.impact)}</strong></div>${event.displayOnly || !event.impact ? '' : `<p class="hint">${event.applied ? '시세에 한 번 반영했어요.' : '다음 갱신에 반영할 예정이에요.'}</p>`}<div class="modal-footer">${event.type === 'research' ? `<button class="button outline" data-action="stock" data-id="${esc(event.targetId)}">주가 보기 ${icon('arrow')}</button>` : ''}<button class="button primary" data-action="dismiss">닫기</button></div>`);
}

function showConclusion() {
  const etf = portfolio(state, catalog);
  const biggest = [...etf.holdings].sort((a, b) => b.weight * (state.stocks[b.id].price - 100) - a.weight * (state.stocks[a.id].price - 100))[0];
  openModal(`${modalHead('SEASON RECAP PREVIEW', '나의 캠퍼스 시즌 기록')}<div class="recap-card"><span>2026 FALL · INUC EXCHANGE</span><h2>${etf.holdings.length > 3 ? '전공 올라운더' : '전공 집중러'}</h2><p>나의 시간표, 나만의 포트폴리오.</p><div><strong>${pct(etf.totalReturn)}</strong><span>시즌 시작 대비</span></div><dl><div><dt>수강 구성</dt><dd>${etf.selected.length}개 강의 · ${etf.totalCredits}학점</dd></div><div><dt>시간표 교수님</dt><dd>${etf.holdings.length}개</dd></div><div><dt>가장 큰 기여</dt><dd>${biggest ? esc(prof(biggest.id).name) : '구성 대기'}</dd></div><div><dt>시세 기록</dt><dd>${state.day}회 갱신</dd></div></dl></div><div class="modal-footer"><span class="hint">유니코인으로 기록한 이번 학기 기록이에요.</span><button class="button primary" data-action="dismiss">확인했어요</button></div>`);
}

function showAbout() {
  openModal(`${modalHead('INU EXCHANGE', '서비스 안내')}<div class="about-content"><h3>강의와 교수님 정보</h3><p>2026년 9월 4일 기준 인천대학교 종합강의시간표의 정보기술대학 강의 정보를 사용해요. 교수님 41명과 개설 강의 129개의 과목명·담당자·학점·시간표를 담았어요.</p><h3>수업이 끝나면, 한 줄 평</h3><p>내 시간표에 담긴 강의는 당일 마지막 수업이 끝난 뒤 평가할 수 있어요. 점수와 함께 남긴 한 줄은 강의별로 모아 볼 수 있고, 공감이 많은 순서로도 살펴볼 수 있어요.</p><h3>주가와 학과 지수</h3><p>시즌 기준가는 100 유니코인. 수업 평가·캠퍼스 소식·시장 변동을 반영해 주가가 움직여요. 학과 지수에는 교수님마다 같은 비중을 적용해요.</p><h3>내 자산과 평가 가중치</h3><p>내 자산은 각 강의의 학점 × 담당 교수님 주가를 모두 더한 값이에요. 평가에 적용하는 GPA 가중치는 1 + 0.5 × GPA / 4.5예요.</p><h3>내 기록</h3><p>시간표, 평가와 공감 기록은 현재 브라우저에 저장돼요.</p></div><div class="modal-footer"><button class="button primary" data-action="dismiss">확인했어요</button></div>`, 'wide');
}


function navigate(next, id) {
  if (next === 'stock' && !prof(id)) return;
  selectedCandleKey = null;
  if (next === 'stock' && currentStock !== id) { stockRange = 'month'; stockTab = 'community'; commentSort = 'recent'; commentLimit = 12; reviewCourse = 'all'; selectedCandleKey = null; }
  view = next;
  if (id) currentStock = id;
  const hash = next === 'stock' ? `#stock/${encodeURIComponent(id)}` : `#${next}`;
  if (location.hash !== hash) history.pushState(null,'',hash);
  if (modal.open) modal.close();
  render(); window.scrollTo({top:0,behavior:'instant'});
}
function showStock(id) { navigate('stock', id); }
function readRoute() {
  const [next,id] = location.hash.slice(1).split('/');
  if (next === 'main') return;
  selectedCandleKey = null;
  if (next === 'stock' && id && prof(decodeURIComponent(id))) { view = 'stock'; currentStock = decodeURIComponent(id); }
  else view = ['market','news','community','timetable','portfolio'].includes(next) ? next : 'market';
  if (modal.open) modal.close();
  render();
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  event.preventDefault();
  const { action, id } = target.dataset;
  try {
    if (action === 'ranking') { ranking = id; sort = ['up','down'].includes(id) ? 'return' : 'name'; page = 0; refreshTable(); }
    else if (action === 'ribbon-step') { ribbon.step(Number(id)); refreshRibbon(); }
    else if (action === 'ribbon-pause') { ribbonPaused = !ribbonPaused; refreshRibbon(); }
    else if (action === 'discovery-select') { discoveryIndex = Number(id); refreshDiscovery(); }
    else if (action === 'discovery-step') { discoveryIndex = (discoveryIndex + Number(id) + 3) % 3; refreshDiscovery(); }
    else if (action === 'discovery-pause') { discoveryPaused = !discoveryPaused; refreshDiscovery(); }
    else if (action === 'overview-range') { overviewRange = id; render(); }
    else if (action === 'stock-range') { stockRange = id; selectedCandleKey = null; render(); }
    else if (action === 'chart-type') { chartType = id; render(); }
    else if (action === 'chart-event') {
      selectedCandleKey = id || null; render();
      const marker = document.querySelector(`.cc-event-marker[data-id="${CSS.escape(id)}"]`) ?? document.querySelector('.cc-chart-svg');
      if (id) marker?.focus({preventScroll:true});
    }
    else if (action === 'chart-event-close') { selectedCandleKey = null; render(); }
    else if (action === 'stock-tab') { stockTab = id; render(); }
    else if (action === 'stock-review-course') { reviewCourse = id; commentLimit = 12; stockTab = 'community'; render(); }
    else if (action === 'stock-review-jump') { stockTab = 'community'; render(); document.querySelector('.sd-discussion')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if (action === 'stock-reviews') { navigate('stock', id); reviewCourse = target.dataset.course || 'all'; stockTab = 'community'; render(); document.querySelector('.sd-discussion')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if (action === 'stock-comment-sort') { commentSort = id; commentLimit = 12; render(); }
    else if (action === 'stock-more') { commentLimit = Number(id); render(); }
    else if (action === 'feed-scope') { feedMine = id === 'mine'; communityLimit = 24; render(); }
    else if (action === 'community-sort') { communitySort = id; communityLimit = 24; render(); }
    else if (action === 'community-tone') { communityTone = id; communityLimit = 24; render(); }
    else if (action === 'community-more') { communityLimit = Number(id); render(); }
    else if (action === 'community-clear') { communityTone = 'all'; communityQuery = ''; communityLimit = 24; render(); }
    else if (action === 'like-comment') {
      state.commentLikes ??= {}; state.commentLikes[id] = !state.commentLikes[id]; save();
      if (modal.open) { target.classList.toggle('liked', state.commentLikes[id]); target.setAttribute('aria-pressed', String(state.commentLikes[id])); target.textContent = `♡ ${state.commentLikes[id] ? 1 : 0}`; }
      else render();
    }
    else if (action === 'nav') navigate(target.dataset.view);
    else if (action === 'dismiss') modal.close();
    else if (action === 'filter-dept') { department = id; page = 0; render(); }
    else if (action === 'range') { range = id; render(); }
    else if (action === 'page') { page += Number(id); refreshTable(); }
    else if (action === 'stock') showStock(id);
    else if (action === 'favorite') { state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id]; save(); render(); }
    else if (action === 'edit') showEditor();
    else if (action === 'gpa') showGpa();
    else if (action === 'review') showReview(id);
    else if (action === 'about') showAbout();
    else if (action === 'conclusion') showConclusion();
    else if (action === 'news-detail') showNews(id);
    else if (action === 'clear-courses') { draftCourses.clear(); renderEditorList(); }
    else if (action === 'apply-courses') {
      const selected = catalog.courses.filter(c => draftCourses.has(c.id));
      if (courseConflicts(selected).length) return toast('겹치는 수업을 먼저 조정해주세요.');
      state.selectedCourseIds = [...draftCourses];
      for (const cid of Object.keys(state.pendingReviews)) if (!draftCourses.has(cid)) delete state.pendingReviews[cid];
      save(); modal.close(); render(); toast(`${selected.length}개 강의로 포트폴리오를 구성했어요.`);
    }
  } catch (error) { toast(error.message); }
});

document.addEventListener('input', event => {
  if (event.isComposing) return;
  const input = event.target;
  if (input.id === 'review-comment') { currentReview.comment = input.value; document.querySelector('#comment-count').textContent = `${input.value.length}/120`; }
  else if (input.id === 'market-search') {
    query = input.value.trim(); page = 0;
    const start = input.selectionStart;
    refreshTable();
    const replacement = document.querySelector('#market-search');
    replacement.focus();
    if (start !== null) replacement.setSelectionRange(start, start);
  } else if (input.id === 'community-search') {
    communityQuery = input.value; communityLimit = 24;
    const start = input.selectionStart; render();
    const replacement = document.querySelector('#community-search'); replacement?.focus();
    if (start !== null) replacement?.setSelectionRange(start,start);
  } else if (input.id === 'course-search') { editorQuery = input.value.trim(); renderEditorList(); }
  else if (input.dataset.rating !== undefined) {
    const i = Number(input.dataset.rating);
    currentReview.ratings[i] = Number(input.value);
    document.querySelector(`#rating-output-${i}`).innerHTML = `${input.value}<small>/5</small>`;
    updateReviewPreview();
  } else if (input.id === 'gpa-input') {
    const value = Number(input.value);
    document.querySelector('#gpa-weight').textContent = input.value !== '' && value >= 0 && value <= 4.5 ? `×${gpaWeight(value).toFixed(3)}` : '0~4.5 입력';
  }
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'market-department') { department = input.value; page = 0; render(); }
  else if (input.id === 'market-sort') { sort = input.value; if (['up','down','reviews'].includes(ranking)) ranking = 'all'; page = 0; refreshTable(); }
  else if (input.id === 'mine-toggle') { onlyMine = input.checked; page = 0; refreshTable(); }
  else if (input.dataset.course) { input.checked ? draftCourses.add(input.dataset.course) : draftCourses.delete(input.dataset.course); input.closest('.course-option').classList.toggle('chosen', input.checked); updateEditorSummary(); }
  else if (input.id === 'review-course') showReview(input.value);
});

document.addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (event.target.id === 'review-form') {
      queueReview(state, catalog, currentReview.courseId, currentReview.ratings, currentReview.comment);
      closeMarket(state, catalog);
      save(); modal.close(); render(); toast('오늘의 평가와 한 줄 평을 시세와 라운지에 반영했어요.');
    } else if (event.target.id === 'gpa-form') {
      const value = Number(document.querySelector('#gpa-input').value);
      gpaWeight(value); state.gpa = value; save(); modal.close(); render(); toast(`평가 가중치를 ×${gpaWeight(value).toFixed(2)}로 설정했어요.`);

    }
  } catch (error) { toast(error.message); }
});

modal.addEventListener('click', event => {
  if (event.target !== modal) return;
  const box = modal.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close();
});

window.addEventListener('popstate', readRoute);
window.addEventListener('hashchange', readRoute);
readRoute();
save();


setInterval(() => {
  if (embedded || gameClockReader.connected() || !state.playing || modal.open || view === 'stock' && selectedCandleKey || document.activeElement?.matches('input, textarea, select, .sd-chart-svg, .cc-chart-svg, .mo-chart, [data-action="chart-event"]') || document.querySelector('.sd-chart:hover, .cc-chart:hover, .mo-chart:hover, .sd-discussion:hover, .lounge-grid:hover, .rl-grid:hover, .rl-featured:hover, .mb-discovery:hover, .mb-discovery:focus-within, .review-ribbon:hover, .review-ribbon:focus-within')) return;
  try {
    const scroll = window.scrollY;
    advanceSimulation(state, catalog);
    save(); render();
    window.scrollTo(0, scroll);
  } catch (error) {
    state.playing = false;
    toast(error.message);
  }
}, 2500);

// The host owns time when embedded. UI controls never create news or advance it.
let syncingGameClock = false;
let pendingGameRender = false;
async function syncGameClock() {
  if (!embedded || syncingGameClock) return;
  const snapshot = gameClockReader.read();
  if (!normalizeGameClock(snapshot)) {
    if (snapshot?.active === false && state.playing) { state.playing = false; pendingGameRender = true; }
    return;
  }
  syncingGameClock = true;
  try {
    const nextKey = gameStorageKey(snapshot);
    if (storageKey !== nextKey) {
      const saved = await loadDemo(nextKey);
      state = validState(saved, snapshot) ? saved : createGameState(catalog, snapshot);
      ensureMarketData(state, catalog);
      ensureDemoContent(state, catalog);
      storageKey = nextKey;
      if (modal.open) modal.close();
      selectedCandleKey = null;
      pendingGameRender = true;
      await save();
    }
    const result = applyHostTime(snapshot);
    if (result.changed) { await save(); pendingGameRender = true; }
    if (pendingGameRender && !modal.open && !document.activeElement?.matches('input, textarea, select')) {
      const scroll = window.scrollY;
      render(); window.scrollTo(0, scroll);
      pendingGameRender = false;
    }
  } catch (error) { console.warn('Exchange clock synchronization failed:', error); }
  finally { syncingGameClock = false; }
}
setInterval(syncGameClock, 250);


function refreshDiscovery() {
  const region = document.querySelector('#discovery-region');
  if (!region) return;
  const focused = region.contains(document.activeElement) ? document.activeElement.dataset : null;
  const focusAction = focused?.action, focusId = focused?.id;
  region.innerHTML = board.discovery(discoveryIndex, discoveryPaused);
  if (focusAction) region.querySelector(`[data-action="${CSS.escape(focusAction)}"]${focusId == null ? '' : `[data-id="${CSS.escape(focusId)}"]`}`)?.focus({preventScroll:true});
}
setInterval(() => {
  if (view !== 'market' || discoveryPaused || document.hidden || modal.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const card = document.querySelector('.mb-discovery');
  if (!card || card.matches(':hover') || card.contains(document.activeElement)) return;
  discoveryIndex = (discoveryIndex + 1) % 3;
  refreshDiscovery();
}, 5000);


function refreshRibbon() {
  const region = document.querySelector('#review-ribbon-region');
  if (!region) return;
  const focused = region.contains(document.activeElement) ? document.activeElement.dataset : null;
  const focusAction = focused?.action, focusId = focused?.id;
  region.innerHTML = ribbon.render({paused:ribbonPaused});
  if (focusAction) region.querySelector(`[data-action="${CSS.escape(focusAction)}"]${focusId == null ? '' : `[data-id="${CSS.escape(focusId)}"]`}`)?.focus({preventScroll:true});
}
setInterval(() => {
  if (view !== 'market' || ribbonPaused || document.hidden || modal.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const strip = document.querySelector('.review-ribbon');
  if (!strip || strip.matches(':hover') || strip.contains(document.activeElement)) return;
  ribbon.step(1);
  refreshRibbon();
}, 6000);
