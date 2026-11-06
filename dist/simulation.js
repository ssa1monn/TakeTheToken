import { closeMarket, ratingScore, DEPARTMENTS, ensureMarketData } from './market.js';
import { calendarClock, currentClock, evaluationWindow, EVENT_TEMPLATES, generateStudentReviews, nextDate } from './campus.js';

function nextRandom(state) {
  state.randomSeed = (Math.imul(1664525, state.randomSeed) + 1013904223) >>> 0;
  return state.randomSeed / 4294967296;
}
const choose = (values, random) => values[Math.floor(random() * values.length)];

export function randomCampusEvent(state, catalog, clock) {
  const random = () => nextRandom(state);
  // A rolling variety window makes a short live demo show different stories, even with an unlucky seed.
  const recentKeys = new Set(state.events.filter(e => e.generated).slice(-10).map(e => e.key));
  const available = EVENT_TEMPLATES.map(template => ({
    template,
    targets: (template.type === 'department' ? DEPARTMENTS : catalog.professors).filter(target => {
      const id = `auto:${clock.date}:${template.key}:${typeof target === 'string' ? target : target.id}`;
      return !state.events.some(event => event.id === id);
    }),
  })).filter(item => item.targets.length);
  if (!available.length) return null;
  const varied = available.filter(item => !recentKeys.has(item.template.key));
  const pool = varied.length ? varied : available;
  const mood = random(), sign = mood < .4 ? -1 : mood < .8 ? 1 : 0;
  const balanced = pool.filter(item => Math.sign(item.template.impact) === sign);
  const { template, targets } = choose(balanced.length ? balanced : pool, random);
  const target = choose(targets, random);
  const targetId = typeof target === 'string' ? target : target.id;
  const titleTarget = typeof target === 'string' ? target : `${target.name} 교수님`;
  const id = `auto:${clock.date}:${template.key}:${targetId}`;
  if (state.events.some(e => e.id === id)) return null;
  const event = {
    ...template, id, targetId, title: `${titleTarget} · ${template.title}`,
    baseImpact: template.impact, impact: template.impact * (state.volatilityMode === 'calm' ? 1 : 3.5),
    day: state.day + 1, date: clock.date, minute: clock.minute,
    applied: false, source: '캠퍼스 뉴스', generated: true,
  };
  state.events.push(event);
  state.generatedEventCount++;
  state.lastEventDate = clock.date;
  state.lastEventMinute = clock.minute;
  return event;
}

function previousDate(date, offset) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function seededContentRandom(state) {
  let seed = ((state.randomSeed ?? 42) ^ 0x6150acbd) >>> 0;
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function archiveReviews(state, professorId, reviews) {
  state.reviewArchive ??= {};
  const all = [...reviews, ...(state.reviewArchive[professorId] ?? [])];
  const seen = new Set();
  const byCourse = new Map();
  const unique = all.filter(review => {
    if (seen.has(review.id)) return false;
    seen.add(review.id);
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.minute - a.minute);
  // Preserve a mix of classes instead of letting many placement sections consume the entire archive.
  state.reviewArchive[professorId] = unique.filter(review => {
    const count = byCourse.get(review.courseId) ?? 0;
    byCourse.set(review.courseId, count + 1);
    return count < 12;
  }).slice(0, 48);
}

/** Read-only history for a populated first visit; never queues scores or retroactive price changes. */
export function ensureDemoContent(state, catalog, { now } = {}) {
  const clock = currentClock(state, now);
  if (state.contentVersion === 1 && catalog.professors.every(professor => state.reviewArchive?.[professor.id]?.length)) return false;
  const random = seededContentRandom(state);
  state.reviewArchive ??= {};
  for (const professor of catalog.professors) {
    if (state.reviewArchive[professor.id]?.length >= 12) continue;
    const courses = catalog.courses.filter(course => course.professorId === professor.id && course.meetings.length).sort((a, b) =>
      Number(state.selectedCourseIds.includes(b.id)) - Number(state.selectedCourseIds.includes(a.id)) ||
      Number(/현장교육|현장실습/.test(a.name)) - Number(/현장교육|현장실습/.test(b.name)) || a.name.localeCompare(b.name, 'ko'));
    const reviews = [];
    for (let offset = 1; offset <= 28 && reviews.length < 12; offset++) {
      const date = previousDate(clock.date, offset);
      const pastClock = calendarClock(date, 1439);
      for (const course of courses) {
        const window = evaluationWindow(course, pastClock);
        if (!window.allowed) continue;
        const existing = state.classBatches?.[`${date}:${course.id}`]?.reviews;
        const generated = existing ?? generateStudentReviews(course, date, window.end, Math.min(1439, window.end + 75), random).map(review => ({ ...review, score: ratingScore(review.ratings), historical: true }));
        // Take different moods when possible, so the detail page has more than unanimous praise.
        const sample = [...generated.filter(review => review.tone === 'positive').slice(0, 2), ...generated.filter(review => review.tone === 'mixed').slice(0, 1), ...generated.filter(review => review.tone === 'negative').slice(0, 1)];
        for (const review of generated) if (sample.length < 4 && !sample.some(item => item.id === review.id)) sample.push(review);
        reviews.push(...sample.slice(0, 4));
        if (reviews.length >= 12) break;
      }
    }
    archiveReviews(state, professor.id, reviews);
  }
  if (!state.events.some(event => event.displayOnly && event.id.startsWith('archive-event:'))) {
    const notices = EVENT_TEMPLATES.filter(template => template.impact === 0 || ['open-seminar', 'mentoring', 'coding-cafe', 'lightning-talk', 'reading-list', 'office-hour', 'survey', 'project-theme', 'festival-booth', 'club-recruit', 'schedule-vote'].includes(template.key));
    const archive = Array.from({ length: 18 }, (_, index) => {
      const template = notices[index % notices.length];
      const target = template.type === 'department' ? DEPARTMENTS[index % DEPARTMENTS.length] : catalog.professors[Math.floor(random() * catalog.professors.length)];
      const targetId = typeof target === 'string' ? target : target.id;
      const titleTarget = typeof target === 'string' ? target : `${target.name} 교수님`;
      return {
        ...template, id: `archive-event:${index}:${targetId}`, targetId,
        title: `${titleTarget} · ${template.title}`, date: previousDate(clock.date, 5 - Math.floor(index / 4)),
        minute: 555 + (index % 4) * 95, day: 0, impact: 0,
        source: '캠퍼스 뉴스', archived: true, displayOnly: true, applied: true,
      };
    });
    state.events = [...archive, ...state.events];
  }
  state.contentVersion = 1;
  return true;
}

export function processCampus(state, catalog, { forceEvents = 0, now } = {}) {
  ensureMarketData(state, catalog);
  const clock = currentClock(state, now);
  const random = () => nextRandom(state);
  let classCount = 0;
  for (const course of catalog.courses) {
    const window = evaluationWindow(course, clock);
    const key = `${clock.date}:${course.id}`;
    if (!window.allowed || state.generatedClasses[key]) continue;
    const reviews = generateStudentReviews(course, clock.date, window.end, clock.minute, random).map(r => ({ ...r, score: ratingScore(r.ratings) }));
    state.classBatches[key] = { courseId: course.id, date: clock.date, reviews };
    state.generatedClasses[key] = true;
    state.pendingBatches[course.id] = { date: clock.date };
    // Feed is a sample of the generated class. The aggregation uses every response.
    state.reviewFeed.push(...reviews.slice(0, 5));
    archiveReviews(state, course.professorId, reviews.slice(0, 6));
    classCount++;
  }
  const todayCount = state.events.filter(e => e.date === clock.date).length;
  const eventWindow = state.lastEventDate !== clock.date || clock.minute - (state.lastEventMinute ?? 0) >= 25;
  if (forceEvents) {
    for (let i = 0; i < forceEvents; i++) randomCampusEvent(state, catalog, clock);
  } else if (eventWindow && todayCount < 14 && random() < .65) randomCampusEvent(state, catalog, clock);
  state.reviewFeed.sort((a,b) => b.date.localeCompare(a.date) || b.minute - a.minute);
  state.reviewFeed = state.reviewFeed.slice(0, 180);
  state.events = state.events.slice(-100);
  const hasPending = Object.keys(state.pendingBatches).length || Object.keys(state.pendingReviews).length || state.events.some(e => !e.applied);
  const pulseKey = `${clock.date}:${clock.minute}`;
  const marketPulse = state.lastMarketPulse !== pulseKey;
  const result = hasPending || marketPulse ? closeMarket(state, catalog, { marketPulse, now }) : null;
  if (marketPulse) state.lastMarketPulse = pulseKey;
  return { classCount, result };
}

export function endOfCampusDay(catalog, clock) {
  const end = Math.max(1080, ...catalog.courses.flatMap(c => c.meetings.filter(m => m.day === clock.weekday).map(m => Number(m.end.slice(0,2)) * 60 + Number(m.end.slice(3)))));
  return Math.min(1430, end + 20);
}

export function advanceSimulation(state, catalog, { minutes = state.speed, now } = {}) {
  if (state.clockMode === 'demo') {
    state.minute += minutes;
    if (state.minute > endOfCampusDay(catalog, currentClock(state))) {
      do state.demoDate = nextDate(state.demoDate);
      while (!catalog.courses.some(c => c.meetings.some(m => m.day === calendarClock(state.demoDate, 0).weekday)));
      state.minute = 510;
      state.simulationDays++;
      const oldest = new Date(`${state.demoDate}T00:00:00Z`);
      oldest.setUTCDate(oldest.getUTCDate() - 7);
      const cutoff = oldest.toISOString().slice(0, 10);
      for (const key of Object.keys(state.classBatches)) if (key.slice(0,10) < cutoff) delete state.classBatches[key];
    }
  }
  return processCampus(state, catalog, { now });
}

export function fastForwardToday(state, catalog) {
  if (state.clockMode !== 'demo') throw new Error('시간 압축은 시연 모드에서만 사용할 수 있어요.');
  const ending = endOfCampusDay(catalog, currentClock(state));
  let classCount = 0, eventCount = 0;
  while (state.minute < ending) {
    const before = state.generatedEventCount;
    const result = advanceSimulation(state, catalog, { minutes: Math.min(15, ending - state.minute) });
    classCount += result.classCount;
    eventCount += Math.max(0, state.generatedEventCount - before);
  }
  state.playing = false;
  return { day: state.day, reviewCount: 0, classCount, eventCount };
}

export function initializeSimulation(state, catalog) {
  ensureDemoContent(state, catalog);
  return processCampus(state, catalog, { forceEvents: 2 });
}
