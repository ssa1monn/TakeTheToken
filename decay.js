// ───────────────────────────────────────────────
// 시간에 따른 감소 — 관계는 내버려 두면 소원해지고, 컨디션은 깨어 있는 동안 조금씩 닳는다
// (game.js 전에 로드. game.js의 update / weekStep / evalHtml이 아래 함수를 부른다)
// ───────────────────────────────────────────────
const REP_GRACE = 2;          // 이만큼(주)은 아무것도 안 해도 그대로
const REP_DECAY_START = 0.5;  // 유예가 끝난 첫 주 감소량
const REP_DECAY_STEP = 0.25;  // 그 뒤로 한 주마다 늘어나는 양
const REP_DECAY_MAX = 1.5;    // 한 주 최대 감소량
const REP_FLOOR = 25;         // 내버려 둬서 떨어지는 건 여기까지 (그 아래는 사건으로만)

const COND_DRAIN_WEEK = 3;    // 컨디션이 한 주(=하루) 동안 닳는 양 (매주 자연 회복 +2와 합치면 -1)
const COND_LATE_MULT = 1.5;   // 새벽(00~06시)에 깨어 있으면 더 빨리 닳는다

// 한 번이라도 좋아진 주를 "연락한 주"로 본다 — 이벤트·정기 연락·소속 활동 모두 포함
function repIdleWeeks(s, k) {
  const last = s.repTouch?.[k] ?? 0;
  return (s.tick || 0) - last;
}
function repDecayAmount(s, k) {
  const idle = repIdleWeeks(s, k);
  if (idle <= REP_GRACE) return 0;
  return Math.min(REP_DECAY_MAX, REP_DECAY_START + REP_DECAY_STEP * (idle - REP_GRACE - 1));
}

// weekStep 끝에서 매주 한 번
function weeklyDecay(s) {
  s.tick = (s.tick || 0) + 1;
  s.repTouch ||= {};
  s.repSnap ||= { ...s.rep };
  const faded = [];
  for (const k of Object.keys(s.rep)) {
    if (s.rep[k] > s.repSnap[k] + 0.05) s.repTouch[k] = s.tick;      // 지난주보다 올랐다 = 챙겼다
    const d = repDecayAmount(s, k);
    if (d > 0 && s.rep[k] > REP_FLOOR) {
      s.rep[k] = Math.max(REP_FLOOR, s.rep[k] - d);
      if (repIdleWeeks(s, k) === REP_GRACE + 1) faded.push(k);       // 막 소원해지기 시작한 관계만 알림
    }
    s.repSnap[k] = s.rep[k];
  }
  if (faded.length) toast(`⏳ ${faded.map(k => `${STAT_ICON[k]} ${STAT_LABEL[k]}`).join(', ')}와(과) 연락이 뜸해졌다`);
}

// update에서 매 프레임 (weekFrac: 이번 프레임에 흐른 주의 비율)
function drainCondition(s, weekFrac) {
  if (s.burnout > 0 || s.cond <= 0) return;
  const late = hourOf(s) < DAY_START;                                 // 00~06시
  s.cond = Math.max(0, s.cond - COND_DRAIN_WEEK * weekFrac * (late ? COND_LATE_MULT : 1));
}

// 평가 패널: 관계 옆에 "몇 주째 소식 없음"
function repDecayNote(s, k) {
  const idle = repIdleWeeks(s, k), d = repDecayAmount(s, k);
  if (idle < REP_GRACE || !s.tick) return '';
  if (!d) return `<div class="rep-idle">⏳ ${idle}주째 소식 없음 · 다음 주부터 멀어진다</div>`;
  if (s.rep[k] <= REP_FLOOR) return `<div class="rep-idle">⏳ ${idle}주째 소식 없음 · 더는 안 멀어진다</div>`;
  return `<div class="rep-idle warn">⏳ ${idle}주째 소식 없음 · 매주 -${fmt(d)}</div>`;
}
