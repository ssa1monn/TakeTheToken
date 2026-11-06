const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const gameSource = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const phoneSource = fs.readFileSync(path.join(root, 'phone/phone.js'), 'utf8');
const sleepSource = fs.readFileSync(path.join(root, 'sleep.js'), 'utf8');
const SAVE_KEY = 'reborn-campus-save-v2';

// Exercise the shipped lifecycle functions. The canvas/DOM rendering and unrelated
// campus events are the only substitutes; character creation, saves, modal queues,
// phone mounting, clock snapshots and date advancement use the real game code.
function boot({ storage = new Map(), uuidSequence = { count: 0 } } = {}) {
  const nodes = new Map(), listeners = new Map();
  const metrics = { iframeCount: 0, reloads: 0, events: [] };
  function element(tag = 'div') {
    const classes = new Set(), children = new Map();
    let id = '', html = '';
    return {
      tagName: tag.toUpperCase(), style: {}, dataset: {}, value: '', textContent: '',
      clientWidth: 1100, clientHeight: 700, childNodes: [],
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, force) => {
          const on = force === undefined ? !classes.has(name) : force;
          on ? classes.add(name) : classes.delete(name);
          return on;
        },
      },
      get id() { return id; },
      set id(next) { id = next; nodes.set(`#${next}`, this); },
      get innerHTML() { return html; },
      set innerHTML(next) {
        html = next;
        if (next.includes('<iframe')) {
          metrics.iframeCount++;
          children.set('iframe', element('iframe'));
        }
      },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element(selector === 'iframe' ? 'iframe' : 'div'));
        return children.get(selector);
      },
      querySelectorAll() { return []; },
      appendChild(child) { this.childNodes.push(child); return child; },
      addEventListener() {}, remove() {}, focus() {},
    };
  }
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  }
  const document = {
    querySelector: node, getElementById: id => node(`#${id}`), querySelectorAll: () => [],
    createElement: element, body: element('body'), activeElement: element('body'),
    addEventListener(name, listener) {
      const group = listeners.get(name) || [];
      group.push(listener); listeners.set(name, group);
    },
  };
  const context = vm.createContext({
    console, document, Date, Math, JSON,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence.count).padStart(12, '0')}` },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    DAY_START: 6, WEEKS: 16, WEEK_SECONDS: 40, EVENT_GAP: [2, 4],
    MAX_ACTIVITIES: 3, PAPER_COST: 100,
    MAJORS: { cs: { name: '컴퓨터공학과', emoji: '', desc: '', bonus: {}, studyMult: 1 } },
    TIME_PHASES: [{ from: 0, to: 24, id: 'day', emoji: '', name: '낮' }],
    ENDINGS: { employed: { emoji: '', title: '취업', text: '새 출발' } },
    STAT_ICON: {}, STAT_LABEL: {},
    weeklyActivities() {}, weeklyDecay() {}, drainCondition() {}, relationTick() {},
    setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: callback => callback(),
    addEventListener(name, listener) {
      const group = listeners.get(name) || [];
      group.push(listener); listeners.set(name, group);
    },
    Event: class { constructor(type) { this.type = type; } },
    location: { reload() { metrics.reloads++; } },
    dispatchEvent(event) { metrics.events.push(event.type); },
  });
  context.window = context;
  vm.runInContext(phoneSource, context, { filename: 'phone/phone.js' });
  vm.runInContext(sleepSource, context, { filename: 'sleep.js' });
  vm.runInContext(gameSource, context, { filename: 'game.js' });
  vm.runInContext(`
    renderAll = () => {};
    renderHud = () => {};
    renderClock = () => {};
    renderWeekBar = () => {};
    maybeRandomPost = () => {};
    maybeTimedEvent = () => {};
  `, context);
  const run = code => vm.runInContext(code, context);
  const snapshot = () => JSON.parse(JSON.stringify(run('window.Game.exchangeClock()')));
  const state = () => JSON.parse(run('JSON.stringify(S)'));
  const clickNew = (name = '같은 이름') => {
    run('initStart()');
    node('#name').value = name;
    node('#btn-start').onclick();
    // Close only the welcome dialog; the tested start button uses the real queue.
    run('nextModal()');
    return snapshot();
  };
  return { run, snapshot, state, clickNew, node, metrics, storage, uuidSequence, listeners };
}

test('new-character button gives same-name characters separate persistent market identities', () => {
  const game = boot();
  const first = game.clickNew();
  assert.match(first.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(first.date, '2026-11-06');
  assert.equal(first.minute, 360);
  assert.deepEqual(first.startedAt, { date: '2026-11-06', minute: 360 });
  assert.equal(JSON.parse(game.storage.get(SAVE_KEY)).exchangeSessionId, first.sessionId);
  const second = game.clickNew();
  assert.notEqual(second.sessionId, first.sessionId, 'the name is not a market-save identifier');
  assert.equal(JSON.parse(game.storage.get(SAVE_KEY)).exchangeSessionId, second.sessionId);
  assert.equal(game.uuidSequence.count, 2);
});

test('continuing a saved character and restarting the game view retain identity and clock', () => {
  const first = boot();
  first.clickNew();
  first.run('S.exchangeDay = 3; S.weekT = 0.25; save()');
  const expected = first.snapshot();
  const second = boot(first);
  second.run('initStart()');
  second.node('#btn-continue').onclick();
  assert.equal(second.snapshot().sessionId, expected.sessionId);
  assert.equal(second.snapshot().date, expected.date);
  assert.equal(second.snapshot().minute, expected.minute);
  assert.deepEqual(second.snapshot().startedAt, expected.startedAt);
  second.run('startGame(); startGame()');
  assert.equal(second.snapshot().sessionId, expected.sessionId);
  assert.equal(first.uuidSequence.count, 1, 'continue/open must not allocate another UUID');
});

test('an older save receives a market identity once and preserves it through later reloads', () => {
  const fixture = boot();
  fixture.clickNew();
  const legacy = fixture.state();
  delete legacy.exchangeSessionId;
  delete legacy.exchangeDay;
  legacy.stageSem = 2;
  legacy.week = 4;
  legacy.weekT = 0.5;
  legacy.gpas = [{ stage: 'ug', gpa: 3.6 }];
  fixture.storage.set(SAVE_KEY, JSON.stringify(legacy));
  const migrated = boot(fixture);
  migrated.run('initStart()');
  migrated.node('#btn-continue').onclick();
  const snapshot = migrated.snapshot();
  assert.ok(snapshot.sessionId);
  assert.equal(migrated.state().exchangeDay, 19);
  assert.equal(JSON.parse(migrated.storage.get(SAVE_KEY)).exchangeSessionId, snapshot.sessionId);
  const again = boot(migrated);
  again.run('initStart()');
  again.node('#btn-continue').onclick();
  assert.equal(again.snapshot().sessionId, snapshot.sessionId);
  assert.equal(again.snapshot().date, snapshot.date);
  assert.equal(again.uuidSequence.count, 2, 'only initial fixture creation and one migration allocate IDs');
});

test('repeated phone open/close keeps one iframe and never replaces the character identity', () => {
  const game = boot();
  const before = game.clickNew();
  game.run('mountPhoneWidget(); setSpeed(0)');
  for (let i = 0; i < 4; i++) {
    game.run('openPhone()');
    assert.equal(game.run('phoneOpen'), true);
    assert.equal(game.snapshot().sessionId, before.sessionId);
    assert.equal(game.snapshot().minute, before.minute);
    assert.equal(game.snapshot().paused, true);
    game.run('closePhone()');
    assert.equal(game.run('phoneOpen'), false);
  }
  assert.equal(game.metrics.iframeCount, 1);
  assert.equal(game.uuidSequence.count, 1);
  assert.equal(JSON.parse(game.storage.get(SAVE_KEY)).exchangeSessionId, before.sessionId);
});

test('normal time and sleep each advance the date without creating a new character', () => {
  const game = boot();
  const before = game.clickNew();
  game.run('S.weekT = 0.99; paused = false; update(1)');
  assert.equal(game.state().exchangeDay, 1);
  assert.equal(game.snapshot().date, '2026-11-07');
  assert.deepEqual(game.snapshot().startedAt, before.startedAt);
  game.run('S.weekT = 0.99; advanceHours(S, 2)');
  assert.equal(game.state().exchangeDay, 2);
  assert.equal(game.snapshot().date, '2026-11-08');
  assert.deepEqual(game.snapshot().startedAt, before.startedAt);
  assert.equal(game.snapshot().sessionId, before.sessionId);
  assert.equal(game.uuidSequence.count, 1);
});

test('semester and degree transitions preserve the market identity and cumulative date', () => {
  const game = boot();
  const before = game.clickNew();
  game.run('S.exchangeDay = 16; S.weekT = 0; S.week = 16; startNextSemester()');
  assert.equal(game.state().week, 1);
  assert.equal(game.snapshot().date, '2026-11-22');
  game.run("enterStage('ms')");
  assert.equal(game.state().week, 1);
  assert.equal(game.snapshot().sessionId, before.sessionId);
  assert.equal(game.snapshot().date, '2026-11-22');
  assert.deepEqual(game.snapshot().startedAt, before.startedAt);
  assert.equal(game.uuidSequence.count, 1);
});

test('a delayed first phone visit warms up at character creation, then follows the actual game clock', async () => {
  const moduleUrl = name => pathToFileURL(path.join(root, 'phone/exchange', name)).href;
  const [{ createGameState }, { createGameClockReader, applyGameClock }, { processCampus, ensureDemoContent }] = await Promise.all([
    import(moduleUrl('market.js')),
    import(moduleUrl('game-clock.js')),
    import(moduleUrl('simulation.js')),
  ]);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'phone/exchange/data/catalog.json'), 'utf8'));
  const game = boot();
  const initial = game.clickNew();
  const baseline = createGameState(catalog, initial);
  // The actual update path crosses two game days before this character first
  // opens the phone. Opening it pauses the host; it must not move the origin.
  game.run('update(40); update(40); update(10); mountPhoneWidget(); openPhone()');
  const origin = 'http://localhost:4173';
  const reader = createGameClockReader({
    location: { origin },
    parent: { location: { origin }, Game: game.run('window.Game') },
  });
  const firstVisit = reader.read();
  assert.equal(firstVisit.date, '2026-11-08');
  assert.equal(firstVisit.minute, 720);
  assert.equal(firstVisit.paused, true);
  assert.deepEqual(firstVisit.startedAt, initial.startedAt);

  const market = createGameState(catalog, firstVisit);
  assert.equal(market.gameClock.date, initial.date);
  assert.equal(market.gameClock.minute, initial.minute);
  assert.deepEqual(market.marketOrigin, baseline.marketOrigin);
  for (const professor of catalog.professors) {
    assert.equal(market.stocks[professor.id].history.length, 41);
    assert.deepEqual(market.stocks[professor.id].history, baseline.stocks[professor.id].history);
  }

  const process = (state, source) => {
    ensureDemoContent(state, source);
    return processCampus(state, source);
  };
  const result = applyGameClock(market, catalog, firstVisit, { process });
  assert.equal(result.resetRequired, false);
  assert.ok(result.steps > 1, 'elapsed game time is processed after the stable warm-up');
  assert.ok(market.day > baseline.day);
  assert.equal(market.gameClock.sessionId, initial.sessionId);
  assert.equal(market.gameClock.date, firstVisit.date);
  assert.equal(market.gameClock.minute, firstVisit.minute);

  const watched = catalog.professors[0].id;
  market.favorites = [watched];
  const pricesBeforeReopen = JSON.stringify(market.stocks);
  game.run('closePhone(); openPhone()');
  const reopened = applyGameClock(market, catalog, reader.read(), { process });
  assert.equal(reopened.steps, 0);
  assert.equal(reopened.resetRequired, false);
  assert.equal(JSON.stringify(market.stocks), pricesBeforeReopen);
  assert.deepEqual(market.favorites, [watched]);
  assert.equal(game.metrics.iframeCount, 1);
  assert.equal(game.uuidSequence.count, 1);
});

test('ending clears the continue save, and the next new character gets a fresh market identity', () => {
  const game = boot();
  const previous = game.clickNew();
  game.run("showEnding('employed')");
  assert.equal(game.storage.has(SAVE_KEY), false);
  assert.equal(game.run('window.Game.isActive()'), false);
  const restarted = boot(game);
  const next = restarted.clickNew('같은 이름');
  assert.notEqual(next.sessionId, previous.sessionId);
  assert.equal(next.date, '2026-11-06');
  assert.equal(next.minute, 360);
  assert.equal(restarted.uuidSequence.count, 2);
});
