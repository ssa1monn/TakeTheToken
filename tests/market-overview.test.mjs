import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewSeries, createMarketOverview } from '../dist/market-overview.js';

const catalog = { professors: [{ id: 'a', department: '컴퓨터공학부' }, { id: 'b', department: '정보통신공학과' }] };
const sample = (date, minute, price) => ({ date, minute, price });
const state = { clockMode: 'demo', demoDate: '2026-11-06', minute: 900, stocks: {
  a: { history: [sample('2026-10-01', 600, 90), sample('2026-11-05', 600, 100), sample('2026-11-06', 800, 110), sample('2026-11-06', 900, 120), sample('2026-11-06', 901, 900), sample('2026-11-07', 600, 900)] },
  b: { history: [sample('2026-10-01', 600, 110), sample('2026-11-05', 600, 100), sample('2026-11-06', 800, 100), sample('2026-11-06', 900, 110), sample('2026-11-06', 901, 900), sample('2026-11-07', 600, 900)] },
} };
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const ui = getState => createMarketOverview({ getState, catalog, esc, number: value => Number(value).toFixed(2), pct: value => `${(value * 100).toFixed(2)}%`, direction: value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat' });

test('overview retains every recorded index update and excludes future dates and minutes', () => {
  const before = structuredClone(state);
  const result = overviewSeries(state, catalog, 'all', 'all');
  assert.deepEqual(result.points.map(point => point.price), [100, 100, 105, 115]);
  assert.equal(result.current.minute, 900);
  assert.equal(result.count, 2);
  assert.ok(Math.abs(result.change - .15) < 1e-12);
  assert.ok(Math.abs(result.todayChange - .15) < 1e-12);
  assert.deepEqual(state, before);
});

test('overview department selection and period baseline use actual visible records', () => {
  const result = overviewSeries(state, catalog, '컴퓨터공학부', 'week');
  assert.deepEqual(result.points.map(point => point.price), [100, 110, 120]);
  assert.equal(result.count, 1);
  assert.match(ui(() => state).render(), /data-id="week" aria-pressed="true"/);
  assert.ok(Math.abs(result.change - .2) < 1e-12);
  assert.equal(overviewSeries(state, catalog, '없는 학과').points.length, 0);
});

test('overview renders finite flat, single and empty charts without fabricated observations', () => {
  const flat = structuredClone(state);
  for (const stock of Object.values(flat.stocks)) stock.history = [sample('2026-11-05', 800, 100)];
  let html = ui(() => flat).render({range:'all'});
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /11\.05 13:20/);
  assert.match(html, /data-mo-points/);
  assert.match(html, /data-action="overview-range"/);
  for (const stock of Object.values(flat.stocks)) stock.history = [];
  html = ui(() => flat).render();
  assert.match(html, /아직 기록이 없어요/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('today includes the real previous close and every visible intraday update', () => {
  const result = overviewSeries(state, catalog, 'all', 'today');
  assert.deepEqual(result.points.map(point => point.price), [100, 105, 115]);
  assert.equal(result.points[0].isBaseline, true);
  assert.equal(result.points[0].date, '2026-11-05');
  assert.equal(result.waiting, false);
  const html = ui(() => state).render({range:'today'});
  assert.match(html, /data-id="today" aria-pressed="true"/);
  assert.match(html, /11\.05 마감/);
  assert.match(html, /13:20/);
  const line = html.match(/<path d="([^"]*)" class="mo-price-line"/)[1];
  assert.match(line, /^M[\d.]+,[\d.]+ L/);
  assert.doesNotMatch(line, /[CQ]/, 'the chart must join observations with straight segments');
  assert.doesNotMatch(html, /종목/);
});

test('today with no current update shows a waiting state instead of a yesterday chart', () => {
  const quiet = structuredClone(state);
  quiet.minute = 790;
  const result = overviewSeries(quiet, catalog, 'all', 'today');
  assert.equal(result.waiting, true);
  assert.equal(result.points.length, 0);
  assert.equal(result.current.price, 100);
  const html = ui(() => quiet).render({range:'today'});
  assert.match(html, /오늘의 첫 움직임을 기다리는 중/);
  assert.match(html, /직전 지수 100.00 pt/);
  assert.doesNotMatch(html, /class="mo-price-line"/);
});
