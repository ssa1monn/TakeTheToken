import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, closeMarket, queueReview } from '../market.js';
import { calendarClock, currentClock, evaluationWindow, realKoreanClock, generateStudentReviews, validateComment, EVENT_TEMPLATES } from '../campus.js';
import { processCampus, advanceSimulation, fastForwardToday, randomCampusEvent, ensureDemoContent } from '../simulation.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const graphics = catalog.courses.find(c => c.code === '0001423001');
const vision = catalog.courses.find(c => c.code === 'IAA6036001');
const language = catalog.courses.find(c => c.code === '0010925001');
const fresh = () => createState(catalog, { seed: 987654 });

test('Friday graphics opens at 14:45 exactly and not a minute before', () => {
  assert.equal(evaluationWindow(graphics, calendarClock('2026-11-06', 884)).allowed, false);
  assert.equal(evaluationWindow(graphics, calendarClock('2026-11-06', 885)).allowed, true);
  assert.equal(evaluationWindow(graphics, calendarClock('2026-11-07', 900)).allowed, false);
  assert.equal(evaluationWindow(language, calendarClock('2026-11-06', 900)).status, 'not_today');
});

test('two Friday computer-vision meetings unlock only after the final one', () => {
  assert.equal(evaluationWindow(vision, calendarClock('2026-11-06', 975)).allowed, false);
  assert.equal(evaluationWindow(vision, calendarClock('2026-11-06', 1064)).allowed, false);
  assert.equal(evaluationWindow(vision, calendarClock('2026-11-06', 1065)).allowed, true);
});

test('actual KST mode ignores the adjustable simulation clock', () => {
  const state = fresh();
  state.clockMode = 'live';
  state.demoDate = '2026-11-09';
  state.minute = 1439;
  const before = new Date('2026-11-06T05:44:00Z');
  const after = new Date('2026-11-06T05:45:00Z');
  assert.deepEqual(realKoreanClock(after), { date: '2026-11-06', weekday: '금', minute: 885 });
  assert.throws(() => queueReview(state, catalog, graphics.id, [4,4,4,4,4,4], '', before));
  queueReview(state, catalog, graphics.id, [4,4,4,4,4,4], '오늘 예제는 제제이야', after);
  assert.equal(state.pendingReviews[graphics.id].date, '2026-11-06');
  assert.throws(() => fastForwardToday(state, catalog));
});

test('comments are stored, pending edits replace and reflected daily reviews cannot repeat', () => {
  const state = fresh();
  state.minute = 900;
  queueReview(state, catalog, graphics.id, [4,4,4,4,4,4], '  행렬 이해 완. 제제이야  ');
  assert.equal(state.pendingReviews[graphics.id].comment, '행렬 이해 완. 제제이야');
  queueReview(state, catalog, graphics.id, [5,4,5,4,5,4], '복습하고 나니 더 잘 이해됐어요');
  assert.equal(Object.keys(state.pendingReviews).length, 1);
  closeMarket(state, catalog);
  assert.equal(state.reviewFeed.filter(r => r.source === 'self').length, 1);
  assert.equal(state.userReviews[`2026-11-06:${graphics.id}`].comment, '복습하고 나니 더 잘 이해됐어요');
  assert.throws(() => queueReview(state, catalog, graphics.id, [4,4,4,4,4,4]));
  assert.throws(() => validateComment('가'.repeat(121)));
  assert.equal(validateComment('첫 줄\n둘째 줄'), '첫 줄 둘째 줄');
});

test('generated students appear only for ended classes and never with future timestamps', () => {
  const state = fresh();
  state.minute = 800;
  processCampus(state, catalog);
  const clock = currentClock(state);
  for (const batch of Object.values(state.classBatches)) {
    const c = catalog.courses.find(c => c.id === batch.courseId);
    const eligibility = evaluationWindow(c, clock);
    assert.equal(eligibility.allowed, true);
    assert.ok(batch.reviews.length >= 12 && batch.reviews.length <= 36);
    for (const r of batch.reviews) {
      assert.ok(r.minute >= eligibility.end && r.minute <= clock.minute);
      assert.equal(r.source, 'simulation');
      assert.ok(r.comment.length > 0 && r.comment.length <= 120);
    }
  }
  assert.equal(state.classBatches[`2026-11-06:${graphics.id}`], undefined);
  assert.equal(state.classBatches[`2026-11-06:${vision.id}`], undefined);
});

test('automatic batches do not duplicate and aggregate all generated responses', () => {
  const state = fresh();
  state.minute = 885;
  const first = processCampus(state, catalog);
  const count = Object.keys(state.classBatches).length;
  const reviews = state.classBatches[`2026-11-06:${graphics.id}`].reviews;
  assert.equal(state.sessions[graphics.id].at(-1).count, reviews.length);
  const second = processCampus(state, catalog);
  assert.ok(first.classCount > 0);
  assert.equal(second.classCount, 0);
  assert.equal(Object.keys(state.classBatches).length, count);
});

test('random events span gains, losses, neutral news and multiple subjects', () => {
  const state = fresh();
  for (let i = 0; i < 180; i++) randomCampusEvent(state, catalog, currentClock(state));
  assert.ok(EVENT_TEMPLATES.length >= 40);
  assert.equal(new Set(EVENT_TEMPLATES.map(event => event.key)).size, EVENT_TEMPLATES.length);
  assert.ok(new Set(state.events.map(e => e.key).filter(Boolean)).size >= 40);
  assert.ok(state.events.some(e => e.impact < 0));
  assert.ok(state.events.some(e => e.impact > 0));
  assert.ok(state.events.some(e => e.impact === 0));
  assert.equal(new Set(state.events.map(e => e.id)).size, state.events.length);
  const generated = state.events.filter(event => event.generated);
  for (let i = 0; i < generated.length; i++) {
    assert.ok(!generated.slice(Math.max(0, i - 10), i).some(event => event.key === generated[i].key));
  }
});

test('historic content fills every professor without mutating market calculations or random progression', () => {
  const state = fresh();
  const prices = JSON.stringify(state.stocks);
  const sessions = JSON.stringify(state.sessions);
  const randomSeed = state.randomSeed;
  const day = state.day;
  assert.equal(ensureDemoContent(state, catalog), true);
  assert.equal(JSON.stringify(state.stocks), prices);
  assert.equal(JSON.stringify(state.sessions), sessions);
  assert.equal(state.randomSeed, randomSeed);
  assert.equal(state.day, day);
  assert.equal(Object.keys(state.pendingBatches).length, 0);
  for (const professor of catalog.professors) {
    const reviews = state.reviewArchive[professor.id];
    assert.ok(reviews.length >= 12, `${professor.name} gets recent class comments`);
    assert.equal(new Set(reviews.map(review => review.id)).size, reviews.length);
    for (const review of reviews) {
      const reviewedCourse = catalog.courses.find(course => course.id === review.courseId);
      const window = evaluationWindow(reviewedCourse, calendarClock(review.date, review.minute));
      assert.equal(review.professorId, professor.id);
      assert.ok(review.date < state.demoDate);
      assert.equal(window.allowed, true);
      assert.ok(review.minute >= window.end && review.minute <= 1439);
      assert.ok(review.comment.length <= 120);
    }
  }
  const archivedEvents = state.events.filter(event => event.displayOnly);
  assert.equal(archivedEvents.length, 18);
  assert.ok(archivedEvents.every(event => event.applied && event.impact === 0 && event.date < state.demoDate));
  const before = JSON.stringify(state);
  assert.equal(ensureDemoContent(state, catalog), false);
  assert.equal(JSON.stringify(state), before);
  closeMarket(state, catalog);
  for (const professor of catalog.professors) assert.equal(state.stocks[professor.id].lastReturn, 0);
});

test('student tone follows the generated ratings and batches avoid repetitive comments', () => {
  let seed = 12821;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const all = [];
  for (let index = 0; index < 20; index++) {
    const reviews = generateStudentReviews(graphics, '2026-11-06', 885, 920, random);
    assert.ok(new Set(reviews.map(review => review.comment)).size >= reviews.length * .9);
    for (const review of reviews) {
      const average = review.ratings.reduce((sum, rating) => sum + rating, 0) / 6;
      assert.equal(review.tone, average >= 3.65 ? 'positive' : average >= 2.65 ? 'mixed' : 'negative');
      assert.ok(review.comment.length <= 120);
    }
    all.push(...reviews);
  }
  assert.ok(new Set(all.map(review => review.comment)).size >= 75);
  assert.ok(new Set(all.map(review => review.nickname)).size >= all.length * .95);
  assert.ok(all.some(review => review.comment.includes('제제이야')));
});

test('fast-forward creates the pictured Friday classes after their actual scheduled ends', () => {
  const state = fresh();
  fastForwardToday(state, catalog);
  assert.equal(state.playing, false);
  assert.ok(state.minute >= 1065);
  assert.ok(state.classBatches[`2026-11-06:${graphics.id}`]);
  assert.ok(state.classBatches[`2026-11-06:${vision.id}`]);
  assert.equal(state.classBatches[`2026-11-06:${language.id}`], undefined);
});

test('advance follows the calendar and settled events are not applied again', () => {
  const state = fresh();
  state.minute = 1430;
  advanceSimulation(state, catalog, { minutes: 30 });
  assert.notEqual(state.demoDate, '2026-11-06');
  for (const event of state.events) assert.equal(event.applied, true);
  const prices = Object.fromEntries(Object.entries(state.stocks).map(([id,s]) => [id,s.price]));
  closeMarket(state, catalog);
  for (const [id,s] of Object.entries(state.stocks)) assert.equal(s.price, prices[id]);
});

test('fictional student score distributions contain real variation', () => {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0) / 4294967296);
  const students = generateStudentReviews(graphics, '2026-11-06', 885, 910, random);
  assert.ok(new Set(students.map(s => s.ratings.join(','))).size > 5);
  assert.ok(new Set(students.map(s => s.comment)).size > 3);
  assert.ok(students.some(s => s.ratings.some(x => x < 4)));
  assert.ok(students.every(s => s.gpa >= 2 && s.gpa <= 4.5));
});

test('today return accumulates across updates and resets on the next date', () => {
  const state = fresh();
  const professor = catalog.professors[0];
  const baseline = state.stocks[professor.id].price;
  state.events.push({ id: 'daily-1', type: 'research', targetId: professor.id, impact: .01, day: state.day + 1, applied: false });
  closeMarket(state, catalog);
  state.events.push({ id: 'daily-2', type: 'research', targetId: professor.id, impact: .01, day: state.day + 1, applied: false });
  closeMarket(state, catalog);
  const stock = state.stocks[professor.id];
  assert.ok(Math.abs(stock.todayReturn - (stock.price / baseline - 1)) < 1e-10);
  assert.ok(stock.todayReturn > stock.lastReturn);
  state.demoDate = '2026-11-09';
  closeMarket(state, catalog);
  assert.equal(stock.todayReturn, 0);
});
