import { currentClock, timeLabel } from './campus.js';
import { dateObjectForDay } from './market.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clockMinute = point => finite(point.minute) ? point.minute : Number(point.label?.match(/(\d{2}):(\d{2})$/)?.[1] ?? 0) * 60 + Number(point.label?.match(/(\d{2}):(\d{2})$/)?.[2] ?? 0);
const dayLabel = date => date.slice(5).replace('-', '.');
const direction = value => value > .000001 ? 'cc-up' : value < -.000001 ? 'cc-down' : 'cc-flat';

/** Monotone cubic control points stay inside each observed segment's price range. */
export function monotoneSegments(points) {
  if (points.length < 2) return [];
  const slopes = points.slice(1).map((point, i) => (point.y-points[i].y)/(point.x-points[i].x));
  const tangents = points.map((point,i) => i===0 ? slopes[0] : i===points.length-1 ? slopes.at(-1) : slopes[i-1]*slopes[i] <= 0 ? 0 : 2/(1/slopes[i-1]+1/slopes[i]));
  for (let i=0;i<slopes.length;i++) {
    if (slopes[i] === 0) { tangents[i]=0; tangents[i+1]=0; continue; }
    const alpha=tangents[i]/slopes[i], beta=tangents[i+1]/slopes[i];
    const length=Math.hypot(alpha,beta);
    if (length>3) { tangents[i]=3/length*alpha*slopes[i]; tangents[i+1]=3/length*beta*slopes[i]; }
  }
  return points.slice(1).map((end,i)=>{
    const start=points[i], third=(end.x-start.x)/3;
    return { start, c1:{x:start.x+third,y:start.y+tangents[i]*third}, c2:{x:end.x-third,y:end.y-tangents[i+1]*third}, end };
  });
}

export function smoothPath(points) {
  if (!points.length) return '';
  return `M${points[0].x},${points[0].y} ${monotoneSegments(points).map(segment=>`C${segment.c1.x},${segment.c1.y} ${segment.c2.x},${segment.c2.y} ${segment.end.x},${segment.end.y}`).join(' ')}`.trim();
}

/** Aggregate recorded observations only. No fabricated high, low or event is added here. */
export function buildCandles(history, clock, range = 'month') {
  const start = new Date(`${clock.date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (range === 'week' ? 7 : range === 'month' ? 30 : 0));
  const cutoff = range === 'all' ? '' : start.toISOString().slice(0, 10);
  const raw = (history ?? []).map((point, index) => ({
    ...point, index,
    date: point.date ?? (Number.isInteger(point.day) ? dateObjectForDay(point.day).toISOString().slice(0, 10) : null),
    minute: clockMinute(point),
  })).filter(point => point.date && finite(point.close ?? point.price))
    .sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute || a.index - b.index);
  const candles = new Map();
  let previousClose;
  for (const point of raw) {
    const close = point.close ?? point.price;
    const open = finite(point.open) ? point.open : previousClose ?? close;
    previousClose = close;
    if (point.date > clock.date || point.date === clock.date && point.minute > clock.minute || point.date < cutoff) continue;
    const high = Math.max(open, close, finite(point.high) ? point.high : close);
    const low = Math.min(open, close, finite(point.low) ? point.low : close);
    const minute = range === 'today' ? Math.floor(point.minute / 30) * 30 : 0;
    const key = range === 'today' ? `${point.date}:T${minute}` : point.date;
    const causes = (point.causes ?? []).map(cause => ({ ...cause }));
    const update = { key: `${point.date}:${point.minute}:${point.day ?? point.index}`, date: point.date, minute: point.minute, open, high, low, close, change: open ? close / open - 1 : 0, causes, legacy: !!point.legacy || !finite(point.open) };
    if (!candles.has(key)) candles.set(key, {
      key, date: point.date, minute, label: range === 'today' ? `${dayLabel(point.date)} ${timeLabel(minute)}` : dayLabel(point.date),
      open, high, low, close, price: close, updates: [], causes: [], legacy: false,
    });
    const candle = candles.get(key);
    candle.high = Math.max(candle.high, high);
    candle.low = Math.min(candle.low, low);
    candle.close = candle.price = close;
    candle.updates.push(update);
    candle.causes.push(...causes);
    candle.legacy ||= update.legacy;
  }
  return [...candles.values()].map(candle => ({
    ...candle,
    eventCount: candle.causes.filter(cause => ['news', 'review'].includes(cause.type)).length,
    newsCount: candle.causes.filter(cause => cause.type === 'news').length,
    reviewCount: candle.causes.filter(cause => cause.type === 'review').length,
  }));
}

export function createCandleChartUI({ getState, esc, number, pct, icon }) {
  const isStory = cause => ['news','review'].includes(cause.type);
  const labelFor = cause => ({ news: '캠퍼스 소식', review: '강의평 반영' })[cause.type] ?? '시연 변동';
  const variationTitle = cause => /한도|반올림|조정/.test(cause.title ?? '') ? '가격 한도·반올림' : cause.type === 'flow' ? '시연 변동' : cause.title || '시연 변동';
  const precisePct = value => Math.abs(value) > 0 && Math.abs(value) < .00005 ? `${value > 0 ? '+' : ''}${(value*100).toFixed(4)}%` : pct(value);

  function causeCard(cause) {
    return `<article class="cc-cause"><div class="cc-cause-title"><span class="cc-cause-label cc-${esc(cause.type)}">${labelFor(cause)}</span><strong>${esc(cause.title)}</strong><b class="${direction(cause.impact ?? 0)}">${pct(cause.impact ?? 0)}</b></div>${cause.summary ? `<p>${esc(cause.summary)}</p>` : ''}${cause.type === 'review' ? `<div class="cc-review-stats">${finite(cause.count) ? `<span>응답 <strong>${cause.count}명</strong></span>` : ''}${finite(cause.score) ? `<span>회차 보정점수 <strong>${number(cause.score)} / 100</strong></span>` : ''}</div>${(cause.reviews ?? []).slice(0, 3).map(review => `<blockquote><span>${esc(review.nickname ?? '가상 수강생')}${finite(review.score) ? `<small>★ ${(1 + review.score / 25).toFixed(1)}</small>` : ''}</span><p>${esc(review.comment || '점수로 수업 경험을 남겼어요.')}</p></blockquote>`).join('')}${cause.reviewsOmitted ? '<p>오래된 기록은 응답 수와 점수만 보관하고 있어요.</p>' : ''}` : ''}</article>`;
  }

  function selectedPanel(candle) {
    const change = candle.open ? candle.close / candle.open - 1 : 0;
    const updates = candle.updates.filter(update => update.causes.length || Math.abs(update.change) > .000001);
    const stories = updates.filter(update => update.causes.some(isStory));
    const variationOnly = updates.filter(update => update.causes.length && !update.causes.some(isStory));
    const withoutEvidence = updates.filter(update => !update.causes.length);
    const renderUpdate = update => {
      const total = update.causes.reduce((sum, cause) => sum + (finite(cause.impact) ? cause.impact : 0), 0);
      const residual = update.change - total;
      const variations=update.causes.filter(cause=>!isStory(cause));
      return `<div class="cc-update"><div class="cc-update-heading"><span>${dayLabel(update.date)} ${timeLabel(update.minute)} 반영</span><strong>${number(update.open)} <i>→</i> ${number(update.close)} <small>유니코인</small> <b class="${direction(update.change)}">${pct(update.change)}</b></strong></div>${update.causes.filter(isStory).map(causeCard).join('')}${variations.length ? `<div class="cc-variation-summary"><span>시연 변동·가격 조정</span><b class="${direction(variations.reduce((sum,cause)=>sum+(cause.impact??0),0))}">${pct(variations.reduce((sum,cause)=>sum+(cause.impact??0),0))}</b></div><details class="cc-adjustment-details"><summary>세부값</summary>${variations.map(cause=>`<div><span>${esc(variationTitle(cause))}</span><b class="${direction(cause.impact??0)}">${precisePct(cause.impact??0)}</b></div>`).join('')}</details>` : ''}${Math.abs(residual) > .0000001 ? `<div class="cc-rounding"><span>${update.causes.length ? '상하한·반올림 조정' : '이전 기록 · 세부 요인 미저장'}</span><b class="${direction(residual)}">${precisePct(residual)}</b></div>` : ''}</div>`;
    };
    return `<section class="cc-event-panel" aria-label="선택 시점의 가격 변동 이유"><header><div><span>CHART STORY</span><h3>${candle.label} · 이때 무슨 일이?</h3></div><button data-action="chart-event" data-id="" aria-label="가격 변동 이유 닫기">${icon('close')}</button></header><div class="cc-event-result"><span>이 봉의 가격</span><strong>${number(candle.open)} <i>→</i> ${number(candle.close)} <em>유니코인</em></strong><b class="${direction(change)}">${pct(change)}</b><small>뉴스 ${candle.newsCount} · 강의평 반영 ${candle.reviewCount}</small></div>${stories.map(renderUpdate).join('')}${variationOnly.length ? `<details class="cc-variation-history"><summary>시연 변동 ${variationOnly.length}회 <span>추가 가격 변화 보기</span>${icon('chevron')}</summary>${variationOnly.map(renderUpdate).join('')}</details>` : ''}${withoutEvidence.length ? '<p class="cc-no-cause">이전 버전 기록: 원인 기록 없음. 당시 가격만 남아 있어 뉴스나 강의평을 연결할 수 없어요.</p>' : !updates.length ? '<p class="cc-no-cause">이 구간에는 새로 반영된 뉴스나 강의평이 없어요.</p>' : ''}<p class="cc-method-note">각 요인의 %는 해당 갱신 직전 가격 기준이에요. 봉 전체 등락률은 갱신별 변화를 복리로 연결한 값이에요.${candle.legacy ? '<br>이전 기록의 고가·저가는 저장된 종가 사이 범위로 표시해요.' : ''}</p></section>`;
  }

  function render(stock, professor, { range = 'month', chartType = 'candle', selectedCandleKey = null } = {}) {
    const now = currentClock(getState());
    const all = buildCandles(stock.history, now, range);
    const candles = all.slice(-84);
    if (!candles.length) return `<div class="cc-empty"><strong>아직 오늘의 캔들이 없어요.</strong><p>새 시세가 들어오면 첫 봉이 그려져요. 다른 기간의 기록도 볼 수 있어요.</p></div>`;
    const selected = candles.find(candle => candle.key === selectedCandleKey);
    const latest = selected ?? candles.at(-1);
    const first = candles[0];
    const periodChange = first.open ? candles.at(-1).close / first.open - 1 : 0;
    const low = Math.min(...candles.map(candle => candle.low));
    const high = Math.max(...candles.map(candle => candle.high));
    const padding = Math.max(.4, (high - low) * .14);
    const min = low - padding, max = high + padding;
    const left = 18, right = 818, top = 18, bottom = 246, width = 900, height = 332;
    const slot = (right - left) / Math.max(candles.length, 5);
    const x = i => candles.length < 5 ? left + (right-left) / 2 + (i - (candles.length - 1) / 2) * slot : left + (i + .5) * slot;
    const y = value => top + (max - value) / (max - min) * (bottom - top);
    const bodyWidth = Math.max(2, Math.min(13, slot * .56));
    const points = candles.map((candle, index) => ({ key: candle.key, x: x(index), y: y(candle.close), label: candle.label, open: number(candle.open), high: number(candle.high), low: number(candle.low), close: number(candle.close), change: pct(candle.open ? candle.close / candle.open - 1 : 0), direction: direction(candle.close - candle.open) }));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = min + (max-min)*index/4;
      return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="cc-gridline"/><text x="889" y="${y(value)+4}" text-anchor="end">${number(value)}</text>`;
    }).join('');
    const bodies = candles.map((candle, index) => {
      const cx = x(index), delta = candle.close - candle.open;
      return `<g class="cc-candle ${direction(delta)} ${candle.key === selectedCandleKey ? 'is-selected' : ''}"><line x1="${cx}" x2="${cx}" y1="${y(candle.high)}" y2="${y(candle.low)}"/><rect x="${cx - bodyWidth/2}" y="${Math.min(y(candle.open),y(candle.close))}" width="${bodyWidth}" height="${Math.max(1.5,Math.abs(y(candle.open)-y(candle.close)))}" rx=".7"/></g>`;
    }).join('');
    const path = smoothPath(points);
    const lineColor=periodChange < 0 ? '#3879ed' : '#ef4b61';
    const line = `<path class="cc-smooth-line" d="${path}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${points.at(-1).x}" cy="${points.at(-1).y}" r="3" fill="${lineColor}"/>`;
    const labels = [...new Set([0, Math.floor((candles.length-1)/3),Math.floor((candles.length-1)*2/3),candles.length-1])].map(index => `<text x="${x(index)}" y="319" text-anchor="${index===0?'start':index===candles.length-1?'end':'middle'}">${range === 'today' ? timeLabel(candles[index].minute) : candles[index].label}</text>`).join('');
    const hits = candles.map((candle,index) => `<rect class="cc-candle-hit" data-action="chart-event" data-id="${esc(candle.key)}" x="${x(index)-slot/2}" y="${top}" width="${slot}" height="${bottom-top}" fill="transparent"><title>${candle.label}: 시가 ${number(candle.open)}, 고가 ${number(candle.high)}, 저가 ${number(candle.low)}, 종가 ${number(candle.close)} 유니코인. 클릭하면 변동 이유.</title></rect>`).join('');
    const markers = candles.map((candle,index) => candle.eventCount ? `<button class="cc-event-marker ${candle.key===selectedCandleKey?'selected':''} ${candle.newsCount && candle.reviewCount ? 'mixed' : candle.newsCount ? 'news' : 'review'}" style="left:${x(index)/width*100}%" data-action="chart-event" data-id="${esc(candle.key)}" aria-label="${candle.label} 뉴스 ${candle.newsCount}건, 강의평 ${candle.reviewCount}건 보기" aria-pressed="${candle.key===selectedCandleKey}" title="${candle.label} · 뉴스 ${candle.newsCount} / 강의평 ${candle.reviewCount}"><span>${candle.newsCount && candle.reviewCount ? 'N·R' : candle.newsCount ? 'N' : 'R'}</span>${candle.eventCount > 1 ? `<small>${candle.eventCount}</small>` : ''}</button>` : '').join('');
    const initial = points.find(point => point.key===latest.key);
    return `<div class="cc-toolbar"><div><span class="cc-interval">${range==='today'?'30분봉':'일봉'}</span><span class="cc-currency">유니코인</span><span class="cc-period ${direction(periodChange)}">선택 기간 ${pct(periodChange)}</span>${all.length>candles.length?`<small>최근 ${candles.length}개 봉</small>`:''}</div><div class="cc-types" aria-label="차트 표시 방식"><button data-action="chart-type" data-id="candle" aria-pressed="${chartType==='candle'}" class="${chartType==='candle'?'active':''}">캔들</button><button data-action="chart-type" data-id="line" aria-pressed="${chartType==='line'}" class="${chartType==='line'?'active':''}">라인</button></div></div><div class="cc-chart ${candles.length > 32 ? 'cc-dense' : ''} ${candles.length > 55 ? 'cc-very-dense' : ''}" data-cc-points="${esc(JSON.stringify(points))}" data-selected-key="${esc(latest.key)}"><div class="cc-ohlc"><strong class="cc-ohlc-date">${latest.label}</strong>${[['open','시'],['high','고'],['low','저'],['close','종']].map(([key,label])=>`<span>${label} <b data-cc-value="${key}">${number(latest[key])}</b></span>`).join('')}<em class="${direction(latest.close-latest.open)}" data-cc-value="change">${pct(latest.close/latest.open-1)}</em></div><div class="cc-plot"><svg class="cc-chart-svg" viewBox="0 0 ${width} ${height}" role="img" tabindex="0" aria-label="${esc(professor.name)} ${chartType==='line'?'라인':'캔들'} 차트. ${range==='today'?'30분봉':'일봉'} ${candles.length}개, 시작 ${number(first.open)}, 현재 ${number(candles.at(-1).close)} 유니코인. 좌우 방향키로 탐색하고 Enter로 변동 이유를 열 수 있어요.">${grid}${chartType==='line'?line:bodies}${labels}<line x1="${left}" x2="${right}" y1="266" y2="266" class="cc-event-track"/>${hits}<g class="cc-crosshair" visibility="hidden" pointer-events="none"><line x1="${initial.x}" x2="${initial.x}" y1="${top}" y2="${bottom}"/><circle cx="${initial.x}" cy="${initial.y}" r="4"/></g></svg><div class="cc-marker-layer">${markers}</div><div class="cc-tooltip" hidden><small>${initial.label}</small><strong>${initial.close}</strong><span>유니코인</span></div></div></div><div class="cc-legend"><span><i class="cc-legend-news">N</i>뉴스</span><span><i class="cc-legend-review">R</i>강의평</span><span>표시를 누르면 당시 반응과 변동 이유를 볼 수 있어요</span></div>${selected ? selectedPanel(selected) : '<div class="cc-chart-hint">📍 캔들이 움직인 이유가 궁금하다면? <strong>N · R 표시를 눌러보세요.</strong></div>'}`;
  }

  function mount(root = document) {
    const chart = root.querySelector('.cc-chart');
    if (!chart) return;
    const points = JSON.parse(chart.dataset.ccPoints);
    if (!points.length) return;
    const svg = chart.querySelector('.cc-chart-svg');
    const crosshair = svg.querySelector('.cc-crosshair');
    const crossline = crosshair.querySelector('line'), dot = crosshair.querySelector('circle');
    const tooltip = chart.querySelector('.cc-tooltip');
    const selectedIndex=points.findIndex(point=>point.key===chart.dataset.selectedKey);
    const initialIndex=selectedIndex<0?points.length-1:selectedIndex;
    const initial = points[initialIndex];
    let index = initialIndex;
    const updateOhlc = point => {
      chart.querySelector('.cc-ohlc-date').textContent = point.label;
      for (const key of ['open','high','low','close','change']) chart.querySelector(`[data-cc-value="${key}"]`).textContent = point[key];
      chart.querySelector('[data-cc-value="change"]').className = point.direction;
    };
    const show = position => {
      index = Math.max(0,Math.min(points.length-1,position));
      const point = points[index];
      updateOhlc(point);
      crosshair.setAttribute('visibility','visible');
      crossline.setAttribute('x1',point.x); crossline.setAttribute('x2',point.x);
      dot.setAttribute('cx',point.x); dot.setAttribute('cy',point.y);
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8,Math.min(85,point.x/900*100))}%`;
      tooltip.style.top = `${Math.max(3,Math.min(63,point.y/332*100-17))}%`;
      tooltip.querySelector('small').textContent = point.label;
      tooltip.querySelector('strong').textContent = point.close;
    };
    svg.addEventListener('pointermove', event => {
      const bounds = svg.getBoundingClientRect();
      const position = (event.clientX-bounds.left)/bounds.width*900;
      let nearest = 0;
      for (let i=1;i<points.length;i++) if (Math.abs(points[i].x-position)<Math.abs(points[nearest].x-position)) nearest=i;
      show(nearest);
    });
    const hide = () => { crosshair.setAttribute('visibility','hidden'); tooltip.hidden=true; updateOhlc(initial); };
    svg.addEventListener('pointerleave',hide);
    svg.addEventListener('blur',hide);
    svg.addEventListener('focus',()=>show(index));
    svg.addEventListener('keydown',event=>{
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        show(event.key==='Home'?0:event.key==='End'?points.length-1:index+(event.key==='ArrowRight'?1:-1));
      } else if (['Enter',' '].includes(event.key)) {
        event.preventDefault();
        [...svg.querySelectorAll('.cc-candle-hit')].find(hit=>hit.dataset.id===points[index].key)?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      }
    });
  }
  return { render, mount };
}
