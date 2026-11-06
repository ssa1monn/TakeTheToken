import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameState, createState } from '../dist/market.js';
import { applyGameClock, gameStorageKey } from '../dist/game-clock.js';
import { ensureDemoContent, processCampus } from '../dist/simulation.js';

const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
const snapshot = (extra = {}) => ({ sessionId: 'character-a', date: '2026-11-06', minute: 360, active: true, paused: false, ...extra });
const prices = state => Object.values(state.stocks).map(stock => stock.price);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} differs from ${b}`);

test('a new character starts with a bounded, varied week of past prices and valid candles', () => {
  for (const date of ['2026-11-06', '2026-11-07', '2026-11-09']) {
    const state = createGameState(catalog, snapshot({ date }));
    assert.equal(state.day, 40);
    assert.equal(state.marketOrigin.observations, 40);
    assert.equal(state.marketOrigin.calendarDays, 7);
    assert.equal(new Set(prices(state)).size, catalog.professors.length);
    assert.ok(prices(state).some(price => price < 100));
    assert.ok(prices(state).some(price => price > 100));
    const cutoff = Date.parse(`${date}T00:00:00Z`) - 7 * 86400_000;
    for (const stock of Object.values(state.stocks)) {
      assert.equal(stock.history.length, 41);
      assert.equal(new Set(stock.history.map(point => point.date)).size, 5);
      assert.equal(stock.price, stock.history.at(-1).close);
      assert.equal(stock.dayOpenPrice, stock.price);
      assert.equal(stock.todayReturn, 0);
      near(Object.values(stock.contributions).reduce((sum, value) => sum + value, 0), stock.lastReturn);
      for (const point of stock.history) {
        assert.ok(point.date < date, 'warmup must not invent observations after the character starts');
        assert.ok(Date.parse(`${point.date}T00:00:00Z`) >= cutoff);
        assert.ok(point.low >= 85 && point.high <= 115);
        assert.ok(point.low <= Math.min(point.open, point.close));
        assert.ok(point.high >= Math.max(point.open, point.close));
        if (point.contributions) {
          near(Object.values(point.contributions).reduce((sum, value) => sum + value, 0), point.close / point.open - 1);
          near(point.causes.reduce((sum, cause) => sum + cause.impact, 0), point.close / point.open - 1);
        }
      }
    }
  }
});

test('character identity makes initialization reproducible and independent of another character', () => {
  const first = createGameState(catalog, snapshot());
  const repeated = createGameState(catalog, snapshot());
  const another = createGameState(catalog, snapshot({ sessionId: 'character-b' }));
  assert.deepEqual(repeated, first);
  assert.notDeepEqual(prices(another), prices(first));
  assert.notEqual(gameStorageKey(first.gameClock), gameStorageKey(another.gameClock));
  first.favorites.push(catalog.professors[0].id);
  first.userReviews['my-review'] = { comment: '내 캐릭터의 평가' };
  assert.deepEqual(another.favorites, []);
  assert.deepEqual(another.userReviews, {});
});

test('a delayed first visit initializes at character creation then advances the elapsed game day', () => {
  const startedAt = { date:'2026-11-06',minute:360 };
  const atCreation = snapshot({ startedAt });
  const nextDay = snapshot({ date:'2026-11-07',startedAt });
  const early = createGameState(catalog, atCreation);
  const delayed = createGameState(catalog, nextDay);
  assert.deepEqual(delayed, early, 'first-open time must not move the character starting market');
  assert.equal(delayed.gameClock.date, startedAt.date);
  assert.equal(delayed.gameClock.minute, startedAt.minute);
  assert.equal(delayed.lastMarketPulse, '2026-11-06:360');
  assert.equal(delayed.marketOrigin.fromDate, '2026-10-30');
  assert.equal(delayed.marketOrigin.throughDate, '2026-11-05');
  assert.deepEqual(delayed.marketOrigin.startedAt, startedAt);
  const initialPrices = prices(delayed);
  const result = applyGameClock(delayed, catalog, nextDay, { process:processCampus });
  assert.equal(result.reason, 'advanced');
  assert.equal(result.resetRequired, false);
  assert.ok(result.steps > 1);
  assert.ok(delayed.day > 40);
  assert.notDeepEqual(prices(delayed), initialPrices);
  assert.equal(delayed.gameClock.date, '2026-11-07');
  const graphics = catalog.courses.find(course => course.code === '0001423001');
  assert.ok(delayed.generatedClasses[`2026-11-06:${graphics.id}`], 'the missed Friday class must settle during catch-up');
  applyGameClock(early, catalog, nextDay, { process:processCampus });
  assert.deepEqual(delayed, early, 'opening later produces the same elapsed timeline');
  const saved = JSON.stringify(delayed);
  assert.equal(applyGameClock(delayed, catalog, nextDay, { process:processCampus }).steps, 0);
  assert.equal(JSON.stringify(delayed), saved);
});

test('a first visit after a long absence keeps its creation anchor and bounded catch-up', () => {
  const current = snapshot({date:'2026-12-06',startedAt:{date:'2026-11-06',minute:360}});
  const state = createGameState(catalog, current);
  const initialHistory = JSON.stringify(Object.values(state.stocks)[0].history);
  const result = applyGameClock(state,catalog,current,{process:processCampus});
  assert.equal(result.reason,'advanced-gap');
  assert.equal(result.steps,1);
  assert.equal(result.resetRequired,false);
  assert.equal(state.day,41);
  assert.equal(state.marketOrigin.throughDate,'2026-11-05');
  assert.equal(JSON.stringify(Object.values(state.stocks)[0].history.slice(0,-1)),initialHistory);
});

test('first opening, pausing, closing and saved-state reopening never advance the same character', () => {
  let state = createGameState(catalog, snapshot());
  const originalPrices = prices(state);
  ensureDemoContent(state, catalog);
  assert.deepEqual(prices(state), originalPrices, 'populating comments must not change prices');
  const origin = JSON.stringify(state.marketOrigin);
  const originalDay = state.day;
  for (const paused of [true, false, true, false]) {
    state = JSON.parse(JSON.stringify(state));
    const before = JSON.stringify(state.stocks);
    const result = applyGameClock(state, catalog, snapshot({ paused }), { process: processCampus });
    ensureDemoContent(state, catalog);
    assert.equal(result.steps, 0);
    assert.equal(state.day, originalDay);
    assert.equal(JSON.stringify(state.stocks), before);
    assert.equal(JSON.stringify(state.marketOrigin), origin);
  }
  const advanced = applyGameClock(state, catalog, snapshot({ minute: 370 }), { process: processCampus });
  assert.equal(advanced.steps, 1);
  assert.equal(state.day, originalDay + 1);
  assert.notDeepEqual(prices(state), originalPrices);
  const saved = JSON.stringify(state);
  const restored = JSON.parse(saved);
  assert.equal(applyGameClock(restored, catalog, snapshot({ minute: 370 }), { process: processCampus }).steps, 0);
  assert.equal(JSON.stringify(restored), saved);
});

test('older saves and long gaps retain market progress; a different identity requests isolation', () => {
  const state = createGameState(catalog, snapshot());
  ensureDemoContent(state, catalog);
  state.favorites = [catalog.professors[0].id];
  applyGameClock(state, catalog, snapshot({ minute: 390 }), { process: processCampus });
  const progressed = JSON.stringify(state);
  const older = applyGameClock(state, catalog, snapshot({ minute: 360 }), { process: processCampus });
  assert.equal(older.ignored, true);
  assert.equal(older.resetRequired, false);
  assert.equal(JSON.stringify(state), progressed);

  const firstHistory = JSON.stringify(Object.values(state.stocks)[0].history);
  const day = state.day;
  const gap = applyGameClock(state, catalog, snapshot({ date: '2026-12-01' }), { process: processCampus });
  assert.equal(gap.reason, 'advanced-gap');
  assert.equal(gap.steps, 1);
  assert.equal(state.day, day + 1);
  assert.deepEqual(state.favorites, [catalog.professors[0].id]);
  assert.equal(JSON.stringify(Object.values(state.stocks)[0].history.slice(0, -1)), firstHistory);
  const current = JSON.stringify(state);
  const newCharacter = applyGameClock(state, catalog, snapshot({ sessionId: 'character-b' }), { process: processCampus });
  assert.equal(newCharacter.reason, 'different-session');
  assert.equal(newCharacter.resetRequired, true);
  assert.equal(JSON.stringify(state), current);
});

test('standalone initialization keeps its existing longer history and game starts reject invalid clocks', () => {
  const standalone = createState(catalog, { seed: 3021 });
  assert.equal(standalone.clockMode, 'demo');
  assert.equal(standalone.day, 43);
  assert.equal(standalone.gameClock, undefined);
  for (const input of [undefined, snapshot({ sessionId: '' }), snapshot({ date: '2026-02-30' }), snapshot({ minute: -1 }), snapshot({ minute: 1440 }), snapshot({startedAt:{date:'2026-11-07',minute:360}})]) {
    assert.throws(() => createGameState(catalog, input));
  }
});
