import { DEPARTMENTS, indexHistory } from './market.js';
import { currentClock, timeLabel } from './campus.js';

const shortName = department => ({ 컴퓨터공학부: '컴퓨터공학', 정보통신공학과: '정보통신', 임베디드시스템공학과: '임베디드' })[department] ?? 'INU 종합';
const dateLabel = date => date?.slice(5).replace('-', '.') ?? '기록 없음';
const finite = value => typeof value === 'number' && Number.isFinite(value);

// Keep every recorded update. The chart joins real observations with straight
// segments; no smoothing, interpolation or invented noise changes the history.
export function overviewSeries(state, catalog, department = 'all', range = 'week', now = currentClock(state)) {
  const selected = department === 'all' ? null : department;
  const members = catalog.professors.filter(p => (!selected || p.department === selected) && state.stocks[p.id]?.history?.length);
  if (!members.length) return { points: [], current: null, change: 0, todayChange: 0, count: 0 };
  const reference = state.stocks[members[0].id].history;
  if (members.some(p => state.stocks[p.id].history.length !== reference.length)) return { points: [], current: null, change: 0, todayChange: 0, count: members.length };
  const history = indexHistory(state, { ...catalog, professors: members }, selected)
    .map((point, i) => ({ ...point, minute: reference[i].minute ?? 0, position: i }))
    .filter(point => finite(point.price) && point.date && (point.date < now.date || point.date === now.date && point.minute <= now.minute))
    .sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute || a.position - b.position);
  const current = history.at(-1) ?? null;
  const previous = history.filter(point => point.date < now.date).at(-1);
  const today = history.filter(point => point.date === now.date);
  const cutoffDate = new Date(`${now.date}T00:00:00Z`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (range === 'week' ? 7 : 30));
  const cutoff = range === 'all' ? '' : cutoffDate.toISOString().slice(0, 10);
  const points = range === 'today'
    ? today.length ? [...(previous ? [{ ...previous, isBaseline: true }] : []), ...today] : []
    : history.filter(point => point.date >= cutoff);
  // Keep a real dated observation for a quiet longer interval. Today must stay
  // explicitly empty until a current-day update exists; yesterday is not today.
  if (range !== 'today' && !points.length && current) points.push(current);
  const baseline = points[0]?.price;
  return {
    points, current, previous, waiting: range === 'today' && !today.length, count: members.length,
    change: baseline && current ? current.price / baseline - 1 : 0,
    todayChange: current?.date === now.date && previous?.price ? current.price / previous.price - 1 : 0,
  };
}

export function createMarketOverview({ getState, catalog, esc, number, pct, direction }) {
  function render({ department = 'all', range = 'week' } = {}) {
    const state = getState(), now = currentClock(state);
    const selected = department === 'all' || DEPARTMENTS.includes(department) ? department : 'all';
    const chosenRange = ['today', 'week', 'month', 'all'].includes(range) ? range : 'week';
    const model = overviewSeries(state, catalog, selected, chosenRange, now);
    const chips = ['all', ...DEPARTMENTS].map((dept, i) => {
      const data = overviewSeries(state, catalog, dept, chosenRange, now);
      return `<button class="mo-index-chip ${selected === dept ? 'selected' : ''}" data-action="filter-dept" data-id="${esc(dept)}" aria-pressed="${selected === dept}"><i class="mo-chip-symbol mo-symbol-${i}">${['I', 'C', 'N', 'E'][i]}</i><span>${shortName(dept)}</span><b class="${direction(data.todayChange)}">${pct(data.todayChange)}</b></button>`;
    }).join('');
    const width = 780, height = 184, left = 10, right = 60, top = 12, bottom = 27;
    const values = model.points.map(point => point.price);
    const low = values.length ? Math.min(...values) : 99, high = values.length ? Math.max(...values) : 101;
    const padding = Math.max(.05, (high - low) * .14), min = low - padding, max = high + padding;
    const x = i => model.points.length === 1 ? (left + width - right) / 2 : left + i / Math.max(1, model.points.length - 1) * (width - left - right);
    const y = value => top + (max - value) / (max - min) * (height - top - bottom);
    const positions = model.points.map((point, i) => ({ ...point, x: x(i), y: y(point.price) }));
    const path = positions.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
    const area = positions.length > 1 ? `${path} L${positions.at(-1).x},${height - bottom} L${positions[0].x},${height - bottom} Z` : '';
    const grid = Array.from({ length: 4 }, (_, i) => {
      const value = min + (max - min) * i / 3;
      return `<line x1="${left}" x2="${width - right + 8}" y1="${y(value)}" y2="${y(value)}" class="mo-grid-line"/><text x="${width - 4}" y="${y(value) + 4}" text-anchor="end" class="mo-axis">${value.toFixed(max - min < 1 ? 2 : 1)}</text>`;
    }).join('');
    const tickIndices = [...new Set([0, Math.floor((positions.length - 1) / 2), positions.length - 1])].filter(i => i >= 0 && i < positions.length);
    const axisLabel = point => chosenRange === 'today' ? point.isBaseline ? `${dateLabel(point.date)} 마감` : timeLabel(point.minute) : dateLabel(point.date);
    const ticks = tickIndices.map(i => `<text x="${x(i)}" y="${height - 7}" text-anchor="${i === 0 && positions.length > 1 ? 'start' : i === positions.length - 1 && positions.length > 1 ? 'end' : 'middle'}" class="mo-axis">${axisLabel(positions[i])}</text>`).join('');
    const end = positions.at(-1), start = positions[0];
    const series = positions.map(point => ({ x: point.x, y: point.y, value: number(point.price), date: `${dateLabel(point.date)} ${timeLabel(point.minute)}${point.isBaseline ? ' · 직전 마감' : ''}`, change: pct(start?.price ? point.price / start.price - 1 : 0) }));
    const gradientId = `mo-area-${selected === 'all' ? 0 : DEPARTMENTS.indexOf(selected) + 1}`;
    const caption = `${shortName(selected)} 지수. ${positions.length}개 가격 기록${model.current ? `, 최근 ${number(model.current.price)} 포인트` : ''}. 좌우 방향키로 시점별 지수를 확인할 수 있어요.`;
    return `<section class="market-overview" aria-label="캠퍼스 지수 차트"><div class="mo-intro"><div><span class="mo-eyebrow"><i></i>CAMPUS INDEX</span><h2>캠퍼스 실시간 지수</h2></div><span class="mo-intro-note">한 줄 평이 모여 만드는 우리 학교 증시</span></div><div class="mo-index-switch" aria-label="지수 선택 · 오늘 등락률">${chips}</div><div class="mo-chart-heading"><div><span class="mo-selected-name">${shortName(selected)}${model.waiting ? '<small>직전 기록 · 오늘 갱신 대기</small>' : ''}</span><div class="mo-value"><strong>${model.current ? number(model.current.price) : '—'}</strong><span>pt</span><b class="${direction(model.change)}">${model.waiting ? '대기 중' : pct(model.change)}<small>${chosenRange === 'today' ? '오늘' : '선택 기간'}</small></b></div></div><div class="mo-range" aria-label="캠퍼스 지수 기간">${[['today', '오늘'], ['week', '1주'], ['month', '1개월'], ['all', '전체']].map(([key, label]) => `<button class="${key === chosenRange ? 'active' : ''}" data-action="overview-range" data-id="${key}" aria-pressed="${key === chosenRange}">${label}</button>`).join('')}</div></div><div class="mo-chart" tabindex="0" role="group" aria-label="${esc(caption)}" data-mo-points="${esc(JSON.stringify(series))}"><div class="mo-readout"><span data-mo-date>${end ? `${dateLabel(end.date)} ${timeLabel(end.minute)}` : '아직 기록이 없어요'}</span><b data-mo-value>${end ? number(end.price) : '—'}<small> pt</small></b><span data-mo-change>${pct(model.change)}</span></div>${positions.length ? `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6475b9" stop-opacity=".22"/><stop offset="100%" stop-color="#6475b9" stop-opacity=".015"/></linearGradient></defs>${grid}${area ? `<path d="${area}" fill="url(#${gradientId})"/>` : ''}${start ? `<line x1="${left}" x2="${width - right + 8}" y1="${y(start.price)}" y2="${y(start.price)}" class="mo-baseline"/>` : ''}<path d="${path}" class="mo-price-line"/><line data-mo-crosshair x1="${end.x}" x2="${end.x}" y1="${top}" y2="${height - bottom}" class="mo-crosshair"/><circle data-mo-dot cx="${end.x}" cy="${end.y}" r="4.5" class="mo-point"/>${ticks}</svg>` : `<div class="mo-no-data"><strong>${chosenRange === 'today' ? '오늘의 첫 움직임을 기다리는 중' : '지수 기록을 기다리는 중'}</strong><span>${model.current ? `직전 지수 ${number(model.current.price)} pt · ${dateLabel(model.current.date)} ${timeLabel(model.current.minute)}` : '기록이 생기면 실제 갱신 시점마다 그래프를 이어요.'}</span></div>`}</div><div class="mo-chart-footer"><span><i></i> ${model.count}명 교수님 동일 비중 · 학기 시작 100 pt</span><span>${start ? chosenRange === 'today' ? `${dateLabel(now.date)} · 당일 전체 갱신` : `${dateLabel(start.date)} — ${dateLabel(end.date)}` : '기록 대기'}<span class="mo-baseline-key">점선: 비교 기준</span></span></div></section>`;
  }

  function mount(root = document) {
    root.querySelectorAll('.mo-chart[data-mo-points]').forEach(chart => {
      const points = JSON.parse(chart.dataset.moPoints || '[]');
      const svg = chart.querySelector('svg');
      if (!points.length || !svg) return;
      let active = points.length - 1;
      const show = index => {
        active = Math.max(0, Math.min(points.length - 1, index));
        const point = points[active];
        chart.querySelector('[data-mo-date]').textContent = point.date;
        chart.querySelector('[data-mo-value]').textContent = `${point.value} pt`;
        chart.querySelector('[data-mo-change]').textContent = point.change;
        const crosshair = chart.querySelector('[data-mo-crosshair]');
        crosshair.setAttribute('x1', point.x); crosshair.setAttribute('x2', point.x);
        const dot = chart.querySelector('[data-mo-dot]');
        dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y);
      };
      chart.addEventListener('pointermove', event => {
        const rect = svg.getBoundingClientRect();
        const target = (event.clientX - rect.left) / Math.max(1, rect.width) * 780;
        const index = points.reduce((best, point, i) => Math.abs(point.x - target) < Math.abs(points[best].x - target) ? i : best, 0);
        chart.classList.add('is-inspecting'); show(index);
      });
      chart.addEventListener('pointerleave', () => { if (document.activeElement !== chart) { chart.classList.remove('is-inspecting'); show(points.length - 1); } });
      chart.addEventListener('focus', () => chart.classList.add('is-inspecting'));
      chart.addEventListener('blur', () => { chart.classList.remove('is-inspecting'); show(points.length - 1); });
      chart.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        show(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : active + (event.key === 'ArrowLeft' ? -1 : 1));
      });
    });
  }
  return { render, mount };
}
