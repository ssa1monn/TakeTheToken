// ───────────────────────────────────────────────
// OSM 데이터 → Three.js 캠퍼스 (로우폴리 디오라마)
// 2D 좌표 (x=동, y=북) → 3D (x, 높이, -y)
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { ring, area2, ccw, centroid, ptInPoly, segDist, polyEdgeDist, insetPoly, stitch, makeClipper, rng } from './osm.js';
import { DOOR_OVERRIDES } from './doors.js';

const LEVEL_H = 3.6;       // 층고 (m)
const BAY_W = 3.2;         // 창문 한 칸 폭 (m)
const DEFAULT_LEVELS = 2;
const PARAPET_H = 1.0;     // 옥상 난간 높이
const GROUND_DEPTH = 14;   // 디오라마 땅 두께
const LINE_Z = 0.05;       // 차선은 노면보다 살짝 위

// ── 팔레트 (Pocket City 풍 파스텔)
const COLORS = {
  ground: '#9fd18b', campus: '#b5dd9c', park: '#86c573', pitch: '#6fb35f',
  water: '#6cb6ea', parking: '#c3c7cd', plaza: '#d8cbb0', soil: '#a8794f',
  road_main: '#59606c', road: '#6b7280', path: '#e2d4b5',
  line_w: '#f4f4ee', line_y: '#f2c230',
  roof_univ: '#d9785a', roof_dorm: '#7a8fb8', roof_biz: '#8d99a8', roof_misc: '#b7a58f',
  trim: '#f7f3ea', unit: '#b9bec6',
  trunk: '#8a6a4a', leaf: '#5aa64e', leaf2: '#79bd5a',
  shelter: '#4a7bd0', glass: '#bfe0f0',
  door_frame: '#3b4250', door_glass: '#8fb8cf',
};
const DOOR_W = { main: 3.2, yes: 1.8 };   // 문 폭 (m) — main: 정문(양여닫이 + 차양), yes: 보조문
const DOOR_H = { main: 3.0, yes: 2.6 };
// 벽 텍스처: [벽색, 유리색, 창틀색]
const WALLS = {
  univ: ['#f4e7d1', '#86aac6', '#e2d2b8'],
  dorm: ['#f3d3b5', '#9dbbd2', '#e4bf9c'],
  biz:  ['#dfe5ec', '#7896b2', '#c9d1db'],
  misc: ['#ece6dc', '#93abc0', '#d6cebf'],
};

const ROAD = { // 종류: [폭, 높이, 재질]
  trunk: [16, 0.12, 'road_main'], primary: [16, 0.12, 'road_main'], secondary: [14, 0.12, 'road_main'],
  tertiary: [10, 0.11, 'road'], residential: [7, 0.10, 'road'], unclassified: [7, 0.10, 'road'],
  service: [5, 0.09, 'road'], living_street: [5, 0.09, 'road'],
  pedestrian: [4, 0.085, 'path'], footway: [2.4, 0.08, 'path'], path: [2, 0.08, 'path'],
  cycleway: [2.4, 0.08, 'path'], steps: [2.4, 0.08, 'path'],
};
const AREA_Z = { park: 0.04, pitch: 0.06, parking: 0.05, plaza: 0.07, water: 0.03 };

// ── 재질
const MATS = {};
function mat(key) {
  return MATS[key] ||= new THREE.MeshStandardMaterial({ color: COLORS[key], roughness: key === 'water' || key === 'glass' ? 0.25 : 0.85 });
}

const WALL_TEX = {};
function windowTexture(style) {
  if (WALL_TEX[style]) return WALL_TEX[style];
  const [wall, glass, frame] = WALLS[style];
  const S = 32, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  // 캔버스는 위가 v=1 → y를 뒤집어서 그림 (u, v는 0~1)
  const rect = (u0, v0, u1, v1, c) => { g.fillStyle = c; g.fillRect(u0 * S, (1 - v1) * S, (u1 - u0) * S, (v1 - v0) * S); };
  rect(0, 0, 1, 1, wall);
  rect(0.16, 0.26, 0.84, 0.32, frame);              // 창턱
  rect(0.2, 0.34, 0.8, 0.86, glass);                // 유리
  rect(0.2, 0.7, 0.8, 0.86, 'rgba(255,255,255,.14)'); // 위쪽 반사
  rect(0.475, 0.34, 0.525, 0.86, frame);            // 가운데 창살
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return (WALL_TEX[style] = tex);
}

// 밤에 켜지는 창문 (emissiveMap): 4×4칸 타일에 불 켜진 창을 무작위로 → repeat 1/4로 붙여 반복이 덜 보이게
const LIT_TEX = {};
const LIT_TILE = 4;
function windowLitTexture(style) {
  if (LIT_TEX[style]) return LIT_TEX[style];
  const rand = rng(Object.keys(WALLS).indexOf(style) + 101);
  const C = 16, S = C * LIT_TILE, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let by = 0; by < LIT_TILE; by++) for (let bx = 0; bx < LIT_TILE; bx++) {
    if (rand() > 0.42) continue;
    g.fillStyle = rand() < 0.75 ? '#ffd58a' : '#dfe8ff';       // 대부분 노란 불, 가끔 형광등
    const x0 = (bx + 0.2) * C, y0 = (by + 1 - 0.86) * C;        // 유리 영역 (u 0.2~0.8, v 0.34~0.86)
    g.fillRect(x0, y0, 0.6 * C, 0.52 * C);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / LIT_TILE, 1 / LIT_TILE);
  return (LIT_TEX[style] = tex);
}

// ── 지오메트리 빌더: 재질 슬롯별로 삼각형을 모아 groups가 있는 BufferGeometry 하나로
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const v3 = (p, h) => [p[0], h, -p[1]];          // 2D → 3D
const out3 = n2 => [n2[0], 0, -n2[1]];          // 2D 법선 → 3D

class GeoBuilder {
  constructor(slots = 1) { this.parts = Array.from({ length: slots }, () => ({ p: [], n: [], u: [] })); }

  tri(mi, a, b, c, want, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n);
    if (len < 1e-9) return;
    n = n.map(v => v / len);
    if (want && n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n = n.map(v => -v); }
    const P = this.parts[mi];
    P.p.push(...a, ...b, ...c); P.n.push(...n, ...n, ...n); P.u.push(...ua, ...ub, ...uc);
  }

  quad(mi, a, b, c, d, want, uv) {
    const [ua, ub, uc, ud] = uv || [];
    this.tri(mi, a, b, c, want, ua, ub, uc);
    this.tri(mi, a, c, d, want, ua, uc, ud);
  }

  /** 수평 다각형 (오목 다각형도 earcut으로 삼각분할) */
  poly(mi, pts, h, want = UP) {
    if (pts.length < 3) return;
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const [i, j, k] of tris) this.tri(mi, v3(pts[i], h), v3(pts[j], h), v3(pts[k], h), want);
  }

  /** a→b 방향 띠 (off: 진행 방향 왼쪽으로 평행이동) */
  strip(mi, a, b, w, h, off = 0) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-3) return;
    const nx = -dy / L, ny = dx / L, lo = off - w / 2, hi = off + w / 2;
    this.quad(mi, v3([a[0] + nx * hi, a[1] + ny * hi], h), v3([a[0] + nx * lo, a[1] + ny * lo], h),
      v3([b[0] + nx * lo, b[1] + ny * lo], h), v3([b[0] + nx * hi, b[1] + ny * hi], h), UP);
  }

  disc(mi, c, r, h, seg = 8) {
    const pts = Array.from({ length: seg }, (_, i) => [c[0] + r * Math.cos(2 * Math.PI * i / seg), c[1] + r * Math.sin(2 * Math.PI * i / seg)]);
    for (let i = 1; i < seg - 1; i++) this.tri(mi, v3(pts[0], h), v3(pts[i], h), v3(pts[i + 1], h), UP);
  }

  /** 수직 벽 (a→b 밑변, 바깥쪽이 want2d) */
  wall(mi, a, b, h0, h1, want2d, uv) {
    this.quad(mi, v3(a, h0), v3(b, h0), v3(b, h1), v3(a, h1), out3(want2d), uv);
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

// ───────────────────────────────────────────────
export function buildCampus(osm, seed = 7) {
  const rand = rng(seed);
  const R = (a, b) => a + (b - a) * rand();
  const { halfW, halfH, nodes, nodeTags, ways, wayById, relations } = osm;
  const { inside, clipSeg, clipPoly } = makeClipper(halfW, halfH);
  const group = new THREE.Group();

  // 1) 바닥 (두께 있는 디오라마 판)
  const ground = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, GROUND_DEPTH, halfH * 2),
    [mat('soil'), mat('soil'), mat('ground'), mat('soil'), mat('soil'), mat('soil')]);
  ground.position.y = -GROUND_DEPTH / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // 2) 캠퍼스 부지
  const gb = new GeoBuilder(1);
  const mini = { campus: [], areas: [], roads: [] };      // 미니맵용 2D 데이터
  for (const rel of relations) {
    if (rel.tags.amenity !== 'university') continue;
    const outs = rel.members.filter(m => m.role === 'outer' && wayById.has(m.ref)).map(m => wayById.get(m.ref).pts);
    for (const r of stitch(outs)) { const p = clipPoly(r); gb.poly(0, p, 0.02); mini.campus.push(p); }
  }
  group.add(gb.mesh([mat('campus')], { name: 'campus' }));

  // 3) 영역 (공원/운동장/물/주차장/광장)
  const areaKind = t => {
    if (t.natural === 'water' || t.water) return 'water';
    if (['pitch', 'stadium', 'track'].includes(t.leisure)) return 'pitch';
    if (['park', 'garden', 'golf_course'].includes(t.leisure) || ['grass', 'recreation_ground'].includes(t.landuse)
      || ['scrub', 'wood', 'grassland'].includes(t.natural)) return 'park';
    if (t.amenity === 'parking') return 'parking';
    if (t.highway === 'pedestrian' && t.area === 'yes') return 'plaza';
    return null;
  };
  const areaKeys = Object.keys(AREA_Z);
  const ab = new GeoBuilder(areaKeys.length);
  const treeZones = [];
  for (const w of ways) {
    const t = w.tags;
    if (t.building || t.indoor || w.pts.length < 4 || w.pts[0] !== w.pts[w.pts.length - 1]) continue;
    const k = areaKind(t);
    if (!k) continue;
    const poly = clipPoly(ring(w.pts));
    ab.poly(areaKeys.indexOf(k), poly, AREA_Z[k]);
    if (poly.length >= 3) mini.areas.push([k, poly]);
    if (k === 'park' && poly.length >= 3) treeZones.push(poly);
  }
  group.add(ab.mesh(areaKeys.map(mat), { name: 'areas' }));

  // 4) 도로 + 차선 + 횡단보도
  const roadOf = t => {
    if (!ROAD[t.highway] || t.area === 'yes' || t.indoor || ['yes', 'building_passage'].includes(t.tunnel)) return null;
    if (t.level != null && t.level !== '0') return null;
    return ROAD[t.highway];
  };
  const roadKeys = ['road_main', 'road', 'path'];
  const rb = new GeoBuilder(3), lb = new GeoBuilder(2); // 차선: 0 흰색, 1 노란색
  const roadSegs = [];                                   // [a, b, 폭] — 나무 배치 시 회피용
  const pathSegs = [];                                   // 보행로 — 가로등 배치용

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
  group.add(rb.mesh(roadKeys.map(mat), { name: 'roads' }));
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

  const buildings = [], bldPolys = [], doorStats = {};
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

    const bb = new GeoBuilder(7); // 0 벽 1 지붕 2 장식 3 실외기·디딤판 4 문틀 5 문유리 6 문등
    // 벽: 가로 = 창문 칸(정수 개로 맞춤), 세로 = 층
    for (let i = 0; i < local.length; i++) {
      const a = local[i], b = local[(i + 1) % local.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const bays = Math.max(1, Math.round(L / BAY_W)), v1 = h / LEVEL_H;
      const outN = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
      bb.wall(0, a, b, base, top, outN, [[0, 0], [bays, 0], [bays, v1], [0, v1]]);
      if (parapet) bb.wall(2, a, b, top, top + PARAPET_H, outN);
    }
    if (skyway) bb.poly(2, local, base, DOWN);
    if (parapet) {
      // 옥상 난간: 테두리를 안쪽으로 오프셋 → 난간 윗면 + 안쪽 벽
      const inner = insetPoly(local, Math.min(0.6, 0.12 * Math.sqrt(area)));
      bb.poly(1, inner, top);
      for (let i = 0; i < local.length; i++) {
        const j = (i + 1) % local.length;
        bb.quad(2, v3(local[i], top + PARAPET_H), v3(local[j], top + PARAPET_H), v3(inner[j], top + PARAPET_H), v3(inner[i], top + PARAPET_H), UP);
        const a = inner[i], b = inner[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        bb.wall(2, a, b, top, top + PARAPET_H, [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]);
      }
      // 옥상 실외기
      if (area > 250) {
        const xs = local.map(p => p[0]), ys = local.map(p => p[1]);
        for (let n = 0; n < Math.min(5, Math.floor(area / 400) + 1); n++) {
          for (let tr = 0; tr < 20; tr++) {
            const x = R(Math.min(...xs), Math.max(...xs)), y = R(Math.min(...ys), Math.max(...ys));
            if (ptInPoly(x, y, local) && polyEdgeDist([x, y], local) > 3) {
              bb.box(3, x, y, top, R(1.6, 3.2), R(1.2, 2.2), R(0.9, 1.6), rand() < 0.5 ? 0 : Math.PI / 2);
              break;
            }
          }
        }
      }
    } else {
      bb.poly(1, local, top);
    }

    // 문: 문틀 + 유리문(+ 정문은 가운데 문살·차양) + 문등 + 1층이면 앞 디딤판
    const doors = skyway ? [] : doorsFor(wy, poly, area).filter(d => d.level * LEVEL_H + d.h + 0.5 < top);
    for (const d of doors) {
      const p = [d.p[0] - cx, d.p[1] - cy], rot = Math.atan2(d.u[1], d.u[0]), z0 = d.level * LEVEL_H;
      const at = k => [p[0] + d.n[0] * k, p[1] + d.n[1] * k];        // 벽에서 바깥으로 k(m)
      const main = d.kind === 'main';
      bb.box(4, ...at(0.06), z0, d.w + 0.3, 0.12, d.h + 0.15, rot);
      bb.box(5, ...at(0.08), z0, d.w, 0.14, d.h, rot);
      if (main) {
        bb.box(4, ...at(0.09), z0, 0.08, 0.17, d.h, rot);
        bb.box(2, ...at(0.9), z0 + d.h + 0.35, d.w + 1.6, 1.8, 0.22, rot);
        bb.box(6, ...at(0.3), z0 + d.h + 0.12, 0.7, 0.2, 0.12, rot);
      } else {
        bb.box(6, ...at(0.1), z0 + d.h + 0.3, 0.45, 0.16, 0.16, rot);
      }
      if (z0 === 0) bb.box(3, ...at(0.75), 0, d.w + 1.2, 1.5, 0.14, rot);
      doorStats[d.source] = (doorStats[d.source] || 0) + 1;
    }

    const wallMat = new THREE.MeshStandardMaterial({ map: windowTexture(style), roughness: 0.8 });
    wallMat.userData.lit = windowLitTexture(style);   // 밤 조명은 게임(world.js)에서 켠다
    const doorLight = lampHead.clone();
    doorLights.push(doorLight);
    const mats = [
      wallMat,
      mat(`roof_${style}`).clone(), mat('trim').clone(), mat('unit').clone(),
      mat('door_frame').clone(), mat('door_glass').clone(), doorLight,
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

  const doorFronts = buildings.flatMap(m => m.userData.doors.filter(d => d.level === 0).map(d => [d.p[0] + d.n[0] * 2, d.p[1] + d.n[1] * 2]));
  const blocked = (x, y, clear = 1.5) =>
    bldPolys.some(p => ptInPoly(x, y, p) || polyEdgeDist([x, y], p) < clear) ||
    roadSegs.some(([a, b, w]) => segDist([x, y], a, b) < w / 2 + clear) ||
    doorFronts.some(([dx, dy]) => Math.hypot(x - dx, y - dy) < 4);   // 문 앞은 비워 둔다

  // 6) 나무: 공원 + 가로수 + OSM 개별 나무
  const trees = [];
  for (const poly of treeZones) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const n = Math.min(120, Math.floor(Math.abs(area2(poly)) / 2 / 260));
    let placed = 0;
    for (let k = 0; k < n * 4 && placed < n; k++) {
      const x = R(Math.min(...xs), Math.max(...xs)), y = R(Math.min(...ys), Math.max(...ys));
      if (ptInPoly(x, y, poly) && !blocked(x, y, 1.0)) { trees.push([x, y, R(0.8, 1.3)]); placed++; }
    }
  }
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
      for (let d = (12 - acc % 12) % 12; d < L; d += 12) {
        const px = a[0] + ux * d, py = a[1] + uy * d;
        for (const side of [-1, 1]) {
          const x = px - uy * side * (w / 2 + 2.2), y = py + ux * side * (w / 2 + 2.2);
          if (inside([x, y], 3) && !blocked(x, y, 1.2)) trees.push([x, y, 0.75]);
        }
      }
      acc += L;
    }
  }
  for (const [nid, t] of nodeTags) if (t.natural === 'tree' && inside(nodes.get(nid), 2)) trees.push([...nodes.get(nid), 1.1]);
  group.add(treeMeshes(trees, rand));

  // 7) 버스정류장 쉘터
  const nearestRoadDir = p => {
    let best = null, bd = Infinity;
    for (const s of roadSegs) { const d = segDist(p, s[0], s[1]); if (d < bd) { bd = d; best = s; } }
    return best ? Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) : 0;
  };
  const sb = new GeoBuilder(3), seen = [];
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
  group.add(sb.mesh([mat('shelter'), mat('glass'), mat('unit')], { cast: true, name: 'bus_stops' }));

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
  placeLamps(roadSegs, 30, 1.2, true);
  placeLamps(pathSegs, 24, 1.0, false);
  group.add(lampMeshes(lamps, lampHead));

  return {
    group, buildings, lamps, lampHead, doorLights,
    mini: { ...mini, halfW, halfH, colors: COLORS },
    stats: { buildings: buildings.length, trees: trees.length, busStops: seen.length, lamps: lamps.length, doors: doorStats },
  };
}

function lampMeshes(lamps, headMat) {
  const g = new THREE.Group();
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6).translate(0, 2.5, 0),
    new THREE.MeshStandardMaterial({ color: '#4b5361', roughness: 0.6 }), lamps.length);
  const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0).translate(0, 5.2, 0), headMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach(([x, y], i) => { m.makeTranslation(x, 0, -y); pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
  pole.castShadow = true;
  g.add(pole, head);
  g.name = 'lamps';
  return g;
}

// 나무: 줄기/잎 InstancedMesh (잎은 두 가지 초록을 인스턴스 색으로)
function treeMeshes(trees, rand) {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.6, 5).translate(0, 0.8, 0);
  const leafGeo = new THREE.IcosahedronGeometry(2, 0).translate(0, 3, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, mat('trunk'), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c1 = new THREE.Color(COLORS.leaf), c2 = new THREE.Color(COLORS.leaf2);
  trees.forEach(([x, y, k], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(p.set(x, 0, -y), q, s.set(k, k, k));
    trunk.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, rand() < 0.5 ? c1 : c2);
  });
  for (const im of [trunk, leaves]) { im.castShadow = true; im.receiveShadow = true; }
  g.add(trunk, leaves);
  g.name = 'trees';
  return g;
}
