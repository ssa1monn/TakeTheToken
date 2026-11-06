import { calendarClock, currentClock, evaluationWindow, validateComment } from './campus.js';

export const VERSION = 3;
export const MARKET_VERSION = 3;
export const DEPARTMENTS = ['컴퓨터공학부', '정보통신공학과', '임베디드시스템공학과'];
export const RATING_WEIGHTS = [0.25, 0.20, 0.20, 0.15, 0.15, 0.05];
export const RATING_LABELS = ['이해도', '설명과 구성', '흥미와 몰입', '상호작용', '학습 체감', '진행 명확성'];
export const DEFAULT_COURSE_CODES = ['0010925001', '0011918001', '0011921001', 'IAA6021001', '0001423001', 'IAA6036001'];
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
export const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const sessionAverage = sessions => sessions.length ? sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length : 50;

// Old line-chart saves only know the previous/current close. Never invent historic wicks or causes.
export function ensureMarketData(state, catalog) {
  if (state.marketVersion === MARKET_VERSION) return false;
  state.volatilityMode ??= 'lively';
  for (const p of catalog.professors) {
    const stock = state.stocks[p.id];
    let previous = stock.history[0]?.price ?? 100;
    for (const point of stock.history) {
      if (!Number.isFinite(point.open)) {
        Object.assign(point, { open: previous, close: point.price, high: Math.max(previous, point.price), low: Math.min(previous, point.price), causes: [], legacy: true });
      }
      point.minute ??= point.label?.match(/(\d{2}):(\d{2})$/) ? Number(point.label.slice(-5,-3)) * 60 + Number(point.label.slice(-2)) : 1080;
      point.date ??= dateObjectForDay(point.day).toISOString().slice(0,10);
      for (const cause of point.causes ?? []) if (cause.type === 'flow') {
        cause.type = 'variation';
        if (!cause.id?.startsWith('adjustment:')) {
          cause.title = '시장 변동';
          cause.summary = '교수님별 주가 변동';
        }
      }
      if (point.contributions && 'flow' in point.contributions) {
        point.contributions.variation = point.contributions.flow;
        delete point.contributions.flow;
      }
      previous = point.price;
    }
    stock.contributions.variation ??= stock.contributions.flow ?? 0;
    delete stock.contributions.flow;
    stock.variationState = null;
  }
  state.marketVersion = MARKET_VERSION;
  return true;
}

export function gpaWeight(gpa) {
  if (!Number.isFinite(gpa) || gpa < 0 || gpa > 4.5) throw new Error('GPA는 0.0~4.5 사이로 입력해주세요.');
  return 1 + 0.5 * gpa / 4.5;
}

export function ratingScore(ratings) {
  if (ratings.length !== 6 || ratings.some(r => !Number.isInteger(r) || r < 1 || r > 5)) throw new Error('평가 항목을 모두 선택해주세요.');
  return ratings.reduce((sum, rating, i) => sum + (rating - 1) * 25 * RATING_WEIGHTS[i], 0);
}

export function aggregateReviews(reviews) {
  if (!reviews.length) return null;
  const weights = reviews.map(r => gpaWeight(r.gpa));
  const total = weights.reduce((a, b) => a + b, 0);
  const mean = reviews.reduce((s, r, i) => s + r.score * weights[i], 0) / total;
  const effectiveN = total ** 2 / weights.reduce((s, w) => s + w ** 2, 0);
  return { score: (effectiveN * mean + 250) / (effectiveN + 5), mean, effectiveN, count: reviews.length };
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function random(seed) {
  let value = hash(seed);
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function independentVariation(stock, professorId, seed, lively, historical) {
  const profile = hash(`profile:${professorId}`);
  const individuality = .65 + (profile % 1250) / 1000;
  const model = stock.variationState ??= { seed: hash(`${seed}:${professorId}:variation-v3`), regime: 'choppy', remaining: 0, momentum: 0 };
  const rng = () => {
    model.seed = (Math.imul(1664525, model.seed) + 1013904223) >>> 0;
    return model.seed / 4294967296;
  };
  const gaussian = () => clamp(Math.sqrt(-2*Math.log(Math.max(1e-12,rng()))) * Math.cos(2*Math.PI*rng()),-3,3);
  if (model.remaining <= 0 || rng() < .045) {
    const choice = rng();
    model.regime = choice < .18 ? 'quiet' : choice < .46 ? 'trend' : choice < .78 ? 'choppy' : choice < .92 ? 'reversal' : 'shock';
    const previousDirection = Math.sign(model.momentum) || (rng()<.5?-1:1);
    const direction = rng()<.56 ? previousDirection : -previousDirection;
    if (model.regime === 'trend') model.momentum = direction*(.009+rng()*.016)*individuality;
    else if (model.regime === 'reversal') model.momentum = -previousDirection*(.012+rng()*.018)*individuality;
    else model.momentum *= model.regime === 'quiet' ? .08 : .2;
    model.remaining = model.regime === 'shock' ? 1 : 2+Math.floor(rng()*8);
  }
  model.remaining--;
  const scale = (lively ? 1 : .25) * (historical ? 1.15 : 1);
  const sigma = ({quiet:.0035,trend:.015,choppy:.04,reversal:.022,shock:.03})[model.regime] * individuality * scale;
  const momentum = model.momentum*(1+gaussian()*.18)*scale;
  const shock = model.regime === 'shock' ? (rng()<.5?-1:1)*(.035+rng()*.06)*scale : 0;
  const count = 8+Math.floor(rng()*13), shockAt=Math.floor(rng()*count);
  const deltas = Array.from({length:count},(_,i)=> momentum/count + gaussian()*sigma/Math.sqrt(count) + (i===shockAt?shock:0));
  const label = {quiet:'횡보 구간',trend:'추세 구간',choppy:'불규칙한 움직임',reversal:'방향 전환',shock:'급변 구간'}[model.regime];
  return {deltas,label,eventAt:Math.floor(rng()*count),regime:model.regime};
}

function syntheticReviews(courseId, day) {
  const rng = random(`${courseId}:${day}`);
  const bias = (hash(courseId) % 31) - 15;
  return Array.from({ length: 8 }, () => ({
    gpa: round(2 + rng() * 2.5),
    score: clamp(53 + bias + Math.sin(day * 0.7 + bias) * 17 + (rng() - 0.5) * 32, 0, 100),
  }));
}

export function professorExperience(state, professor) {
  return professor.courseIds.reduce((total, courseId) => {
    const sessions = state.sessions[courseId] ?? [];
    return total + (sessions.length ? sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length : 50);
  }, 0) / professor.courseIds.length;
}

export function queueReview(state, catalog, courseId, ratings, comment = '', now) {
  if (!state.selectedCourseIds.includes(courseId)) throw new Error('내 시간표에 있는 강의만 평가할 수 있어요.');
  const selected = catalog.courses.find(c => c.id === courseId);
  if (!selected) throw new Error('강의를 찾을 수 없어요.');
  const clock = currentClock(state, now);
  const eligibility = evaluationWindow(selected, clock);
  if (!eligibility.allowed) throw new Error(eligibility.reason);
  const key = `${clock.date}:${courseId}`;
  if (state.userReviews[key]) throw new Error('이 수업의 오늘 평가는 이미 반영됐어요.');
  state.pendingReviews[courseId] = { ratings: [...ratings], score: ratingScore(ratings), gpa: state.gpa, comment: validateComment(comment), date: clock.date, minute: clock.minute };
}

export function previewReview(state, courseId, ratings) {
  const clock = currentClock(state);
  const batch = state.classBatches[`${clock.date}:${courseId}`];
  return aggregateReviews([...(batch?.reviews ?? []), { score: ratingScore(ratings), gpa: state.gpa }]);
}

export function queueEvent(state, catalog, { type, targetId }) {
  if (!['department', 'research'].includes(type)) throw new Error('지원하지 않는 이벤트예요.');
  if (type === 'department' && !DEPARTMENTS.includes(targetId)) throw new Error('학과를 선택해주세요.');
  const professor = catalog.professors.find(p => p.id === targetId);
  if (type === 'research' && !professor) throw new Error('교수님을 선택해주세요.');
  const id = `event:${state.day + 1}:${type}:${targetId}`;
  if (state.events.some(e => e.id === id)) return false;
  const clock = currentClock(state);
  const event = {
    id, type, targetId, day: state.day + 1, date: clock.date, minute: clock.minute, applied: false,
    impact: type === 'department' ? 0.006 : 0.012,
    title: type === 'department' ? `${targetId}, 공동 실습 환경 개선` : `${professor.name} 교수님, 연구 성과 발표`,
    summary: type === 'department'
      ? '학과 공통 실습 자원이 확충돼요. 해당 학과 교수님 전체에 같은 효과를 반영해요.'
      : '새 연구 성과가 공개됐어요. 해당 교수님의 주가에 한 번 반영해요.',
    source: '캠퍼스 공시',
  };
  state.events.push(event);
  return true;
}

export function closeMarket(state, catalog, { marketPulse = false, historicalReviews = null, now } = {}) {
  ensureMarketData(state, catalog);
  const day = state.day + 1;
  const pending = Object.entries(state.pendingReviews);
  const clock = currentClock(state, now);
  const inputs = new Map();
  if (historicalReviews) for (const [courseId, input] of Object.entries(historicalReviews)) inputs.set(courseId, input);
  const affected = new Set([...Object.keys(state.pendingBatches), ...Object.keys(state.pendingReviews)]);
  for (const courseId of affected) {
    const own = state.pendingReviews[courseId];
    const date = own?.date ?? state.pendingBatches[courseId]?.date ?? clock.date;
    const batch = state.classBatches[`${date}:${courseId}`];
    const reviews = [...(batch?.reviews ?? [])];
    if (own) {
      reviews.push(own);
      state.userReviews[`${date}:${courseId}`] = own;
      state.reviewFeed.unshift({ ...own, id: `own:${date}:${courseId}`, nickname: '나의 한 줄 평', professorId: catalog.courses.find(c => c.id === courseId).professorId, courseId, source: 'self' });
    }
    const aggregate = aggregateReviews(reviews);
    if (!aggregate) continue;
    inputs.set(courseId, { reviews, aggregate, oldScore: sessionAverage(state.sessions[courseId] ?? []), own: !!own });
    const previous = (state.sessions[courseId] ?? []).filter(s => s.date !== date);
    state.sessions[courseId] = [...previous, { day, date, ...aggregate }].slice(-4);
  }
  const events = state.events.filter(e => !e.applied && !e.displayOnly && e.day <= day && (!e.date || e.date < clock.date || e.date === clock.date && (e.minute ?? 0) <= clock.minute));
  const lively = state.volatilityMode !== 'calm';
  const teachingScale = lively ? .28 : .06;
  for (const professor of catalog.professors) {
    const stock = state.stocks[professor.id];
    if (stock.priceDate !== clock.date) {
      stock.dayOpenPrice = stock.price;
      stock.priceDate = clock.date;
    }
    const open = stock.price;
    const causes = [];
    const experience = professorExperience(state, professor);
    const teaching = teachingScale * (experience - stock.experience) / 100;
    for (const courseId of professor.courseIds) {
      const input = inputs.get(courseId);
      if (!input) continue;
      const c = catalog.courses.find(c => c.id === courseId);
      const afterScore = sessionAverage(state.sessions[courseId] ?? []);
      const rows = input.reviews.filter(r => !r.date || r.date < clock.date || r.date === clock.date && (r.minute ?? 0) <= clock.minute);
      const sorted = [...rows].sort((a,b) => a.score-b.score);
      const sample = [...new Set([input.own ? rows.at(-1) : sorted[0], sorted[Math.floor(sorted.length/2)], sorted.at(-1)])].filter(Boolean).map((r,i) => ({
        id: r.id ?? `review:${clock.date}:${courseId}:${i}`, nickname: r.nickname ?? (input.own && r === rows.at(-1) ? '나의 한 줄 평' : '이전 수강생'), comment: r.comment ?? '', score: r.score, date: r.date ?? clock.date, minute: r.minute ?? clock.minute,
      }));
      causes.push({ id: `class:${day}:${courseId}`, type: 'review', courseId, title: `${c.name} · ${input.own ? '내 평가 추가' : '수강평 반영'}`, summary: `${input.aggregate.count}명 응답 · 보정점수 ${input.aggregate.score.toFixed(1)}점`, count: input.aggregate.count, score: input.aggregate.score, beforeScore: input.oldScore, afterScore, impact: teachingScale * (afterScore-input.oldScore) / professor.courseIds.length / 100, reviews: sample });
    }
    const eventContribution = (type, target, limit) => {
      const matches = events.filter(e => e.type === type && e.targetId === target);
      const raw = matches.reduce((s,e) => s+e.impact,0), bounded = clamp(raw,-limit,limit);
      const factor = raw === 0 ? 1 : bounded/raw;
      for (const e of matches) causes.push({ id: `news:${day}:${e.id}`, type: 'news', eventId: e.id, title: e.title, summary: e.summary ?? '', impact: e.impact*factor, date: e.date ?? clock.date, minute: e.minute ?? clock.minute });
      return bounded;
    };
    const research = eventContribution('research',professor.id,.12);
    const department = eventContribution('department',professor.department,.07);
    // Every professor has an independent regime and random path. No trading or demand model is used.
    const movement = marketPulse ? independentVariation(stock,professor.id,historicalReviews?'history-v3':state.randomSeed,lively,!!historicalReviews) : null;
    const variation = movement?.deltas.reduce((sum,n)=>sum+n,0) ?? 0;
    const knownImpact = teaching+research+department;
    const lower = Math.max(1,open*.86,stock.dayOpenPrice*.55), upper = Math.min(open*1.14,stock.dayOpenPrice*1.45);
    const pricePath = [open];
    if (movement) {
      for(let i=0;i<movement.deltas.length;i++) {
        const delta = movement.deltas[i] + (i===movement.eventAt ? knownImpact : 0);
        pricePath.push(round(clamp(pricePath.at(-1)+open*delta,lower,upper)));
      }
      causes.push({ id:`variation:${day}:${professor.id}`,type:'variation',title:`시장 변동 · ${movement.label}`,summary:'교수님별 주가 변동',impact:variation });
    } else pricePath.push(round(clamp(open*(1+knownImpact),lower,upper)));
    const price = pricePath.at(-1);
    const change = price/open-1;
    const adjustment = change-knownImpact-variation;
    if (Math.abs(adjustment)>1e-12) causes.push({id:`adjustment:${day}:${professor.id}`,type:'variation',title:'가격 한도·반올림',summary:'회당 ±14% · 당일 ±45% · 소수 둘째 자리',impact:adjustment});
    const contributions = { teaching, research, department, variation, adjustment };
    Object.assign(stock, {
      price, experience, lastReturn: change, todayReturn: price / stock.dayOpenPrice - 1,
      contributions,
    });
    stock.history.push({ day, price, date: clock.date, minute: clock.minute, label: `${clock.date.slice(5).replace('-', '.')} ${String(Math.floor(clock.minute / 60)).padStart(2, '0')}:${String(clock.minute % 60).padStart(2, '0')}`, open, high: Math.max(...pricePath), low: Math.min(...pricePath), close: price, causes, contributions: { ...contributions }, simulated: true });
    const oldPoint = stock.history.at(-91);
    if (oldPoint) for (const cause of oldPoint.causes ?? []) if (cause.reviews?.length) { delete cause.reviews; cause.reviewsOmitted = true; }
    if (stock.history.length > 350) stock.history = [stock.history[0], ...stock.history.slice(-349)];
  }
  for (const event of events) event.applied = true;
  state.day = day;
  state.lastClose = { day, reviewCount: pending.length, classCount: affected.size, eventCount: events.length };
  state.pendingReviews = {};
  state.pendingBatches = {};
  state.reviewFeed = state.reviewFeed.slice(0, 180);
  return state.lastClose;
}

export function createState(catalog, options = {}) {
  const state = {
    version: VERSION, marketVersion: MARKET_VERSION, volatilityMode: options.volatilityMode ?? 'lively', day: 0, gpa: 3.8,
    selectedCourseIds: DEFAULT_COURSE_CODES.map(code => catalog.courses.find(c => c.code === code)?.id).filter(Boolean),
    favorites: [], pendingReviews: {}, pendingBatches: {}, events: [], sessions: {}, stocks: {}, lastClose: null,
    clockMode: 'demo', demoDate: '2026-11-06', minute: 800, playing: true, speed: 10,
    randomSeed: (options.seed ?? Date.now()) >>> 0, classBatches: {}, userReviews: {}, reviewFeed: [], generatedClasses: {},
    generatedEventCount: 0, simulationDays: 0,
  };
  for (const p of catalog.professors) {
    state.stocks[p.id] = { price: 100, history: [{ day: 0, price: 100, date: '2026-09-07', minute: 510, open: 100, high: 100, low: 100, close: 100, causes: [], simulated: true }], experience: 50, lastReturn: 0, contributions: { teaching: 0, research: 0, department: 0, variation: 0, adjustment: 0 } };
  }
  // Reproducible fictional history. Instructor names and course links remain source data.
  for (let day = 1; day <= 43; day++) {
    const historicDate = dateObjectForDay(day).toISOString().slice(0, 10);
    const historicClock = calendarClock(historicDate, 1439);
    state.demoDate = historicDate;
    state.minute = 1435;
    const historicalReviews = {};
    for (const c of catalog.courses) {
      if (!evaluationWindow(c, historicClock).allowed) continue;
      const end = evaluationWindow(c,historicClock).end;
      const reviews = syntheticReviews(c.id, day).map((r,i) => ({ ...r, id: `history:${historicDate}:${c.id}:${i}`, nickname: ['복습하는 감자','필기하는 쿼카','실습하는 오리'][i%3], date: historicDate, minute: end, comment: r.score >= 70 ? '제제이야… 예제 풀면서 개념이 연결됨' : r.score < 45 ? '진도가 매콤해서 복습 한 번 더 하고 올게요' : '알 것 같은데 직접 해보면 잠시만요 상태' }));
      const aggregate = aggregateReviews(reviews);
      historicalReviews[c.id] = { reviews, aggregate, oldScore: sessionAverage(state.sessions[c.id] ?? []) };
      state.sessions[c.id] = [...(state.sessions[c.id] ?? []), { day, date: historicDate, ...aggregate }].slice(-4);
    }
    if (day === 6) queueEvent(state, catalog, { type: 'department', targetId: '컴퓨터공학부' });
    if (day === 12) queueEvent(state, catalog, { type: 'research', targetId: catalog.professors.find(p => p.name === '김인수').id });
    closeMarket(state, catalog, { marketPulse: true, historicalReviews });
  }
  state.lastClose = null;
  state.demoDate = '2026-11-06';
  state.minute = 800;
  for (const stock of Object.values(state.stocks)) stock.variationState = null;
  return state;
}

export function portfolio(state, catalog) {
  const selected = catalog.courses.filter(c => state.selectedCourseIds.includes(c.id));
  const totalCredits = selected.reduce((s, c) => s + c.credits, 0);
  const credits = {};
  for (const c of selected) credits[c.professorId] = (credits[c.professorId] ?? 0) + c.credits;
  const holdings = Object.entries(credits).map(([id, credits]) => ({ id, credits, weight: credits / totalCredits, value: credits*state.stocks[id].price, baseValue: credits*100, profit: credits*(state.stocks[id].price-100) })).sort((a, b) => b.weight - a.weight);
  const reference = state.stocks[catalog.professors[0].id].history;
  const history = reference.map((point, i) => ({ day: point.day, label: point.label, date: point.date, price: holdings.reduce((s, h) => s + h.credits * state.stocks[h.id].history[i].price, 0) }));
  const baseValue = totalCredits*100;
  const value = history.at(-1).price;
  const previous = history.at(-2)?.price ?? value;
  const normalized = history.map(point=>({...point,price:baseValue?point.price/baseValue*100:100}));
  return { selected, totalCredits, holdings, history, value, baseValue, profit:value-baseValue, totalReturn:baseValue?value/baseValue-1:0, indexValue:baseValue?value/baseValue*100:100, indexHistory:normalized, lastReturn:previous?value/previous-1:0 };
}

export function indexHistory(state, catalog, department = null) {
  const members = catalog.professors.filter(p => !department || p.department === department);
  return state.stocks[members[0].id].history.map((point, i) => ({ day: point.day, label: point.label, date: point.date, price: members.reduce((s, p) => s + state.stocks[p.id].history[i].price, 0) / members.length }));
}

export function courseConflicts(courses) {
  const conflicts = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      if (courses[i].meetings.some(a => courses[j].meetings.some(b => a.day === b.day && a.start < b.end && b.start < a.end))) conflicts.push([courses[i].id, courses[j].id]);
    }
  }
  return conflicts;
}

export function dateObjectForDay(day) {
  const date = new Date(Date.UTC(2026, 8, 7));
  for (let i = 0; i < day; i++) {
    do date.setUTCDate(date.getUTCDate() + 1); while ([0, 6].includes(date.getUTCDay()));
  }
  return date;
}

export function dateForDay(day) {
  const date = dateObjectForDay(day);
  return `${date.getUTCMonth() + 1}.${String(date.getUTCDate()).padStart(2, '0')}`;
}
