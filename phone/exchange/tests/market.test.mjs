import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregateReviews, closeMarket, courseConflicts, createState, DEFAULT_COURSE_CODES, gpaWeight, indexHistory, portfolio, queueEvent, queueReview, ratingScore } from '../market.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('source catalog has 41 distinct IT names and 129 linked course offerings', () => {
  assert.equal(catalog.professors.length, 41);
  assert.equal(catalog.courses.length, 129);
  assert.equal(new Set(catalog.professors.map(p => p.name)).size, 41);
  assert.equal(new Set(catalog.courses.map(c => c.id)).size, 129);
  for (const c of catalog.courses) {
    const p = catalog.professors.find(p => p.id === c.professorId);
    assert.ok(p.courseIds.includes(c.id));
    assert.equal(typeof c.code, 'string');
  }
});

test('the attached timetable becomes 6 courses, 18 credits and 5 stocks', () => {
  const state = createState(catalog);
  const etf = portfolio(state, catalog);
  assert.deepEqual(state.selectedCourseIds.map(id => catalog.courses.find(c => c.id === id).code), DEFAULT_COURSE_CODES);
  assert.equal(etf.totalCredits, 18);
  assert.equal(etf.selected.length, 6);
  assert.equal(etf.holdings.length, 5);
  assert.deepEqual(courseConflicts(etf.selected), []);
  const kim = catalog.professors.find(p => p.name === '김인수');
  near(etf.holdings.find(h => h.id === kim.id).weight, 1 / 3);
  near(etf.holdings.reduce((s, h) => s + h.weight, 0), 1);
});

test('GPA weighting and low-sample correction reproduce the planning example', () => {
  near(gpaWeight(4.5), 1.5);
  near(gpaWeight(3), 4 / 3);
  const result = aggregateReviews([{ gpa: 4.5, score: 90 }, { gpa: 3, score: 50 }]);
  near(result.mean, 71.1764705882353);
  near(result.score, 56.035502958579876);
  assert.equal(aggregateReviews([]), null);
  assert.throws(() => gpaWeight(5));
  assert.throws(() => gpaWeight(NaN));
  assert.equal(ratingScore([1,1,1,1,1,1]), 0);
  near(ratingScore([5,5,5,5,5,5]), 100);
});

test('a close with no new data does not reapply history or move any price', () => {
  const state = createState(catalog);
  const previousDay = state.day;
  const before = Object.fromEntries(Object.entries(state.stocks).map(([id,s]) => [id,s.price]));
  const result = closeMarket(state, catalog);
  assert.deepEqual(result, { day: previousDay + 1, reviewCount: 0, classCount: 0, eventCount: 0 });
  for (const [id, stock] of Object.entries(state.stocks)) assert.equal(stock.price, before[id]);
});

test('department event applies once to all 18 computer-science stocks', () => {
  const state = createState(catalog);
  const before = structuredClone(state.stocks);
  assert.equal(queueEvent(state, catalog, { type: 'department', targetId: '컴퓨터공학부' }), true);
  assert.equal(queueEvent(state, catalog, { type: 'department', targetId: '컴퓨터공학부' }), false);
  closeMarket(state, catalog);
  for (const p of catalog.professors) {
    const stock = state.stocks[p.id];
    near(stock.contributions.department, p.department === '컴퓨터공학부' ? .006 : 0);
    if (p.department !== '컴퓨터공학부') assert.equal(stock.price, before[p.id].price);
    else near(stock.price, Math.round((before[p.id].price * 1.006 + Number.EPSILON) * 100) / 100);
  }
  const after = structuredClone(state.stocks);
  closeMarket(state, catalog);
  for (const p of catalog.professors) assert.equal(state.stocks[p.id].price, after[p.id].price);
});

test('research event changes exactly one stock and price receipts reconcile', () => {
  const state = createState(catalog);
  const targetId = catalog.professors[0].id;
  const before = structuredClone(state.stocks);
  queueEvent(state, catalog, { type: 'research', targetId });
  closeMarket(state, catalog);
  for (const [id, stock] of Object.entries(state.stocks)) {
    if (id !== targetId) assert.equal(stock.price, before[id].price);
    else near(stock.contributions.research, .012);
    near(Object.values(stock.contributions).reduce((s,v) => s + v, 0), stock.lastReturn);
  }
});

test('editing a review replaces the pending submission and cannot rate unselected courses', () => {
  const state = createState(catalog);
  state.demoDate = '2026-11-09';
  state.minute = 720;
  const selected = state.selectedCourseIds[0];
  queueReview(state, catalog, selected, [2,2,2,2,2,2]);
  queueReview(state, catalog, selected, [5,5,5,5,5,5]);
  assert.equal(Object.keys(state.pendingReviews).length, 1);
  near(state.pendingReviews[selected].score, 100);
  assert.throws(() => queueReview(state, catalog, catalog.courses.find(c => !state.selectedCourseIds.includes(c.id)).id, [3,3,3,3,3,3]));
  const result = closeMarket(state, catalog);
  assert.equal(result.reviewCount, 1);
  assert.equal(Object.keys(state.pendingReviews).length, 0);
  assert.equal(state.sessions[selected].at(-1).count, 1);
});

test('GPA changes only new submission weighting, not closed prices or credits', () => {
  const state = createState(catalog);
  state.demoDate = '2026-11-09';
  state.minute = 720;
  const before = JSON.stringify(state.stocks);
  const oldPortfolio = portfolio(state, catalog);
  state.gpa = 4.5;
  assert.equal(JSON.stringify(state.stocks), before);
  assert.deepEqual(portfolio(state, catalog).holdings, oldPortfolio.holdings);
  queueReview(state, catalog, state.selectedCourseIds[0], [4,4,4,4,4,4]);
  assert.equal(state.pendingReviews[state.selectedCourseIds[0]].gpa, 4.5);
});

test('department index has a 100 base while timetable assets scale with credits', () => {
  const state = createState(catalog);
  near(indexHistory(state, catalog)[0].price, 100);
  near(portfolio(state, catalog).history[0].price, 1800);
  near(portfolio(state, catalog).baseValue,1800);
  near(portfolio(state, catalog).value,catalog.courses.filter(c=>state.selectedCourseIds.includes(c.id)).reduce((sum,c)=>sum+c.credits*state.stocks[c.professorId].price,0));
  state.selectedCourseIds = [];
  const etf = portfolio(state, catalog);
  assert.equal(etf.value, 0);
  assert.equal(etf.baseValue,0);
  assert.equal(etf.profit,0);
  assert.equal(etf.totalReturn,0);
  assert.equal(etf.indexValue,100);
  assert.equal(etf.totalCredits, 0);
  assert.equal(etf.lastReturn, 0);
});

test('seeded history is reproducible and the pictured Thursday is empty', () => {
  const a = createState(catalog), b = createState(catalog);
  assert.deepEqual(a.stocks, b.stocks);
  assert.ok(portfolio(a, catalog).selected.every(c => c.meetings.every(m => m.day !== '목')));
});
