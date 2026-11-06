// ───────────────────────────────────────────────
// 캠퍼스 NPC — 3D 모델 · 돌아다니기 · 말풍선 · 말 걸기
// 종류·대사·시간대별 인원은 npcs-talk.js (NPC_TYPES)
//
//   건물에 사는 NPC(학생·교수님…)는 문에서 나와 다른 문으로 들어가거나 근처를 거닐다 들어간다.
//   동네 주민은 길에서 나타나 산책하다 사라진다. 플레이어 주변에만 인원을 유지한다.
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { polyEdgeDist } from './map/osm.js';

const SCALE = 2.1;                 // 플레이어(2.2)보다 살짝 작게
const TALK_DIST = 4.5;             // 이 거리 안이면 말 걸기
const SPAWN_R = [25, 140];         // 플레이어에서 이 거리 사이의 문/길에서 나타난다
const STREET_SPAWN_MIN = 110;      // 길에서 갑자기 나타나는 NPC는 화면 밖(이 거리 이상)에서
const DESPAWN_R = 175;             // 이보다 멀어지면 조용히 정리 (플레이어가 빨리 움직여도 주변 인원 유지)
const TAG_DIST = 18, BUBBLE_DIST = 32;
const SPEED = { student: 6, grad: 4.6, prof: 4.2, cleaner: 3.8, resident: 4.8, guard: 3.8, rider: 8 };   // m/s (플레이어 14)

const PHASE = h => (h < 6 ? 'late' : h < 9 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'evening' : 'night');
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── 모양: 부위를 정점 색으로 칠해 한 덩어리로 합친다 (NPC 하나 = 몸 1 + 다리 2 메시)
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
const C = new THREE.Color();
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const g = (geo.index ? geo.toNonIndexed() : geo).scale(sx, sy, sz).translate(x, y, z);
  C.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const cyl = (r0, r1, h, seg = 6) => new THREE.CylinderGeometry(r0, r1, h, seg);

const SKIN = ['#f6d7b8', '#efc9a4', '#e8bb92', '#f3d2b0'];
const HAIR = ['#2a1f1a', '#3b2a22', '#1d1a19', '#5a3a28', '#6b4a33'];
const SHIRTS = ['#e0679a', '#4f7fd1', '#f2a33a', '#59a86b', '#8e6bd1', '#e8e3d6', '#2f3542', '#d94f4f', '#7fb3c8', '#c9b48a'];
const PANTS = ['#3d4a6b', '#2b2b2b', '#6b5a4a', '#4a6b8a', '#5c5f66'];

// 종류별 옷차림 (사진 속 한국 캠퍼스 풍경 기준의 전형적인 차림)
function looks(type) {
  const skin = pick(SKIN), hair = pick(HAIR);
  const L = { skin, hair, pants: pick(PANTS), shirt: pick(SHIRTS), extra: [], hairStyle: 'short', dog: false };
  switch (type) {
    case 'student':
      L.hairStyle = pick(['short', 'long', 'short', 'bob']);
      L.extra.push(Math.random() < 0.75 ? ['backpack', pick(['#f2c230', '#2f3542', '#d94f4f', '#4f7fd1', '#e8e3d6'])] : ['tote', '#e8e3d6']);
      if (Math.random() < 0.3) L.extra.push(['cup', '#f4f1ea']);
      break;
    case 'grad':
      L.shirt = Math.random() < 0.5 ? '#f2f2ee' : pick(['#3b3f4a', '#4b5361', '#5a4e44']);   // 실험복 또는 늘어난 후드티
      L.coat = L.shirt === '#f2f2ee';
      L.hairStyle = 'messy';
      L.extra.push(['glasses', '#1d1d1d'], ['backpack', '#2f3542']);
      break;
    case 'prof':
      L.shirt = pick(['#2d3a5c', '#4a4a4f', '#5c4636', '#3f4b3a']);                          // 재킷
      L.pants = pick(['#2b2b2b', '#4a4a4f', '#3a3f4a']);
      L.hair = pick(['#9a9a96', '#c9c9c4', '#5a5a58', '#2a1f1a']);
      L.hairStyle = Math.random() < 0.25 ? 'bald' : 'short';
      L.extra.push(['collar', '#f4f4f0'], ['briefcase', '#3b2a22']);
      if (Math.random() < 0.5) L.extra.push(['glasses', '#3a3a3a']);
      break;
    case 'cleaner':
      L.shirt = pick(['#7fa7cf', '#e59ab0', '#8cb89a']);                                     // 작업복
      L.pants = '#4a5468';
      L.hair = pick(['#2a1f1a', '#4a3a30', '#6a5a50']);
      L.hairStyle = 'perm';
      L.extra.push(['visor', L.shirt], ['mop', '#c8b48a']);
      break;
    case 'resident': {
      const kind = pick(['dog', 'dog', 'jogger', 'grandma']);
      if (kind === 'jogger') { L.shirt = pick(['#f2f2ee', '#3b3f4a', '#e05a4a']); L.pants = '#2b2b2b'; L.extra.push(['cap', pick(['#2f3542', '#f2f2ee'])]); }
      if (kind === 'grandma') { L.shirt = pick(['#8e6bd1', '#c75a7a', '#5a7fb0']); L.hair = '#bdbab3'; L.hairStyle = 'perm'; L.extra.push(['visor', '#f2f2ee']); }
      if (kind === 'dog') { L.dog = pick(['#f4efe6', '#c9a46b', '#3b2f28', '#e8d8b8']); L.extra.push(['leash', '#d94f4f']); }
      L.kind = kind;
      break;
    }
    case 'guard':
      L.shirt = '#2d3a5c'; L.pants = '#2d3a5c';
      L.extra.push(['cap', '#1f2a44'], ['flashlight', '#f2c230']);
      break;
    case 'rider':
      L.shirt = pick(['#2b2b2b', '#2f4f8f', '#3b3f4a']);
      L.pants = '#2b2b2b';
      L.hairStyle = 'none';
      L.extra.push(['helmet', pick(['#e04a3a', '#f2c230', '#f2f2ee', '#2fa0d0'])], ['delivery', pick(['#e8e3d6', '#d94f4f', '#2fa0d0'])]);
      break;
  }
  return L;
}

function buildModel(type) {
  const L = looks(type);
  const parts = [];
  // 몸통 · 팔 · 머리 (플레이어 아바타와 같은 비율: 머리 큰 로우폴리)
  parts.push(part(box(0.6, 0.58, 0.36), L.shirt, 0, 0.8, 0));
  for (const s of [-1, 1]) parts.push(part(box(0.14, 0.5, 0.18), L.shirt, s * 0.37, 0.78, 0));
  for (const s of [-1, 1]) parts.push(part(box(0.12, 0.1, 0.14), L.skin, s * 0.37, 0.5, 0));
  if (L.coat) parts.push(part(box(0.64, 0.3, 0.4), L.shirt, 0, 0.45, 0));            // 실험복 아랫단
  parts.push(part(ball(0.4), L.skin, 0, 1.42, 0));
  for (const s of [-1, 1]) parts.push(part(box(0.07, 0.07, 0.02), '#222', s * 0.13, 1.44, 0.38));
  // 머리 모양
  if (L.hairStyle === 'short') parts.push(part(ball(0.42), L.hair, 0, 1.53, -0.05, 1, 0.72, 1));
  if (L.hairStyle === 'messy') parts.push(part(ball(0.45, 0), L.hair, 0, 1.55, -0.04, 1.05, 0.75, 1.05));
  if (L.hairStyle === 'long') { parts.push(part(ball(0.42), L.hair, 0, 1.53, -0.05, 1, 0.72, 1)); parts.push(part(box(0.7, 0.55, 0.22), L.hair, 0, 1.25, -0.24)); }
  if (L.hairStyle === 'bob') parts.push(part(ball(0.44), L.hair, 0, 1.47, -0.05, 1.05, 0.85, 1.02));
  if (L.hairStyle === 'perm') parts.push(part(ball(0.46, 0), L.hair, 0, 1.52, -0.05, 1.08, 0.8, 1.05));
  if (L.hairStyle === 'bald') parts.push(part(ball(0.41), L.hair, 0, 1.38, -0.12, 1.02, 0.6, 0.9));
  for (const [kind, color] of L.extra) {
    if (kind === 'backpack') parts.push(part(box(0.46, 0.5, 0.2), color, 0, 0.85, -0.28));
    if (kind === 'tote') parts.push(part(box(0.08, 0.45, 0.4), color, 0.4, 0.55, 0));
    if (kind === 'cup') parts.push(part(cyl(0.07, 0.06, 0.2), color, 0.38, 0.6, 0.12));
    if (kind === 'glasses') parts.push(part(box(0.42, 0.06, 0.03), color, 0, 1.44, 0.4));
    if (kind === 'collar') parts.push(part(box(0.22, 0.2, 0.02), color, 0, 0.98, 0.18));
    if (kind === 'briefcase') parts.push(part(box(0.1, 0.32, 0.42), color, 0.42, 0.4, 0));
    if (kind === 'visor') { parts.push(part(cyl(0.44, 0.44, 0.08, 10), color, 0, 1.62, 0)); parts.push(part(box(0.5, 0.04, 0.3), color, 0, 1.6, 0.36)); }
    if (kind === 'cap') { parts.push(part(ball(0.43), color, 0, 1.58, 0, 1, 0.55, 1)); parts.push(part(box(0.44, 0.05, 0.3), color, 0, 1.56, 0.38)); }
    if (kind === 'mop') { parts.push(part(cyl(0.03, 0.03, 1.6), '#8a8f96', 0.45, 0.85, 0.15)); parts.push(part(box(0.4, 0.1, 0.18), color, 0.45, 0.06, 0.15)); }
    if (kind === 'flashlight') parts.push(part(cyl(0.05, 0.07, 0.3), color, 0.4, 0.55, 0.1));
    if (kind === 'helmet') parts.push(part(ball(0.47), color, 0, 1.47, 0, 1, 0.92, 1));
    if (kind === 'delivery') parts.push(part(box(0.55, 0.5, 0.45), color, 0, 0.95, -0.42));
    if (kind === 'leash') parts.push(part(box(0.03, 0.03, 0.7), color, 0.38, 0.5, 0.4));
  }
  const root = new THREE.Group(), body = new THREE.Mesh(mergeGeometries(parts), MAT);
  body.castShadow = true;
  const leg = () => { const m = new THREE.Mesh(part(box(0.22, 0.5, 0.26), L.pants, 0, -0.25, 0), MAT); m.castShadow = true; return m; };
  const legL = leg(), legR = leg();
  legL.position.set(-0.14, 0.5, 0); legR.position.set(0.14, 0.5, 0);
  const rig = new THREE.Group();
  rig.add(body, legL, legR);
  rig.scale.setScalar(SCALE);
  root.add(rig);
  let dog = null;
  if (L.dog) {
    const d = [part(box(0.5, 0.28, 0.8), L.dog, 0, 0.42, 0), part(box(0.36, 0.32, 0.34), L.dog, 0, 0.62, 0.48),
               part(box(0.1, 0.12, 0.08), '#2a2a2a', 0, 0.6, 0.67)];
    for (const [x, z] of [[-0.17, -0.28], [0.17, -0.28], [-0.17, 0.28], [0.17, 0.28]]) d.push(part(box(0.1, 0.3, 0.1), L.dog, x, 0.15, z));
    for (const s of [-1, 1]) d.push(part(box(0.08, 0.16, 0.06), L.dog, s * 0.14, 0.82, 0.42));
    dog = new THREE.Mesh(mergeGeometries(d), MAT);
    dog.castShadow = true;
    dog.scale.setScalar(SCALE * 0.9);
    dog.position.set(1.6, 0, 1.6);
    root.add(dog);
  }
  return { root, rig, legL, legR, dog, look: L };
}

// ───────────────────────────────────────────────
/**
 * world: { scene, nav, findPath, blocked, colliders, player: () => [x, y] }
 */
export function createNPCs(world) {
  const { scene, nav, findPath, colliders } = world;
  const TYPES = window.NPC_TYPES;
  const list = [];
  const usedTalks = new Set();
  let spawnT = 0, filled = false;

  // 종류별 드나드는 문 (건물 문 앞 바깥 지점)
  const homeDoors = {};
  for (const [id, T] of Object.entries(TYPES)) {
    homeDoors[id] = T.homes ? colliders.filter(c => T.homes.test(c.name || '')).flatMap(c => c.doors.map(d => ({
      c, p: [d.p[0] + d.n[0] * 2.8, d.p[1] + d.n[1] * 2.8],
    }))).filter(d => !world.blocked(d.p[0], d.p[1]) && outdoor(d.p)) : [];
  }

  function outdoor(p) {
    const i = nav.cellOf(p);
    if (i < 0) return false;
    if (nav.outdoor[i]) return true;
    // 문 앞 칸은 벽에 붙어 막혀 있을 수 있어서 한 칸 옆까지 본다
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const j = nav.cellOf([p[0] + dx, p[1] + dy]); if (j >= 0 && nav.outdoor[j]) return true; }
    return false;
  }
  function randomSpot(center, r0, r1) {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const p = [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r];
      const i = nav.cellOf(p);
      if (i >= 0 && nav.outdoor[i]) return nav.pos(i);
    }
    return null;
  }
  const placeNear = p => {
    let best = null, bd = 60;
    for (const c of colliders) {
      if (!c.name) continue;
      const d = polyEdgeDist(p, c.poly);
      if (d < bd) { bd = d; best = c.name; }
    }
    return best;
  };

  function target(type, hour) { return TYPES[type].count[PHASE(hour)] || 0; }
  const countOf = type => list.filter(n => n.type === type && n.state !== 'gone').length;

  // ── 생성
  function spawn(type, hour, anywhere) {
    const pp = world.player();
    let p = null, from = null;
    const doors = homeDoors[type];
    if (anywhere) {                                            // 처음 채울 때: 이미 걷고 있던 것처럼
      p = randomSpot(pp, SPAWN_R[0], SPAWN_R[1]);
    } else if (doors.length) {
      const cand = doors.filter(d => { const r = dist(d.p, pp); return r > SPAWN_R[0] && r < SPAWN_R[1]; });
      if (!cand.length) return null;
      from = pick(cand); p = from.p;
    } else {
      p = randomSpot(pp, STREET_SPAWN_MIN, SPAWN_R[1]);
    }
    if (!p) return null;
    const m = buildModel(type);
    m.root.position.set(p[0], 0, -p[1]);
    m.rig.scale.setScalar(anywhere ? SCALE : 0.01);
    scene.add(m.root);
    const el = document.createElement('div');
    el.className = 'npc-label';
    el.innerHTML = `<div class="npc-bubble"></div><div class="npc-tag">${TYPES[type].emoji} ${TYPES[type].name}</div>`;
    const label = new CSS2DObject(el);
    label.position.set(0, 4.6, 0);
    m.root.add(label);
    const n = {
      type, ...m, el, label, bubbleEl: el.firstChild,
      p: p.slice(), face: Math.random() * Math.PI * 2, bob: Math.random() * 10,
      state: 'idle', wait: anywhere ? Math.random() * 2 : 0.6, path: null, legs: 0,
      grow: anywhere ? 1 : 0, leaving: false, talked: false, stops: 0,
      bubbleT: 4 + Math.random() * 12, bubbleOn: 0, yieldT: 0,
    };
    list.push(n);
    return n;
  }

  function remove(n) {
    n.state = 'gone';
    n.root.remove(n.label);
    n.el.remove();
    scene.remove(n.root);
    n.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }

  // ── 다음 목적지: 문으로 들어가기 / 근처 거닐기 / (주민) 멀리 가서 사라지기
  function plan(n, hour) {
    const doors = homeDoors[n.type];
    const surplus = countOf(n.type) > target(n.type, hour);
    let dest = null, kind = 'spot';
    if (doors.length && (surplus || n.stops >= 2 || Math.random() < 0.35)) {
        // 들어갈 시간이면 가까운 문으로, 아니면 아무 문으로
      let cand = doors.filter(d => { const r = dist(d.p, n.p); return r > 15 && r < 200; });
      if (surplus) cand = cand.sort((a, b) => dist(a.p, n.p) - dist(b.p, n.p)).slice(0, 3);
      if (cand.length) { dest = pick(cand).p; kind = 'door'; }
    }
    if (!dest && !doors.length && (surplus || n.stops >= 3)) { dest = randomSpot(n.p, 150, 260); kind = 'away'; }
    if (!dest) dest = randomSpot(dist(n.p, world.player()) > 90 ? world.player() : n.p, 20, 90);   // 너무 멀면 플레이어 쪽으로 거닌다
    const path = dest && findPath(n.p, dest);
    if (!path || !path.length) { n.leaving = true; n.state = 'idle'; n.wait = 0.2; return; }
    n.path = path; n.dest = kind; n.state = 'walk';
  }

  // ── 말풍선 / 이름표
  function say(n, text, sec = 3.5) {
    n.bubbleEl.textContent = text;
    n.el.classList.add('talking');
    n.bubbleOn = sec;
  }

  // ── 매 프레임
  function update(dt, hour, t) {
    const pp = world.player();
    // 인원 맞추기: 처음엔 한꺼번에, 이후엔 조금씩 (문에서 나오는 속도)
    if (!filled) {
      for (const type of Object.keys(TYPES)) for (let k = target(type, hour); k > 0; k--) spawn(type, hour, true);
      filled = true;
    }
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.2;
      // 시간대가 바뀌어 남는 인원: 화면 밖(멀리) 있는 사람부터 정리
      for (const type of Object.keys(TYPES)) {
        if (countOf(type) <= target(type, hour)) continue;
        const far = list.find(n => n.type === type && n.state !== 'gone' && n.state !== 'talk' && dist(n.p, pp) > 130);
        if (far) remove(far);
      }
      const short = Object.keys(TYPES).map(type => [type, target(type, hour) - countOf(type)]).filter(([, d]) => d > 0);
      if (short.length) spawn(pick(short)[0], hour, false);
    }

    let planned = 0;
    for (const n of list) {
      if (n.state === 'gone') continue;
      const dp = dist(n.p, pp);
      if (dp > DESPAWN_R && n.state !== 'talk') { remove(n); continue; }

      // 문에서 나오기 / 들어가기 (크기로 표현)
      const wantGrow = n.state === 'exit' ? 0 : 1;
      n.grow += Math.sign(wantGrow - n.grow) * Math.min(Math.abs(wantGrow - n.grow), dt * 3);
      n.rig.scale.setScalar(Math.max(0.01, n.grow) * SCALE);
      if (n.dog) n.dog.visible = n.grow > 0.5;
      if (n.state === 'exit') { if (n.grow <= 0.02) remove(n); continue; }

      let moving = false;
      if (n.state === 'talk') {
        n.face = Math.atan2(pp[0] - n.p[0], pp[1] - n.p[1]);
      } else if (n.state === 'idle') {
        n.wait -= dt;
        if (n.wait <= 0 && planned < 2) {
          planned++;
          if (n.leaving) { n.state = 'exit'; continue; }
          plan(n, hour);
        }
      } else if (n.state === 'walk') {
        // 플레이어가 바로 앞에 있으면 잠깐 비켜 서기
        const ahead = n.path[0], toP = [pp[0] - n.p[0], pp[1] - n.p[1]];
        const dirW = [ahead[0] - n.p[0], ahead[1] - n.p[1]];
        if (dp < 2.4 && toP[0] * dirW[0] + toP[1] * dirW[1] > 0 && n.yieldT < 1.5) {
          n.yieldT += dt;
        } else {
          n.yieldT = dp < 2.4 ? n.yieldT : 0;
          const L = Math.hypot(dirW[0], dirW[1]), step = SPEED[n.type] * dt;
          if (L <= step) {
            n.p = ahead.slice(); n.path.shift();
            if (!n.path.length) {
              n.stops++;
              if (n.dest === 'door' || n.dest === 'away') { n.state = 'exit'; continue; }
              n.state = 'idle'; n.wait = 2 + Math.random() * 6;
            }
          } else {
            n.p = [n.p[0] + dirW[0] / L * step, n.p[1] + dirW[1] / L * step];
            n.face = Math.atan2(dirW[0], dirW[1]);
          }
          moving = true;
        }
      }

      // 위치 · 방향 · 걷기 모션
      n.root.position.set(n.p[0], 0, -n.p[1]);
      const cur = n.root.rotation.y, want = Math.PI - n.face;
      const diff = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      n.root.rotation.y = cur + diff * Math.min(1, dt * 8);
      n.bob += dt * (moving ? 9 * SPEED[n.type] / 5 : 0);
      const sw = moving ? Math.sin(n.bob) * 0.5 : 0;
      n.legL.rotation.x = sw; n.legR.rotation.x = -sw;
      n.rig.position.y = moving ? Math.abs(Math.sin(n.bob)) * 0.18 : 0;
      if (n.dog) {
        n.dog.position.y = moving ? Math.abs(Math.sin(n.bob * 1.6)) * 0.25 : 0;
        n.dog.rotation.y = moving ? 0 : Math.sin(t * 2 + n.bob) * 0.5;
      }

      // 이름표 · 혼잣말
      const showTag = dp < TAG_DIST || n.state === 'talk';
      n.label.visible = n.grow > 0.6 && (showTag || n.bubbleOn > 0);
      n.el.classList.toggle('near', showTag);
      if (n.bubbleOn > 0) {
        n.bubbleOn -= dt;
        if (n.bubbleOn <= 0) n.el.classList.remove('talking');
      } else if (dp < BUBBLE_DIST && n.state !== 'talk') {
        n.bubbleT -= dt;
        if (n.bubbleT <= 0) { n.bubbleT = 12 + Math.random() * 18; say(n, pick(TYPES[n.type].bubbles)); }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].state === 'gone') list.splice(i, 1);
  }

  // ── 말 걸기
  function nearest(p) {
    let best = null, bd = TALK_DIST;
    for (const n of list) {
      if (n.state === 'gone' || n.state === 'exit' || n.grow < 0.8) continue;
      const d = dist(n.p, p);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function talk(n, s, hour) {
    const T = TYPES[n.type];
    const resume = () => { if (n.state === 'talk') { n.state = 'idle'; n.wait = 1 + Math.random() * 2; } };
    n.state = 'talk'; n.path = null;
    if (n.talked) {                                  // 같은 사람에게 또: 짧은 인사만 (효과 없음)
      say(n, pick(T.again), 3);
      setTimeout(resume, 2500);
      return 'again';
    }
    const ctx = { place: placeNear(n.p), npc: n.type };
    const phase = PHASE(hour);
    const ok = T.talks.filter(e => (!e.time || e.time.includes(phase)) && (!e.when || e.when(s, ctx)));
    let pool = ok.filter(e => !usedTalks.has(e.id));
    if (!pool.length) { for (const e of ok) usedTalks.delete(e.id); pool = ok; }
    const e = pick(pool);
    if (!e) { say(n, pick(T.bubbles)); setTimeout(resume, 2500); return 'again'; }
    usedTalks.add(e.id);
    const opened = window.Game.talk(e, () => { n.talked = true; say(n, pick(['그럼 이만~', '좋은 하루 보내요!', '다음에 또 봐요', '수고해요~']), 2.5); resume(); });
    if (!opened) { resume(); return null; }
    return 'talk';
  }

  return {
    update, nearest, talk,
    get list() { return list; },
    debug: () => Object.keys(TYPES).map(type => `${type} ${countOf(type)}/${target(type, window.Game.hour())}`).join(' · '),
  };
}
