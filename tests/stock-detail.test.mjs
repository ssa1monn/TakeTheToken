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

test('course filters isolate comments, response counts, balanced excerpts and rating dimensions', () => {
  const language = catalog.courses.find(c => c.code === '0010925001');
  const deep = catalog.courses.find(c => c.code === '0011918001');
  assert.equal(language.professorId, deep.professorId);
  const state = fresh();
  state.minute = 900;
  const row = (id, c, overrides) => review(id, { courseId: c.id, professorId: c.professorId, date: '2026-11-04', ...overrides });
  state.reviewFeed = [
    row('language-best', language, { score: 100, comment: '설명 <script>alert(1)</script> 좋았어요', ratings: [5,5,5,5,5,5] }),
    row('language-low', language, { score: 0, comment: '복습할 예제가 더 필요해요.', ratings: [1,1,1,1,1,1] }),
    row('language-legacy', language, { score: 60, comment: '이전 형식의 평가', ratings: [5,5] }),
    row('deep-review', deep, { score: 75, comment: '심층학습 전용 댓글', ratings: [4,4,4,4,4,4] }),
    row('future-review', language, { date: '2026-11-07', score: 100, comment: '미래 댓글', ratings: [5,5,5,5,5,5] }),
  ];
  const detail = detailFor(() => state);
  const html = detail.render(language.professorId, { reviewCourse: language.id, commentSort: 'critical', commentLimit: 1 });
  assert.match(html, new RegExp(`data-review-course="${language.id}"`));
  assert.match(html, /저장된 응답 3개/);
  assert.match(html, /항목 응답 2개/);
  assert.match(html, /sd-temperature"><strong>3\.1<\/strong>/);
  assert.equal((html.match(/data-rating-dimension="\d"/g) ?? []).length, 6);
  assert.equal((html.match(/<strong>3\.0<\/strong>/g) ?? []).length, 6);
  assert.match(html, /설명 &lt;script&gt;alert\(1\)&lt;\/script&gt; 좋았어요/);
  assert.doesNotMatch(html, /심층학습 전용 댓글|미래 댓글|<script>/);
  const list = html.split('<div class="sd-comments">')[1].split('</article>')[0];
  assert.match(list, /복습할 예제가 더 필요해요/);
  assert.doesNotMatch(list, /이전 형식의 평가/);
  assert.match(html, /한 줄 평 더 보기 <span>1 \/ 3<\/span>/);
  const other = detail.render(language.professorId, { reviewCourse: deep.id });
  assert.match(other, /저장된 응답 1개/);
  assert.match(other, /심층학습 전용 댓글/);
  assert.doesNotMatch(other, /복습할 예제가 더 필요해요|alert\(1\)/);
});

test('unrelated course filters fall back to all courses and missing ratings do not invent dimension scores', () => {
  const state = fresh();
  state.minute = 900;
  state.reviewFeed = [review('old-format', { score: 60, comment: '항목 없이 남긴 예전 평가' })];
  const html = detailFor(() => state).render(graphics.professorId, { reviewCourse: vision.id });
  assert.match(html, /data-review-course="all"/);
  assert.match(html, /항목 없이 남긴 예전 평가/);
  assert.doesNotMatch(html, /data-rating-dimension|\b(?:NaN|Infinity|undefined)\b/);
});

test('popular comments use peer likes plus the personal toggle and break ties by recency', () => {
  const state = fresh();
  state.minute = 900;
  state.reviewFeed = [
    review('popular-earlier', { comment: '공감 동점의 이른 댓글', demoLikes: 11, minute: 885 }),
    review('popular-later', { comment: '공감 동점의 최신 댓글', demoLikes: 10, minute: 899 }),
    review('less-popular', { comment: '공감이 적은 댓글', demoLikes: 3, minute: 900 }),
  ];
  state.commentLikes = { 'popular-later': true };
  const detail = detailFor(() => state);
  let html = detail.render(graphics.professorId, { commentSort: 'popular' });
  let list = html.split('<div class="sd-comments">')[1].split('<p class="sd-content-note">')[0];
  assert.ok(list.indexOf('공감 동점의 최신 댓글') < list.indexOf('공감 동점의 이른 댓글'));
  assert.ok(list.indexOf('공감 동점의 이른 댓글') < list.indexOf('공감이 적은 댓글'));
  assert.equal((list.match(/공감 11<\/button>/g) ?? []).length, 2);
  state.commentLikes['popular-later'] = false;
  html = detail.render(graphics.professorId, { commentSort: 'popular' });
  list = html.split('<div class="sd-comments">')[1].split('<p class="sd-content-note">')[0];
  assert.ok(list.indexOf('공감 동점의 이른 댓글') < list.indexOf('공감 동점의 최신 댓글'));
  assert.match(list, /공감 10<\/button>/);
});
