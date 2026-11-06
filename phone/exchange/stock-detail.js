import { currentClock, timeLabel } from './campus.js';
import { createCandleChartUI } from './candle-chart.js';
import { professorInitials, ratingStars } from './identity.js';

// This screen reads the simulation state. It never creates prices or student activity.
export function createStockDetailUI(context) {
  const { getState, catalog, icon, esc, pct, number, direction, prof, course, colorFor, live } = context;
  const candles = createCandleChartUI({ getState, esc, number, pct, icon });
  const priceClass = value => value > .000001 ? 'sd-up' : value < -.000001 ? 'sd-down' : 'sd-flat';
  const ticker = p => `INU${String(catalog.professors.indexOf(p) + 1).padStart(3, '0')}`;
  const courseById = new Map(catalog.courses.map(c => [c.id, c]));
  let reviewCache = null;
  let cachedState = null;
  let cachedDay = null;

  function invalidateReviews() {
    reviewCache = null;
  }

  function reviewsFor(id) {
    const state = getState();
    // A render can ask for all 41 tickers repeatedly while sorting. Scan the shared
    // history once, then reuse the per-professor arrays until the next UI render.
    if (!reviewCache || cachedState !== state || cachedDay !== state.day) {
      const now = currentClock(state);
      const grouped = new Map();
      const add = r => {
        const c = courseById.get(r.courseId);
        if (!c || !Number.isFinite(r.score)) return;
        if (r.date > now.date || (r.date === now.date && r.minute > now.minute)) return;
        if (!grouped.has(c.professorId)) grouped.set(c.professorId, new Map());
        grouped.get(c.professorId).set(r.id ?? `${r.date}:${r.courseId}:${r.nickname}:${r.comment}`, { ...r, professorId: c.professorId });
      };
      for (const archive of Object.values(state.reviewArchive ?? {})) for (const r of archive) add(r);
      for (const r of state.reviewFeed ?? []) add(r);
      for (const batch of Object.values(state.classBatches ?? {})) for (const r of batch.reviews) add(r);
      for (const [key, r] of Object.entries(state.userReviews ?? {})) {
        add({ ...r, id: `own:${key}`, courseId: key.slice(11), nickname: '나의 한 줄 평', source: 'self' });
      }
      reviewCache = new Map([...grouped].map(([professorId, rows]) => [professorId, [...rows.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.minute ?? 0) - (a.minute ?? 0))]));
      cachedState = state;
      cachedDay = state.day;
    }
    return reviewCache.get(id) ?? [];
  }

  function relatedEvents(p) {
    const now = currentClock(getState());
    return getState().events.filter(e => (e.type === 'research' && e.targetId === p.id || e.type === 'department' && e.targetId === p.department) && (!e.date || e.date < now.date || e.date === now.date && e.minute <= now.minute)).sort((a,b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.minute ?? 0) - (a.minute ?? 0) || b.day - a.day);
  }

  function commentCard(r) {
    const state = getState(), c = course(r.courseId);
    const rating = 1 + r.score / 25;
    const tone = r.score >= 72 ? ['sd-positive', '이해도 떡상'] : r.score < 45 ? ['sd-critical', '복습이 필요해'] : ['sd-neutral', '차근차근 소화 중'];
    const nickname = r.nickname ?? '가상 수강생';
    return `<article class="sd-comment"><div class="sd-comment-top"><span class="sd-comment-avatar" style="--sd-avatar:${colorFor(c.professorId)}">${esc(nickname.slice(0, 1))}</span><div><strong>${esc(nickname)}${r.source === 'self' ? '<b class="sd-self">나</b>' : ''}</strong><small>${r.date?.slice(5).replace('-', '.') ?? ''} ${timeLabel(r.minute ?? 0)} · ${esc(c.name)}</small></div><span class="sd-stars" aria-label="${rating.toFixed(1)}점">★ <b>${rating.toFixed(1)}</b></span></div><p>${esc(r.comment || '점수로 수업 경험을 남겼어요.')}</p><div class="sd-comment-bottom"><span class="sd-tone ${tone[0]}">${tone[1]}</span><button class="sd-like ${state.commentLikes?.[r.id] ? 'is-liked' : ''}" data-action="like-comment" data-id="${esc(r.id)}" aria-label="${esc(nickname)} 한 줄 평 공감" aria-pressed="${!!state.commentLikes?.[r.id]}">${state.commentLikes?.[r.id] ? '♥' : '♡'} 공감${state.commentLikes?.[r.id] ? ' 1' : ''}</button></div></article>`;
  }

  function commentPanel(p, reviews, options) {
    const sorted = [...reviews];
    if (options.commentSort === 'positive') sorted.sort((a, b) => b.score - a.score);
    if (options.commentSort === 'critical') sorted.sort((a, b) => a.score - b.score);
    const commentLimit = options.commentLimit;
    return `<div class="sd-community-heading"><div><h2>수업 끝나고, 진짜 하고 싶은 말.</h2><p>수강생들의 한 줄로 읽는 ${esc(p.name)} 종목</p></div><div class="sd-comment-sort" aria-label="한 줄 평 정렬">${[['recent', '최신순'], ['positive', '높은 평점순'], ['critical', '낮은 평점순']].map(([key, label]) => `<button data-action="stock-comment-sort" data-id="${key}" class="${options.commentSort === key ? 'active' : ''}">${label}</button>`).join('')}</div></div><div class="sd-comments">${sorted.slice(0, commentLimit).map(commentCard).join('') || '<div class="sd-empty"><span>✍️</span><h3>아직 이 종목의 한 줄 평이 없어요</h3><p>강의가 끝나면 수강생들의 반응이 쌓여요.</p></div>'}</div>${sorted.length > commentLimit ? `<button class="sd-more" data-action="stock-more" data-id="${commentLimit + 12}">한 줄 평 더 보기 <span>${Math.min(commentLimit, sorted.length)} / ${sorted.length}</span>${icon('chevron')}</button>` : ''}<p class="sd-content-note">닉네임·점수·한 줄 평은 시연용 가상 데이터예요.</p>`;
  }

  function newsPanel(events) {
    return `<div class="sd-news-list">${events.map(e => `<button class="sd-news-item" data-action="news-detail" data-id="${esc(e.id)}"><span class="sd-news-icon ${priceClass(e.impact)}">${icon(e.impact < 0 ? 'info' : 'spark')}</span><span class="sd-news-copy"><small>${e.displayOnly ? '이전 소식 · ' : ''}${esc(e.label ?? (e.type === 'department' ? '학과 소식' : '연구 소식'))} · ${e.date ? e.date.slice(5).replace('-', '.') : '이전 기록'} ${e.minute != null ? timeLabel(e.minute) : ''}</small><strong>${esc(e.title)}</strong><p>${esc(e.summary)}</p></span><span class="sd-news-change ${e.displayOnly || !e.impact ? 'sd-flat' : priceClass(e.impact)}">${e.displayOnly ? '시세 미반영' : e.impact ? pct(e.impact) : '정보 알림'}${icon('chevron')}</span></button>`).join('') || '<div class="sd-empty"><span>📰</span><h3>새로운 소식을 기다리고 있어요</h3><p>교수님 연구 소식과 학과 공시가 여기에 모여요.</p></div>'}</div><p class="sd-content-note">모든 뉴스는 시연을 위해 만들어진 가상 공시예요.</p>`;
  }

  function courseSchedule(c) {
    if (!c.meetings.length) return '시간 미정';
    return [...new Set(c.meetings.map(m => m.day))].map(day => {
      const meetings = c.meetings.filter(m => m.day === day).sort((a, b) => a.start.localeCompare(b.start));
      return `${day} ${meetings[0].start}–${meetings.at(-1).end}`;
    }).join(' · ');
  }

  function coursesPanel(p) {
    const state = getState();
    return `<div class="sd-course-list">${p.courseIds.map(cid => {
      const c = course(cid), selected = state.selectedCourseIds.includes(cid), status = live.statusFor(c);
      return `<article class="sd-course"><span class="sd-course-icon">${icon('book')}</span><div><h3>${esc(c.name)}${selected ? '<span>내 수업</span>' : ''}</h3><p>${esc(courseSchedule(c))}</p><small>${esc(c.code)} · ${c.credits}학점 · ${esc(c.type)}</small></div>${selected ? `<button class="sd-course-review" data-action="review" data-id="${esc(cid)}" ${status.canRate ? '' : 'disabled'} title="${esc(status.reason)}">${status.submitted ? '평가 완료' : status.canRate ? '평가하기' : '평가 대기'}</button>` : `<span class="sd-course-credit">${c.credits}<small>학점</small></span>`}</article>`;
    }).join('')}</div>`;
  }

  function reviewRail(p, reviews) {
    const state = getState();
    const count = reviews.length;
    const average = count ? reviews.reduce((sum, r) => sum + (1 + r.score / 25), 0) / count : null;
    const groups = [reviews.filter(r => r.score >= 72).length, reviews.filter(r => r.score >= 45 && r.score < 72).length, reviews.filter(r => r.score < 45).length];
    const own = p.courseIds.map(course).filter(c => state.selectedCourseIds.includes(c.id));
    const available = own.filter(c => live.statusFor(c).canRate);
    return `<aside class="sd-rail"><section class="sd-rail-card"><div class="sd-rail-title"><h2>수강생 온도</h2><span>가상 평가</span></div><div class="sd-temperature"><strong>${average == null ? '—' : average.toFixed(1)}</strong><span>${ratingStars(average)}<small>저장된 응답 ${count.toLocaleString('ko-KR')}개</small></span></div><div class="sd-sentiment-bar">${groups.map((n, i) => `<i class="sd-sentiment-${i}" style="flex:${count ? n : 1}"></i>`).join('')}</div><div class="sd-sentiment-labels">${['좋았어요', '보통이에요', '아쉬워요'].map((label, i) => `<span><i class="sd-sentiment-${i}"></i>${label}<b>${count ? Math.round(groups[i] / count * 100) : 0}%</b></span>`).join('')}</div><p class="sd-rail-hint">보관된 가상 응답의 단순 평균이에요.</p></section><section class="sd-rail-card sd-review-cta"><span class="sd-cta-symbol">✍️</span><h2>오늘 수업은 어땠나요?</h2><p>${own.length ? '당일 수업이 끝나면 평가가 열려요. 당신의 한 줄도 시세에 반영돼요.' : '내 시간표에 담긴 강의의 수업이 끝나면 직접 평가할 수 있어요.'}</p>${own.map(c => {
      const status = live.statusFor(c);
      return `<div class="sd-eligibility"><span>${esc(c.name)}</span><small class="${status.canRate ? 'available' : ''}">${status.submitted ? '오늘 평가 완료' : status.canRate ? '평가 가능' : status.status === 'not_today' ? '오늘 수업 없음' : `${timeLabel(status.end)} 종료 후`}</small></div>`;
    }).join('')}${available.length ? available.map(c => `<button class="sd-primary" data-action="review" data-id="${esc(c.id)}">${esc(c.name)} 평가하기 ${icon('arrow')}</button>`).join('') : own.length ? `<button class="sd-primary" disabled>${own.some(c => live.statusFor(c).submitted) ? '오늘 평가를 마쳤어요' : '수업 종료 후 만나요'}</button>` : '<button class="sd-primary" data-action="edit">내 시간표 편집하기</button>'}</section><section class="sd-rail-card sd-overview"><h2>종목 정보</h2><dl><div><dt>종목 코드</dt><dd>${ticker(p)}</dd></div><div><dt>개설 학과</dt><dd>${esc(p.department)}</dd></div><div><dt>연결 강의</dt><dd>${p.courseIds.length}개</dd></div><div><dt>시즌 기준가</dt><dd>100.00</dd></div></dl></section></aside>`;
  }

  function render(id, options = {}) {
    const settings = { range: 'month', tab: 'community', commentSort: 'recent', commentLimit: 12, chartType: 'candle', selectedCandleKey: null, ...options };
    const state = getState(), p = prof(id), now = currentClock(state);
    if (!p || !state.stocks[id]) return '<div class="sd-empty"><h2>종목을 찾을 수 없어요.</h2><button data-action="nav" data-view="market">시장으로 돌아가기</button></div>';
    const stock = state.stocks[id], reviews = reviewsFor(id), events = relatedEvents(p);
    const todayPrices = stock.history.filter(point => point.date === now.date);
    const open = stock.priceDate === now.date ? stock.dayOpenPrice : stock.price;
    const todayReturn = stock.price / open - 1;
    const favorite = state.favorites.includes(id);
    const content = settings.tab === 'news' ? newsPanel(events) : settings.tab === 'courses' ? coursesPanel(p) : commentPanel(p, reviews, settings);
    return `<div class="sd-page"><div class="sd-breadcrumb"><button data-action="nav" data-view="market">${icon('chevron')}교수님 시장</button><span>/</span><span>${esc(p.name)}</span></div><div class="sd-heading"><div class="sd-avatar" style="--sd-avatar:${colorFor(id)}">${professorInitials(p.name)}</div><div class="sd-identity"><span>${esc(p.department)} <i>·</i> ${ticker(p)}</span><h1>${esc(p.name)} <small>교수님</small></h1></div><button class="sd-favorite ${favorite ? 'selected' : ''}" data-action="favorite" data-id="${esc(id)}" aria-pressed="${favorite}">${icon('star')}${favorite ? '관심 종목' : '관심 등록'}</button></div><div class="sd-layout"><div class="sd-main"><section class="sd-quote-card"><div class="sd-quote-header"><div><div class="sd-price">${number(stock.price)}<small>유니코인</small></div><div class="sd-daily ${priceClass(todayReturn)}">${todayReturn > 0 ? '▲' : todayReturn < 0 ? '▼' : '—'} ${number(Math.abs(stock.price - open))} <strong>(${pct(todayReturn)})</strong><span>오늘</span></div></div><span class="sd-live"><i></i>${timeLabel(now.minute)} 시세</span></div><div class="sd-chart-controls"><span>주가 차트</span><div aria-label="종목 차트 기간">${[['today', '오늘'], ['week', '1주'], ['month', '1개월'], ['all', '전체']].map(([key, label]) => `<button class="${settings.range === key ? 'active' : ''}" data-action="stock-range" data-id="${key}" aria-pressed="${settings.range === key}">${label}</button>`).join('')}</div></div>${candles.render(stock, p, settings)}<div class="sd-price-stats"><div><span>오늘 시가</span><strong>${number(open)}</strong></div><div><span>오늘 최고</span><strong class="sd-up">${number(Math.max(open, ...todayPrices.map(point => point.high ?? point.price)))}</strong></div><div><span>오늘 최저</span><strong class="sd-down">${number(Math.min(open, ...todayPrices.map(point => point.low ?? point.price)))}</strong></div><div><span>시즌 수익률</span><strong class="${priceClass(stock.price / 100 - 1)}">${pct(stock.price / 100 - 1)}</strong></div></div><details class="sd-calculation"><summary>이번 시세, 무엇이 움직였나요? ${icon('chevron')}</summary><div>${[['teaching', '수업 평가'], ['research', '개별 공시'], ['department', '학과 소식'], ['variation', '시연 변동'], ['adjustment', '반올림·상하한']].map(([key, label]) => `<span>${label}<strong class="${priceClass(stock.contributions[key])}">${pct(stock.contributions[key] ?? 0)}</strong></span>`).join('')}</div><p>최근 한 번의 갱신 기여도 · GPA 가중치와 표본 보정을 반영한 가상 시세</p></details></section><section class="sd-discussion"><nav class="sd-tabs" aria-label="종목 정보">${[['community', '한 줄 강의평', reviews.length], ['news', '뉴스·공시', events.length], ['courses', '개설 강의', p.courseIds.length]].map(([key, label, count]) => `<button data-action="stock-tab" data-id="${key}" class="${settings.tab === key ? 'active' : ''}" aria-pressed="${settings.tab === key}">${label}<span>${count}</span></button>`).join('')}</nav>${content}</section></div>${reviewRail(p, reviews)}</div></div>`;
  }

  function mount(root = document) { candles.mount(root); }

  return { render, mount, reviewsFor, invalidateReviews };
}
