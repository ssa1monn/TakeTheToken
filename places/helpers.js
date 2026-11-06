// ───────────────────────────────────────────────
// 건물 이벤트 작성 도우미 (data.js 다음, game.js 전에 로드)
//
//   addPlace(key, { match, emoji, name, open: hours(8, 22), events: [...] })
//     match: OSM 건물 이름 전체 (예: '공과대학 (08)') — 이름이 겹치지 않게 번호까지 적는다
//   ev(id, emoji, title, text, [선택지...], { time, when })
//     time: ['late'|'morning'|'day'|'evening'|'night'] — 그 시간대에만 / 생략하면 아무 때나
//     when: s => 조건 — 생략하면 항상
//   ch(라벨, 효과, 결과 문장, 대나무숲 글?)
//   gamble(라벨, 성공확률, [효과, 문장, 글?], [효과, 문장, 글?])
//   act(라벨, s => ({ fx, msg, post }))  — 플래그/카운터를 건드리는 특수 선택지
//
// 효과 키: study social spec romance research money cond prof peers seniors parents credits
// 한 곳에 최소 2개는 when 없이 둔다 (조건이 다 막혀도 들어갈 수 있게)
// ───────────────────────────────────────────────

function hours(a, b) {
  const fn = h => (a < b ? h >= a && h < b : h >= a || h < b);
  fn.text = `${a}시부터 ${b === 24 ? 24 : b}시까지`;
  return fn;
}

function addPlace(key, cfg) {
  const open = cfg.open;
  PLACES[key] = {
    match: cfg.match, emoji: cfg.emoji, name: cfg.name,
    open, closedText: cfg.closedText || (open ? `${cfg.name}은(는) ${open.text}만 연다` : undefined),
    events: () => cfg.events,
  };
}

function ev(id, emoji, title, text, choices, opt = {}) {
  return { id, emoji, title, text, choices, ...opt };
}

function ch(label, fx, msg, post, cutscene) {
  return { label, run: () => ({ fx, msg, post }), ...(cutscene ? { cutscene } : {}) };
}

function gamble(label, p, win, lose, cutscene) {
  const out = r => ({ fx: r[0], msg: r[1], post: r[2] });
  return { label, run: () => (Math.random() < p ? out(win) : out(lose)), ...(cutscene ? { cutscene } : {}) };
}

function act(label, run, cutscene) { return { label, run, ...(cutscene ? { cutscene } : {}) }; }

const UG_ONLY = s => s.stage === 'ug';
const GRAD_ONLY = s => s.stage !== 'ug';
