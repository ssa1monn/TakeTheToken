// ───────────────────────────────────────────────
// 다시 사는 대학생활 — 3D 캠퍼스 월드
// 캐릭터 이동 · 충돌 · 건물 출입 · 카메라. 게임 규칙은 game.js(window.Game)에 있다.
// 좌표: 2D 지도(x=동, y=북) ↔ 3D (x, 높이, -y)
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { parseOSM, ptInPoly, polyEdgeDist, centroid } from './map/osm.js';
import { buildCampus } from './map/builder.js';
import { createDayNight } from './daynight.js';
import { createMinimap } from './minimap.js';
import { createNPCs } from './npcs.js';

const PLAYER_R = 1.2;        // 충돌 반지름 (m)
const PLAYER_SCALE = 2.2;    // 캐릭터 크기 (실제보다 크게 — 쿼터뷰에서 잘 보이게)
const WALK = 14, RUN = 26;   // 이동 속도 (m/s) — 캠퍼스가 1km라 실제보다 빠르게
const ENTER_DIST = 4;        // 문 앞 이 거리 안이면 출입 가능
const LABEL_DIST = 150;      // 플레이어 주변 이 거리 안의 건물만 이름표
const CAM_YAW = Math.PI / 4, CAM_PITCH = 1.05;   // 시작 카메라 방향 (드래그로 바뀜)
const PITCH_MIN = 0.45, PITCH_MAX = 1.4;          // 기울기 한계: 너무 눕거나 정수리만 보이지 않게
const NAV_CELL = 3;           // 길찾기 격자 크기 (m)
const ZOOM_MIN = 45, ZOOM_MAX = 320;

const view = document.getElementById('view');
const prompt = document.getElementById('prompt');

// ── 렌더러 / 장면
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'labels';
view.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe8f7');
scene.fog = new THREE.Fog('#cfe8f7', 500, 1300);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 2, 3000);

const hemi = new THREE.HemisphereLight('#ffffff', '#8fb87a', 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
const SUN_DIST = 250;                                   // 해 방향은 daynight.js가 정한다
sun.userData.dir = new THREE.Vector3(-120, 200, 100).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ── 상태
let campus = null, bounds = null, osm = null;
const colliders = [];          // { mesh, name, poly, box: [minx, miny, maxx, maxy] }
const labels = [];             // { obj, el, c, mesh }
const markers = [];            // { obj, el, c, name }
const player = { p: [0, 0], face: 0, moving: false, running: false, bob: 0 };
const keys = new Set();
let moveTarget = null;         // { path: [[x, y], ...], enter: collider | null, lastD, stuckT }
let nav = null;                // 걷기 가능한 격자 (길찾기용)
let near = null;               // 지금 출입 가능한 건물
let started = false;
let zoom = 140, yaw = CAM_YAW, pitch = CAM_PITCH, introSpin = true;
let dayNight = null, minimap = null;
let npcs = null, nearNpc = null;   // 돌아다니는 NPC (npcs.js) · 지금 말 걸 수 있는 NPC

// ── 캐릭터 (로우폴리 · 머리 큰 비율)
const avatar = makeAvatar();
scene.add(avatar.root);

function makeAvatar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  const legL = add(new THREE.BoxGeometry(0.22, 0.5, 0.26), m('#3d4a6b'), -0.14, 0.25, 0);
  const legR = add(new THREE.BoxGeometry(0.22, 0.5, 0.26), m('#3d4a6b'), 0.14, 0.25, 0);
  add(new THREE.BoxGeometry(0.62, 0.6, 0.38), m('#e0679a'), 0, 0.8, 0);            // 후드티
  add(new THREE.BoxGeometry(0.46, 0.5, 0.2), m('#f2c230'), 0, 0.85, -0.28);         // 백팩
  const head = add(new THREE.IcosahedronGeometry(0.42, 1), m('#f6d7b8'), 0, 1.45, 0);
  add(new THREE.IcosahedronGeometry(0.44, 1), m('#3b2a22'), 0, 1.56, -0.06).scale.set(1, 0.75, 1); // 머리카락
  add(new THREE.BoxGeometry(0.07, 0.07, 0.02), m('#222'), -0.14, 1.47, 0.4);        // 눈
  add(new THREE.BoxGeometry(0.07, 0.07, 0.02), m('#222'), 0.14, 1.47, 0.4);
  body.scale.setScalar(PLAYER_SCALE);
  root.add(body);
  // 발밑 표시
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.15;
  root.add(ringMesh);
  return { root, body, legL, legR, head };
}

// 클릭 목적지 표시
const goalMark = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.3, 20), new THREE.MeshBasicMaterial({ color: '#d9534f', transparent: true, opacity: 0.85 }));
goalMark.rotation.x = -Math.PI / 2; goalMark.visible = false;
scene.add(goalMark);

// ── 맵 생성
fetch('assets/map/campus.osm')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then(text => {
    osm = parseOSM(text);
    bounds = [osm.halfW - 4, osm.halfH - 4];
    campus = buildCampus(osm);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    campus.group.traverse(o => { for (const mt of [o.material].flat()) if (mt?.map) mt.map.anisotropy = maxAniso; });
    scene.add(campus.group);
    for (const mesh of campus.buildings) {
      const { poly, skyway, name } = mesh.userData;
      if (!poly || skyway) continue;
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const c = { mesh, name, poly, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], center: centroid(poly),
                  doors: mesh.userData.doors.filter(d => d.level === 0) };   // 땅에서 들어갈 수 있는 문만
      colliders.push(c);
      if (name) addLabel(c);
      if (name && window.Game.placeStatus(name).key) addMarker(c);
    }
    nav = buildNav();
    player.p = spawnPoint();
    npcs = createNPCs({ scene, nav, findPath, colliders, blocked: (x, y) => blocked(x, y), player: () => player.p });
    dayNight = createDayNight({ scene, sun, hemi, campus, follow: avatar.root });
    minimap = createMinimap(document.querySelector('#minimap canvas'), campus.mini,
      campus.buildings.filter(m => m.userData.poly).map(m => ({ poly: m.userData.poly, style: m.userData.style, doors: m.userData.doors })));
    console.info('[campus]', campus.stats);
    document.getElementById('loading')?.remove();
  })
  .catch(err => { const l = document.getElementById('loading'); if (l) l.textContent = '캠퍼스를 만들지 못했다: ' + err.message; console.error(err); });

// 제1기숙사 바깥, 캠퍼스 바깥과 이어진 지점 중 도서관 쪽에서 시작
function spawnPoint() {
  const dorm = colliders.find(c => c.name.includes('제1기숙사'));
  const lib = colliders.find(c => c.name.includes('학산도서관'));
  let best = null, bs = Infinity;
  for (let i = 0; i < nav.cols * nav.rows; i++) {
    if (!nav.outdoor[i]) continue;
    const p = nav.pos(i);
    const dd = dorm ? polyEdgeDist(p, dorm.poly) : 0;
    if (dorm && (dd < 4 || dd > 12)) continue;
    const s = lib ? Math.hypot(p[0] - lib.center[0], p[1] - lib.center[1]) : Math.hypot(p[0], p[1]);
    if (s < bs) { bs = s; best = p; }
  }
  return best || [0, 0];
}

// ── 길찾기 격자: 걸을 수 있는 칸 + 지도 가장자리와 이어진 "바깥" 영역
function buildNav() {
  const cols = Math.floor(bounds[0] * 2 / NAV_CELL), rows = Math.floor(bounds[1] * 2 / NAV_CELL);
  const pos = i => [-bounds[0] + (i % cols + 0.5) * NAV_CELL, -bounds[1] + (Math.floor(i / cols) + 0.5) * NAV_CELL];
  const cellOf = p => {
    const c = Math.floor((p[0] + bounds[0]) / NAV_CELL), r = Math.floor((p[1] + bounds[1]) / NAV_CELL);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  const walk = new Uint8Array(cols * rows);
  for (let i = 0; i < walk.length; i++) { const [x, y] = pos(i); walk[i] = blocked(x, y, PLAYER_R + 0.4) ? 0 : 1; }
  // 가장자리에서 flood fill → 건물 안뜰처럼 갇힌 곳 제외
  const outdoor = new Uint8Array(cols * rows), q = [];
  for (let c = 0; c < cols; c++) for (const r of [0, rows - 1]) { const i = r * cols + c; if (walk[i] && !outdoor[i]) { outdoor[i] = 1; q.push(i); } }
  for (let r = 0; r < rows; r++) for (const c of [0, cols - 1]) { const i = r * cols + c; if (walk[i] && !outdoor[i]) { outdoor[i] = 1; q.push(i); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % cols, r = (i - c) / cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (walk[j] && !outdoor[j]) { outdoor[j] = 1; q.push(j); }
    }
  }
  return { cols, rows, walk, outdoor, pos, cellOf };
}

// A* (8방향) → 직선으로 보이는 구간은 건너뛰어 경로 다듬기
function findPath(from, to) {
  const { cols, rows, walk, pos, cellOf } = nav;
  const nearestWalk = p => {
    let i = cellOf(p);
    if (i >= 0 && walk[i]) return i;
    let best = -1, bd = Infinity;
    const c0 = Math.floor((p[0] + bounds[0]) / NAV_CELL), r0 = Math.floor((p[1] + bounds[1]) / NAV_CELL);
    for (let r = r0 - 4; r <= r0 + 4; r++) for (let c = c0 - 4; c <= c0 + 4; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows || !walk[r * cols + c]) continue;
      const q = pos(r * cols + c), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) { bd = d; best = r * cols + c; }
    }
    return best;
  };
  const s = nearestWalk(from), g = nearestWalk(to);
  if (s < 0 || g < 0) return null;
  const gc = g % cols, gr = (g - gc) / cols;
  const H = i => { const c = i % cols, r = (i - c) / cols, dx = Math.abs(c - gc), dy = Math.abs(r - gr); return dx + dy - 0.586 * Math.min(dx, dy); };
  const gs = new Float32Array(cols * rows).fill(Infinity), came = new Int32Array(cols * rows).fill(-1), closed = new Uint8Array(cols * rows);
  const heap = [[H(s), s]];
  gs[s] = 0;
  const push = it => { heap.push(it); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let found = false;
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    if (i === g) { found = true; break; }
    closed[i] = 1;
    const c = i % cols, r = (i - c) / cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (!walk[j] || closed[j]) continue;
      if (dr && dc && (!walk[r * cols + cc] || !walk[rr * cols + c])) continue; // 모서리 끼기 방지
      const ng = gs[i] + (dr && dc ? 1.414 : 1);
      if (ng < gs[j]) { gs[j] = ng; came[j] = i; push([ng + H(j), j]); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = g; i !== -1; i = came[i]) cells.push(pos(i));
  cells.reverse();
  cells.push(to);
  // 경로 다듬기
  const clear = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 1.0);
    for (let k = 1; k < n; k++) if (blocked(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false;
    return true;
  };
  const out = [];
  let cur = from, k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) if (clear(cur, cells[m])) { far = m; break; }
    out.push(cells[far]); cur = cells[far]; k = far + 1;
  }
  return out;
}

// ── 충돌
function blocked(x, y, r = PLAYER_R) {
  if (bounds && (Math.abs(x) > bounds[0] || Math.abs(y) > bounds[1])) return true;
  for (const c of colliders) {
    const b = c.box;
    if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) continue;
    if (ptInPoly(x, y, c.poly) || polyEdgeDist([x, y], c.poly) < r) return true;
  }
  return false;
}

function tryMove(dx, dy) {
  const [x, y] = player.p;
  if (!blocked(x + dx, y + dy)) { player.p = [x + dx, y + dy]; return true; }
  if (Math.abs(dx) > 1e-4 && !blocked(x + dx, y)) { player.p = [x + dx, y]; return true; }   // 벽 따라 미끄러지기
  if (Math.abs(dy) > 1e-4 && !blocked(x, y + dy)) { player.p = [x, y + dy]; return true; }
  return false;
}

// 지금 서 있는 곳 앞의 문 → 그 건물 (문 앞 ENTER_DIST 안, 문 바깥쪽, 문 폭 근처일 때만)
function nearestBuilding() {
  let best = null, bd = Infinity;
  const [x, y] = player.p;
  for (const c of colliders) {
    const b = c.box;
    if (x < b[0] - ENTER_DIST || x > b[2] + ENTER_DIST || y < b[1] - ENTER_DIST || y > b[3] + ENTER_DIST) continue;
    for (const d of c.doors) {
      const rx = x - d.p[0], ry = y - d.p[1];
      const out = rx * d.n[0] + ry * d.n[1];                 // 벽에서 바깥으로 떨어진 거리
      const side = Math.abs(rx * d.n[1] - ry * d.n[0]);      // 문 중심에서 옆으로 벗어난 거리
      if (out < -0.5 || out > ENTER_DIST || side > d.w / 2 + 1.5) continue;
      const dist = Math.hypot(rx, ry);
      if (dist < bd) { bd = dist; best = c; }
    }
  }
  return best;
}

// 건물의 문 앞 지점 중 플레이어와 가장 가까운 곳 (__world.walkTo 목적지)
function doorPoint(c) {
  let best = null, bd = Infinity;
  for (const d of c.doors) {
    const p = [d.p[0] + d.n[0] * (PLAYER_R + 1.2), d.p[1] + d.n[1] * (PLAYER_R + 1.2)];
    const dist = Math.hypot(p[0] - player.p[0], p[1] - player.p[1]);
    if (dist < bd && !blocked(p[0], p[1]) && reachable(p)) { bd = dist; best = p; }
  }
  return best;
}

// 안뜰처럼 갇힌 곳이 아닌, 바깥과 이어진 지점인지
function reachable(p) {
  if (!nav) return true;
  const c0 = Math.floor((p[0] + bounds[0]) / NAV_CELL), r0 = Math.floor((p[1] + bounds[1]) / NAV_CELL);
  for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
    if (c >= 0 && r >= 0 && c < nav.cols && r < nav.rows && nav.outdoor[r * nav.cols + c]) return true;
  }
  return false;
}

// ── 이름표 / 이벤트 마커
function addLabel(c) {
  const m = c.name.match(/^(.*?)\s*\(([\d-]+)\)$/);
  const el = document.createElement('div');
  el.className = 'blabel';
  el.innerHTML = m ? `<i>${esc(m[2])}</i>${esc(m[1])}` : esc(c.name);
  const obj = new CSS2DObject(el);
  const box = new THREE.Box3().setFromObject(c.mesh);
  obj.position.set(c.center[0], box.max.y + 4, -c.center[1]);
  scene.add(obj);
  labels.push({ obj, el, c });
}

function addMarker(c) {
  const el = document.createElement('div');
  el.className = 'bmarker';
  const obj = new CSS2DObject(el);
  const box = new THREE.Box3().setFromObject(c.mesh);
  obj.position.set(c.center[0], box.max.y + 14, -c.center[1]);
  obj.userData.baseY = obj.position.y;
  scene.add(obj);
  markers.push({ obj, el, c });
}

function updateOverlays(t) {
  for (const l of labels) {
    const d = Math.hypot(l.c.center[0] - player.p[0], l.c.center[1] - player.p[1]);
    l.el.classList.toggle('show', started && (d < LABEL_DIST || l.c === near));
    l.el.classList.toggle('active', l.c === near);
  }
  for (const mk of markers) {
    const st = window.Game.placeStatus(mk.c.name);
    mk.el.className = 'bmarker' + (st.ok ? ' ready' : ' used');
    mk.el.textContent = st.ok ? '!' : '✓';
    mk.obj.position.y = mk.obj.userData.baseY + Math.sin(t * 3) * 1.2;
    // 건물이 많아서 가까운 곳(또는 지금 서 있는 곳)만 표시
    const d = Math.hypot(mk.c.center[0] - player.p[0], mk.c.center[1] - player.p[1]);
    mk.obj.visible = started && (d < LABEL_DIST * 1.3 || mk.c === near);
  }
}

// ── 입력: e.code(물리 키 위치)로 읽는다 — 한글 입력 상태면 e.key가 'ㅈ','ㅁ'…로 들어와서
const KEY = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', KeyE: 'enter', Space: 'enter',
};
addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') return;
  const k = KEY[e.code];
  if (!k) return;
  if (k !== 'run') e.preventDefault();          // 방향키·스페이스로 페이지가 스크롤되지 않게
  keys.add(k);
  if (k === 'enter' && !e.repeat) tryEnter();
});
addEventListener('keyup', e => keys.delete(KEY[e.code]));
addEventListener('blur', () => keys.clear());

prompt.addEventListener('click', tryEnter);

function tryEnter() {
  if (!started || window.Game.inputBlocked()) return;
  if (nearNpc) { talkTo(nearNpc); return; }          // NPC가 바로 앞이면 말 걸기가 먼저
  if (!near) return;
  moveTarget = null; goalMark.visible = false;
  window.Game.enterBuilding(near.name);
}

function talkTo(n) {
  moveTarget = null; goalMark.visible = false;
  player.face = Math.atan2(n.p[0] - player.p[0], n.p[1] - player.p[1]);   // 서로 마주 본다
  npcs.talk(n, window.Game.state(), window.Game.hour());
}

renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom * (1 + Math.sign(e.deltaY) * 0.12), ZOOM_MIN, ZOOM_MAX);
}, { passive: false });

// ── 마우스: 드래그로 카메라 회전 (좌우 = 방향, 위아래 = 기울기). 클릭으로 걷기는 없다
const DRAG_YAW = 0.006, DRAG_PITCH = 0.004;   // 드래그 1px당 라디안
const canvas = renderer.domElement;
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let drag = null;                              // { x, y, dist, id }
canvas.addEventListener('contextmenu', e => e.preventDefault());   // 우클릭 드래그도 회전
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  drag = { x: e.clientX, y: e.clientY, dist: 0, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.dist += Math.hypot(dx, dy);
  if (drag.dist > 4) canvas.classList.add('dragging');
  yaw -= dx * DRAG_YAW;
  pitch = THREE.MathUtils.clamp(pitch + dy * DRAG_PITCH, PITCH_MIN, PITCH_MAX);
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const clicked = drag.dist <= 4;
  drag = null;
  canvas.classList.remove('dragging');
  if (clicked && e.type === 'pointerup') clickBuilding(e);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// 바로 앞에 있는 건물을 클릭하면 들어가기 (E와 같다)
function clickBuilding(e) {
  if (!near || window.Game.inputBlocked()) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(colliders.map(c => c.mesh), false)[0];
  if (hit && hit.object === near.mesh) tryEnter();
}

// 콘솔 디버그(__world.walkTo)용 자동 걷기
function setTarget(p, enter) {
  const path = nav && findPath(player.p, p);
  if (!path || !path.length) { toast('🚧 거기까지 가는 길을 못 찾았다'); return; }
  moveTarget = { path, enter, lastD: Infinity, stuckT: 0 };
  goalMark.position.set(p[0], 0.2, -p[1]);
  goalMark.visible = true;
}

// ── 매 프레임
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta()), t = clock.elapsedTime;
  if (started) window.Game.update(dt);
  if (npcs && started) npcs.update(dt, window.Game.hour(), t);
  if (campus) stepPlayer(dt);
  const night = dayNight ? dayNight(window.Game.hour()) : 0;
  updateCamera(dt);
  updateOcclusion();
  updateOverlays(t);
  if (minimap && started) {
    minimap.draw({
      player: player.p, face: player.face, forward: [-Math.sin(yaw), Math.cos(yaw)], night,
      goal: moveTarget ? moveTarget.path[moveTarget.path.length - 1] : null,
      markers: markers.map(mk => ({ p: mk.c.center, ok: window.Game.placeStatus(mk.c.name).ok })),
    });
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

function stepPlayer(dt) {
  let ix = 0, iy = 0;
  const canMove = started && !window.Game.inputBlocked();
  if (canMove) {
    if (keys.has('up')) iy += 1;
    if (keys.has('down')) iy -= 1;
    if (keys.has('right')) ix += 1;
    if (keys.has('left')) ix -= 1;
  }
  player.running = keys.has('run');
  const speed = player.running ? RUN : WALK;
  let dir = null;

  if (ix || iy) {
    moveTarget = null; goalMark.visible = false;
    // 화면 기준 방향 → 지도 좌표 (카메라 yaw 고정)
    const f = [-Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), Math.sin(yaw)];
    dir = [r[0] * ix + f[0] * iy, r[1] * ix + f[1] * iy];
  } else if (moveTarget && canMove) {
    let wp = moveTarget.path[0];
    if (moveTarget.path.length > 1 && Math.hypot(wp[0] - player.p[0], wp[1] - player.p[1]) < 1.5) { moveTarget.path.shift(); moveTarget.lastD = Infinity; wp = moveTarget.path[0]; }
    const dx = wp[0] - player.p[0], dy = wp[1] - player.p[1], d = Math.hypot(dx, dy);
    if (d < 1 && moveTarget.path.length === 1) {
      const enter = moveTarget.enter;
      moveTarget = null; goalMark.visible = false;
      if (enter) { near = nearestBuilding(); if (near === enter) tryEnter(); }
    } else {
      dir = [dx, dy];
      // 진전이 없으면(건물에 막힘) 포기
      moveTarget.stuckT = d < moveTarget.lastD - 0.05 ? 0 : moveTarget.stuckT + dt;
      moveTarget.lastD = Math.min(moveTarget.lastD, d);
      if (moveTarget.stuckT > 1.2) { moveTarget = null; goalMark.visible = false; toast('🚧 길이 막혔다. 다른 방향으로 돌아가 보자'); dir = null; }
    }
  }

  player.moving = false;
  if (dir) {
    const L = Math.hypot(dir[0], dir[1]) || 1;
    const step = Math.min(speed * dt, moveTarget ? Math.hypot(moveTarget.path[0][0] - player.p[0], moveTarget.path[0][1] - player.p[1]) + 0.01 : Infinity);
    player.moving = tryMove(dir[0] / L * step, dir[1] / L * step);
    player.face = Math.atan2(dir[0], dir[1]);
  }

  // 아바타 위치 · 방향 · 걷기 모션
  avatar.root.position.set(player.p[0], 0, -player.p[1]);
  // player.face는 지도 기준(북=0, 시계방향). 3D에서 북쪽은 -z이고 모델 정면은 +z → π - face
  const cur = avatar.root.rotation.y, want = Math.PI - player.face;
  let diff = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  avatar.root.rotation.y = cur + diff * Math.min(1, dt * 12);
  player.bob += dt * (player.moving ? (player.running ? 18 : 12) : 0);
  const sw = player.moving ? Math.sin(player.bob) * 0.5 : 0;
  avatar.legL.rotation.x = sw; avatar.legR.rotation.x = -sw;
  avatar.body.position.y = player.moving ? Math.abs(Math.sin(player.bob)) * 0.25 : 0;

  // 출입 안내
  near = started ? nearestBuilding() : null;
  nearNpc = started && npcs ? npcs.nearest(player.p) : null;
  if (nearNpc && !window.Game.inputBlocked()) {
    const T = window.NPC_TYPES[nearNpc.type];
    prompt.innerHTML = `<kbd>E</kbd> ${T.emoji} ${esc(T.name)}에게 말 걸기`;
    prompt.className = 'show ready';
  } else if (near && !window.Game.inputBlocked()) {
    const st = window.Game.placeStatus(near.name);
    const nm = esc(near.name || '이름 없는 건물');
    prompt.innerHTML = st.key
      ? (st.ok ? `<kbd>E</kbd> ${nm} 들어가기` : `${nm} · <span>${esc(st.reason)}</span>`)
      : `${nm} · <span>아직 준비 중</span>`;
    prompt.className = 'show' + (st.key && st.ok ? ' ready' : '');
  } else {
    prompt.className = '';
  }
}

// 카메라와 캐릭터 사이를 가리는 건물은 반투명하게
const faded = new Set();
const occRay = new THREE.Raycaster();
function setFade(mesh, on) {
  for (const mt of [mesh.material].flat()) { mt.transparent = on; mt.opacity = on ? 0.28 : 1; mt.depthWrite = !on; mt.needsUpdate = true; }
  mesh.castShadow = !on;
}
function updateOcclusion() {
  if (!campus || !started) return;
  const now = new Set();
  const head = new THREE.Vector3(player.p[0], 3, -player.p[1]);
  for (const h of [3, 0.5]) {                       // 머리 · 발 두 높이로 검사
    head.y = h;
    const dir = head.clone().sub(camera.position), dist = dir.length();
    occRay.set(camera.position, dir.normalize());
    occRay.far = dist - 1;
    for (const hit of occRay.intersectObjects(colliders.map(c => c.mesh), false)) now.add(hit.object);
  }
  for (const m of faded) if (!now.has(m)) { setFade(m, false); faded.delete(m); }
  for (const m of now) if (!faded.has(m)) { setFade(m, true); faded.add(m); }
}

// 카메라: 플레이어를 부드럽게 따라가는 초점 주위를 yaw/pitch/zoom으로 공전
const camFocus = new THREE.Vector3();
let camZoom = zoom;
function updateCamera(dt) {
  if (!started) {
    yaw += dt * 0.08;                       // 시작 화면: 천천히 둘러보기
  } else if (introSpin) {
    introSpin = false; yaw = CAM_YAW; pitch = CAM_PITCH;
  }
  const want = new THREE.Vector3(player.p[0], 0, -player.p[1]);
  const k = started ? Math.min(1, dt * 8) : 1;
  camFocus.lerp(want, k);
  camZoom += ((started ? zoom : 260) - camZoom) * k;
  const p = started ? pitch : CAM_PITCH;
  camera.position.set(
    camFocus.x + camZoom * Math.cos(p) * Math.sin(yaw),
    camFocus.y + camZoom * Math.sin(p),
    camFocus.z + camZoom * Math.cos(p) * Math.cos(yaw));
  camera.lookAt(camFocus);
  sun.position.copy(camFocus).addScaledVector(sun.userData.dir, SUN_DIST);
  sun.target.position.copy(camFocus);
}

addEventListener('game-start', () => { started = true; });

// 콘솔 디버그용 (예: __world.walkTo('학산도서관'))
window.__world = {
  get player() { return player.p.slice(); },
  get near() { return near?.name || null; },
  get npcs() { return npcs; },
  get faded() { return [...faded].map(m => m.userData.name || m.name); },
  get cam() { return camera.position.toArray().map(Math.round); },
  get facing() { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(avatar.root.quaternion); return [v.x, -v.z]; }, // 지도 좌표 정면
  walkTo(name) { const c = colliders.find(x => x.name.includes(name)); const p = c && doorPoint(c); if (p) setTarget(p, c); return !!moveTarget; },
  // 문 위치 확인: 건물 이름 → [{ kind, source: manual|osm|path|guess, lat, lon }]
  doors(name) { const c = colliders.find(x => x.name.includes(name)); return c && c.mesh.userData.doors.map(d => ({ kind: d.kind, source: d.source, level: d.level, lat: +osm.unproj(d.p)[0].toFixed(7), lon: +osm.unproj(d.p)[1].toFixed(7) })); },
  // 실제 문 앞에 서서 실행 → map/doors.js에 붙여넣을 줄을 돌려준다
  doorHere(kind = 'main') {
    let best = null, bd = Infinity;
    for (const c of colliders) { const d = polyEdgeDist(player.p, c.poly); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > 8) return '건물 벽 가까이(8m 안)에 서서 다시 실행하세요';
    const [lat, lon] = osm.unproj(player.p);
    return `'${best.name || best.mesh.userData.osmId}': [{ lat: ${lat.toFixed(7)}, lon: ${lon.toFixed(7)}, kind: '${kind}' }],`;
  },
};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

function toast(msg) { window.toast ? window.toast(msg) : console.log(msg); }
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
