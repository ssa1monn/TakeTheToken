// ───────────────────────────────────────────────
// 원형 미니맵 — 화면 방향(카메라 앞)이 위로 오게 회전, 플레이어가 가운데
// 좌표: 2D 지도(x=동, y=북, 미터)
// ───────────────────────────────────────────────

const K = 1.2;            // 바탕 지도 해상도 (px/m)
const VIEW_R = 150;       // 미니맵 반지름이 보여주는 거리 (m)

export function createMinimap(canvas, mini, buildings) {
  const base = drawBase(mini, buildings);
  const ctx = canvas.getContext('2d');
  let size = 0, theta = 0;

  function resize() {
    const css = canvas.clientWidth || 184, dpr = Math.min(2, devicePixelRatio);
    if (canvas.width !== Math.round(css * dpr)) canvas.width = canvas.height = Math.round(css * dpr);
    size = canvas.width;
  }

  // 지도 좌표 벡터 → 미니맵 캔버스 벡터 (회전 θ 후 y 뒤집기)
  const toCanvasVec = (dx, dy, s) => {
    const c = Math.cos(theta), n = Math.sin(theta);
    return [(dx * c - dy * n) * s, -(dx * n + dy * c) * s];
  };

  /**
   * player: [x, y] · face: 진행 방향(북쪽 기준 시계방향 라디안) · forward: 화면 위쪽에 해당하는 지도 방향 벡터
   * markers: [{ p, ok }] · goal: [x, y] | null · night: 0~1
   */
  function draw({ player, face, forward, markers = [], goal = null, night = 0 }) {
    resize();
    const S = size, R = S / 2, s = R / VIEW_R;
    theta = Math.PI / 2 - Math.atan2(forward[1], forward[0]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#cfe8f7'; ctx.fillRect(0, 0, S, S);

    // 바탕 지도
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-theta);
    ctx.scale(s / K, s / K);
    ctx.drawImage(base, -(player[0] + mini.halfW) * K, -(mini.halfH - player[1]) * K);
    ctx.restore();

    if (night > 0.02) { ctx.fillStyle = `rgba(16, 24, 52, ${0.32 * night})`; ctx.fillRect(0, 0, S, S); }

    // 목적지
    if (goal) {
      const [gx, gy] = toCanvasVec(goal[0] - player[0], goal[1] - player[1], s);
      if (Math.hypot(gx, gy) < R - 6) {
        ctx.strokeStyle = '#d9534f'; ctx.lineWidth = S * 0.012;
        ctx.beginPath(); ctx.arc(R + gx, R + gy, S * 0.03, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 이벤트 건물: 범위 밖이면 테두리에 붙여서 방향만
    for (const m of markers) {
      let [mx, my] = toCanvasVec(m.p[0] - player[0], m.p[1] - player[1], s);
      const d = Math.hypot(mx, my), lim = R - S * 0.06;
      if (d > lim) { mx *= lim / d; my *= lim / d; }
      ctx.fillStyle = m.ok ? '#d9534f' : '#8a9aa8';
      ctx.beginPath(); ctx.arc(R + mx, R + my, S * 0.042, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(S * 0.055)}px Pretendard, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.ok ? '!' : '✓', R + mx, R + my + S * 0.004);
    }

    // 플레이어 화살표
    const [fx, fy] = toCanvasVec(Math.sin(face), Math.cos(face), 1);
    const a = Math.atan2(fy, fx), r = S * 0.05;
    ctx.save();
    ctx.translate(R, R); ctx.rotate(a);
    ctx.fillStyle = '#e0679a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = S * 0.012; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * 0.8, r * 0.75); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * 0.75); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.restore();

    // 테두리 + 북쪽 표시
    ctx.lineWidth = S * 0.025; ctx.strokeStyle = 'rgba(255, 253, 248, .95)';
    ctx.beginPath(); ctx.arc(R, R, R - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    const [nx, ny] = toCanvasVec(0, 1, 1), nr = R - S * 0.07;
    ctx.fillStyle = '#2b2620'; ctx.beginPath(); ctx.arc(R + nx * nr, R + ny * nr, S * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(S * 0.05)}px Pretendard, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', R + nx * nr, R + ny * nr + S * 0.003);
  }

  return { draw };
}

// 정적인 바탕 지도를 한 번만 그려 둔다 (북쪽이 위)
function drawBase(mini, buildings) {
  const { halfW, halfH, colors: C } = mini;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(halfW * 2 * K); cv.height = Math.ceil(halfH * 2 * K);
  const g = cv.getContext('2d');
  const P = ([x, y]) => [(x + halfW) * K, (halfH - y) * K];
  const poly = (pts, fill) => {
    if (pts.length < 3) return;
    g.beginPath();
    pts.forEach((p, i) => { const [u, v] = P(p); i ? g.lineTo(u, v) : g.moveTo(u, v); });
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  g.fillStyle = C.ground; g.fillRect(0, 0, cv.width, cv.height);
  for (const p of mini.campus) poly(p, C.campus);
  for (const [k, p] of mini.areas) poly(p, C[k]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const kind of ['path', 'road', 'road_main']) {               // 큰 길이 위로 오게
    g.strokeStyle = kind === 'path' ? '#efe4cb' : C[kind];
    for (const [a, b, w, mk] of mini.roads) {
      if (mk !== kind) continue;
      g.lineWidth = Math.max(1.5, w * K);
      const [u0, v0] = P(a), [u1, v1] = P(b);
      g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke();
    }
  }
  for (const b of buildings) {
    poly(b.poly, C[`roof_${b.style}`] || C.roof_misc);
    g.strokeStyle = 'rgba(60, 40, 30, .35)'; g.lineWidth = 1; g.stroke();
  }
  // 문: 벽 바깥에 짧은 흰 선
  g.strokeStyle = '#fffdf8'; g.lineCap = 'butt'; g.lineWidth = 2.5;
  for (const b of buildings) for (const d of b.doors || []) {
    if (d.level) continue;
    const half = [-d.n[1] * d.w / 2, d.n[0] * d.w / 2], o = [d.p[0] + d.n[0] * 0.8, d.p[1] + d.n[1] * 0.8];
    const [u0, v0] = P([o[0] - half[0], o[1] - half[1]]), [u1, v1] = P([o[0] + half[0], o[1] + half[1]]);
    g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke();
  }
  return cv;
}
