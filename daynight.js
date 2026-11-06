// ───────────────────────────────────────────────
// 낮과 밤 — 시각(0~24)에 따라 하늘·햇빛·창문 불빛·가로등을 바꾼다
// ───────────────────────────────────────────────
import * as THREE from 'three';

// 시각별 기준 색/밝기. 사이 시각은 선형 보간
const KEYS = [
  { h: 0,    sky: '#141d36', hs: '#3a4f80', hg: '#1b2433', hi: 0.45, sc: '#a9bcff', si: 0.35 },
  { h: 4.5,  sky: '#1b2647', hs: '#41588c', hg: '#1d2636', hi: 0.5,  sc: '#a9bcff', si: 0.35 },
  { h: 6,    sky: '#f3b58e', hs: '#ffd2a8', hg: '#7a8f6a', hi: 0.9,  sc: '#ffb27a', si: 1.2 },
  { h: 8,    sky: '#cfe8f7', hs: '#ffffff', hg: '#8fb87a', hi: 1.4,  sc: '#fff4e0', si: 2.2 },
  { h: 16.5, sky: '#cfe8f7', hs: '#ffffff', hg: '#8fb87a', hi: 1.4,  sc: '#fff4e0', si: 2.2 },
  { h: 18.5, sky: '#f0a37f', hs: '#ffc9a3', hg: '#8a7f6a', hi: 0.9,  sc: '#ff9a5a', si: 1.1 },
  { h: 20,   sky: '#2a3561', hs: '#5163a0', hg: '#232c3d', hi: 0.5,  sc: '#a9bcff', si: 0.4 },
  { h: 24,   sky: '#141d36', hs: '#3a4f80', hg: '#1b2433', hi: 0.45, sc: '#a9bcff', si: 0.35 },
].map(k => ({ ...k, sky: new THREE.Color(k.sky), hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg), sc: new THREE.Color(k.sc) }));

const WINDOW_GLOW = '#ffcf7a';
const MOON_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** 0 = 한낮, 1 = 한밤 */
export function nightFactor(h) {
  if (h >= 17.5) return smooth(17.5, 19.5, h);
  if (h < 5) return 1;
  return 1 - smooth(5, 6.5, h);
}

export function createDayNight({ scene, sun, hemi, campus, follow }) {
  // 건물 창문: builder가 준비한 emissiveMap을 붙인다
  const walls = [];
  for (const b of campus.buildings) for (const m of [b.material].flat()) {
    if (!m.userData.lit) continue;          // 외장 재질마다 불 켜진 창 텍스처가 따로 있다
    m.emissiveMap = m.userData.lit;
    m.emissive.set(WINDOW_GLOW);
    m.emissiveIntensity = 0;
    m.needsUpdate = true;
    walls.push(m);
  }

  // 가로등 불빛이 땅에 번지는 원 (가산 합성)
  const pool = new THREE.InstancedMesh(
    new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffcf86', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: radialTexture() }),
    campus.lamps.length);
  const mtx = new THREE.Matrix4();
  campus.lamps.forEach(([x, y], i) => { mtx.makeTranslation(x, 0.25, -y); pool.setMatrixAt(i, mtx); });
  pool.renderOrder = 2;
  scene.add(pool);

  // 캐릭터 주변을 비추는 작은 불빛
  const glow = new THREE.PointLight('#ffd9a0', 0, 32, 1.4);
  glow.position.set(0, 4, 0);
  follow.add(glow);

  const sky = new THREE.Color(), tmp = new THREE.Vector3();
  let lastN = -1;

  return function update(h) {
    const i = KEYS.findIndex(k => k.h > h);
    const a = KEYS[Math.max(0, i - 1)], b = KEYS[i < 0 ? KEYS.length - 1 : i];
    const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
    sky.copy(a.sky).lerp(b.sky, t);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    hemi.color.copy(a.hs).lerp(b.hs, t);
    hemi.groundColor.copy(a.hg).lerp(b.hg, t);
    hemi.intensity = THREE.MathUtils.lerp(a.hi, b.hi, t);
    sun.color.copy(a.sc).lerp(b.sc, t);
    sun.intensity = THREE.MathUtils.lerp(a.si, b.si, t);

    // 해: 06시 동쪽에서 떠서 18시 서쪽으로. 밤에는 달 방향으로 부드럽게
    const ang = (h - 6) / 12 * Math.PI;
    const dayW = THREE.MathUtils.clamp(Math.sin(ang) * 3, 0, 1);
    tmp.set(Math.cos(ang), Math.max(0.25, Math.sin(ang)), 0.45).normalize().lerp(MOON_DIR, 1 - dayW).normalize();
    sun.userData.dir = tmp.clone();          // world.js가 그림자 카메라 위치에 쓴다

    const n = nightFactor(h);
    if (Math.abs(n - lastN) > 0.002) {
      lastN = n;
      for (const m of walls) m.emissiveIntensity = n * 1.15;
      campus.lampHead.emissiveIntensity = n * 2.5;
      for (const m of campus.doorLights) m.emissiveIntensity = n * 2.5;
      pool.material.opacity = n * 0.42;
      pool.visible = n > 0.02;
      glow.intensity = n * 45;
    }
    return n;
  };
}

function radialTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
