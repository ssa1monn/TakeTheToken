// ───────────────────────────────────────────────
// OSM 데이터 → Three.js 캠퍼스
// 2D 좌표 (x=동, y=북) → 3D (x, 높이, -y)
//
// 실제 모습 보정:
//   - 건물 외장: map/facades.js (인천대 공식 캠퍼스맵 사진 기준)
//   - 지붕 색·소나무 위치·트랙·골프장 벙커: map/real.js (위성사진에서 추출)
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ring, area2, ccw, centroid, ptInPoly, segDist, polyEdgeDist, insetPoly, stitch, makeClipper, rng } from './osm.js';
import { DOOR_OVERRIDES } from './doors.js';
import { specFor, facadeTextures, styleBays } from './facades.js';
import { PINES, TRACK, ROOF, BUNKERS } from './real.js';

const LEVEL_H = 3.6;       // 층고 (m)
const BAY_W = 3.2;         // 창문 한 칸 폭 (m)
const DEFAULT_LEVELS = 2;
const PARAPET_H = 1.0;     // 옥상 난간 높이
const GROUND_DEPTH = 14;   // 디오라마 땅 두께
const LINE_Z = 0.05;       // 차선은 노면보다 살짝 위

// ── 팔레트 (위성사진·현장 사진에서 고른 색. 잔디는 여름 기준)
const COLORS = {
  ground: '#8aac64', campus: '#92b66b', park: '#80ad5a', golf: '#94c264', pitch: '#4f8a4a', stadium: '#53906b',
  water: '#4d7f88', parking: '#7d8086', plaza: '#ffffff', granite: '#ffffff', soil: '#6f5238',
  road_main: '#ffffff', road: '#ffffff', path: '#ffffff', sidewalk: '#ffffff',
  dirt: '#c4ab84', bunker: '#e6dcc0', tennis: '#2f4f8f', court: '#2f7d55',
  line_w: '#f4f4ee', line_y: '#f2c230',
  roof_univ: '#b9b8aa', roof_dorm: '#a3a598', roof_biz: '#c9cbc4', roof_misc: '#b2ad9c',
  trim: '#d9d9d4', unit: '#b9bec6', plinth: '#5f5d5a', white: '#f2f2ee',
  solar: '#26344f', glass_dark: '#3d5466',
  trunk: '#6b4a33', pine_trunk: '#7c4b36',
  shelter: '#4a7bd0', glass: '#bfe0f0', bench: '#9b7653',
  door_frame: '#3b4250', door_glass: '#8fb8cf',
  track: '#b85a45', turf: '#4f8a3e', turf2: '#5b9748', tennis_court: '#4a72c0',
  tower: '#5b5866',
};
const DOOR_W = { main: 3.2, yes: 1.8 };   // 문 폭 (m) — main: 정문(양여닫이 + 차양), yes: 보조문
const DOOR_H = { main: 3.0, yes: 2.6 };

const ROAD = { // 종류: [폭, 높이, 재질]
  trunk: [16, 0.12, 'road_main'], primary: [16, 0.12, 'road_main'], secondary: [14, 0.12, 'road_main'],
  tertiary: [10, 0.11, 'road'], residential: [7, 0.10, 'road'], unclassified: [7, 0.10, 'road'],
  service: [5, 0.09, 'road'], living_street: [5, 0.09, 'road'],
  pedestrian: [4, 0.085, 'path'], footway: [2.4, 0.08, 'path'], path: [2, 0.08, 'path'],
  cycleway: [2.4, 0.08, 'path'], steps: [2.4, 0.08, 'path'],
};
const SIDEWALK_Z = 0.065;
const AREA_Z = { park: 0.04, golf: 0.04, stadium: 0.05, pitch: 0.06, tennis: 0.06, court: 0.06, dirt: 0.055, parking: 0.05, plaza: 0.07, granite: 0.072, water: 0.03 };

// ── 바닥 텍스처 (월드 좌표 UV: 1 = 1m)
const GROUND_TEX = {};
function groundTexture(kind) {
  if (GROUND_TEX[kind]) return GROUND_TEX[kind];
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rand = rng(kind.length * 97 + 3);
  const pick = a => a[Math.floor(rand() * a.length)];
  let meters = 4;
  if (kind === 'brick' || kind === 'brick_light') {
    // 붉은 점토 벽돌 (반장 엇갈려 쌓기) + 4m마다 밝은 띠 — 01·06·11 앞 광장 사진
    const pal = kind === 'brick'
      ? ['#b06a50', '#a55f47', '#b97559', '#9c5842', '#bd7a60', '#a8644c']
      : ['#b98270', '#ae7866', '#c28d78', '#a87262', '#c69886'];
    const px = S / meters, bw = 0.2 * px, bh = 0.1 * px;
    g.fillStyle = '#7d4a3a'; g.fillRect(0, 0, S, S);
    for (let y = 0, row = 0; y < S; y += bh, row++) {
      for (let x = (row % 2) * -bw / 2; x < S; x += bw) {
        const edge = y < 0.2 * px || x < 0.2 * px;                 // 4m 격자 띠 (밝은 벽돌)
        g.fillStyle = edge ? pick(['#c99a82', '#c4957c', '#cfa38b']) : pick(pal);
        g.fillRect(x + 0.6, y + 0.6, bw - 1.2, bh - 1.2);
      }
    }
  } else if (kind === 'granite') {
    // 밝은 화강석 판 (23 강당 앞 광장)
    meters = 4;
    const px = S / meters;
    for (let y = 0; y < meters; y++) for (let x = 0; x < meters; x++) {
      g.fillStyle = pick(['#e2e1da', '#dcdbd3', '#e7e6df', '#d6d5cd']);
      g.fillRect(x * px, y * px, px, px);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(90,90,90,${rand() * 0.08})`; g.fillRect(x * px + rand() * px, y * px + rand() * px, 2, 2); }
    }
    g.fillStyle = '#b9b8b0';
    for (let k = 0; k <= meters; k++) { g.fillRect(k * S / meters - 1, 0, 2, S); g.fillRect(0, k * S / meters - 1, S, 2); }
  } else if (kind === 'grass') {
    // 잔디 얼룩: 밝기만 바뀌는 회색 (재질 색에 곱해짐)
    meters = 24;
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 260; k++) {
      const r = 8 + rand() * 46, x = rand() * S, y = rand() * S, v = Math.floor(205 + rand() * 50);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${v},${v},${v},0.5)`); grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grd;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); }   // 이음매 없이 반복
    }
    for (let k = 0; k < 14000; k++) {
      const v = Math.floor(190 + rand() * 65);
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(rand() * S, rand() * S, 1.2, 2.4);
    }
  } else {
    // 아스팔트: 잔 알갱이 노이즈
    meters = 8;
    g.fillStyle = kind === 'asphalt_main' ? '#46494e' : '#54575c';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 9000; k++) {
      const v = Math.floor(rand() * 60) + 40;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rand() * 0.3})`;
      g.fillRect(rand() * S, rand() * S, 1.5, 1.5);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / meters, 1 / meters);
  return (GROUND_TEX[kind] = tex);
}
const GROUND_MAP = { campus: 'grass', park: 'grass', golf: 'grass', stadium: 'grass', plaza: 'brick', path: 'brick_light', sidewalk: 'brick_light', granite: 'granite', road_main: 'asphalt_main', road: 'asphalt' };

// ── 재질
const MATS = {};
function mat(key) {
  if (MATS[key]) return MATS[key];
  const opt = { color: COLORS[key], roughness: 0.85 };
  if (key === 'water') Object.assign(opt, { roughness: 0.12, metalness: 0.25 });
  if (key === 'glass' || key === 'glass_dark') Object.assign(opt, { roughness: 0.2, metalness: 0.3 });
  if (key === 'solar') Object.assign(opt, { roughness: 0.3, metalness: 0.4 });
  if (GROUND_MAP[key]) opt.map = groundTexture(GROUND_MAP[key]);
  return (MATS[key] = new THREE.MeshStandardMaterial(opt));
}

// ── 지오메트리 빌더: 재질 슬롯별로 삼각형을 모아 groups가 있는 BufferGeometry 하나로
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const v3 = (p, h) => [p[0], h, -p[1]];          // 2D → 3D
const out3 = n2 => [n2[0], 0, -n2[1]];          // 2D 법선 → 3D

class GeoBuilder {
  /** worldUV: UV를 월드 좌표(m)로 자동 계산할 슬롯 번호들 (바닥 텍스처용) */
  constructor(slots = 1, worldUV = []) {
    this.parts = Array.from({ length: slots }, () => ({ p: [], n: [], u: [] }));
    this.wuv = new Set(worldUV);
  }

  tri(mi, a, b, c, want, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n);
    if (len < 1e-9) return;
    n = n.map(v => v / len);
    if (this.wuv.has(mi)) { ua = [a[0], -a[2]]; ub = [b[0], -b[2]]; uc = [c[0], -c[2]]; }
    if (want && n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n = n.map(v => -v); }
    while (this.parts.length <= mi) this.parts.push({ p: [], n: [], u: [] });
    const P = this.parts[mi];
    P.p.push(...a, ...b, ...c); P.n.push(...n, ...n, ...n); P.u.push(...ua, ...ub, ...uc);
  }

  quad(mi, a, b, c, d, want, uv) {
    const [ua, ub, uc, ud] = uv || [];
    this.tri(mi, a, b, c, want, ua, ub, uc);
    this.tri(mi, a, c, d, want, ua, uc, ud);
  }

  /** 수평 다각형 (오목 다각형·구멍도 earcut으로 삼각분할) */
  poly(mi, pts, h, want = UP, holes = []) {
    if (pts.length < 3) return;
    const all = [pts, ...holes].flat();
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), holes.map(hl => hl.map(p => new THREE.Vector2(p[0], p[1]))));
    for (const [i, j, k] of tris) this.tri(mi, v3(all[i], h), v3(all[j], h), v3(all[k], h), want);
  }

  /** a→b 방향 띠 (off: 진행 방향 왼쪽으로 평행이동) */
  strip(mi, a, b, w, h, off = 0) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-3) return;
    const nx = -dy / L, ny = dx / L, lo = off - w / 2, hi = off + w / 2;
    this.quad(mi, v3([a[0] + nx * hi, a[1] + ny * hi], h), v3([a[0] + nx * lo, a[1] + ny * lo], h),
      v3([b[0] + nx * lo, b[1] + ny * lo], h), v3([b[0] + nx * hi, b[1] + ny * hi], h), UP);
  }

  /** 닫힌/열린 꺾은선을 따라 가는 선 */
  polyline(mi, pts, w, h, closed = false) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) this.strip(mi, pts[i], pts[(i + 1) % pts.length], w, h);
  }

  disc(mi, c, r, h, seg = 8, want = UP) {
    const pts = Array.from({ length: seg }, (_, i) => [c[0] + r * Math.cos(2 * Math.PI * i / seg), c[1] + r * Math.sin(2 * Math.PI * i / seg)]);
    for (let i = 1; i < seg - 1; i++) this.tri(mi, v3(pts[0], h), v3(pts[i], h), v3(pts[i + 1], h), want);
  }

  /** 수직 벽 (a→b 밑변, 바깥쪽이 want2d) */
  wall(mi, a, b, h0, h1, want2d, uv) {
    this.quad(mi, v3(a, h0), v3(b, h0), v3(b, h1), v3(a, h1), out3(want2d), uv);
  }

  /** 원기둥 (옆면 UV: u = 둘레 m / uScale, v = 높이 m / vScale) */
  cyl(mi, c, r, z0, z1, seg = 12, { caps = true, capMi = mi, uScale = 0, vScale = 1, v0 = 0 } = {}) {
    const P = i => [c[0] + r * Math.cos(2 * Math.PI * i / seg), c[1] + r * Math.sin(2 * Math.PI * i / seg)];
    const arc = 2 * Math.PI * r / seg;
    for (let i = 0; i < seg; i++) {
      const a = P(i), b = P(i + 1), n = [(a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]];
      const uv = uScale ? [[i * arc / uScale, v0], [(i + 1) * arc / uScale, v0], [(i + 1) * arc / uScale, v0 + (z1 - z0) / vScale], [i * arc / uScale, v0 + (z1 - z0) / vScale]] : undefined;
      this.wall(mi, a, b, z0, z1, n, uv);
    }
    if (caps) { this.disc(capMi, c, r, z1, seg, UP); this.disc(capMi, c, r, z0, seg, DOWN); }
  }

  /** 회전된 상자 */
  box(mi, cx, cy, z0, sx, sy, sz, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [cx + x * sx / 2 * c - y * sy / 2 * s, cy + x * sx / 2 * s + y * sy / 2 * c]);
    this.poly(mi, pts, z0 + sz, UP);
    this.poly(mi, pts, z0, DOWN);
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      this.wall(mi, a, b, z0, z0 + sz, [b[1] - a[1], -(b[0] - a[0])]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    const total = this.parts.reduce((a, part) => a + part.p.length / 3, 0);
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), U = new Float32Array(total * 2);
    let start = 0;
    this.parts.forEach((part, mi) => {
      const count = part.p.length / 3;
      if (!count) return;
      P.set(part.p, start * 3); N.set(part.n, start * 3); U.set(part.u, start * 2); // 큰 배열이라 spread 대신 set
      g.addGroup(start, count, mi);
      start += count;
    });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    return g;
  }

  mesh(materials, { cast = false, receive = true, name = '' } = {}) {
    const m = new THREE.Mesh(this.geometry(), materials);
    m.castShadow = cast; m.receiveShadow = receive; m.name = name;
    return m;
  }
}

// ── 2D 보조
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const len = v => Math.hypot(v[0], v[1]);
const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };

/** 반시계 다각형을 바깥으로 d만큼 (모서리는 최대 2d) */
function outsetPoly(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const n1 = norm([p[1] - a[1], -(p[0] - a[0])]), n2 = norm([b[1] - p[1], -(b[0] - p[0])]);
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = Math.min(d / Math.max(bis[0] * n1[0] + bis[1] * n1[1], 0.3), d * 2);
    return add(p, bis, k);
  });
}

/** 긴 변 방향 기준 회전 사각형: { c, u(장축), v(단축), a(장축 반길이), b(단축 반길이) } */
function orientedBox(poly) {
  let best = 0, u = [1, 0];
  for (let i = 0; i < poly.length; i++) {
    const d = sub(poly[(i + 1) % poly.length], poly[i]), L = len(d);
    if (L > best) { best = L; u = norm(d); }
  }
  let v = [-u[1], u[0]];
  const pu = poly.map(p => p[0] * u[0] + p[1] * u[1]), pv = poly.map(p => p[0] * v[0] + p[1] * v[1]);
  let a = (Math.max(...pu) - Math.min(...pu)) / 2, b = (Math.max(...pv) - Math.min(...pv)) / 2;
  const cu = (Math.max(...pu) + Math.min(...pu)) / 2, cv = (Math.max(...pv) + Math.min(...pv)) / 2;
  const c = [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv];
  if (b > a) { [a, b] = [b, a]; [u, v] = [v, [-v[0], -v[1]]]; }
  return { c, u, v, a, b };
}
const boxPt = (B, x, y) => [B.c[0] + B.u[0] * x + B.v[0] * y, B.c[1] + B.u[1] * x + B.v[1] * y];
const rectPts = (B, a, b) => [boxPt(B, -a, -b), boxPt(B, a, -b), boxPt(B, a, b), boxPt(B, -a, b)];

/** 육상 트랙 모양 (직선 + 반원). d: 바깥선에서 안쪽으로 들어간 거리 */
function stadiumPts(c, u, L, W, d, seg = 20) {
  const v = [-u[1], u[0]], s = (L - W) / 2, r = W / 2 - d, pts = [];
  for (const end of [1, -1]) {
    for (let i = 0; i <= seg; i++) {
      const t = -Math.PI / 2 + Math.PI * i / seg;
      const x = end * (s + r * Math.cos(t)), y = end * r * Math.sin(t);
      pts.push([c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y]);
    }
  }
  return pts;
}

// ───────────────────────────────────────────────
export function buildCampus(osm, seed = 7) {
  const rand = rng(seed);
  const R = (a, b) => a + (b - a) * rand();
  const { halfW, halfH, nodes, nodeTags, ways, wayById, relations } = osm;
  const { inside, clipSeg, clipPoly } = makeClipper(halfW, halfH);
  const group = new THREE.Group();

  // 1) 바닥 (두께 있는 디오라마 판)
  const grassTex = groundTexture('grass').clone();
  grassTex.repeat.set(halfW * 2 / 24, halfH * 2 / 24);
  const groundTop = new THREE.MeshStandardMaterial({ color: COLORS.ground, map: grassTex, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, GROUND_DEPTH, halfH * 2),
    [mat('soil'), mat('soil'), groundTop, mat('soil'), mat('soil'), mat('soil')]);
  ground.position.y = -GROUND_DEPTH / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // 2) 캠퍼스 부지
  const gb = new GeoBuilder(1, [0]);
  const mini = { campus: [], areas: [], roads: [] };      // 미니맵용 2D 데이터
  const campusPolys = [];
  for (const rel of relations) {
    if (rel.tags.amenity !== 'university') continue;
    const outs = rel.members.filter(m => m.role === 'outer' && wayById.has(m.ref)).map(m => wayById.get(m.ref).pts);
    for (const r of stitch(outs)) { const p = clipPoly(r); gb.poly(0, p, 0.02); mini.campus.push(p); campusPolys.push(p); }
  }
  group.add(gb.mesh([mat('campus')], { name: 'campus' }));
  const inCampus = (x, y) => campusPolys.some(p => ptInPoly(x, y, p));

  // 3) 영역 (공원/골프장/운동장/물/주차장/광장)
  const hall23 = ways.find(w => w.tags.building && /\(23\)/.test(w.tags.name || ''));
  const hall23c = hall23 ? centroid(ring(hall23.pts)) : null;
  const areaKind = t => {
    if (t.natural === 'water' || t.water) return 'water';
    if (t.leisure === 'pitch') return { tennis: 'tennis', basketball: 'court', soccer: 'dirt' }[t.sport] || 'pitch';
    if (['stadium', 'track'].includes(t.leisure)) return 'stadium';
    if (t.leisure === 'golf_course') return 'golf';
    if (['park', 'garden'].includes(t.leisure) || ['grass', 'recreation_ground'].includes(t.landuse)
      || ['scrub', 'wood', 'grassland'].includes(t.natural)) return 'park';
    if (t.amenity === 'parking') {
      if (t.parking === 'underground' || parseInt(t.layer, 10) < 0) return null;   // 지하주차장 (위는 광장·잔디)
      return t.surface === 'dirt' ? 'dirt' : 'parking';
    }
    if (t.highway === 'pedestrian' && t.area === 'yes') return 'plaza';
    return null;
  };
  const areaKeys = Object.keys(AREA_Z);
  const ab = new GeoBuilder(areaKeys.length, ['plaza', 'granite', 'park', 'golf', 'stadium'].map(k => areaKeys.indexOf(k)));
  const sp = new GeoBuilder(6);   // 운동시설 위 표시: 0 흰 선 1 테니스 코트 2 트랙 3 인조잔디 4 잔디 줄무늬 5 네트
  const treeZones = [], waterPolys = [], noTree = [];
  for (const w of ways) {
    const t = w.tags;
    if (t.building || t.indoor || w.pts.length < 4 || w.pts[0] !== w.pts[w.pts.length - 1]) continue;
    let k = areaKind(t);
    if (!k) continue;
    const poly = clipPoly(ring(w.pts));
    if (poly.length < 3) continue;
    // 23 강당 앞 광장은 밝은 화강석 (나머지 광장은 붉은 벽돌)
    if (k === 'plaza' && hall23c && Math.hypot(...sub(centroid(poly), hall23c)) < 130) k = 'granite';
    ab.poly(areaKeys.indexOf(k), poly, AREA_Z[k]);
    mini.areas.push([k === 'granite' ? 'plaza' : ['tennis', 'court', 'dirt', 'stadium'].includes(k) ? 'pitch' : k === 'golf' ? 'park' : k, poly]);
    if (k === 'park' || k === 'golf') treeZones.push(poly);
    if (k === 'water') waterPolys.push(poly);
    if (['tennis', 'court', 'dirt', 'pitch', 'stadium', 'parking'].includes(k)) noTree.push(poly);
    if (k === 'tennis') tennisCourt(poly);
    if (k === 'court') turfCourt(poly);
  }

  function tennisCourt(poly) {
    const B = orientedBox(poly);
    const a = Math.min(11.885, B.a - 0.5), b = Math.min(5.485, B.b - 0.5), z = AREA_Z.tennis + 0.006;
    sp.poly(1, rectPts(B, a, b), z);
    const L = (x0, y0, x1, y1) => sp.strip(0, boxPt(B, x0, y0), boxPt(B, x1, y1), 0.1, z + 0.004);
    const bs = b * 0.75;                                     // 단식 사이드라인
    for (const y of [-b, -bs, bs, b]) L(-a, y, a, y);
    for (const x of [-a, a]) L(x, -b, x, b);
    for (const x of [-6.4, 6.4]) L(x, -bs, x, bs);
    L(-6.4, 0, 6.4, 0);
    const n0 = boxPt(B, 0, -b - 0.5), n1 = boxPt(B, 0, b + 0.5);
    sp.box(5, (n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, z, 0.06, 2 * b + 1, 0.95, Math.atan2(B.v[1], B.v[0]) + Math.PI / 2);
  }
  function turfCourt(poly) {
    const B = orientedBox(poly), z = AREA_Z.court + 0.004;
    const a = B.a - 2, b = B.b - 2;
    const pts = rectPts(B, a, b);
    sp.polyline(0, pts, 0.1, z, true);
    sp.strip(0, boxPt(B, 0, -b), boxPt(B, 0, b), 0.1, z);
    sp.polyline(0, Array.from({ length: 24 }, (_, i) => boxPt(B, 3 * Math.cos(i / 24 * 2 * Math.PI), 3 * Math.sin(i / 24 * 2 * Math.PI))), 0.1, z, true);
    for (const s of [-1, 1]) sp.polyline(0, [boxPt(B, s * a, -3), boxPt(B, s * (a - 5), -3), boxPt(B, s * (a - 5), 3), boxPt(B, s * a, 3)], 0.1, z);
  }

  // 육상 트랙 + 축구장 (위성사진 빨간 우레탄 영역에서 맞춘 크기)
  {
    const c = osm.proj(TRACK.lat, TRACK.lon), u = [Math.cos(TRACK.angle), Math.sin(TRACK.angle)], v = [-u[1], u[0]];
    const { length: L, width: W, laneWidth: lw } = TRACK, z = 0.075;
    const outer = stadiumPts(c, u, L, W, 0), inner = stadiumPts(c, u, L, W, lw);
    sp.poly(2, outer, z, UP, [inner.slice().reverse()]);
    for (let k = 1; k < 8; k++) sp.polyline(0, stadiumPts(c, u, L, W, lw * k / 8 - 0.3), 0.07, z + 0.004, true);
    sp.polyline(0, inner, 0.1, z + 0.004, true);
    sp.poly(3, inner, z - 0.002);
    // 잔디 줄무늬 + 축구장 라인
    const fa = Math.min(52, (L - W) / 2 + W / 2 - lw - 6), fb = Math.min(34, W / 2 - lw - 3);
    const B = { c, u, v };
    for (let x = -fa, i = 0; x < fa; x += 2 * fa / 12, i++) if (i % 2) sp.poly(4, [boxPt(B, x, -fb), boxPt(B, x + 2 * fa / 12, -fb), boxPt(B, x + 2 * fa / 12, fb), boxPt(B, x, fb)], z + 0.001);
    const fz = z + 0.005;
    sp.polyline(0, rectPts(B, fa, fb), 0.12, fz, true);
    sp.strip(0, boxPt(B, 0, -fb), boxPt(B, 0, fb), 0.12, fz);
    sp.polyline(0, Array.from({ length: 32 }, (_, i) => boxPt(B, 9.15 * Math.cos(i / 32 * 2 * Math.PI), 9.15 * Math.sin(i / 32 * 2 * Math.PI))), 0.12, fz, true);
    for (const s of [-1, 1]) {
      sp.polyline(0, [boxPt(B, s * fa, -20.15), boxPt(B, s * (fa - 16.5), -20.15), boxPt(B, s * (fa - 16.5), 20.15), boxPt(B, s * fa, 20.15)], 0.12, fz);
      sp.polyline(0, [boxPt(B, s * fa, -9.15), boxPt(B, s * (fa - 5.5), -9.15), boxPt(B, s * (fa - 5.5), 9.15), boxPt(B, s * fa, 9.15)], 0.12, fz);
      const gp = boxPt(B, s * (fa + 1), 0);
      sp.box(5, gp[0], gp[1], fz, 2, 7.3, 2.4, Math.atan2(u[1], u[0]));            // 골대 (단순 상자)
    }
    noTree.push(outer);
  }
  // 골프장 벙커 (위성사진 흰 모래 영역)
  for (const bk of BUNKERS) {
    const p = bk.map(([la, lo]) => osm.proj(la, lo));
    if (p.every(q => inside(q))) sp.poly(6, p, 0.046);
  }
  group.add(ab.mesh(areaKeys.map(k => mat(k)), { name: 'areas' }));
  group.add(sp.mesh([mat('line_w'), mat('tennis_court'), mat('track'), mat('turf'), mat('turf2'), mat('door_frame'), mat('bunker')], { name: 'sports' }));

  // 4) 도로 + 보도 + 차선 + 횡단보도
  const roadOf = t => {
    if (!ROAD[t.highway] || t.area === 'yes' || t.indoor || ['yes', 'building_passage'].includes(t.tunnel) || parseInt(t.layer, 10) < 0) return null;
    if (t.level != null && t.level !== '0') return null;
    return ROAD[t.highway];
  };
  const roadKeys = ['road_main', 'road', 'path', 'sidewalk'];
  const rb = new GeoBuilder(4, [0, 1, 2, 3]), lb = new GeoBuilder(2); // 차선: 0 흰색, 1 노란색
  const roadSegs = [];                                   // [a, b, 폭] — 나무 배치 시 회피용
  const pathSegs = [];                                   // 보행로 — 가로등 배치용
  const sidewalkSegs = [];

  const dashed = (a, b, w, h, off, phase, dash = 3, gap = 4) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), period = dash + gap;
    const p = d => [a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L];
    for (let s = -(phase % period); s < L; s += period) {
      const s0 = Math.max(0, s), s1 = Math.min(L, s + dash);
      if (s1 > s0 + 0.2) lb.strip(0, p(s0), p(s1), w, h, off);
    }
  };

  for (const wy of ways) {
    const spec = roadOf(wy.tags);
    if (!spec) continue;
    const [w, h, mk] = spec, mi = roadKeys.indexOf(mk), oneway = wy.tags.oneway === 'yes';
    let phase = 0;
    for (let i = 1; i < wy.pts.length; i++) {
      const seg = clipSeg(wy.pts[i - 1], wy.pts[i]);
      if (!seg) continue;
      const [a, b] = seg, lz = h + LINE_Z;
      rb.strip(mi, a, b, w, h);
      rb.disc(mi, b, w / 2, h);
      if (mk !== 'path') roadSegs.push([a, b, w]);
      else pathSegs.push([a, b, w]);
      mini.roads.push([a, b, w, mk]);
      // 보도 (붉은 보도블록): 큰길 양옆
      if (mk === 'road_main' || (mk === 'road' && w >= 7)) {
        for (const side of [-1, 1]) rb.strip(3, a, b, 3.2, SIDEWALK_Z, side * (w / 2 + 1.6));
        rb.disc(3, b, w / 2 + 3.2, SIDEWALK_Z, 16);
        sidewalkSegs.push([a, b, w + 6.4]);
      }
      if (mk === 'road_main') {
        for (const side of [-1, 1]) lb.strip(0, a, b, 0.2, lz, side * (w / 2 - 0.6));        // 가장자리 실선
        if (oneway) for (const off of [-w / 6, w / 6]) dashed(a, b, 0.18, lz, off, phase);
        else for (const off of [-0.18, 0.18]) lb.strip(1, a, b, 0.15, lz, off);              // 노란 중앙선
      } else if (mk === 'road' && w >= 7) {
        if (oneway) dashed(a, b, 0.16, lz, 0, phase);
        else lb.strip(1, a, b, 0.15, lz, 0);
      }
      phase += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }

  // 횡단보도: crossing 노드가 걸린 차도 방향으로 줄무늬
  const nodeRoads = new Map();
  for (const wy of ways) {
    const spec = roadOf(wy.tags);
    if (!spec || spec[2] === 'path') continue;
    wy.refs.forEach((r, i) => { if (!nodeRoads.has(r)) nodeRoads.set(r, [wy.pts, i, spec]); });
  }
  for (const [nid, t] of nodeTags) {
    if (t.highway !== 'crossing' || !nodeRoads.has(nid)) continue;
    const [pts, i, [w, h]] = nodeRoads.get(nid), c = pts[i];
    if (!inside(c, 2)) continue;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const p0 = [c[0] - ux * 1.6, c[1] - uy * 1.6], p1 = [c[0] + ux * 1.6, c[1] + uy * 1.6];
    for (let k = -w / 2 + 0.8; k <= w / 2 - 0.8; k += 1) lb.strip(0, p0, p1, 0.5, h + LINE_Z, k);
  }
  group.add(rb.mesh(roadKeys.map(k => mat(k)), { name: 'roads' }));
  group.add(lb.mesh([mat('line_w'), mat('line_y')], { name: 'road_lines' }));

  // 5) 건물
  const bldStyle = t => {
    const k = t.building;
    if (['university', 'school', 'college'].includes(k)) return 'univ';
    if (['dormitory', 'apartments', 'residential'].includes(k)) return 'dorm';
    if (['commercial', 'industrial', 'office', 'retail'].includes(k)) return 'biz';
    return 'misc';
  };
  const bldHeight = t => {
    const h = parseFloat(t.height);
    if (!Number.isNaN(h)) return h - PARAPET_H;
    const lv = parseFloat(t['building:levels']);
    return (Number.isNaN(lv) ? DEFAULT_LEVELS : Math.max(1, lv)) * LEVEL_H;
  };

  // ── 문 위치: map/doors.js 직접 지정 → OSM entrance 태그 → 벽에 닿는 보행로 끝 → 길 쪽 벽 추정
  const lampHead = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.4 });
  const doorLights = [];                                     // 건물마다 복제한 문등 재질 (밤에 켜짐)
  const walkSegs = [...roadSegs, ...pathSegs];
  const pathEnds = [];
  for (const wy of ways) {
    const t = wy.tags;
    if (!['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'service'].includes(t.highway) || t.indoor || t.area === 'yes') continue;
    if (t.level != null && t.level !== '0') continue;
    if (['yes', 'building_passage'].includes(t.tunnel) || parseInt(t.layer, 10) < 0) continue;   // 지하주차장 통로·램프는 지상 출입구가 아니다
    if (wy.pts.length) pathEnds.push(wy.pts[0], wy.pts[wy.pts.length - 1]);
  }
  const allBldPolys = ways.filter(w => w.tags.building && w.pts.length >= 4).map(w => ring(w.pts));

  // 다각형에서 p와 가장 가까운 벽 지점 { i: 변 번호, t: 0~1, L, d, p, n: 바깥 법선, u: 변 방향 }
  const snapToWall = (poly, p) => {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-3) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L)));
      const q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { i, t, L, d, p: q, n: [dy / L, -dx / L], u: [dx / L, dy / L] };
    }
    return best;
  };
  // 벽 위치 s에 문을 낸다 (문이 변 밖으로 삐져나가지 않게 안쪽으로 당김)
  const makeDoor = (poly, s, kind, source, level = 0) => {
    const w = Math.min(DOOR_W[kind], Math.max(1.2, s.L - 0.6));
    const at = s.L < w + 0.4 ? s.L / 2 : Math.max(w / 2 + 0.2, Math.min(s.L - w / 2 - 0.2, s.t * s.L));
    const a = poly[s.i];
    return { p: [a[0] + s.u[0] * at, a[1] + s.u[1] * at], n: s.n, u: s.u, w, h: DOOR_H[kind], kind, source, level, s };
  };
  const farFrom = (doors, p, min) => doors.every(d => Math.hypot(d.p[0] - p[0], d.p[1] - p[1]) >= min);

  function doorsFor(wy, poly, area) {
    const t = wy.tags;
    const manual = DOOR_OVERRIDES[t.name] || DOOR_OVERRIDES[wy.id];
    if (manual) return manual.map(o => makeDoor(poly, snapToWall(poly, osm.proj(o.lat, o.lon)), o.kind === 'main' ? 'main' : 'yes', 'manual', o.level || 0));

    const doors = [];
    // 1) OSM entrance 태그가 붙은 외곽선 노드 (staircase는 건물 안 계단실이라 제외)
    for (const r of wy.refs) {
      const nt = nodeTags.get(r);
      if (!nt?.entrance || nt.entrance === 'staircase') continue;
      const p = nodes.get(r);
      if (farFrom(doors, p, 3)) doors.push(makeDoor(poly, snapToWall(poly, p), nt.entrance === 'main' ? 'main' : 'yes', 'osm', parseInt(nt.level, 10) || 0));
    }
    // 2) 건물 벽에 닿는 보행로 끝 — 길이 끝나는 곳이 보통 출입구
    for (const e of pathEnds) {
      const s = snapToWall(poly, e);
      if (s.d > 3 || (s.d > 0.3 && ptInPoly(e[0], e[1], poly))) continue;   // 건물 안을 지나는 길은 제외
      if (farFrom(doors, s.p, 12)) doors.push(makeDoor(poly, s, 'yes', 'path'));   // 여러 길이 한 문으로 모이는 경우 하나로
    }
    // 3) 추정: 문 밖 5m 지점이 길과 가장 가까운 벽 (다른 건물에 막힌 벽은 피함). 큰 건물은 반대편에 하나 더
    if (!doors.some(d => d.level === 0)) {
      const cands = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 2.2) continue;
        const s = { i, t: 0.5, L, d: 0, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: [(b[1] - a[1]) / L, -(b[0] - a[0]) / L], p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        const probe = [s.p[0] + s.n[0] * 5, s.p[1] + s.n[1] * 5];
        let score = Math.min(...walkSegs.map(([p, q, w]) => segDist(probe, p, q) - w / 2));
        if (allBldPolys.some(q => !poly.includes(q[0]) && ptInPoly(probe[0], probe[1], q))) score += 50;
        cands.push({ s, score: score - Math.min(L, 30) * 0.05 });       // 같으면 긴 벽 선호
      }
      cands.sort((x, y) => x.score - y.score);
      if (cands[0]) doors.push(makeDoor(poly, cands[0].s, 'main', 'guess'));
      const second = area > 1800 && cands.find(c => c.score < 40 && farFrom(doors, c.s.p, 30));
      if (second) doors.push(makeDoor(poly, second.s, 'yes', 'guess'));
    }
    // 1층 문 하나는 정문으로
    if (!doors.some(d => d.kind === 'main')) {
      const i = doors.findIndex(d => d.level === 0);
      if (i >= 0) doors[i] = makeDoor(poly, doors[i].s, 'main', doors[i].source, 0);
    }
    return doors;
  }

  // 고정 재질 슬롯 (외장 슬롯은 그 뒤에 건물마다 필요한 만큼)
  const S = { ROOF: 0, TRIM: 1, UNIT: 2, DFRAME: 3, DGLASS: 4, DLIGHT: 5, PLINTH: 6, WHITE: 7, SOLAR: 8, GLASS: 9 };
  const FIXED = 10;
  const buildings = [], bldPolys = [], doorStats = {}, signs = [], conifers = [];
  for (const wy of ways) {
    const t = wy.tags;
    if (!t.building || wy.pts.length < 4) continue;
    const poly = ccw(ring(wy.pts));
    const [cx, cy] = centroid(poly);
    if (!inside([cx, cy])) continue;
    bldPolys.push(poly);
    const area = area2(poly) / 2;
    const skyway = t.name === '공중보행로';
    const base = skyway ? 5 : 0, h = skyway ? 1 : bldHeight(t);   // 공중보행로: 띄워진 얇은 판
    const parapet = !skyway && area > 80;
    const top = base + h, style = bldStyle(t);
    const local = poly.map(([x, y]) => [x - cx, y - cy]);
    const spec = skyway ? { wall: 'curtain' } : specFor(t.name || '', style);
    const feats = new Set(spec.features || []);

    const bb = new GeoBuilder(FIXED);
    const styleSlots = [];
    const slotOf = key => { let i = styleSlots.indexOf(key); if (i < 0) { styleSlots.push(key); i = styleSlots.length - 1; } return FIXED + i; };

    // 층별 외장: bands(아래·위 몇 층) → 기본
    const levelsN = Math.max(1, Math.round(h / LEVEL_H));
    const styleAt = f => {
      for (const b of spec.bands || []) {
        const from = b.from < 0 ? levelsN + b.from : b.from, to = b.to == null ? levelsN : b.to < 0 ? levelsN + b.to : b.to;
        if (f >= from && f < to) return b.style;
      }
      return spec.wall;
    };
    // 변 종류: 곡면(짧은 변이 완만하게 이어짐) / 마구리(긴 변의 절반 이하) / 보통
    const n = local.length, Ls = local.map((p, i) => len(sub(local[(i + 1) % n], p)));
    const maxL = Math.max(...Ls);
    const dirOf = i => norm(sub(local[(i + 1) % n], local[i]));
    const turn = (i, j) => { const a = dirOf(i), b = dirOf(j); return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))); };
    const roleOf = i => {
      if (Ls[i] < 5 && turn((i - 1 + n) % n, i) < 0.5 && turn(i, (i + 1) % n) < 0.5) return 'curve';
      if (Ls[i] >= 3 && Ls[i] <= maxL * 0.5) return 'short';
      return 'long';
    };

    for (let i = 0; i < n; i++) {
      const a = local[i], b = local[(i + 1) % n], L = Ls[i];
      if (L < 1e-3) continue;
      const outN = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
      const role = roleOf(i);
      const over = role === 'curve' ? spec.curve : role === 'short' ? spec.short : null;
      // 같은 외장이 이어지는 층끼리 한 장으로
      let f0 = 0;
      for (let f = 1; f <= levelsN; f++) {
        const key = over || styleAt(f0);
        if (f < levelsN && (over || styleAt(f)) === key) continue;
        const z0 = base + f0 * LEVEL_H, z1 = f === levelsN ? top : base + f * LEVEL_H;
        const sb = styleBays(key), bays = Math.max(1, Math.round(L / BAY_W)) / sb;
        const v0 = f0, v1 = f0 + (z1 - z0) / LEVEL_H;
        bb.wall(slotOf(key), a, b, z0, z1, outN, [[0, v0], [bays, v0], [bays, v1], [0, v1]]);
        f0 = f;
      }
      if (parapet) bb.wall(S.TRIM, a, b, top, top + PARAPET_H, outN);
      // 기단: 짙은 화강석 띠 (대학 건물)
      if (!skyway && style === 'univ') bb.wall(S.PLINTH, add(a, outN, 0.04), add(b, outN, 0.04), 0, 0.45, outN);
    }
    if (skyway) bb.poly(S.TRIM, local, base, DOWN);
    const roofMat = new THREE.MeshStandardMaterial({ color: ROOF[wy.id] || COLORS[`roof_${style}`], roughness: 0.92 });
    let inner = local;
    if (parapet) {
      // 옥상 난간: 테두리를 안쪽으로 오프셋 → 난간 윗면 + 안쪽 벽
      inner = insetPoly(local, Math.min(0.6, 0.12 * Math.sqrt(area)));
      bb.poly(S.ROOF, inner, top);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        bb.quad(S.TRIM, v3(local[i], top + PARAPET_H), v3(local[j], top + PARAPET_H), v3(inner[j], top + PARAPET_H), v3(inner[i], top + PARAPET_H), UP);
        const a = inner[i], b = inner[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        bb.wall(S.TRIM, a, b, top, top + PARAPET_H, [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]);
      }
      // 처마 슬래브 (14 경영대 사진: 지붕판이 바깥으로 돌출)
      if (feats.has('cornice')) {
        const o = outsetPoly(local, 0.9), z = top + PARAPET_H;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          bb.quad(S.TRIM, v3(o[i], z), v3(o[j], z), v3(local[j], z), v3(local[i], z), UP);
          bb.quad(S.TRIM, v3(o[i], z - 0.35), v3(o[j], z - 0.35), v3(local[j], z - 0.35), v3(local[i], z - 0.35), DOWN);
          const L = len(sub(o[j], o[i])) || 1;
          bb.wall(S.TRIM, o[i], o[j], z - 0.35, z, [(o[j][1] - o[i][1]) / L, -(o[j][0] - o[i][0]) / L]);
        }
      }
    } else {
      bb.poly(S.ROOF, local, top);
    }

    // 옥상: 실외기 / 태양광(기숙사 위성사진) / 천창(06 도서관 위성사진의 가운데 사각형)
    const roofFree = [];
    const xs = inner.map(p => p[0]), ys = inner.map(p => p[1]);
    if (feats.has('solar')) {
      const B = orientedBox(inner);
      const north = B.v[1] >= 0 ? B.v : [-B.v[0], -B.v[1]];       // 패널은 남쪽을 보고 북쪽이 높다
      for (let y = -B.b + 2; y < B.b - 2; y += 2.6) for (let x = -B.a + 2; x < B.a - 2; x += 2.1) {
        const p = boxPt(B, x, y);
        if (!ptInPoly(p[0], p[1], inner) || polyEdgeDist(p, inner) < 1.4) continue;
        const lo = add(p, north, -0.8), hi = add(p, north, 0.8);
        const e = [B.u[0] * 0.95, B.u[1] * 0.95];
        bb.quad(S.SOLAR, v3(add(lo, e, -1), top + 0.35), v3(add(lo, e, 1), top + 0.35), v3(add(hi, e, 1), top + 0.85), v3(add(hi, e, -1), top + 0.85), UP);
      }
    } else if (parapet && area > 250) {
      for (let k = 0; k < Math.min(5, Math.floor(area / 400) + 1); k++) {
        for (let tr = 0; tr < 20; tr++) {
          const x = R(Math.min(...xs), Math.max(...xs)), y = R(Math.min(...ys), Math.max(...ys));
          if (ptInPoly(x, y, local) && polyEdgeDist([x, y], local) > 3) {
            bb.box(S.UNIT, x, y, top, R(1.6, 3.2), R(1.2, 2.2), R(0.9, 1.6), rand() < 0.5 ? 0 : Math.PI / 2);
            roofFree.push([x, y]);
            break;
          }
        }
      }
    }
    if (feats.has('skylight')) {
      const B = orientedBox(local), sa = B.a * 0.22, sb = B.b * 0.22;
      const pts = rectPts({ ...B, c: [0, 0] }, sa, sb).map(p => add(p, B.c));
      bb.poly(S.GLASS, pts, top + 1.4);
      for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; bb.wall(S.GLASS, a, b, top, top + 1.4, [b[1] - a[1], -(b[0] - a[0])]); }
      bb.polyline(S.TRIM, pts, 0.25, top + 1.42, true);
    }

    // 01 대학본부: 정면 가운데 유리 원통 드럼 + 원반 지붕, 정면 흰 원기둥 열주 (Commons·공식 사진)
    if (feats.has('drum') || feats.has('colonnade')) {
      const fr = spec.front || [0, 1];
      let fi = 0, fs = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = local[i], b = local[(i + 1) % n], nn = [(b[1] - a[1]) / Ls[i], -(b[0] - a[0]) / Ls[i]];
        const s = Ls[i] * (nn[0] * fr[0] + nn[1] * fr[1]);
        if (s > fs) { fs = s; fi = i; }
      }
      const a = local[fi], b = local[(fi + 1) % n], L = Ls[fi], u = norm(sub(b, a)), nn = [u[1], -u[0]];
      const mid = add(a, u, L / 2), r = Math.min(10, L * 0.12);
      if (feats.has('drum')) {
        const c = add(mid, nn, -r * 0.45), zt = top + LEVEL_H;
        bb.cyl(slotOf('curtain'), c, r, 0, zt, 28, { caps: false, uScale: BAY_W, vScale: LEVEL_H });
        bb.disc(S.ROOF, c, r, zt, 28);
        bb.cyl(S.WHITE, c, r + 2.2, zt + 0.3, zt + 0.8, 28);          // 원반 지붕
      }
      if (feats.has('colonnade')) {
        const zc = 2 * LEVEL_H;
        for (let d = 3; d < L - 2; d += 4.4) {
          if (feats.has('drum') && Math.abs(d - L / 2) < r + 2.5) continue;
          bb.cyl(S.WHITE, add(add(a, u, d), nn, 2.6), 0.42, 0, zc, 10);
        }
        // 열주 위 얇은 차양
        const p0 = add(a, u, 1), p1 = add(a, u, L - 1);
        const q = [p0, p1, add(p1, nn, 3.4), add(p0, nn, 3.4)];
        bb.poly(S.WHITE, q, zc + 0.4); bb.poly(S.WHITE, q, zc, DOWN);
        bb.wall(S.WHITE, q[1], q[2], zc, zc + 0.4, u); bb.wall(S.WHITE, q[2], q[3], zc, zc + 0.4, nn); bb.wall(S.WHITE, q[3], q[0], zc, zc + 0.4, [-u[0], -u[1]]);
      }
    }

    // 문: 문틀 + 유리문(+ 정문은 가운데 문살·차양) + 문등 + 1층이면 앞 디딤판
    const doors = skyway ? [] : doorsFor(wy, poly, area).filter(d => d.level * LEVEL_H + d.h + 0.5 < top);
    for (const d of doors) {
      const p = [d.p[0] - cx, d.p[1] - cy], rot = Math.atan2(d.u[1], d.u[0]), z0 = d.level * LEVEL_H;
      const at = k => [p[0] + d.n[0] * k, p[1] + d.n[1] * k];        // 벽에서 바깥으로 k(m)
      const main = d.kind === 'main';
      bb.box(S.DFRAME, ...at(0.06), z0, d.w + 0.3, 0.12, d.h + 0.15, rot);
      bb.box(S.DGLASS, ...at(0.08), z0, d.w, 0.14, d.h, rot);
      if (main) {
        bb.box(S.DFRAME, ...at(0.09), z0, 0.08, 0.17, d.h, rot);
        bb.box(S.TRIM, ...at(0.9), z0 + d.h + 0.35, d.w + 1.6, 1.8, 0.22, rot);
        bb.box(S.DLIGHT, ...at(0.3), z0 + d.h + 0.12, 0.7, 0.2, 0.12, rot);
      } else {
        bb.box(S.DLIGHT, ...at(0.1), z0 + d.h + 0.3, 0.45, 0.16, 0.16, rot);
      }
      if (z0 === 0) bb.box(S.UNIT, ...at(0.75), 0, d.w + 1.2, 1.5, 0.14, rot);
      doorStats[d.source] = (doorStats[d.source] || 0) + 1;
    }
    // 호관 표지판 (사진: 정문 옆 파란 낮은 판에 흰 번호) / 12 컨벤션센터 앞 원뿔형 나무 줄
    const mainDoor = doors.find(d => d.kind === 'main' && d.level === 0);
    if (mainDoor && spec.no && style === 'univ') signs.push({ no: spec.no, p: add(add(mainDoor.p, mainDoor.n, 3.2), mainDoor.u, mainDoor.w / 2 + 2.6), n: mainDoor.n });
    if (mainDoor && feats.has('conifers')) {
      // 정문 쪽을 향한 가장 긴 벽을 따라 (사진: 긴 정면 앞 잔디에 한 줄)
      let ei = -1, eL = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], L = len(sub(b, a)), nn = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
        if (L > eL && nn[0] * mainDoor.n[0] + nn[1] * mainDoor.n[1] > -0.2) { eL = L; ei = i; }
      }
      const a = poly[ei], u = norm(sub(poly[(ei + 1) % poly.length], a)), nn = [u[1], -u[0]];
      for (let d = 3; d < eL - 2; d += 5.5) {
        const p = add(add(a, u, d), nn, 6.5);
        if (Math.hypot(...sub(p, mainDoor.p)) > 6) conifers.push(p);
      }
    }

    const wallMats = styleSlots.map(key => {
      const { map, lit } = facadeTextures(key);
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.78 });
      m.userData.lit = lit;              // 밤 조명은 게임(daynight.js)에서 켠다
      return m;
    });
    const doorLight = lampHead.clone();
    doorLights.push(doorLight);
    const mats = [
      roofMat, mat('trim').clone(), mat('unit').clone(), mat('door_frame').clone(), mat('door_glass').clone(), doorLight,
      mat('plinth').clone(), mat('white').clone(), mat('solar').clone(), mat('glass_dark').clone(),
      ...wallMats,
    ];
    const m = bb.mesh(mats, { cast: true, name: `bld_${wy.id}` });
    m.position.set(cx, 0, -cy);
    m.userData = { osmId: wy.id, name: t.name || '', kind: t.building, levels: t['building:levels'] || '', style,
                   height: Math.round((top + (parapet ? PARAPET_H : 0)) * 10) / 10,
                   poly, skyway,   // poly: 2D 바닥 윤곽(월드 좌표) — 게임 충돌/출입 판정용
                   doors: doors.map(({ p, n, w, kind, level, source }) => ({ p, n, w, kind, level, source })) };
    group.add(m);
    buildings.push(m);
  }

  // 24 전망타워 "글로벌 아일랜드": 모래시계형 세로 골 금속 탑 (공식 사진·Commons UItower.jpg)
  const towerWay = ways.find(w => w.tags.man_made === 'tower' && /\(24\)/.test(w.tags.name || ''));
  if (towerWay) {
    const poly = ccw(ring(towerWay.pts)), c = centroid(poly);
    if (inside(c)) {
      const H = 34, prof = [[5.2, 0], [4.8, 5], [3.7, 12], [2.9, 18], [3.0, 22], [3.7, 27], [4.7, 32], [5.1, H]].map(([r, y]) => new THREE.Vector2(r, y));
      const geo = new THREE.LatheGeometry(prof, 28);
      const tm = new THREE.MeshStandardMaterial({ color: COLORS.tower, metalness: 0.45, roughness: 0.35, flatShading: true, side: THREE.DoubleSide });
      const tower = new THREE.Mesh(geo, tm);
      tower.position.set(c[0], 1.2, -c[1]);
      tower.castShadow = true;
      tower.userData = { osmId: towerWay.id, name: towerWay.tags.name, kind: 'tower', levels: '', style: 'misc', height: H + 1.2,
                         poly: Array.from({ length: 16 }, (_, i) => [c[0] + 5.4 * Math.cos(i / 16 * 2 * Math.PI), c[1] + 5.4 * Math.sin(i / 16 * 2 * Math.PI)]),
                         skyway: false, doors: [] };
      const ringTop = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.25, 6, 28).rotateX(Math.PI / 2).translate(0, H, 0), tm);
      tower.add(ringTop);
      group.add(tower);
      buildings.push(tower);
      bldPolys.push(tower.userData.poly);
      // 잔디 둔덕 (사진: 탑이 계단식 잔디 언덕 위에 있음)
      const mound = new GeoBuilder(1);
      mound.cyl(0, c, 9, 0, 0.6, 24); mound.cyl(0, c, 7, 0.6, 1.2, 24);
      group.add(mound.mesh([mat('park')], { name: 'tower_mound' }));
    }
  }

  const doorFronts = buildings.flatMap(m => m.userData.doors.filter(d => d.level === 0).map(d => [d.p[0] + d.n[0] * 2, d.p[1] + d.n[1] * 2]));
  const blocked = (x, y, clear = 1.5) =>
    bldPolys.some(p => ptInPoly(x, y, p) || polyEdgeDist([x, y], p) < clear) ||
    roadSegs.some(([a, b, w]) => segDist([x, y], a, b) < w / 2 + clear) ||
    doorFronts.some(([dx, dy]) => Math.hypot(x - dx, y - dy) < 4);   // 문 앞은 비워 둔다
  const onPath = (x, y, clear = 0.6) => pathSegs.some(([a, b, w]) => segDist([x, y], a, b) < w / 2 + clear);
  const inWater = (x, y) => waterPolys.some(p => ptInPoly(x, y, p));
  const inNoTree = (x, y) => noTree.some(p => ptInPoly(x, y, p) || polyEdgeDist([x, y], p) < 1.5);

  // 6) 나무
  //   소나무: 위성사진 상록수 위치 그대로 / 활엽수: 공원·가로수·보행 몰 / 원뿔형: 12 앞 줄
  const tg = new Map(), CELL = 6;
  const near = (x, y, r) => {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const q of tg.get(`${gx + i},${gy + j}`) || []) if (Math.hypot(q[0] - x, q[1] - y) < r) return true;
    return false;
  };
  const plant = (list, x, y, s) => {
    list.push([x, y, s]);
    const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    if (!tg.has(k)) tg.set(k, []);
    tg.get(k).push([x, y]);
  };
  const pines = [], broad = [], cones = [];
  const treeOK = (x, y, clear) => inside([x, y], 2) && !blocked(x, y, clear) && !onPath(x, y) && !inWater(x, y) && !inNoTree(x, y);
  for (const [la, lo] of PINES) {
    const [x, y] = osm.proj(la, lo);
    if (treeOK(x, y, 1.0) && !near(x, y, 2.6)) plant(pines, x, y, R(0.8, 1.25));
  }
  for (const [nid, t] of nodeTags) if (t.natural === 'tree' && inside(nodes.get(nid), 2)) plant(pines, ...nodes.get(nid), 1.1);
  for (const p of conifers) if (treeOK(p[0], p[1], 0.8)) plant(cones, p[0], p[1], R(0.95, 1.1));
  // 가로수: 큰길 보도 바깥쪽
  for (const wy of ways) {
    if (!['secondary', 'tertiary', 'residential'].includes(wy.tags.highway)) continue;
    const w = ROAD[wy.tags.highway][0];
    let acc = 0;
    for (let i = 1; i < wy.pts.length; i++) {
      const seg = clipSeg(wy.pts[i - 1], wy.pts[i]);
      if (!seg) continue;
      const [a, b] = seg, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      for (let d = (9 - acc % 9) % 9; d < L; d += 9) {
        const px = a[0] + ux * d, py = a[1] + uy * d;
        for (const side of [-1, 1]) {
          const x = px - uy * side * (w / 2 + 3.6), y = py + ux * side * (w / 2 + 3.6);
          if (inside([x, y], 3) && !bldPolys.some(p => ptInPoly(x, y, p) || polyEdgeDist([x, y], p) < 1.5) && !near(x, y, 3)) plant(broad, x, y, R(0.8, 0.95));
        }
      }
      acc += L;
    }
  }
  // 캠퍼스 보행로 양옆 가로수 (위성사진: 대각선 보행 몰을 따라 나무 열)
  for (const wy of ways) {
    const t = wy.tags;
    if (!['pedestrian', 'footway'].includes(t.highway) || t.area === 'yes' || t.indoor) continue;
    const w = ROAD[t.highway][0];
    for (let i = 1; i < wy.pts.length; i++) {
      const seg = clipSeg(wy.pts[i - 1], wy.pts[i]);
      if (!seg) continue;
      const [a, b] = seg, L = len(sub(b, a));
      if (L < (t.highway === 'pedestrian' ? 20 : 45)) continue;     // 긴 보행 축에만
      const u = norm(sub(b, a)), nn = [-u[1], u[0]];
      for (let d = 5; d < L - 4; d += 10) for (const side of [-1, 1]) {
        const p = add(add(a, u, d), nn, side * (w / 2 + 1.8));
        if (inCampus(p[0], p[1]) && treeOK(p[0], p[1], 2.5) && !near(p[0], p[1], 4)) plant(broad, p[0], p[1], R(0.75, 0.95));
      }
    }
  }
  // 공원: 남는 자리에 활엽수 (소나무 숲은 위에서 이미 채움)
  for (const poly of treeZones) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const nTrees = Math.min(90, Math.floor(Math.abs(area2(poly)) / 2 / 380));
    let placed = 0;
    for (let k = 0; k < nTrees * 4 && placed < nTrees; k++) {
      const x = R(Math.min(...xs), Math.max(...xs)), y = R(Math.min(...ys), Math.max(...ys));
      if (ptInPoly(x, y, poly) && treeOK(x, y, 1.0) && !near(x, y, 5)) { plant(broad, x, y, R(0.8, 1.3)); placed++; }
    }
  }
  group.add(treeMeshes({ pines, broad, cones }, rand));

  // 7) 버스정류장 쉘터
  const nearestRoadDir = p => {
    let best = null, bd = Infinity;
    for (const s of roadSegs) { const d = segDist(p, s[0], s[1]); if (d < bd) { bd = d; best = s; } }
    return best ? Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) : 0;
  };
  const sb = new GeoBuilder(4), seen = [];
  for (const [nid, t] of nodeTags) {
    if (t.highway !== 'bus_stop' && t.public_transport !== 'platform') continue;
    const p = nodes.get(nid);
    if (!inside(p, 3) || seen.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 8)) continue;
    seen.push(p);
    const rot = nearestRoadDir(p), bx = -Math.sin(rot) * 0.8, by = Math.cos(rot) * 0.8;
    sb.box(0, p[0], p[1], 2.4, 4, 1.8, 0.15, rot);                    // 지붕
    sb.box(1, p[0] + bx, p[1] + by, 0.1, 4, 0.08, 2.3, rot);          // 뒷유리
    for (const side of [-1.9, 1.9]) sb.box(2, p[0] + Math.cos(rot) * side + bx, p[1] + Math.sin(rot) * side + by, 0.1, 0.12, 0.12, 2.3, rot);
  }
  // 벤치 (OSM amenity=bench 선)
  let benches = 0;
  for (const wy of ways) {
    if (wy.tags.amenity !== 'bench') continue;
    for (let i = 1; i < wy.pts.length; i++) {
      const a = wy.pts[i - 1], b = wy.pts[i], L = len(sub(b, a));
      if (L < 0.5 || !inside(a, 2)) continue;
      const c = add(a, sub(b, a), 0.5), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      sb.box(3, c[0], c[1], 0.38, L, 0.5, 0.08, rot);
      sb.box(2, c[0], c[1], 0, Math.max(0.2, L - 0.4), 0.3, 0.38, rot);
      benches++;
    }
  }
  group.add(sb.mesh([mat('shelter'), mat('glass'), mat('unit'), mat('bench')], { cast: true, name: 'street_furniture' }));
  group.add(signMeshes(signs));

  // 8) 가로등: 차도 옆(번갈아) + 보행로 옆, 서로 너무 붙지 않게
  const lamps = [], lampGrid = new Map();
  const tooClose = (x, y) => {
    const gx = Math.floor(x / 10), gy = Math.floor(y / 10);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const q of lampGrid.get(`${gx + i},${gy + j}`) || []) if (Math.hypot(q[0] - x, q[1] - y) < 12) return true;
    return false;
  };
  const placeLamps = (segs, gap, offset, alternate) => {
    let side = 1;
    for (const [a, b, w] of segs) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 4) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      for (let d = gap / 2; d < L; d += gap) {
        if (alternate) side = -side;
        const off = w / 2 + offset;
        const x = a[0] + ux * d - uy * side * off, y = a[1] + uy * d + ux * side * off;
        if (!inside([x, y], 3) || tooClose(x, y) || blocked(x, y, 0.5)) continue;
        lamps.push([x, y]);
        const k = `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
        if (!lampGrid.has(k)) lampGrid.set(k, []);
        lampGrid.get(k).push([x, y]);
      }
    }
  };
  placeLamps(roadSegs, 30, 3.4, true);
  placeLamps(pathSegs, 24, 1.0, false);
  group.add(lampMeshes(lamps, lampHead));

  return {
    group, buildings, lamps, lampHead, doorLights,
    // 미니맵은 읽기 쉽게: 지붕은 종류별 색 유지, 텍스처 쓰는 바닥은 대표색
    mini: { ...mini, halfW, halfH, colors: { ...COLORS, plaza: '#c99a80', road_main: '#4a4d52', road: '#5a5d62',
      roof_univ: '#d9785a', roof_dorm: '#7a8fb8', roof_biz: '#8d99a8', roof_misc: '#b7a58f' } },
    stats: { buildings: buildings.length, pines: pines.length, broad: broad.length, cones: cones.length, busStops: seen.length, benches, lamps: lamps.length, doors: doorStats, signs: signs.length, coniferSpots: conifers.length },
  };
}

// 가로등: 사진처럼 가는 기둥 + 납작한 원반 등
function lampMeshes(lamps, headMat) {
  const g = new THREE.Group();
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 6.2, 6).translate(0, 3.1, 0),
    new THREE.MeshStandardMaterial({ color: '#5a606b', roughness: 0.5, metalness: 0.3 }), lamps.length);
  const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.5, 0.16, 12).translate(0, 6.25, 0), headMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach(([x, y], i) => { m.makeTranslation(x, 0, -y); pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
  pole.castShadow = true;
  g.add(pole, head);
  g.name = 'lamps';
  return g;
}

// 호관 표지판: 파란 판 + 흰 번호
function signMeshes(signs) {
  const g = new THREE.Group();
  g.name = 'signs';
  const side = new THREE.MeshStandardMaterial({ color: '#2b3990', roughness: 0.6 });
  const legs = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.5 });
  for (const s of signs) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#2b3990'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#fff'; c.textBaseline = 'middle';
    c.font = 'bold 76px Pretendard, "Apple SD Gothic Neo", sans-serif';
    const num = s.no.replace(/^0/, '');
    c.fillText(num, 22, 68);
    const w = c.measureText(num).width;
    c.font = 'bold 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
    c.fillText('호관', 30 + w, 78);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.14), [side, side, side, side, face, face]);
    board.position.set(s.p[0], 1.05, -s.p[1]);
    board.rotation.y = Math.atan2(s.n[0], -s.n[1]);
    board.castShadow = true;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), legs);
    leg.position.y = -0.8;
    board.add(leg);
    g.add(board);
  }
  return g;
}

// 나무: 종류별 줄기/잎 InstancedMesh (잎 색은 인스턴스마다 조금씩)
function treeMeshes({ pines, broad, cones }, rand) {
  const g = new THREE.Group();
  g.name = 'trees';
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
  const blob = (r, x, y, z, sx = 1, sy = 1, sz = 1, detail = 0) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z);

  // 소나무(적송): 붉은 갈색 줄기가 높이 올라가고, 위에 납작한 잎 덩어리 여러 개
  const pineTrunk = mergeGeometries([
    new THREE.CylinderGeometry(0.18, 0.3, 5.6, 5).translate(0, 2.8, 0),
    new THREE.CylinderGeometry(0.08, 0.12, 2.2, 4).rotateZ(0.9).translate(0.8, 4.6, 0),
  ]);
  const pineCrown = mergeGeometries([
    blob(1.7, 0, 6.4, 0, 1.25, 0.55, 1.1), blob(1.3, 1.3, 5.3, 0.4, 1.1, 0.5, 1.0), blob(1.2, -0.9, 5.6, -0.8, 1.1, 0.5, 1.0), blob(0.9, 0.2, 7.3, 0.3, 1.0, 0.55, 1.0),
  ]);
  // 활엽수(느티나무·벚나무 등): 짧은 줄기 + 둥근 수관
  const broadTrunk = new THREE.CylinderGeometry(0.2, 0.28, 2.6, 5).translate(0, 1.3, 0);
  const broadCrown = mergeGeometries([blob(2.3, 0, 4.2, 0, 1, 0.85, 1, 1), blob(1.5, 1.2, 3.6, 0.6, 1, 0.9, 1), blob(1.4, -1.0, 3.8, -0.7, 1, 0.9, 1)]);
  // 원뿔형(메타세쿼이아 류)
  const coneTrunk = new THREE.CylinderGeometry(0.15, 0.25, 1.6, 5).translate(0, 0.8, 0);
  const coneCrown = new THREE.ConeGeometry(1.6, 8.5, 7).translate(0, 5.6, 0);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const add = (list, trunkGeo, crownGeo, trunkColor, leafColors, tilt) => {
    if (!list.length) return;
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.9 }), list.length);
    const crown = new THREE.InstancedMesh(crownGeo, leafMat, list.length);
    const col = new THREE.Color();
    list.forEach(([x, y, k], i) => {
      e.set((rand() - 0.5) * tilt, rand() * Math.PI * 2, (rand() - 0.5) * tilt);
      q.setFromEuler(e);
      m.compose(p.set(x, 0, -y), q, s.set(k, k * (0.9 + rand() * 0.2), k));
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      col.set(leafColors[Math.floor(rand() * leafColors.length)]).offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.05);
      crown.setColorAt(i, col);
    });
    for (const im of [trunk, crown]) { im.castShadow = true; im.receiveShadow = true; }
    g.add(trunk, crown);
  };
  add(pines, pineTrunk, pineCrown, '#7c4b36', ['#3b5a2c', '#44652f', '#365328'], 0.16);
  add(broad, broadTrunk, broadCrown, '#6b5442', ['#6f9a45', '#7da84f', '#5f8c3c', '#86ad55'], 0.06);
  add(cones, coneTrunk, coneCrown, '#6b4a33', ['#5d8a45', '#668f4a'], 0.02);
  return g;
}
