// ───────────────────────────────────────────────
// 건물 외장 — 인천대 공식 캠퍼스맵 사진(inu.ac.kr/campusMap)을 보고 정한 재료·창 패턴
//
//   STYLES: 외장 한 종류 = 벽 재료 + 창 패턴 (텍스처 한 칸 = 창 한 칸 폭 × 한 층)
//   SPECS:  건물 번호 → 어떤 외장을 어느 층/어느 벽에 쓰는지
//     wall: 기본 외장 / bands: 층별 외장 (from, to: 층 번호, 음수는 꼭대기에서 셈)
//     short: 짧은 마구리벽(긴 벽의 절반 이하) 외장 / curve: 곡면(짧은 변이 이어진 곳) 외장
//     features: 특수 형태 (drum: 원통 유리 드럼, colonnade: 정면 열주, skylight: 옥상 천창, solar: 태양광, cornice: 처마 슬래브)
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { rng } from './osm.js';

export const TILE = 4;              // 텍스처 한 장 = 4×4칸 (칸마다 블라인드·불빛을 달리 해 반복이 덜 보이게)
const TW = 128, TH = 144;           // 한 칸 픽셀 (창 한 칸 3.2m × 층고 3.6m)

const G = { blue: '#6f8a9e', dark: '#4f6577', teal: '#3f8f8f', clear: '#7d9db4' };

// win: punched(창 하나) pair(창 둘) slot(세로 좁은 창) small(작은 정사각) deep(깊은 창·주황 창틀)
//      strip(바닥~천장 세로 띠창) curtain(유리 커튼월) ribbon(가로 띠창) louvre(유리 + 흰 루버)
//      storefront(1층 통유리) framegrid(금속 프레임 격자) tiles(금속판 + 색 타일) ribbonlow(골강판 + 아래 띠창) blank(창 없음)
// joints: stone(석재 판) ashlar(난석 쌓기) panel(금속 패널) corrugated(골강판) none
export const STYLES = {
  curtain:        { wall: '#c9ced3', joints: 'none',  win: 'curtain',  glass: G.clear, frame: '#dfe3e6' },
  grey_slot:      { wall: '#b9bdc0', joints: 'panel', win: 'slot',     glass: G.dark,  frame: '#8a8f94' },
  greige_slot:    { wall: '#d4c4b5', joints: 'stone', win: 'slot',     glass: G.dark,  frame: '#8c8f92' },
  pink_louvre:    { wall: '#e0d4ca', joints: 'stone', win: 'louvre',   glass: G.dark,  frame: '#f4f4f0' },
  pink_punched:   { wall: '#e0d4ca', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#6d7074', ww: 0.36 },
  sand_punched:   { wall: '#c8b09a', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#5d5f63' },
  silver_fins:    { wall: '#b3b6be', joints: 'panel', win: 'strip',    glass: G.blue,  frame: '#c9cdd1', fins: true },
  terracotta:     { wall: '#a0503a', joints: 'panel', win: 'blank' },   // 06 이룸관 기단: 붉은 테라코타 덩어리
  rose_ashlar:    { wall: '#b89a88', joints: 'ashlar', win: 'small',   glass: '#5d7385', frame: '#4a4c50' },
  tan_punched:    { wall: '#bdb3a8', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#55585c' },
  metal_pair:     { wall: '#c9cdd0', joints: 'panel', win: 'pair',     glass: G.dark,  frame: '#8a9096', ww: 0.24, wh: 0.34 },
  beige_deep:     { wall: '#d8c8b2', joints: 'stone', win: 'deep',     glass: G.dark,  frame: '#c07040' },
  white_glass:    { wall: '#e4e6e6', joints: 'panel', win: 'ribbon',   glass: G.clear, frame: '#cfd3d6', tall: true },
  white_store:    { wall: '#e4e6e6', joints: 'panel', win: 'storefront', glass: G.clear, frame: '#9aa0a6' },
  taupe_ribbon:   { wall: '#9a8e8c', joints: 'panel', win: 'ribbon',   glass: G.blue,  frame: '#6e6664' },
  rose_punched:   { wall: '#c9a898', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#3e4146' },
  rose_light:     { wall: '#e2c6b3', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#3e4146' },
  orange_accent:  { wall: '#c8705a', joints: 'panel', win: 'punched',  glass: G.blue,  frame: '#3e4146' },
  redbrown_wall:  { wall: '#8a4530', joints: 'panel', win: 'blank' },
  khaki_small:    { wall: '#a29c90', joints: 'ashlar', win: 'small',   glass: G.dark,  frame: '#55585c' },
  brick_frame:    { wall: '#a0503f', joints: 'panel', win: 'framegrid', glass: G.blue, frame: '#a8aeb0' },
  grey_store:     { wall: '#b4b4b6', joints: 'panel', win: 'storefront', glass: G.blue, frame: '#7b8187' },
  dorm_grey:      { wall: '#d0d4d2', joints: 'panel', win: 'pair',     glass: G.dark,  frame: '#9aa0a4', ww: 0.3 },
  redbrown_punch: { wall: '#8a3a2a', joints: 'panel', win: 'punched',  glass: G.dark,  frame: '#5a2a20' },
  salmon_pair:    { wall: '#b47c68', joints: 'panel', win: 'pair',     glass: G.dark,  frame: '#7d5446', ww: 0.3 },
  white_pair:     { wall: '#dcdddf', joints: 'panel', win: 'pair',     glass: G.dark,  frame: '#9aa0a4', ww: 0.3 },
  grey_punched:   { wall: '#b4b4b6', joints: 'panel', win: 'punched',  glass: G.blue,  frame: '#6c7177' },
  charcoal:       { wall: '#3e3d3b', joints: 'stone', win: 'blank' },
  corrugated:     { wall: '#c0c6cc', joints: 'corrugated', win: 'ribbonlow', glass: G.dark, frame: '#8d949b' },
  metal_tiles:    { wall: '#a4b0c4', joints: 'panel', win: 'tiles' },
  beige_punched:  { wall: '#c8b8a4', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#55585c' },
  silver_store:   { wall: '#d0d0cc', joints: 'panel', win: 'storefront', glass: G.clear, frame: '#e8e8e4' },
  silver_panel:   { wall: '#d0d0cc', joints: 'panel', win: 'blank' },
  tan2_punched:   { wall: '#b8a898', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#55585c' },
  rose2_punched:  { wall: '#dccdc0', joints: 'stone', win: 'punched',  glass: G.blue,  frame: '#55585c' },
  darkgrey_teal:  { wall: '#637074', joints: 'panel', win: 'strip',    glass: G.teal,  frame: '#4c575b' },
  white_teal:     { wall: '#e8ecef', joints: 'panel', win: 'punched',  glass: G.blue,  frame: '#8a9096', bays: 3, tealStrip: true },
  peach_fins:     { wall: '#d9b8a0', joints: 'panel', win: 'strip',    glass: G.blue,  frame: '#8f9499', fins: true },
  // 캠퍼스 밖 / 사진 없는 건물
  biz:            { wall: '#c3c8cc', joints: 'panel', win: 'ribbon',   glass: G.blue,  frame: '#8d949b' },
  misc:           { wall: '#d8d2c6', joints: 'panel', win: 'punched',  glass: G.blue,  frame: '#7a7d80' },
  apt:            { wall: '#e0dcd4', joints: 'panel', win: 'pair',     glass: G.dark,  frame: '#9aa0a4', ww: 0.3 },
};

export const SPECS = {
  '01': { wall: 'curtain', short: 'grey_slot', features: ['drum', 'colonnade'], front: [0.707, 0.707] },
  '02': { wall: 'greige_slot' },
  '03': { wall: 'curtain' },
  '04': { wall: 'pink_louvre', short: 'pink_punched' },
  '05': { wall: 'sand_punched' },
  '06': { wall: 'silver_fins', bands: [{ from: 0, to: 1, style: 'terracotta' }, { from: 1, to: 2, style: 'curtain' }], features: ['skylight'] },
  '07': { wall: 'curtain', short: 'rose_ashlar' },
  '08': { wall: 'tan_punched' },
  '09': { wall: 'metal_pair' },
  '10': { wall: 'beige_deep' },
  '11': { wall: 'white_glass', bands: [{ from: 0, to: 1, style: 'white_store' }] },
  '12': { wall: 'taupe_ribbon', bands: [{ from: -1, style: 'curtain' }], features: ['conifers'] },
  '13': { wall: 'rose_punched', bands: [{ from: -1, style: 'curtain' }], short: 'orange_accent' },
  '14': { wall: 'rose_light', bands: [{ from: -1, style: 'curtain' }], features: ['cornice'] },
  '15': { wall: 'rose_punched', bands: [{ from: -3, style: 'curtain' }], short: 'redbrown_wall' },
  '16': { wall: 'khaki_small' },
  '17': { wall: 'brick_frame', bands: [{ from: 0, to: 1, style: 'grey_store' }] },
  '18-1': { wall: 'dorm_grey', bands: [{ from: 0, to: 3, style: 'redbrown_punch' }], features: ['solar'] },
  '18-2': { wall: 'salmon_pair', features: ['solar'] },
  '18-3': { wall: 'white_pair', features: ['solar'] },
  '19': { wall: 'grey_punched', bands: [{ from: 0, to: 1, style: 'grey_store' }] },
  '20': { wall: 'charcoal', bands: [{ from: -1, style: 'corrugated' }] },
  '21': { wall: 'metal_tiles', bands: [{ from: 0, to: 1, style: 'grey_store' }] },
  '22': { wall: 'beige_punched', short: 'redbrown_punch' },
  '23': { wall: 'silver_panel', bands: [{ from: 0, to: 1, style: 'silver_store' }], curve: 'curtain' },
  '27': { wall: 'tan2_punched' },
  '28': { wall: 'rose2_punched', short: 'darkgrey_teal' },
  '29': { wall: 'white_teal' },
  '41': { wall: 'peach_fins' },
};

/** OSM 건물 이름에서 호관 번호 ('공과대학 (08)' → '08', '정보대(07)' → '07') */
export function buildingNo(name = '') {
  const m = name.match(/\((\d{2}(?:-\d)?)\)/);
  return m ? m[1] : null;
}

/** 건물 → 외장 사양. 사진이 없는 건물은 종류별 기본값 */
export function specFor(name, category) {
  const no = buildingNo(name);
  if (no && SPECS[no]) return { no, ...SPECS[no] };
  const wall = { univ: 'tan_punched', dorm: name.includes('코스테이') ? 'apt' : 'white_pair', biz: 'biz', misc: 'misc' }[category] || 'misc';
  return { no, wall };
}

// ── 텍스처
const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return `#${c.getHexString()}`; };

function windowsOf(s) {
  // 칸 안의 유리 영역 [u0, v0, u1, v1] (u: 0~bays, v: 0~1, 아래가 0)
  const w = s.ww ?? 0.46, h = s.wh ?? 0.5;
  switch (s.win) {
    case 'punched': {
      const r = [];
      for (let b = 0; b < (s.bays || 1); b++) if (!(s.tealStrip && b === 2)) r.push([b + 0.5 - w / 2, 0.3, b + 0.5 + w / 2, 0.3 + h]);
      if (s.tealStrip) r.push([2.3, 0, 2.7, 1]);
      return r;
    }
    case 'pair': return [[0.25 - w / 2, 0.32, 0.25 + w / 2, 0.32 + h * 1.1], [0.75 - w / 2, 0.32, 0.75 + w / 2, 0.32 + h * 1.1]];
    case 'slot': return [[0.43, 0.14, 0.57, 0.9]];
    case 'small': return [[0.38, 0.4, 0.62, 0.68]];
    case 'deep': return [[0.3, 0.32, 0.7, 0.78]];
    case 'strip': return [[0.24, 0, 0.76, 1]];
    case 'curtain': return [[0, 0, 1, 1]];
    case 'ribbon': return s.tall ? [[0, 0.16, 1, 0.92]] : [[0, 0.34, 1, 0.82]];
    case 'louvre': return [[0.06, 0, 0.94, 1]];
    case 'storefront': return [[0.03, 0, 0.97, 0.84]];
    case 'framegrid': return [[0.12, 0.2, 0.88, 0.9]];
    case 'ribbonlow': return [[0, 0.06, 1, 0.3]];
    default: return [];
  }
}

// 창살·루버처럼 유리 위를 가리는 것 (밤 불빛 텍스처에도 검게 덮는다)
function drawOver(g, s, R) {
  const f = s.frame;
  switch (s.win) {
    case 'punched': case 'pair': case 'deep': {
      for (const [u0, v0, u1, v1] of windowsOf(s)) {
        if (u1 - u0 > 0.6 || v1 - v0 > 0.9) continue;
        const mu = (u0 + u1) / 2;
        R(mu - 0.012, v0, mu + 0.012, v1, f);
        R(u0, v0 + (v1 - v0) * 0.72, u1, v0 + (v1 - v0) * 0.72 + 0.012, f);
      }
      break;
    }
    case 'strip':
      R(0.24, 0, 0.76, 0.12, s.spandrel || shade(s.glass, -0.12));      // 층 사이 스팬드럴
      R(0.24, 0.12, 0.76, 0.13, f); R(0.495, 0.13, 0.505, 1, f);
      if (s.fins) { R(0.2, 0, 0.24, 1, shade(s.frame, 0.06)); R(0.76, 0, 0.8, 1, shade(s.frame, -0.1)); }
      break;
    case 'curtain':
      R(0, 0, 1, 0.1, shade(s.glass, -0.14));
      R(0, 0.1, 1, 0.112, f); R(0, 0.58, 1, 0.59, f);
      R(0, 0, 0.012, 1, f); R(0.988, 0, 1, 1, f); R(0.494, 0, 0.506, 1, f);
      break;
    case 'ribbon': case 'ribbonlow': case 'storefront': {
      const [, v0, , v1] = windowsOf(s)[0];
      for (const u of [0, 0.5, 1]) R(u - 0.008, v0, u + 0.008, v1, f);
      if (s.win === 'storefront') R(0, 0.6, 1, 0.61, f);
      break;
    }
    case 'louvre':
      for (let k = 0; k < 10; k++) R(0.06, k / 10 + 0.02, 0.94, k / 10 + 0.055, f);
      R(0.06, 0, 0.08, 1, f); R(0.92, 0, 0.94, 1, f);
      break;
    case 'framegrid':
      R(0.36, 0.2, 0.37, 0.9, f); R(0.63, 0.2, 0.64, 0.9, f);
      break;
    case 'slot':
      R(0.43, 0.52, 0.57, 0.53, f);
      break;
  }
}

function drawJoints(g, s, R, rand, bays) {
  const base = s.wall;
  switch (s.joints) {
    case 'stone': {      // 석재 판: 칸당 4×5장, 판마다 색을 조금씩
      for (let j = 0; j < 5; j++) for (let i = 0; i < 4 * bays; i++) {
        R(i / 4, j / 5, (i + 1) / 4, (j + 1) / 5, shade(base, (rand() - 0.5) * 0.045));
      }
      for (let j = 0; j <= 5; j++) R(0, j / 5 - 0.003, bays, j / 5 + 0.003, shade(base, -0.09));
      for (let i = 0; i <= 4 * bays; i++) R(i / 4 - 0.0025, 0, i / 4 + 0.0025, 1, shade(base, -0.07));
      break;
    }
    case 'ashlar': {     // 난석 쌓기: 줄마다 길이가 다른 돌
      for (let j = 0; j < 7; j++) {
        let u = 0;
        while (u < bays) {
          const L = 0.12 + rand() * 0.3, u1 = Math.min(bays, u + L);
          R(u, j / 7, u1, (j + 1) / 7, shade(base, (rand() - 0.5) * 0.09));
          R(u1 - 0.004, j / 7, u1 + 0.004, (j + 1) / 7, shade(base, -0.12));
          u = u1;
        }
        R(0, j / 7 - 0.004, bays, j / 7 + 0.004, shade(base, -0.12));
      }
      break;
    }
    case 'panel': {      // 금속/세라믹 패널: 칸당 2×3장, 이음매 + 위쪽 살짝 밝게
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2 * bays; i++) R(i / 2, j / 3, (i + 1) / 2, (j + 1) / 3, shade(base, (rand() - 0.5) * 0.025));
      for (let j = 0; j <= 3; j++) R(0, j / 3 - 0.004, bays, j / 3 + 0.004, shade(base, -0.08));
      for (let i = 0; i <= 2 * bays; i++) R(i / 2 - 0.003, 0, i / 2 + 0.003, 1, shade(base, -0.06));
      break;
    }
    case 'corrugated':
      for (let i = 0; i < 24 * bays; i++) R(i / 24, 0, i / 24 + 1 / 48, 1, shade(base, -0.06));
      break;
  }
}

function drawGlass(s, R, rand) {
  for (const [u0, v0, u1, v1] of windowsOf(s)) {
    const teal = s.tealStrip && u1 - u0 < 0.5 && v1 - v0 > 0.9;
    const glass = teal ? G.teal : s.glass;
    if (s.win === 'deep') R(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.04, s.frame);         // 깊은 창틀
    else if (u1 - u0 < 0.95) R(u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02, s.frame);
    R(u0, v0, u1, v1, shade(glass, (rand() - 0.5) * 0.05));
    // 하늘 반사: 위쪽이 밝게
    R(u0, v0 + (v1 - v0) * 0.55, u1, v1, 'rgba(255,255,255,0.10)');
    R(u0, v0 + (v1 - v0) * 0.8, u1, v1, 'rgba(255,255,255,0.08)');
    // 블라인드: 칸마다 내린 정도가 다르다
    if (rand() < 0.4) R(u0, v1 - (v1 - v0) * (0.15 + rand() * 0.45), u1, v1, 'rgba(232,226,210,0.55)');
  }
}

function drawTiles(g, R, rand, bays) {
  for (let k = 0; k < 2; k++) if (rand() < 0.5) {
    const u = rand() * (bays - 0.15), v = rand() * 0.8;
    R(u, v, u + 0.12, v + 0.11, rand() < 0.6 ? '#3a62b0' : '#e6c13a');
  }
}

const TEX = {}, LIT = {};

/** 외장 텍스처 (낮) + 불 켜진 창 (밤 emissiveMap). 둘 다 4×4칸 아틀라스, repeat = 1/4 */
export function facadeTextures(key) {
  if (TEX[key]) return { map: TEX[key], lit: LIT[key] };
  const s = STYLES[key] || STYLES.misc, bays = s.bays || 1;
  const W = TW * bays, cvs = [0, 1].map(() => document.createElement('canvas'));
  for (const c of cvs) { c.width = W * TILE; c.height = TH * TILE; }
  const [g, gl] = cvs.map(c => c.getContext('2d'));
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W * TILE, TH * TILE);
  const rand = rng([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0);
  for (let ty = 0; ty < TILE; ty++) for (let tx = 0; tx < TILE; tx++) {
    // 칸 좌표(u: 0~bays, v: 0~1, 아래가 0) → 캔버스
    const mk = ctx => (u0, v0, u1, v1, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(tx * W + u0 / bays * W, ty * TH + (1 - v1) * TH, (u1 - u0) / bays * W, (v1 - v0) * TH);
    };
    const R = mk(g), RL = mk(gl);
    R(0, 0, bays, 1, shade(s.wall, (rand() - 0.5) * 0.02));
    drawJoints(g, s, R, rand, bays);
    if (s.win === 'tiles') drawTiles(g, R, rand, bays);
    drawGlass(s, R, rand);
    drawOver(g, s, R);
    // 밤: 칸마다 불을 켤지
    for (const [u0, v0, u1, v1] of windowsOf(s)) {
      if (rand() > (s.win === 'curtain' || s.win === 'storefront' ? 0.5 : 0.42)) continue;
      RL(u0, v0, u1, v1, rand() < 0.75 ? '#ffd58a' : '#dfe8ff');
    }
    const black = (u0, v0, u1, v1) => RL(u0, v0, u1, v1, '#000');
    drawOver(gl, { ...s, frame: '#000', spandrel: '#000', glass: '#000' }, (u0, v0, u1, v1) => black(u0, v0, u1, v1));
  }
  const [map, lit] = cvs.map(c => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / TILE, 1 / TILE);
    return t;
  });
  TEX[key] = map; LIT[key] = lit;
  return { map, lit };
}

export function styleBays(key) { return (STYLES[key] || STYLES.misc).bays || 1; }
