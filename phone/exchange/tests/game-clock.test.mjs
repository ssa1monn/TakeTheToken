import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameClockReader, normalizeGameClock, gameStorageKey, applyGameClock } from '../game-clock.js';
import { currentClock } from '../campus.js';
import { createState, queueReview } from '../market.js';
import { processCampus } from '../simulation.js';

const snap = (minute, extra = {}) => ({ sessionId: 'save-a', date: '2026-11-06', minute, active: true, paused: false, ...extra });
const windowWith = game => ({ location: { origin: 'http://localhost:4173' }, parent: { location: { origin: 'http://localhost:4173' }, Game: game } });
const simpleCatalog = { courses: [{ id: 'graphics', meetings: [{ day: '금', end: '14:45' }] }, { id: 'vision', meetings: [{ day: '금', end: '16:15' }, { day: '금', end: '17:45' }] }] };

test('game snapshots reject invalid dates, precision, session IDs and inactive hosts', () => {
  assert.deepEqual(normalizeGameClock(snap(885)), snap(885));
  for (const value of [snap(1440), snap(-1), snap(885.4), snap(900, {date:'2026-02-30'}), snap(900, {sessionId:''}), snap(900, {active:false})]) assert.equal(normalizeGameClock(value), null);
  assert.notEqual(gameStorageKey(snap(900)), gameStorageKey(snap(900, {sessionId:'save-b'})));
  assert.equal(gameStorageKey(snap(900, {sessionId:'test/a'})), 'inu-exchange-game-v1:test%2Fa');
});

test('an optional character creation clock must be valid and cannot follow the current clock', () => {
  const startedAt = { date: '2026-11-06', minute: 360 };
  assert.deepEqual(normalizeGameClock(snap(885, { startedAt })), snap(885, { startedAt }));
  assert.deepEqual(normalizeGameClock(snap(360, { startedAt })), snap(360, { startedAt }));
  for (const invalid of [null, {}, { date:'2026-02-30',minute:0 }, { date:'2026-11-06',minute:-1 }, { date:'2026-11-06',minute:885.5 }, { date:'2026-11-06',minute:886 }, { date:'2026-11-07',minute:0 }]) {
    assert.equal(normalizeGameClock(snap(885, { startedAt: invalid })), null);
  }
});

test('reader uses only the immediate same-origin parent and never reads foreign or self hosts', () => {
  let calls = 0;
  const window = windowWith({ isActive: () => true, exchangeClock: () => { calls++; return snap(885); } });
  const reader = createGameClockReader(window);
  assert.deepEqual(reader.read(), {...snap(885), source:'bae'});
  assert.equal(reader.connected(), true);
  window.parent.location.origin = 'https://elsewhere.example';
  assert.equal(reader.read(), null);
  assert.equal(calls, 1);
  window.parent = window;
  assert.equal(reader.read(), null);
  assert.equal(reader.connected(), true, 'an embedded exchange must not silently resume its standalone clock');
  assert.equal(calls, 1);
  Object.defineProperty(window, 'parent', { get() { throw new Error('SecurityError'); } });
  assert.equal(reader.read(), null);
});

test('legacy Bae Game.hour uses a persisted cursor, observed midnight and inactive guards', () => {
  let hour = 23.9, active = true;
  const reader = createGameClockReader(windowWith({isActive:()=>active,hour:()=>hour,inputBlocked:()=>true}), {legacyCursor:{date:'2026-11-09',minute:1420}});
  assert.equal(reader.read().date, '2026-11-09');
  hour = .1;
  const after = reader.read();
  assert.equal(after.date, '2026-11-10');
  assert.equal(after.minute, 6);
  assert.equal(after.paused, true);
  const restored = createGameClockReader(windowWith({isActive:()=>true,hour:()=>hour}), {legacyCursor:after.legacyCursor});
  assert.equal(restored.read().date, '2026-11-10');
  active = false;
  assert.deepEqual(reader.read(), {active:false,source:'legacy'});
  active = true; hour = NaN;
  assert.equal(reader.read(), null);
});

test('first sync respects host time while pause and repeated snapshots cannot invent price ticks', () => {
  const state = {clockMode:'demo',demoDate:'2040-01-01',minute:0};
  const calls = [];
  const process = s => calls.push(currentClock(s));
  assert.equal(applyGameClock(state, simpleCatalog, snap(884, {paused:true}), {process}).steps, 1);
  assert.deepEqual(calls[0], {date:'2026-11-06',minute:884,weekday:'금'});
  assert.equal(applyGameClock(state, simpleCatalog, snap(884, {paused:true}), {process}).changed, false);
  assert.equal(applyGameClock(state, simpleCatalog, snap(884), {process}).steps, 0);
  assert.equal(calls.length, 1);
  assert.equal(applyGameClock(state, simpleCatalog, {active:false}, {process}).steps, 0);
});

test('catch-up visits exact final class ends and midnight in chronological order', () => {
  const state = {clockMode:'game',gameClock:snap(880)};
  const calls = [];
  const result = applyGameClock(state, simpleCatalog, snap(8,{date:'2026-11-07'}), {process:s=>calls.push({...currentClock(s)})});
  assert.equal(result.resetRequired, false);
  assert.ok(calls.some(clock=>clock.date==='2026-11-06' && clock.minute===885));
  assert.ok(calls.some(clock=>clock.date==='2026-11-06' && clock.minute===1065));
  assert.ok(!calls.some(clock=>clock.minute===975));
  assert.ok(calls.some(clock=>clock.date==='2026-11-06' && clock.minute===1439));
  assert.deepEqual(calls.at(-1),{date:'2026-11-07',minute:8,weekday:'토'});
  assert.equal(new Set(calls.map(clock=>`${clock.date}:${clock.minute}`)).size,calls.length);
});

test('older snapshots of the same character are ignored without changing market history', () => {
  const state = {clockMode:'game',gameClock:snap(900),proof:'unchanged'};
  const original = JSON.stringify(state);
  const result = applyGameClock(state,simpleCatalog,snap(899),{process:()=>assert.fail('an older clock must not run the market')});
  assert.deepEqual(result,{changed:false,resetRequired:false,reason:'rewind-ignored',ignored:true,steps:0});
  assert.equal(JSON.stringify(state),original);
});

test('only a different character requests a different market namespace before mutation', () => {
  const state = {clockMode:'game',gameClock:snap(900),proof:'unchanged'};
  const original = JSON.stringify(state);
  const result = applyGameClock(state,simpleCatalog,snap(900,{sessionId:'save-b'}),{process:()=>assert.fail('namespace must be selected by the caller')});
  assert.deepEqual(result,{changed:false,resetRequired:true,reason:'different-session',steps:0});
  assert.equal(JSON.stringify(state),original);
});

test('a long absence settles only the destination and preserves existing state', () => {
  const state = {clockMode:'game',gameClock:snap(900),proof:{prices:[97,103],favorite:'professor-a'}};
  const original = JSON.stringify(state.proof), calls = [];
  const result = applyGameClock(state,simpleCatalog,snap(901,{date:'2026-12-14'}),{process:s=>calls.push({...currentClock(s)})});
  assert.deepEqual(result,{changed:true,resetRequired:false,reason:'advanced-gap',steps:1});
  assert.deepEqual(calls,[{date:'2026-12-14',minute:901,weekday:'월'}]);
  assert.equal(JSON.stringify(state.proof),original);
});

test('actual campus processing unlocks a review exactly at the host class end, without duplicate evaluations', async () => {
  const catalog = JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const state = createState(catalog,{seed:3021});
  const graphics = catalog.courses.find(course=>course.code==='0001423001');
  applyGameClock(state,catalog,snap(884),{process:processCampus});
  assert.throws(()=>queueReview(state,catalog,graphics.id,[4,4,4,4,4,4]));
  applyGameClock(state,catalog,snap(885),{process:processCampus});
  assert.ok(state.generatedClasses[`2026-11-06:${graphics.id}`]);
  const day=state.day, reviewCount=state.reviewFeed.length, eventCount=state.events.length;
  assert.equal(applyGameClock(state,catalog,snap(885),{process:processCampus}).steps,0);
  assert.equal(state.day,day);
  assert.equal(state.reviewFeed.length,reviewCount);
  assert.equal(state.events.length,eventCount);
  queueReview(state,catalog,graphics.id,[4,4,4,4,4,4],'마지막 예제까지 이해했어요');
  assert.equal(state.pendingReviews[graphics.id].date,'2026-11-06');
});
