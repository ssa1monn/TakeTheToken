// ───────────────────────────────────────────────
// 잠자기 — 내 방(제1기숙사)에 들어가면 언제든 잘 수 있다. 자는 동안 시간이 흐른다
// (game.js 전에 로드. game.js enterBuilding이 offerSleep을 먼저 부른다)
// ───────────────────────────────────────────────
const HOME_DORM = '제1기숙사';      // 시작 위치 = 내 방
const SLEEP_PER_HOUR = 4;          // 한 시간 잘 때마다 컨디션
const LATE_BED_HOUR = 2;           // 새벽 2시 넘어 누우면 잠의 질이 떨어진다
const LATE_BED_MULT = 0.75;
const WAKE_HOUR = 7;
const NAP_HOURS = 1.5, NAP_COND = 7;

const isHome = name => !!name && name.includes(HOME_DORM);
const isNight = h => h >= 20 || h < DAY_START;

// h시에 누워서 WAKE_HOUR까지 자면 몇 시간
function hoursUntilWake(h) { return (WAKE_HOUR - h + 24) % 24 || 24; }

// 시간을 건너뛴다 (06:00을 넘으면 그 주(=하루) 정산을 한 번 돌린다)
function advanceHours(s, hrs) {
  let t = s.weekT + hrs / 24;
  if (t >= 1) { s.weekT = 0; weekStep(); t -= 1; }   // weekStep에서 거래소 날짜도 하루 넘김
  s.weekT = Math.min(0.999, t);
  renderAll();
}

function sleep(s, hrs, quality) {
  const gain = Math.round(hrs * SLEEP_PER_HOUR * quality);
  const before = s.cond;
  s.cond = clamp(s.cond + gain);
  advanceHours(s, hrs);
  return Math.round(s.cond - before);
}

// 내 방이면 잠자기 메뉴를 띄우고 true. 나머지 건물은 false → 원래 출입 흐름
function offerSleep(name) {
  if (!isHome(name) || !S || S.ending) return false;
  const s = S, h = hourOf(s), dayKey = `${s.stage}-${s.stageSem}-${s.week}`;
  const late = h >= LATE_BED_HOUR && h < DAY_START;
  const full = hoursUntilWake(h), q = late ? LATE_BED_MULT : 1;
  const napped = s.flags.napDay === dayKey;

  const choices = isNight(h) ? [
    { label: `푹 잔다 (0${WAKE_HOUR}:00 기상)`, sub: `${fmt(full)}시간 · 컨디션 +${Math.round(full * SLEEP_PER_HOUR * q)}${late ? ' (늦게 누워서 덜 회복)' : ''}`,
      run: st => { const g = sleep(st, full, q); return { fx: {}, msg: late ? `알람을 세 번 끄고 일어났다. 개운하진 않다. (컨디션 +${g})` : `베개에 머리가 닿자마자 기억이 없다. 아침 햇살이 눈부시다. (컨디션 +${g})` }; } },
    { label: '4시간만 자고 일어난다', sub: `컨디션 +${Math.round(4 * SLEEP_PER_HOUR * q)} · 할 일이 남았다`,
      run: st => { const g = sleep(st, 4, q); return { fx: {}, msg: `알람이 울리자마자 몸을 일으켰다. 눈은 아직 자고 있다. (컨디션 +${g})` }; } },
    { label: '책상에 앉아 밤을 새운다', sub: '공부 +6 · 컨디션 -6',
      run: st => { inc(st, 'allnighter'); return { fx: { study: 6, cond: -6 }, msg: '스탠드 불빛 아래 룸메가 뒤척인다. 창밖이 밝아 온다.' }; } },
  ] : [
    { label: `낮잠 (${fmt(NAP_HOURS)}시간)`, sub: napped ? '오늘은 이미 낮잠을 잤다' : `컨디션 +${NAP_COND}`,
      req: () => !napped,
      run: st => { st.flags.napDay = dayKey; const g = sleep(st, NAP_HOURS, NAP_COND / (NAP_HOURS * SLEEP_PER_HOUR)); return { fx: {}, msg: `이불 속에서 "10분만"이 90분이 됐다. (컨디션 +${g})` }; } },
  ];
  choices.push({ label: '기숙사 안을 둘러본다', sub: '기숙사 이벤트', run: () => ({ browse: true }) });

  pushModal(() => showEvent({
    emoji: isNight(h) ? '🌙' : '🛏️', title: '내 방 · 제1기숙사',
    text: isNight(h) ? `${clockText(h)}. 침대가 부른다.` : `${clockText(h)}. 낮인데 침대가 유난히 푹신해 보인다.`,
    choices,
  }, null, res => {
    if (!res.browse) return false;
    nextModal();
    enterBuilding(name, true);           // 잠자기 메뉴 없이 원래 기숙사 이벤트로
    return true;
  }));
  return true;
}

// 내 방은 "이번 주 이미 다녀옴" · 번아웃이어도 항상 들어갈 수 있다 (문 앞 안내도 그렇게)
document.addEventListener('DOMContentLoaded', () => {
  const orig = window.Game.placeStatus;
  window.Game.placeStatus = name => (isHome(name) && window.Game.isActive()
    ? { key: placeOf(name), ok: true, state: 'ready', reason: '' }
    : orig(name));
});
