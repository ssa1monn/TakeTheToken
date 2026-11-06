// ───────────────────────────────────────────────
// OSM 파싱 + 2D 기하 유틸 (좌표: 지도 중심 기준 미터, x=동쪽, y=북쪽)
// ───────────────────────────────────────────────

export function parseOSM(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const b = doc.querySelector('bounds');
  const minlat = +b.getAttribute('minlat'), maxlat = +b.getAttribute('maxlat');
  const minlon = +b.getAttribute('minlon'), maxlon = +b.getAttribute('maxlon');
  const lat0 = (minlat + maxlat) / 2, lon0 = (minlon + maxlon) / 2;
  const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 110540;
  const proj = (lat, lon) => [(lon - lon0) * KX, (lat - lat0) * KY];

  const tagsOf = el => {
    const t = {};
    for (const x of el.children) if (x.tagName === 'tag') t[x.getAttribute('k')] = x.getAttribute('v');
    return t;
  };

  const nodes = new Map(), nodeTags = new Map();
  for (const n of doc.getElementsByTagName('node')) {
    nodes.set(n.getAttribute('id'), proj(+n.getAttribute('lat'), +n.getAttribute('lon')));
    if (n.children.length) nodeTags.set(n.getAttribute('id'), tagsOf(n));
  }
  const ways = [];
  const wayById = new Map();
  for (const w of doc.getElementsByTagName('way')) {
    const refs = [];
    for (const x of w.children) if (x.tagName === 'nd' && nodes.has(x.getAttribute('ref'))) refs.push(x.getAttribute('ref'));
    const way = { id: w.getAttribute('id'), refs, pts: refs.map(r => nodes.get(r)), tags: tagsOf(w) };
    ways.push(way);
    wayById.set(way.id, way);
  }
  const relations = [];
  for (const r of doc.getElementsByTagName('relation')) {
    const members = [];
    for (const x of r.children) if (x.tagName === 'member') members.push({ type: x.getAttribute('type'), ref: x.getAttribute('ref'), role: x.getAttribute('role') });
    relations.push({ tags: tagsOf(r), members });
  }
  return {
    halfW: (maxlon - minlon) / 2 * KX, halfH: (maxlat - minlat) / 2 * KY,
    nodes, nodeTags, ways, wayById, relations,
    proj, unproj: ([x, y]) => [lat0 + y / KY, lon0 + x / KX],   // 미터 ↔ 위경도
  };
}

// ── 다각형/선분
export const ring = pts => (pts.length > 1 && pts[0] === pts[pts.length - 1] ? pts.slice(0, -1) : pts);

export function area2(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}
export const ccw = pts => (area2(pts) < 0 ? pts.slice().reverse() : pts);
export const centroid = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

export function ptInPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
  }
  return c;
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function polyEdgeDist(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[(i + poly.length - 1) % poly.length], poly[i]));
  return d;
}

/** 반시계 다각형을 안쪽으로 t만큼 오프셋 (뾰족한 모서리는 3t로 제한) */
export function insetPoly(pts, t) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const n1 = leftNormal(a, p), n2 = leftNormal(p, b);
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < 1e-6) return [p[0] + n1[0] * t, p[1] + n1[1] * t];
    bx /= bl; by /= bl;
    const m = Math.min(t / Math.max(bx * n1[0] + by * n1[1], 0.2), t * 3);
    return [p[0] + bx * m, p[1] + by * m];
  });
}
function leftNormal(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [-dy / L, dx / L];
}

/** 여러 way 조각을 끝점끼리 이어 닫힌 고리로 */
export function stitch(segs) {
  segs = segs.filter(s => s.length).map(s => s.slice());
  const rings = [];
  while (segs.length) {
    let cur = segs.shift(), changed = true;
    while (cur[0] !== cur[cur.length - 1] && changed) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s[0] === cur[cur.length - 1]) cur = cur.concat(s.slice(1));
        else if (s[s.length - 1] === cur[cur.length - 1]) cur = cur.concat(s.slice().reverse().slice(1));
        else continue;
        segs.splice(i, 1); changed = true; break;
      }
    }
    rings.push(ring(cur));
  }
  return rings;
}

// ── 경계 사각형 자르기
export function makeClipper(halfW, halfH) {
  const inside = (p, m = 0) => Math.abs(p[0]) <= halfW - m && Math.abs(p[1]) <= halfH - m;

  // Liang–Barsky
  function clipSeg(a, b) {
    const [x0, y0] = a, dx = b[0] - x0, dy = b[1] - y0;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, x0 + halfW], [dx, halfW - x0], [-dy, y0 + halfH], [dy, halfH - y0]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
    return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy]];
  }

  // Sutherland–Hodgman
  function clipPoly(pts) {
    let out = pts;
    for (const [ax, v, s] of [[0, -halfW, 1], [0, halfW, -1], [1, -halfH, 1], [1, halfH, -1]]) {
      const inp = out; out = [];
      if (!inp.length) break;
      for (let i = 0; i < inp.length; i++) {
        const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
        const cin = (cur[ax] - v) * s >= 0, pin = (prev[ax] - v) * s >= 0;
        if (cin !== pin) {
          const t = (v - prev[ax]) / (cur[ax] - prev[ax]);
          out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
        }
        if (cin) out.push(cur);
      }
    }
    return out;
  }
  return { inside, clipSeg, clipPoly };
}

/** 재현 가능한 난수 (mulberry32) */
export function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
