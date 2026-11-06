// ───────────────────────────────────────────────
// 캠퍼스 3D 맵 — OSM 파일을 읽어 브라우저에서 직접 생성
// ───────────────────────────────────────────────
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { parseOSM } from './map/osm.js';
import { buildCampus } from './map/builder.js';

const STYLE_LABEL = { univ: '대학 건물', dorm: '기숙사', biz: '상업/산업', misc: '기타' };
const LABEL_DIST = 620;          // 이 거리보다 가까우면 건물 이름표 표시
const GLOW_HOVER = new THREE.Color('#5a4a20');
const GLOW_SELECT = new THREE.Color('#a8561e');

const view = document.getElementById('view');
const tip = document.getElementById('tip');
const info = document.getElementById('info');

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
scene.fog = new THREE.Fog('#cfe8f7', 1100, 2200);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 5, 4000);
camera.position.set(520, 560, 620);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 60;
controls.maxDistance = 1400;
controls.maxPolarAngle = Math.PI * 0.42; // 너무 눕지 않게
controls.screenSpacePanning = false;

// ── 조명 (쿼터뷰 햇살)
scene.add(new THREE.HemisphereLight('#ffffff', '#8fb87a', 1.4));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(-300, 500, 250);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -520, right: 520, top: 520, bottom: -520, near: 10, far: 1500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun);

// ── 맵 생성
let buildings = [];
const labels = [];
fetch('assets/map/campus.osm')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then(text => {
    const t0 = performance.now();
    const campus = buildCampus(parseOSM(text));
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    campus.group.traverse(o => {
      for (const m of [o.material].flat()) if (m?.map) m.map.anisotropy = maxAniso; // 비스듬히 봐도 창문이 뭉개지지 않게
    });
    scene.add(campus.group);
    campus.group.updateMatrixWorld(true);
    buildings = campus.buildings;
    for (const b of buildings) addLabel(b);
    console.info(`[campus] ${Math.round(performance.now() - t0)}ms`, campus.stats);
    document.getElementById('loading').remove();
  })
  .catch(err => { document.getElementById('loading').textContent = '맵을 만들지 못했다: ' + err.message; console.error(err); });

const buildingOf = o => (buildings.includes(o) ? o : null);

// 이름표: "학산도서관 (06)" → 이름 + 건물 번호 뱃지
function addLabel(b) {
  const raw = b.userData.name;
  if (!raw) return;
  const m = raw.match(/^(.*?)\s*\(([\d-]+)\)$/);
  const el = document.createElement('div');
  el.className = 'blabel';
  el.innerHTML = m ? `<i>${esc(m[2])}</i>${esc(m[1])}` : esc(raw);
  const box = new THREE.Box3().setFromObject(b);
  const obj = new CSS2DObject(el);
  obj.position.set((box.min.x + box.max.x) / 2, box.max.y + 4, (box.min.z + box.max.z) / 2);
  scene.add(obj);
  labels.push({ obj, el, b });
}

function updateLabels() {
  const near = camera.position.distanceTo(controls.target) < LABEL_DIST;
  for (const l of labels) {
    const show = near || l.b === selected || l.b === hovered;
    l.el.classList.toggle('show', show);
    l.el.classList.toggle('active', l.b === selected);
  }
}

// ── 호버 / 클릭
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hovered = null, selected = null;

function setGlow(b, color) {
  for (const m of [b.material].flat()) m.emissive.copy(color || new THREE.Color(0));
}
function refreshGlow() {
  for (const b of buildings) setGlow(b, b === selected ? GLOW_SELECT : b === hovered ? GLOW_HOVER : null);
}
function pickBuilding(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(buildings, true)[0];
  return hit ? buildingOf(hit.object) : null;
}
function label(b) { return b.userData.name || '이름 없는 건물'; }

renderer.domElement.addEventListener('pointermove', e => {
  const b = pickBuilding(e);
  if (b !== hovered) { hovered = b; refreshGlow(); }
  renderer.domElement.style.cursor = b ? 'pointer' : '';
  tip.style.display = b ? 'block' : 'none';
  if (b) { tip.textContent = label(b); tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; }
});

let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // 드래그는 무시
  selected = pickBuilding(e);
  refreshGlow();
  if (!selected) { info.style.display = 'none'; return; }
  const d = selected.userData;
  info.innerHTML = `<h3>${esc(label(selected))}</h3>${STYLE_LABEL[d.style] || ''}${d.levels ? ` · ${esc(d.levels)}층` : ''}${d.height ? ` · 높이 ${d.height}m` : ''}`;
  info.style.display = 'block';
});

// 콘솔 디버그용: __view.look([x, y], dist, yaw도) — 지도 좌표 [x, y] 를 바라보기
window.__view = {
  camera, controls, renderer, get buildings() { return buildings; },
  look([x, y], dist = 160, yawDeg = 45, pitchDeg = 35) {
    const yaw = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    controls.target.set(x, 0, -y);
    camera.position.set(x + dist * Math.cos(p) * Math.sin(yaw), dist * Math.sin(p), -y + dist * Math.cos(p) * Math.cos(yaw));
    controls.update();
  },
  find(name) { const b = buildings.find(m => m.userData.name.includes(name)); return b && b.userData.poly && b.userData.poly.reduce((a, q) => [a[0] + q[0] / b.userData.poly.length, a[1] + q[1] / b.userData.poly.length], [0, 0]); },
};

function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
