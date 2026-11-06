import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState } from '../dist/market.js';
import { initializeSimulation, fastForwardToday } from '../dist/simulation.js';
import { createStockDetailUI } from '../dist/stock-detail.js';
import { createLiveUI } from '../dist/live-ui.js';

const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
const graphics = catalog.courses.find(c => c.code === '0001423001');
const vision = catalog.courses.find(c => c.code === 'IAA6036001');
const fresh = () => createState(catalog, { seed: 43102 });
const review = (id, overrides = {}) => ({
  id, courseId: graphics.id, professorId: graphics.professorId, date: '2026-11-06', minute: 885,
  nickname: '가상수강생', comment: '예제 설명이 도움이 됐어요.', score: 80, source: 'simulation', ...overrides,
});

function detailFor(getState) {
  const context = {
    getState, catalog,
    esc: text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    icon: () => '', number: n => Number(n).toFixed(2), pct: n => `${(n * 100).toFixed(2)}%`,
    direction: n => n > 0 ? 'up' : n < 0 ? 'down' : 'flat', colorFor: () => '#314590',
    prof: id => catalog.professors.find(p => p.id === id), course: id => catalog.courses.find(c => c.id === id),
  };
  return createStockDetailUI({ ...context, live: createLiveUI(context) });
}

test('professor comments combine sources once, include the student, and exclude future or unlinked rows', () => {
  const state = fresh();
  state.minute = 900;
  const duplicate = review('shared');
  state.reviewArchive = { [graphics.professorId]: [duplicate, review('past', { date: '2026-11-03', minute: 975 })] };
  state.reviewFeed = [duplicate, review('next-minute', { minute: 901 }), review('tomorrow', { date: '2026-11-07' }), review('invalid-course', { courseId: 'missing' }), review('invalid-score', { score: NaN })];
  state.classBatches = { batch: { reviews: [duplicate, review('other-professor', { courseId: vision.id, professorId: vision.professorId })] } };
  state.userReviews[`2026-11-06:${graphics.id}`] = { date: '2026-11-06', minute: 900, score: 95, comment: '내가 남긴 한 줄', gpa: 3.8 };
  const detail = detailFor(() => state);
  assert.deepEqual(detail.reviewsFor(graphics.professorId).map(r => r.id), [`own:2026-11-06:${graphics.id}`, 'shared', 'past']);
  assert.equal(detail.reviewsFor(graphics.professorId)[0].source, 'self');
  assert.deepEqual(detail.reviewsFor(vision.professorId).map(r => r.id), ['other-professor']);
  assert.equal(catalog.professors.reduce((count, p) => count + detail.reviewsFor(p.id).length, 0), 4);
  for (const professor of catalog.professors) {
    assert.ok(detail.reviewsFor(professor.id).every(r => r.professorId === professor.id));
  }
});

test('review cache refreshes after invalidation, clock movement, and a separate mode state', () => {
  let state = fresh();
  state.minute = 900;
  state.reviewFeed = [review('first')];
  const detail = detailFor(() => state);
  assert.equal(detail.reviewsFor(graphics.professorId).length, 1);
  state.reviewFeed.push(review('second', { minute: 900 }), review('later', { minute: 901 }));
  detail.invalidateReviews();
  assert.equal(detail.reviewsFor(graphics.professorId).length, 2);
  state.minute = 901;
  detail.invalidateReviews();
  assert.equal(detail.reviewsFor(graphics.professorId).length, 3);
  state = fresh();
  state.clockMode = 'live';
  assert.equal(detail.reviewsFor(graphics.professorId).length, 0, 'the actual clock mode must not reuse simulated future comments');
});

test('all four chart ranges show finite prices, retain the latest price, and leave market state unchanged', () => {
  const state = fresh();
  initializeSimulation(state, catalog);
  fastForwardToday(state, catalog);
  const detail = detailFor(() => state);
  const original = JSON.stringify(state);
  const lengths = [];
  for (const range of ['today', 'week', 'month', 'all']) {
    const markup = detail.render(graphics.professorId, { range });
    assert.doesNotMatch(markup, /\b(?:NaN|Infinity|undefined)\b/);
    assert.match(markup, /class="cc-chart-svg"/);
    const attribute = markup.match(/data-cc-points="([^"]+)"/)?.[1];
    assert.ok(attribute);
    const points = JSON.parse(attribute.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    assert.ok(points.length > 0);
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(Number(point.close))));
    assert.equal(Number(points.at(-1).close), state.stocks[graphics.professorId].price);
    lengths.push(points.length);
  }
  assert.ok(lengths[1] <= lengths[2] && lengths[2] <= lengths[3], 'daily ranges expand from week to month to all');
  assert.equal(JSON.stringify(state), original);
});

test('today chart explains the empty period before any price update on that date', () => {
  const state = fresh();
  const markup = detailFor(() => state).render(graphics.professorId, { range: 'today' });
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|undefined)\b/);
  assert.match(markup, /아직 오늘의 캔들이 없어요/);
});
