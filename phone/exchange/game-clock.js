import { calendarClock } from './campus.js';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
const BASE_DATE = '2026-11-06';

function dateNumber(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms / MINUTE_MS : NaN;
}

function validClock(value) {
  return value && Number.isFinite(dateNumber(value.date)) && Number.isInteger(value.minute) && value.minute >= 0 && value.minute < DAY_MINUTES;
}

function atMinute(absolute) {
  const date = new Date(absolute * MINUTE_MS).toISOString().slice(0, 10);
  return { date, minute: absolute - dateNumber(date) };
}

/** Validate a host snapshot before it can change the exchange timeline. */
export function normalizeGameClock(value) {
  if (!value || value.active === false) return null;
  if (!validClock(value) || typeof value.sessionId !== 'string' || !value.sessionId.trim() || value.sessionId.length > 128) return null;
  return { sessionId: value.sessionId, date: value.date, minute: value.minute, active: true, paused: value.paused === true };
}

export function gameStorageKey(snapshot) {
  if (!snapshot || typeof snapshot.sessionId !== 'string' || !snapshot.sessionId.trim()) throw new Error('게임 기록 식별자가 필요해요.');
  return `inu-exchange-game-v1:${encodeURIComponent(snapshot.sessionId)}`;
}

/**
 * Reads only the immediate, same-origin game host. No cross-origin messages are
 * accepted, and neither parent state nor browser storage is modified here.
 * Bae's existing Game.hour() API works immediately. Its optional exchangeClock()
 * supplies a durable save ID and absolute date for exact save/load integration.
 */
export function createGameClockReader(browserWindow, { baseDate = BASE_DATE, legacyCursor } = {}) {
  if (!Number.isFinite(dateNumber(baseDate))) throw new Error('올바른 시작 날짜가 필요해요.');
  let cursor = validClock(legacyCursor) ? { date: legacyCursor.date, minute: legacyCursor.minute } : null;
  let wasConnected = false;

  function hostGame() {
    try {
      const parent = browserWindow.parent;
      if (!parent || parent === browserWindow || parent.location.origin !== browserWindow.location.origin) return null;
      const game = parent.Game;
      return game && typeof game.isActive === 'function' && (typeof game.exchangeClock === 'function' || typeof game.hour === 'function') ? game : null;
    } catch { return null; }
  }

  function read() {
    const game = hostGame();
    wasConnected = !!game;
    if (!game) return null;
    try {
      if (!game.isActive()) return { active: false, source: typeof game.exchangeClock === 'function' ? 'bae' : 'legacy' };
      if (typeof game.exchangeClock === 'function') {
        const snapshot = normalizeGameClock(game.exchangeClock());
        return snapshot ? { ...snapshot, source: 'bae' } : null;
      }
      const hour = game.hour();
      if (!Number.isFinite(hour) || hour < 0 || hour >= 24) return null;
      const minute = Math.floor(hour * 60);
      let date = cursor?.date ?? baseDate;
      // Only an observed midnight wrap advances the date in the legacy adapter.
      // Other backwards movement reaches applyGameClock as a rewind.
      if (cursor && cursor.minute >= 1080 && minute < 360) date = atMinute(dateNumber(date) + DAY_MINUTES).date;
      cursor = { date, minute };
      return { sessionId: 'bae-legacy', ...cursor, active: true, paused: typeof game.inputBlocked === 'function' && game.inputBlocked() === true, source: 'legacy', legacyCursor: { ...cursor } };
    } catch { return null; }
  }

  return { read, connected: () => !!hostGame() || wasConnected };
}

/**
 * Apply elapsed host time, rather than wall-clock time. Duplicate snapshots never
 * run the market again. A rewind/new save is reported before any state mutation
 * so the caller can select a separate saved state or rebuild its own timeline.
 */
export function applyGameClock(state, catalog, input, { process, maxCatchUpDays = 7 } = {}) {
  const snapshot = normalizeGameClock(input);
  if (!snapshot) return { changed: false, resetRequired: false, reason: 'inactive-or-invalid', steps: 0 };
  if (typeof process !== 'function') throw new TypeError('A campus processing function is required.');
  const previous = state.gameClock;
  const target = dateNumber(snapshot.date) + snapshot.minute;
  const current = validClock(previous) ? dateNumber(previous.date) + previous.minute : null;
  const reset = reason => ({ changed: false, resetRequired: true, reason, steps: 0 });
  if (current !== null && previous.sessionId !== snapshot.sessionId) return reset('different-session');
  if (current !== null && target < current) return reset('rewind');
  if (current !== null && target - current > maxCatchUpDays * DAY_MINUTES) return reset('large-jump');
  if (current === target) {
    const changed = state.gameClock.paused !== snapshot.paused;
    state.gameClock = { ...snapshot };
    state.clockMode = 'game';
    return { changed, resetRequired: false, reason: 'same-minute', steps: 0 };
  }

  let steps = 0;
  function run(absolute) {
    const clock = atMinute(absolute);
    state.clockMode = 'game';
    state.gameClock = { ...snapshot, ...clock };
    process(state, catalog);
    steps++;
  }

  if (current === null) run(target);
  else {
    // 10-minute samples preserve price/news movement through background gaps;
    // exact final class ends and day ends ensure no eligible class is missed.
    const ticks = new Set([target]);
    for (let tick = Math.floor(current / 10) * 10 + 10; tick < target; tick += 10) ticks.add(tick);
    for (let day = Math.floor(current / DAY_MINUTES) * DAY_MINUTES; day <= target; day += DAY_MINUTES) {
      const date = atMinute(day).date;
      const weekday = calendarClock(date, 0).weekday;
      for (const course of catalog.courses ?? []) {
        const ends = (course.meetings ?? []).filter(meeting => meeting.day === weekday).map(meeting => Number(meeting.end.slice(0, 2)) * 60 + Number(meeting.end.slice(3)));
        if (!ends.length) continue;
        const ending = day + Math.max(...ends);
        if (ending > current && ending < target) ticks.add(ending);
      }
      if (day + 1439 > current && day + 1439 < target) ticks.add(day + 1439);
    }
    for (const tick of [...ticks].sort((a, b) => a - b)) run(tick);
  }
  return { changed: true, resetRequired: false, reason: current === null ? 'first-sync' : 'advanced', steps };
}
