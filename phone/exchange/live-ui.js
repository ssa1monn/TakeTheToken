import { currentClock, evaluationWindow, timeLabel } from './campus.js';
import { professorInitials } from './identity.js';

export function createLiveUI(context) {
  const { getState, catalog, icon, esc, pct, number, direction, prof, course, colorFor } = context;
  const clock = () => currentClock(getState());
  const todayCourses = () => getState().selectedCourseIds.map(course).filter(c => evaluationWindow(c, clock()).status !== 'not_today').sort((a,b) => evaluationWindow(a,clock()).end - evaluationWindow(b,clock()).end);
  const dateText = value => `${value.date.replaceAll('-', '.')} (${value.weekday})`;
  const recentEvents = () => [...getState().events].sort((a,b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.minute ?? 0) - (a.minute ?? 0) || b.day - a.day);

  function topbar(view) {
    return `<header class="broker-topbar"><div class="broker-topbar-inner"><a href="#market" class="broker-brand" data-action="nav" data-view="market"><span class="inu-monogram">in<span>u</span><i></i></span><span>인천대 거래소</span></a><nav aria-label="주 메뉴">${[['market','교수님 증시'],['community','커뮤니티'],['news','캠퍼스 소식'],['portfolio','내 자산'],['timetable','내 시간표']].map(([key,label]) => `<a href="#${key}" data-action="nav" data-view="${key}" class="${view === key || view === 'stock' && key === 'market' ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="broker-top-right"><span class="demo-tag">CAMPUS · DEMO</span><button class="analyst-button" data-action="gpa" aria-label="내 GPA 설정">${icon('person')}내 프로필</button></div></div></header>`;
  }

  function sessionBar() {
    const state = getState(), now = clock();
    return `<section class="simulation-bar" aria-label="시연 시간 제어"><span class="session-status"><i class="clock-live ${state.playing ? 'running' : ''}"></i>${state.clockMode === 'demo' ? '캠퍼스 가상장' : '실제 KST'}</span><span class="session-date">${dateText(now)} <strong>${timeLabel(now.minute)}</strong></span><span class="session-note">교수님과 강의는 실제, 시세와 반응은 가상</span><div class="simulation-controls"><button class="play-button ${state.playing ? 'playing' : ''}" data-action="toggle-play">${state.playing ? 'Ⅱ 일시정지' : '▶ 자동 진행'}</button><button class="session-settings" data-action="simulation-settings">시연 설정 ${icon('chevron')}</button></div></section>`;
  }

  function ticker() {
    const state = getState();
    const latest = recentEvents().slice(0,4);
    return `<div class="market-ticker"><span class="ticker-label">CAMPUS LIVE</span><div>${latest.map(e => `<button data-action="news-detail" data-id="${esc(e.id)}"><span class="${direction(e.impact)}">${e.impact > 0 ? '▲' : e.impact < 0 ? '▼' : '●'} ${pct(e.impact)}</span>${esc(e.title)}</button>`).join('') || '<span>캠퍼스 소식을 기다리고 있어요.</span>'}</div><span class="ticker-demo">가상 속보</span></div>`;
  }

  function statusFor(c) {
    const state = getState(), now = clock(), eligibility = evaluationWindow(c, now);
    const submitted = state.userReviews[`${now.date}:${c.id}`];
    return { ...eligibility, submitted, pending: state.pendingReviews[c.id], canRate: eligibility.allowed && !submitted };
  }

  function todayClasses() {
    const items = todayCourses();
    return `<section class="card today-classes"><div class="section-head"><h3>오늘의 내 수업</h3><span class="small-badge">${clock().weekday}요일 · ${items.length}개</span></div>${items.map(c => {
      const status = statusFor(c);
      return `<div class="today-class"><span class="class-status ${status.status}"></span><div><strong>${esc(c.name)}</strong><small>${esc(prof(c.professorId).name)} · ${timeLabel(status.start)}–${timeLabel(status.end)}</small><span>${status.submitted ? '오늘 평가 반영 완료' : status.pending ? '내 평가 반영 대기' : status.reason}</span></div><button class="class-review-button" data-action="review" data-id="${c.id}" ${!status.canRate ? 'disabled' : ''}>${status.submitted ? '완료' : status.pending ? '수정' : status.canRate ? '평가' : '잠김'}</button></div>`;
    }).join('') || '<div class="today-free"><strong>오늘은 공강이에요.</strong><p>내 종목 소식과 다른 수강생들의 이야기를 둘러보세요.</p></div>'}<p class="class-window-note">${icon('info')}당일 마지막 수업 종료 후, 그날만 평가할 수 있어요.</p></section>`;
  }

  function watchlist() {
    const state = getState();
    const ids = [...new Set(state.selectedCourseIds.map(id => course(id).professorId))];
    return `<section class="card watchlist-card"><div class="section-head"><h3>내 시간표 종목</h3><button class="text-button" data-action="edit">편집 ${icon('chevron')}</button></div>${ids.map(id => {
      const p = prof(id), stock = state.stocks[id];
      return `<button class="watch-row" data-action="stock" data-id="${id}"><span class="stock-avatar" style="--avatar-color:${colorFor(id)}">${professorInitials(p.name)}</span><span><strong>${esc(p.name)}</strong><small>${p.courseIds.length}개 개설 강의</small></span><span><strong>${number(stock.price)}</strong><small class="${direction(stock.todayReturn)}">${pct(stock.todayReturn)}</small></span></button>`;
    }).join('')}</section>`;
  }

  function commentCard(review, compact = false) {
    const state = getState(), c = course(review.courseId);
    if (!c) return '';
    return `<article class="student-comment ${compact ? 'compact' : ''}"><div class="comment-meta"><span class="comment-avatar" style="background:${colorFor(c.professorId)}15;color:${colorFor(c.professorId)}">${esc(review.nickname.slice(0,1))}</span><span><strong>${esc(review.nickname)}</strong><small>${review.date === clock().date ? '오늘' : esc(review.date?.slice(5).replace('-','.'))} ${timeLabel(review.minute)}${review.source === 'self' ? ' · 내 평가' : ''}</small></span><span class="comment-rating">★ ${(1 + review.score / 25).toFixed(1)}</span></div><p>${esc(review.comment || '점수로 수업 경험을 남겼어요.')}</p><div class="comment-footer"><button data-action="stock" data-id="${c.professorId}">${esc(prof(c.professorId).name)} · ${esc(c.name)}</button><button class="comment-like ${state.commentLikes?.[review.id] ? 'liked' : ''}" data-action="like-comment" data-id="${esc(review.id)}" aria-label="${esc(review.nickname)} 한 줄 평 공감" aria-pressed="${!!state.commentLikes?.[review.id]}">♡ ${state.commentLikes?.[review.id] ? 1 : 0}</button></div></article>`;
  }

  function commentFeed(limit = 5, mine = false) {
    const reviews = gatheredReviews(limit, mine);
    return reviews.map(r => commentCard(r, true)).join('') || '<p class="empty-feed">아직 종료된 수업의 수강평이 없어요.<br>시간이 흐르면 이곳에 학생들의 반응이 모여요.</p>';
  }

  function gatheredReviews(limit, mine) {
    const state = getState(), now = clock();
    const mineIds = new Set(state.selectedCourseIds.map(id => course(id).professorId));
    const selectedIds = new Set(state.selectedCourseIds);
    const visible = r => (r.date < now.date || r.date === now.date && r.minute <= now.minute) && (!mine || mineIds.has(r.professorId));
    const own = Object.entries(state.userReviews).map(([key,r]) => {
      const courseId = key.slice(11), selected = course(courseId);
      return { ...r, id: `own:${key}`, courseId, professorId: selected?.professorId, nickname: '나의 한 줄 평', source: 'self' };
    }).filter(r => r.professorId && visible(r));
    const generated = [...new Map([...Object.values(state.classBatches).flatMap(batch => batch.reviews.slice(0,5)), ...Object.values(state.reviewArchive ?? {}).flat()].filter(visible).map(r => [r.id,r])).values()].sort((a,b) => b.date.localeCompare(a.date) || b.minute - a.minute);
    const groups = new Map();
    for (const r of generated) {
      const key = `${r.professorId}:${course(r.courseId).name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    // Interleave courses: multiple internship sections must not drown out other classes.
    const buckets = [...groups.values()].sort((a,b) => b[0].date.localeCompare(a[0].date) || Number(b.some(r => selectedIds.has(r.courseId))) - Number(a.some(r => selectedIds.has(r.courseId))) || b[0].minute - a[0].minute);
    const result = [...own];
    const shownComments = new Set(own.map(r => r.comment));
    for (let round = 0; result.length < limit; round++) {
      let added = false;
      for (const bucket of buckets) if (bucket[round]) {
        added = true;
        if (shownComments.has(bucket[round].comment)) continue;
        shownComments.add(bucket[round].comment);
        result.push(bucket[round]);
        if (result.length >= limit) break;
      }
      if (!added) break;
    }
    return result.slice(0,limit);
  }

  function liveComments() {
    return `<section class="card live-comments-card"><div class="section-head"><h3>지금 올라온 한 줄 💬</h3><button class="text-button" data-action="nav" data-view="community" aria-label="커뮤니티 전체 보기">${icon('chevron')}</button></div><div class="live-comments-list">${commentFeed(3)}</div></section>`;
  }

  function newsList() {
    return `<section class="card news-rail"><div class="section-head"><h3><i class="news-live-dot"></i>캠퍼스 속보</h3><button class="text-button" data-action="nav" data-view="news" aria-label="캠퍼스 소식 전체 보기">${icon('chevron')}</button></div>${recentEvents().slice(0,4).map(e => `<button data-action="news-detail" data-id="${esc(e.id)}"><span class="news-category ${direction(e.impact)}">${esc(e.label ?? (e.type === 'department' ? '학과 소식' : '연구 성과'))}</span><strong>${esc(e.title)}</strong><small>${e.date === clock().date ? '오늘' : esc(e.date?.slice(5).replace('-','.') ?? '이전 소식')} ${e.minute != null ? timeLabel(e.minute) : ''}${e.impact ? `<span class="${direction(e.impact)}">${pct(e.impact)}</span>` : ''}</small></button>`).join('')}</section>`;
  }

  function briefing() {
    const state = getState(), now = clock();
    const events = state.events.filter(e => e.date === now.date);
    const batches = Object.values(state.classBatches).filter(b => b.date === now.date);
    const responses = batches.reduce((s,b) => s + b.reviews.length, 0);
    return `<section class="market-pulse"><div><span class="pulse-icon">${icon('spark')}</span><span><strong>캠퍼스 시장 브리핑</strong><small>가상 수강생 ${responses}명 · 종료 강의 ${batches.length}개 · 오늘 공시 ${events.length}건</small></span></div><p>${events.length ? `${esc(events.at(-1).title)} 소식이 들어왔어요. ` : ''}수업이 끝날 때마다 새로운 평가와 한 줄 평이 시세에 반영돼요.</p><span class="pulse-mode">규칙 기반 데모 해설</span></section>`;
  }

  function community(mine = false) {
    const reviews = gatheredReviews(60, mine);
    return `<div class="lounge-intro"><span class="eyebrow">AFTER CLASS, BEFORE THE NEXT CHART</span><h2>수업 끝. 한 줄은 남기고 가자.</h2><p>제제이야부터 진지한 복습 다짐까지. 종료된 수업의 가상 수강생들이 남긴 오늘의 반응이에요.</p></div><div class="lounge-toolbar"><div class="filter-tabs"><button data-action="feed-scope" data-id="all" class="${!mine ? 'active' : ''}">캠퍼스 전체</button><button data-action="feed-scope" data-id="mine" class="${mine ? 'active' : ''}">내 종목만</button></div><span>최근 ${reviews.length}개 · 자동 생성 시연</span><button class="button primary small" data-action="review">내 수업 평가하기</button></div><div class="lounge-grid">${reviews.map(r => commentCard(r)).join('') || '<p class="empty-feed">오늘 내 수업이 끝나면 한 줄 평이 모여요.</p>'}</div>`;
  }

  function news() {
    return `<div class="news-intro"><div><span class="eyebrow">CAMPUS DISCLOSURE · SIMULATION</span><h2>호재도, 변수도. 캠퍼스는 진행 중.</h2><p>연구·수상·산학협력부터 서버 장애·일정 조정까지, 여러 유형의 가상 공시가 자동으로 생겨요.</p></div><button class="button primary" data-action="random-event">${icon('spark')}랜덤 속보</button></div><div class="news-grid">${recentEvents().slice(0,30).map(e => `<article class="card news-card"><div class="news-card-top"><span class="news-type ${e.type}">${esc(e.label ?? (e.type === 'department' ? '학과 공통' : '연구 성과'))}</span><span class="small-badge">${e.displayOnly ? '이전 소식' : e.applied ? (e.impact ? '시세 반영' : '정보 알림') : '반영 대기'}</span></div><div class="news-symbol ${direction(e.impact)}">${icon(e.impact < 0 ? 'info' : 'spark')}</div><span class="eyebrow">${esc(e.source)}</span><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p>${e.displayOnly ? '<div class="news-impact is-neutral">이전 소식 · 현재 시세에는 반영하지 않아요</div>' : e.impact ? `<div class="news-impact"><span>${e.type === 'department' ? '학과 전체' : '개별 종목'} · 1회 영향</span><strong class="${direction(e.impact)}">${pct(e.impact)}</strong></div>` : '<div class="news-impact is-neutral">정보 알림 · 가격 영향 없음</div>'}<div class="news-card-bottom"><span>${e.date ? `${e.date.slice(5).replace('-','.')} ${timeLabel(e.minute)}` : '이전 시연 기록'}</span><button class="text-button" data-action="news-detail" data-id="${esc(e.id)}">공시 보기 ${icon('arrow')}</button></div></article>`).join('')}</div>`;
  }

  return { topbar, sessionBar, ticker, todayClasses, watchlist, liveComments, newsList, briefing, community, news, statusFor, commentCard, todayCourses };
}
