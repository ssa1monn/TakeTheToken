import { VERSION, DEPARTMENTS, RATING_LABELS, gpaWeight, ratingScore, createState, portfolio, indexHistory, queueReview, previewReview, queueEvent, closeMarket, courseConflicts, dateForDay, ensureMarketData } from './market.js';

import { currentClock, evaluationWindow, timeLabel } from './campus.js';
import { advanceSimulation, fastForwardToday, initializeSimulation, randomCampusEvent, processCampus, ensureDemoContent } from './simulation.js';
import { createLiveUI } from './live-ui.js';
import { createStockDetailUI } from './stock-detail.js';
import { createMarketBoard } from './market-board.js';
import { loadDemo, saveDemo } from './store.js';
import { createPortfolioUI } from './portfolio-ui.js';
import { smoothPath } from './candle-chart.js';

const STORAGE_KEY = 'inu-exchange-demo-v3';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const catalog = await fetch('./data/catalog.json').then(r => { if (!r.ok) throw new Error('강의 데이터를 읽을 수 없어요.'); return r.json(); }).catch(error => {
  app.innerHTML = `<div class="loading">${error.message} 페이지를 새로고침해주세요.</div>`;
  throw error;
});
let state;
try {
  const saved = await loadDemo(STORAGE_KEY);
  if (saved?.version === VERSION && saved.day >= 20 && catalog.professors.every(p => saved.stocks[p.id]?.history.length === saved.stocks[catalog.professors[0].id]?.history.length) && saved.selectedCourseIds.every(id => catalog.courses.some(c => c.id === id))) state = saved;
} catch { /* A fresh demo is available when browser storage is unavailable. */ }
if (!state) { state = createState(catalog); initializeSimulation(state, catalog); }
ensureMarketData(state, catalog);
ensureDemoContent(state, catalog);
let view = 'market';
let department = 'all';
let query = '';
let page = 0;
let range = 'month';
let sort = 'return';
let onlyMine = false;
let feedMine = false;
let ranking = 'all';
let currentStock = null;
let stockRange = 'month';
let chartType = 'candle';
let selectedCandleKey = null;
let stockTab = 'community';
let commentSort = 'recent';
let commentLimit = 12;
let draftCourses = new Set();
let editorQuery = '';
let currentReview = null;
let toastTimer;
const modeStates = {};

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
const pendingCount = () => Object.keys(state.pendingReviews).length + state.events.filter(e => !e.applied).length;
const live = createLiveUI({ getState: () => state, catalog, icon, esc, pct, number, direction, prof, course, colorFor });
const detail = createStockDetailUI({ getState: () => state, catalog, icon, esc, pct, number, direction, prof, course, colorFor, live });
const board = createMarketBoard({ getState: () => state, catalog, icon, esc, pct, number, direction, colorFor, course, live, reviewsFor: id => detail.reviewsFor(id) });
const assets = createPortfolioUI({ getState: () => state, catalog, icon, esc, pct, number, direction, colorFor, prof, course, chart });

let storageErrorShown = false;
function save() {
  return saveDemo(STORAGE_KEY, state).catch(() => {
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
  return `<svg class="sparkline" viewBox="0 0 100 34" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  const path = smoothPath(values.map((v,i)=>({x:x(i),y:y(v)})));
  const area = `${path} L${x(values.length - 1)},${height - bottom} L${left},${height - bottom} Z`;
  const grids = Array.from({ length: 4 }, (_, i) => {
    const value = min + (max - min) * i / 3;
    return `<line x1="0" x2="${width - right + 8}" y1="${y(value)}" y2="${y(value)}" stroke="#e8ebf0" stroke-dasharray="3 5"/><text x="${width - 1}" y="${y(value) + 4}" text-anchor="end" fill="#8b929e" font-size="11">${value.toFixed(1)}</text>`;
  }).join('');
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].map(i => `<text x="${x(i)}" y="${height - 2}" text-anchor="${i === 0 ? 'start' : 'middle'}" fill="#939aa5" font-size="11">${esc(data[i].label ?? dateForDay(data[i].day))}</text>`).join('');
  return `<div class="chart-wrap"><svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(name)}. 시작 ${number(values[0])}, 현재 ${number(values.at(-1))}. 모든 가격은 시연값입니다."><defs><linearGradient id="fill-${id}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#5471b5" stop-opacity=".15"/><stop offset="1" stop-color="#5471b5" stop-opacity="0"/></linearGradient></defs>${grids}<path d="${area}" fill="url(#fill-${id})"/><path d="${path}" fill="none" stroke="#4967aa" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="4" fill="#4967aa" stroke="white" stroke-width="2"/>${labels}</svg></div>`;
}

function sidebar() { return live.topbar(view); }

function header() {
  const titles = { market: ['교수님 증시', '수업이 끝나면, 새로운 장이 열린다.'], timetable: ['내 시간표', '이번 학기 수업이 나만의 종목으로.'] };
  return `${live.sessionBar()}${titles[view] ? `<header class="page-header"><div><h1>${titles[view][0]}</h1><p>${titles[view][1]}</p></div>${view === 'market' ? '<span class="market-season">2026 가을학기 <span>정보기술대학</span></span>' : ''}</header>` : ''}`;
}

function portfolioCard() { return assets.compact(); }

function marketView() {
  return board.render({ department, query, page, sort, onlyMine, ranking });
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
  return `<div class="timetable-summary"><div><span class="eyebrow">2026 FALL SEMESTER</span><h2>${etf.selected.length}개 강의가 <span>${etf.holdings.length}개 종목</span>으로 연결돼요.</h2><p>총 ${etf.totalCredits}학점 · 같은 교수님의 수업은 학점을 합쳐 비중을 계산해요.</p></div><button class="button primary" data-action="edit">${icon('plus')}시간표 편집</button></div><div class="timetable-layout"><section class="card timetable-card"><div class="section-head"><h2>나의 주간 시간표</h2><span class="small-badge">편람의 실제 수업 시간</span></div><div class="timetable-scroll"><div class="timetable-grid" style="--days:${days.length}"><div class="time-axis"><div class="day-head"></div><div class="hours" style="height:${height}px">${Array.from({ length: endHour - startHour + 1 }, (_, i) => `<span style="top:${i * 60}px">${String(startHour + i).padStart(2, '0')}:00</span>`).join('')}</div></div>${days.map(day => `<div class="day-column"><div class="day-head">${day}</div><div class="day-content" style="height:${height}px">${meetings.filter(m => m.day === day).map(m => `<button class="class-block" style="top:${minutes(m.start) - startHour * 60}px;height:${minutes(m.end) - minutes(m.start)}px;--class-color:${colorFor(m.course.professorId)}" data-action="stock" data-id="${m.course.professorId}"><strong>${esc(m.course.name)}</strong><span>${esc(prof(m.course.professorId).name)}</span><small>${m.start}–${m.end}</small></button>`).join('')}</div></div>`).join('')}</div></div>${etf.selected.some(c => !c.meetings.length) ? '<p class="hint">시간이 없는 강의는 아래 목록에서 확인할 수 있어요.</p>' : ''}</section><div class="timetable-side">${portfolioCard()}<section class="card course-list"><div class="section-head"><h3>내 강의 실적 리포트</h3><span class="heading-count">${etf.selected.length}</span></div>${etf.selected.map(c => `<div class="my-course"><div><strong>${esc(c.name)}</strong><span>${esc(prof(c.professorId).name)} · ${c.credits}학점</span></div><button class="button ${state.pendingReviews[c.id] ? 'subtle' : 'outline'} small" data-action="review" data-id="${c.id}" ${live.statusFor(c).canRate ? '' : 'disabled'}>${live.statusFor(c).submitted ? '완료' : live.statusFor(c).canRate ? '평가하기' : '잠김'}</button></div>`).join('') || '<p class="muted">시간표에 첫 강의를 담아주세요.</p>'}</section></div></div>`;
}

function newsView() { return live.news(); }

function render() {
  detail.invalidateReviews();
  app.innerHTML = `<div class="app-shell">${sidebar()}<main id="main" class="main-content">${header()}${view === 'stock' ? detail.render(currentStock, {range:stockRange,tab:stockTab,commentSort,commentLimit,chartType,selectedCandleKey}) : view === 'market' ? marketView() : view === 'portfolio' ? assets.render({range}) : view === 'timetable' ? timetableView() : view === 'community' ? live.community(feedMine) : newsView()}<footer class="page-footer"><span>INU EXCHANGE · 2026 바이브코딩 <span>가상 시세 · 가상 뉴스 · 가상 수강평</span></span><button data-action="about">데이터·서비스 안내 ${icon('info')}</button></footer></main></div>`;
  if (view === 'stock') detail.mount();
  document.title = view === 'stock' ? `${prof(currentStock).name} · 인천대 거래소` : '인천대 거래소 — 교수님 증시';
}

function refreshTable() { detail.invalidateReviews(); const region = document.querySelector('#market-table-region'); if (region) region.innerHTML = marketTable(); }

function showEditor() {
  draftCourses = new Set(state.selectedCourseIds);
  editorQuery = '';
  openModal(`${modalHead('BUILD YOUR PORTFOLIO', '내 시간표 구성하기')}<p class="modal-description">실제 개설 강의를 골라보세요. 같은 교수님의 강의는 하나의 종목으로 합쳐져요.</p><div class="editor-toolbar"><label class="search-box">${icon('search')}<input id="course-search" type="search" placeholder="강의명, 교수님, 학수번호 검색" aria-label="강의 검색" data-autofocus></label><button class="text-button" data-action="clear-courses">선택 비우기</button></div><div id="editor-list" class="editor-list"></div><div class="editor-summary" id="editor-summary"></div><div class="modal-footer"><span class="hint">구성을 바꾸면 같은 시즌의 지수를 다시 계산해요.</span><button id="apply-courses" class="button primary" data-action="apply-courses">포트폴리오 적용 ${icon('arrow')}</button></div>`, 'wide');
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
  document.querySelector('#editor-summary').innerHTML = `<strong>${selected.length}개 강의 <span>→</span> ${count}개 종목</strong><span>${credits}학점 선택</span>${conflicts.length ? `<p class="conflict">${esc(course(conflicts[0][0]).name)} / ${esc(course(conflicts[0][1]).name)} 수업 시간이 겹쳐요.</p>` : ''}`;
  document.querySelector('#apply-courses').disabled = conflicts.length > 0;
}

function showGpa() {
  openModal(`${modalHead('MY ANALYST PROFILE', '평가 영향력 설정')}<p class="modal-description">GPA는 내 수업 평가의 반영 가중치예요. 종목 구성은 내 시간표의 학점으로 정해져요.</p><form id="gpa-form"><label class="field-label" for="gpa-input">나의 시연용 GPA</label><div class="gpa-input-wrap"><input id="gpa-input" name="gpa" type="number" min="0" max="4.5" step="0.01" value="${state.gpa}" required data-autofocus><span>/ 4.5</span></div><div class="weight-preview"><span>평가 반영 가중치</span><strong id="gpa-weight">×${gpaWeight(state.gpa).toFixed(3)}</strong></div><p class="hint">가중치 = 1 + 0.5 × GPA / 4.5<br>자가 입력하는 시연값이에요. 이미 마감한 평가와 가격은 바꾸지 않아요.</p><div class="modal-footer"><button type="button" class="button outline" data-action="dismiss">닫기</button><button class="button primary" type="submit">저장하기</button></div></form>`);
}

function showReview(courseId) {
  const now = currentClock(state);
  const today = live.todayCourses();
  const available = today.filter(c => live.statusFor(c).canRate);
  const requested = today.find(c => c.id === courseId);
  const c = requested ?? available[0];
  if (!c || !live.statusFor(c).canRate) {
    openModal(`${modalHead('AFTER CLASS ONLY', '수업이 끝나면 만나요.')}<p class="modal-description">${now.date.replaceAll('-', '.')} (${now.weekday}) ${timeLabel(now.minute)} · ${state.clockMode === 'live' ? '실제 한국시간' : '시연 시간'} 기준이에요. 당일 마지막 수업이 끝난 강의만 평가할 수 있어요.</p>${live.todayClasses()}<div class="modal-footer"><button class="button primary" data-action="dismiss">확인했어요</button></div>`);
    return;
  }
  currentReview = { courseId: c.id, ratings: [...(state.pendingReviews[c.id]?.ratings ?? [4,4,4,4,4,4])], comment: state.pendingReviews[c.id]?.comment ?? '' };
  openModal(`${modalHead('AFTER-CLASS REPORT', '오늘 수업, 한 줄로 어땠나요?')}<p class="modal-description">${now.weekday}요일 수업 종료 확인. GPA 가중치를 더해 수업 경험을 종목에 반영해요.</p><label class="field-label" for="review-course">종료된 오늘의 수업</label><select id="review-course" class="full-select">${available.map(item => `<option value="${item.id}" ${c.id === item.id ? 'selected' : ''}>${esc(item.name)} · ${esc(prof(item.professorId).name)}</option>`).join('')}</select><form id="review-form"><div class="rating-list">${RATING_LABELS.map((label, i) => `<label class="rating-row"><span>${label}</span><input aria-label="${label}" type="range" name="rating-${i}" data-rating="${i}" min="1" max="5" step="1" value="${currentReview.ratings[i]}"><output id="rating-output-${i}">${currentReview.ratings[i]}<small>/5</small></output></label>`).join('')}</div><label class="field-label" for="review-comment">한 줄 평가 <span class="optional-label">선택 · 120자</span></label><textarea id="review-comment" name="comment" rows="2" maxlength="120" placeholder="이해 완. 오늘은 나도 제법 전공생일지도?">${esc(currentReview.comment)}</textarea><div class="comment-counter"><span>점수로 담기 어려운 오늘의 경험을 남겨보세요.</span><span id="comment-count">${currentReview.comment.length}/120</span></div><div class="review-preview"><div><span>나의 평가 점수</span><strong id="my-review-score"></strong></div><div><span>GPA ${state.gpa.toFixed(2)} 반영</span><strong>×${gpaWeight(state.gpa).toFixed(2)}</strong></div><div><span>회차 보정점수 예상</span><strong id="aggregate-preview"></strong></div></div><p class="hint" id="review-cohort"></p><div class="modal-footer"><span class="hint">반영 후에는 같은 수업을 오늘 다시 평가할 수 없어요.</span><button class="button primary" type="submit">${state.pendingReviews[c.id] ? '평가 수정하기' : '한 줄과 함께 제출'} ${icon('arrow')}</button></div></form>`);
  updateReviewPreview();
}

function updateReviewPreview() {
  document.querySelector('#my-review-score').textContent = ratingScore(currentReview.ratings).toFixed(1);
  const preview = previewReview(state, currentReview.courseId, currentReview.ratings);
  document.querySelector('#aggregate-preview').textContent = preview.score.toFixed(1);
  document.querySelector('#review-cohort').textContent = `다른 가상 수강생 ${preview.count - 1}명의 응답에 내 평가를 더하고 표본 수를 보정해요.`;
}

function showEvent() {
  openModal(`${modalHead('SIMULATION EVENT', '다음 장에 호재 더하기')}<p class="modal-description">학과 전체와 교수님 한 종목에 작용하는 가상 이벤트를 비교해보세요.</p><form id="event-form"><div class="event-types"><label><input type="radio" name="event-type" value="department" checked><span>${icon('grid')}학과 공통 호재<small>관련 학과 모든 종목 +0.6%</small></span></label><label><input type="radio" name="event-type" value="research"><span>${icon('spark')}연구 성과 발표<small>선택한 한 종목 +1.2%</small></span></label></div><label class="field-label" for="event-target">이벤트 적용 대상</label><select id="event-target" class="full-select">${DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select><div class="event-explainer">${icon('info')}<span>이 공시는 시연용 가상 시나리오예요. 실제 학교 소식이 아니며, 같은 날 같은 대상에 한 번만 추가돼요.</span></div><div class="modal-footer"><span class="hint">장 마감 후 차트와 지수에 반영</span><button type="submit" class="button primary">가상 공시 등록 ${icon('plus')}</button></div></form>`);
}

function showNews(id) {
  const event = state.events.find(e => e.id === id);
  if (!event) return;
  openModal(`${modalHead('CAMPUS NEWS', esc(event.title))}<span class="small-badge">${event.displayOnly ? '이전 소식 · ' : ''}${esc(event.source)}</span><p class="news-body">${esc(event.summary)}</p><div class="weight-preview"><span>${event.displayOnly ? '참고용 소식 · 시세 미반영' : event.type === 'department' ? '학과 내 모든 종목' : '해당 교수님 종목'}</span><strong class="${direction(event.impact)}">${event.displayOnly || !event.impact ? '정보 알림' : pct(event.impact)}</strong></div>${event.displayOnly || !event.impact ? '' : `<p class="hint">${event.applied ? '시세에 한 번 반영했어요.' : '다음 갱신에 반영할 예정이에요.'}</p>`}<div class="modal-footer">${event.type === 'research' ? `<button class="button outline" data-action="stock" data-id="${esc(event.targetId)}">종목 보기 ${icon('arrow')}</button>` : ''}<button class="button primary" data-action="dismiss">닫기</button></div>`);
}

function showGuide() {
  openModal(`${modalHead('LET THE CAMPUS PLAY', '이제 시장이 알아서 움직여요.')}<div class="guide-steps">${[['01','수업 시간표대로 진행','종료된 강의에만 가상 학생들의 점수와 한 줄 평이 생겨요.'],['02','캠퍼스의 랜덤 사건','연구 성과, 수상, 서버 장애와 학과 소식이 지수를 흔들어요.'],['03','내 시간표에 도착하는 반응','오늘 수업이 끝나면 직접 한 줄 평도 남길 수 있어요.']].map(([num,title,text]) => `<div><span>${num}</span><section><h3>${title}</h3><p>${text}</p></section></div>`).join('')}</div><div class="guide-highlight">가상 시연은 시간 압축이 가능해요. 실제 KST 모드에서는 현재 한국시간을 사용하며, 종료 전 평가와 시간 건너뛰기는 막혀 있어요.</div><div class="modal-footer"><button class="button outline" data-action="dismiss">시장을 지켜볼게요</button><button class="button primary" data-action="fast-forward" ${state.clockMode === 'live' ? 'disabled' : ''}>오늘 몰아보기 ${icon('arrow')}</button></div>`);
}

function showReceipt(before, result) {
  const marketValue = indexHistory(state, catalog).at(-1).price, now = currentClock(state);
  const movers = [...catalog.professors].sort((a,b) => Math.abs(state.stocks[b.id].lastReturn) - Math.abs(state.stocks[a.id].lastReturn)).slice(0,3);
  openModal(`${modalHead('CAMPUS RECAP', `${now.date.replaceAll('-', '.')} 시장 리포트`)}<p class="modal-description">수업 ${result.classCount ?? result.reviewCount}개와 공시 ${result.eventCount}건을 추가 반영했어요.</p><div class="close-result"><span>INU 종합 지수</span><strong>${number(before)} ${icon('arrow')} ${number(marketValue)}</strong><span class="${direction(marketValue / before - 1)}">이번 진행 ${pct(marketValue / before - 1)}</span></div><div class="close-movers">${movers.map(p => `<button data-action="stock" data-id="${p.id}"><span>${esc(p.name)}<small>${deptShort(p.department)}</small></span><strong class="${direction(state.stocks[p.id].lastReturn)}">${pct(state.stocks[p.id].lastReturn)}</strong>${icon('chevron')}</button>`).join('')}</div><p class="hint">라운지에서 새로 올라온 한 줄 평을 읽어보세요.<br>시연은 일시정지됐어요. 자동 진행을 누르면 다음 날로 이어져요.</p><div class="modal-footer"><button class="button outline" data-action="conclusion">시즌 결산 미리보기</button><button class="button primary" data-action="nav" data-view="community">수강평 구경하기 ${icon('arrow')}</button></div>`);
}

function closeSession() {
  const before = indexHistory(state, catalog).at(-1).price;
  const result = closeMarket(state, catalog);
  save(); render(); showReceipt(before, result);
}

function showConclusion() {
  const etf = portfolio(state, catalog);
  const biggest = [...etf.holdings].sort((a, b) => b.weight * (state.stocks[b.id].price - 100) - a.weight * (state.stocks[a.id].price - 100))[0];
  openModal(`${modalHead('SEASON RECAP PREVIEW', '나의 캠퍼스 시즌 기록')}<div class="recap-card"><span>2026 FALL · INUC EXCHANGE</span><h2>${etf.holdings.length > 3 ? '전공 올라운더' : '전공 집중러'}</h2><p>나의 시간표, 나만의 포트폴리오.</p><div><strong>${pct(etf.totalReturn)}</strong><span>시즌 시작 대비 · 시연 수익률</span></div><dl><div><dt>수강 구성</dt><dd>${etf.selected.length}개 강의 · ${etf.totalCredits}학점</dd></div><div><dt>시간표 교수님 종목</dt><dd>${etf.holdings.length}개</dd></div><div><dt>최대 기여 종목</dt><dd>${biggest ? esc(prof(biggest.id).name) : '구성 대기'}</dd></div><div><dt>시세 기록</dt><dd>${state.day}회 갱신</dd></div></dl></div><div class="modal-footer"><span class="hint">유니코인으로 기록한 이번 학기 시연 결과예요.</span><button class="button primary" data-action="dismiss">확인했어요</button></div>`);
}

function showAbout() {
  openModal(`${modalHead('ABOUT THIS DEMO', '데이터와 시연 안내')}<div class="about-content"><h3>실제 데이터</h3><p>2026년 9월 4일 기준 인천대학교 종합강의시간표 중 정보기술대학의 교수님 이름 후보 41개와 개설 강의 129개를 사용했어요. 과목명·담당자·학점·시간표는 원본에서 가져왔어요.</p><h3>가상 시뮬레이션</h3><p>평가, 학생 GPA, 연구 성과 뉴스와 모든 가격은 체험을 위한 가상 데이터예요. 특정 교수님의 실제 평가나 성과를 나타내지 않아요.</p><h3>종목과 학과 연결</h3><p>정보기술대학 내 이름과 개설 학과 기준으로 만든 임시 종목이에요. 전교 인물 식별과 실제 교원 소속 확인까지 완료한 명부는 아니에요.</p><h3>브리핑과 기록</h3><p>브리핑은 확정 수치로 만드는 규칙 기반 데모예요. 실시간 AI와 학사 시스템은 연결하지 않았어요. 입력 내용은 현재 브라우저에 저장되며 다른 사람과 공유되지 않아요.</p><h3>계산 규칙</h3><p>시즌 기준가는 100 유니코인. 수업 평가·뉴스·시연 변동을 반영해 가격이 움직여요. 학과 지수는 종목 동일가중이고, 내 자산은 각 강의의 학점 × 담당 교수님 주가를 모두 더한 값이에요. GPA 가중치는 1 + 0.5 × GPA / 4.5예요.</p></div><div class="modal-footer"><button class="button primary" data-action="dismiss">확인했어요</button></div>`, 'wide');
}


function navigate(next, id) {
  if (next === 'stock' && !prof(id)) return;
  selectedCandleKey = null;
  if (next === 'stock' && currentStock !== id) { stockRange = 'month'; stockTab = 'community'; commentSort = 'recent'; commentLimit = 12; selectedCandleKey = null; }
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
function showSimulationSettings() {
  openModal(`${modalHead('DEMO STUDIO', '캠퍼스 시연 설정')}<p class="modal-description">자동으로 수업이 끝나고, 한 줄 평과 소식이 시세에 반영돼요.</p><div class="settings-row"><span>시계 모드</span><div class="clock-mode"><button data-action="clock-mode" data-id="demo" class="${state.clockMode === 'demo' ? 'active' : ''}">가상 시연</button><button data-action="clock-mode" data-id="live" class="${state.clockMode === 'live' ? 'active' : ''}">실제 KST</button></div></div>${state.clockMode === 'demo' ? `<div class="settings-row"><label for="simulation-speed">진행 속도</label><select id="simulation-speed"><option value="5" ${state.speed===5?'selected':''}>천천히 · 5분씩</option><option value="10" ${state.speed===10?'selected':''}>보통 · 10분씩</option><option value="30" ${state.speed===30?'selected':''}>빠르게 · 30분씩</option></select></div>` : ''}<div class="settings-row"><label for="market-volatility">시장 변동성</label><select id="market-volatility"><option value="lively" ${state.volatilityMode !== 'calm' ? 'selected' : ''}>활발 · 큰 등락</option><option value="calm" ${state.volatilityMode === 'calm' ? 'selected' : ''}>차분 · 작은 등락</option></select></div><p class="hint">뉴스·평가 반응과 시연 가격의 움직임을 조절해요. 이미 쌓인 가격 기록은 유지돼요.</p><div class="settings-actions"><button class="button subtle" data-action="fast-forward" ${state.clockMode==='live'?'disabled':''}>${icon('spark')}오늘 몰아보기</button><button class="button outline" data-action="random-event">${icon('news')}랜덤 속보 추가</button></div><div class="modal-footer"><button class="text-button" data-action="reset">${icon('reset')}데모 초기화</button><button class="button primary" data-action="dismiss">시장으로 돌아가기</button></div>`);
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  event.preventDefault();
  const { action, id } = target.dataset;
  try {
    if (action === 'toggle-play') { state.playing = !state.playing; save(); render(); }
    else if (action === 'simulation-settings') showSimulationSettings();
    else if (action === 'ranking') { ranking = id; page = 0; refreshTable(); }
    else if (action === 'stock-range') { stockRange = id; selectedCandleKey = null; render(); }
    else if (action === 'chart-type') { chartType = id; render(); }
    else if (action === 'chart-event') {
      selectedCandleKey = id || null; render();
      const marker = document.querySelector(`.cc-event-marker[data-id="${CSS.escape(id)}"]`) ?? document.querySelector('.cc-chart-svg');
      if (id) marker?.focus({preventScroll:true});
    }
    else if (action === 'chart-event-close') { selectedCandleKey = null; render(); }
    else if (action === 'stock-tab') { stockTab = id; render(); }
    else if (action === 'stock-comment-sort') { commentSort = id; commentLimit = 12; render(); }
    else if (action === 'stock-more') { commentLimit = Number(id); render(); }
    else if (action === 'clock-mode') {
      if (id === state.clockMode) return;
      selectedCandleKey = null;
      modeStates[state.clockMode] = state;
      const previous = state;
      state = modeStates[id] ?? createState(catalog);
      state.clockMode = id;
      state.selectedCourseIds = [...previous.selectedCourseIds];
      state.gpa = previous.gpa;
      state.favorites = [...previous.favorites];
      state.playing = previous.playing;
      if (!modeStates[id]) initializeSimulation(state, catalog);
      save(); render();
      if (modal.open) showSimulationSettings();
      toast(id === 'live' ? '실제 한국시간으로 전환했어요. 가상 시연의 미래 평가는 별도 기록에 남겨요.' : '별도 가상 시연 기록으로 돌아왔어요.');
    }
    else if (action === 'fast-forward') { const before = indexHistory(state, catalog).at(-1).price; const result = fastForwardToday(state, catalog); save(); render(); showReceipt(before, result); }
    else if (action === 'random-event') { randomCampusEvent(state, catalog, currentClock(state)); closeMarket(state, catalog); save(); render(); toast('새로운 랜덤 공시가 도착했어요.'); }
    else if (action === 'feed-scope') { feedMine = id === 'mine'; render(); }
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
    else if (action === 'event') showEvent();
    else if (action === 'guide') showGuide();
    else if (action === 'about') showAbout();
    else if (action === 'conclusion') showConclusion();
    else if (action === 'news-detail') showNews(id);
    else if (action === 'close-market') closeSession();
    else if (action === 'clear-courses') { draftCourses.clear(); renderEditorList(); }
    else if (action === 'apply-courses') {
      const selected = catalog.courses.filter(c => draftCourses.has(c.id));
      if (courseConflicts(selected).length) return toast('겹치는 수업을 먼저 조정해주세요.');
      state.selectedCourseIds = [...draftCourses];
      for (const cid of Object.keys(state.pendingReviews)) if (!draftCourses.has(cid)) delete state.pendingReviews[cid];
      save(); modal.close(); render(); toast(`${selected.length}개 강의로 포트폴리오를 구성했어요.`);
    }
    else if (action === 'run-demo') {
      const c = course(state.selectedCourseIds[0]);
      if (!c) { showEditor(); return toast('먼저 시간표에 강의를 담아주세요.'); }
      queueReview(state, catalog, c.id, [5,4,5,4,5,4]);
      queueEvent(state, catalog, { type: 'department', targetId: c.department });
      closeSession();
    }
    else if (action === 'reset') openModal(`${modalHead('RESET DEMO', '데모를 처음으로 되돌릴까요?')}<p class="modal-description">이 브라우저의 시간표 변경, GPA 설정과 시연 기록이 초기 구성으로 돌아가요.</p><div class="modal-footer"><button class="button outline" data-action="dismiss">유지하기</button><button class="button primary" data-action="confirm-reset">초기화하기</button></div>`);
    else if (action === 'confirm-reset') { for (const key of Object.keys(modeStates)) delete modeStates[key]; state = createState(catalog); initializeSimulation(state, catalog); query = ''; department = 'all'; onlyMine = false; page = 0; ranking='all'; save(); navigate('market'); toast('초기 데모로 돌아왔어요.'); }
  } catch (error) { toast(error.message); }
});

document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'review-comment') { currentReview.comment = input.value; document.querySelector('#comment-count').textContent = `${input.value.length}/120`; }
  else if (input.id === 'market-search') {
    query = input.value.trim(); page = 0;
    const start = input.selectionStart;
    refreshTable();
    const replacement = document.querySelector('#market-search');
    replacement.focus();
    if (start !== null) replacement.setSelectionRange(start, start);
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
  if (input.id === 'simulation-speed') { state.speed = Number(input.value); save(); }
  else if (input.id === 'market-volatility') { state.volatilityMode = input.value === 'calm' ? 'calm' : 'lively'; save(); toast('다음 시세부터 변동성 설정을 적용해요.'); }
  else if (input.id === 'market-department') { department = input.value; page = 0; render(); }
  else if (input.id === 'market-sort') { sort = input.value; page = 0; refreshTable(); }
  else if (input.id === 'mine-toggle') { onlyMine = input.checked; page = 0; refreshTable(); }
  else if (input.dataset.course) { input.checked ? draftCourses.add(input.dataset.course) : draftCourses.delete(input.dataset.course); input.closest('.course-option').classList.toggle('chosen', input.checked); updateEditorSummary(); }
  else if (input.id === 'review-course') showReview(input.value);
  else if (input.name === 'event-type') document.querySelector('#event-target').innerHTML = input.value === 'department' ? DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('') : catalog.professors.map(p => `<option value="${p.id}">${esc(p.name)} · ${deptShort(p.department)}</option>`).join('');
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
    } else if (event.target.id === 'event-form') {
      const added = queueEvent(state, catalog, { type: document.querySelector('[name="event-type"]:checked').value, targetId: document.querySelector('#event-target').value });
      if (!added) return toast('같은 날 같은 대상의 공시가 이미 있어요.');
      save(); modal.close(); render(); toast('가상 공시를 등록했어요. 다음 장 마감에 반영돼요.');
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
  if (!state.playing || modal.open || view === 'stock' && selectedCandleKey || document.activeElement?.matches('input, textarea, select, .sd-chart-svg, .cc-chart-svg, [data-action="chart-event"]') || document.querySelector('.sd-chart:hover, .cc-chart:hover')) return;
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
