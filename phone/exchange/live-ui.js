import { currentClock, evaluationWindow, timeLabel } from './campus.js';
import { professorInitials } from './identity.js';
import { reviewLikeCount } from './review-engagement.js';
import { newsText, newsTitle } from './campus-copy.js';

// One canonical, read-only collection keeps counts, search and cards in agreement.
export function collectCommunityReviews(state, catalog, now, { mine = false, tone = 'all', query = '' } = {}) {
  const courses = new Map(catalog.courses.map(c => [c.id, c]));
  const professors = new Map(catalog.professors.map(p => [p.id, p]));
  const selected = new Set(state.selectedCourseIds ?? []);
  const rows = new Map();
  const add = review => {
    const c = courses.get(review.courseId);
    if (!c || !Number.isFinite(review.score) || review.score < 0 || review.score > 100 || !review.date) return;
    if (review.date > now.date || review.date === now.date && (review.minute ?? 0) > now.minute) return;
    const id = review.id ?? `${review.date}:${review.courseId}:${review.minute ?? 0}:${review.nickname ?? ''}:${review.comment ?? ''}`;
    rows.set(id, { ...review, id, professorId: c.professorId, nickname: review.nickname || '수강생' });
  };
  for (const archive of Object.values(state.reviewArchive ?? {})) for (const row of archive) add(row);
  for (const row of state.reviewFeed ?? []) add(row);
  for (const batch of Object.values(state.classBatches ?? {})) for (const row of batch.reviews ?? []) add(row);
  for (const [key, row] of Object.entries(state.userReviews ?? {})) add({ ...row, id: `own:${key}`, courseId: key.slice(11), nickname: '나의 한 줄 평', source: 'self' });
  const term = query.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
  return [...rows.values()].filter(row => {
    const c = courses.get(row.courseId), p = professors.get(c.professorId);
    return (!mine || selected.has(c.id)) && (tone !== 'positive' || row.score >= 72) && (tone !== 'critical' || row.score < 45)
      && (!term || `${c.name} ${p?.name ?? ''} ${p?.department ?? ''} ${row.nickname} ${row.comment ?? ''}`.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(term));
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.minute ?? 0) - (a.minute ?? 0) || a.id.localeCompare(b.id));
}

export function interleaveCommunityReviews(reviews, catalog) {
  const courses = new Map(catalog.courses.map(c => [c.id, c]));
  const groups = new Map();
  for (const row of reviews) {
    const c = courses.get(row.courseId), key = `${c.professorId}:${c.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const buckets = [...groups.values()], unique = [], repeated = [], shownText = new Set();
  for (let round = 0; ; round++) {
    let added = false;
    for (const bucket of buckets) if (bucket[round]) {
      added = true;
      const row = bucket[round], text = row.comment?.trim();
      if (text && shownText.has(text)) repeated.push(row);
      else { unique.push(row); if (text) shownText.add(text); }
    }
    if (!added) break;
  }
  return [...unique, ...repeated];
}

export function createLiveUI(context) {
  const { getState, catalog, icon, esc, pct, number, direction, prof, course, colorFor } = context;
  const clock = () => currentClock(getState());
  const todayCourses = () => getState().selectedCourseIds.map(course).filter(c => evaluationWindow(c, clock()).status !== 'not_today').sort((a,b) => evaluationWindow(a,clock()).end - evaluationWindow(b,clock()).end);
  const dateText = value => `${value.date.replaceAll('-', '.')} (${value.weekday})`;
  const recentEvents = () => [...getState().events].sort((a,b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.minute ?? 0) - (a.minute ?? 0) || b.day - a.day);

  function topbar(view) {
    return `<header class="broker-topbar"><div class="broker-topbar-inner"><a href="#market" class="broker-brand" data-action="nav" data-view="market"><span class="inu-monogram">in<span>u</span><i></i></span><span>인천대 거래소</span></a><nav aria-label="주 메뉴">${[['market','교수님 증시'],['community','커뮤니티'],['news','캠퍼스 소식'],['portfolio','내 자산'],['timetable','내 시간표']].map(([key,label]) => `<a href="#${key}" data-action="nav" data-view="${key}" class="${view === key || view === 'stock' && key === 'market' ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="broker-top-right"><span class="demo-tag">CAMPUS · LIVE</span><button class="analyst-button" data-action="gpa" aria-label="내 GPA 설정">${icon('person')}내 프로필</button></div></div></header>`;
  }

  function sessionBar() {
    const state = getState(), now = clock();
    return `<section class="simulation-bar" aria-label="캠퍼스 현황"><span class="session-status"><i class="clock-live ${state.playing ? 'running' : ''}"></i>캠퍼스 시장</span><span class="session-date">${dateText(now)} <strong>${timeLabel(now.minute)}</strong></span><span class="session-note">수업의 한 줄이 캠퍼스의 흐름이 되는 곳</span></section>`;
  }

  function ticker() {
    const state = getState();
    const latest = recentEvents().slice(0,4);
    return `<div class="market-ticker"><span class="ticker-label">CAMPUS LIVE</span><div>${latest.map(e => `<button data-action="news-detail" data-id="${esc(e.id)}"><span class="${direction(e.impact)}">${e.impact > 0 ? '▲' : e.impact < 0 ? '▼' : '●'} ${pct(e.impact)}</span>${esc(newsTitle(e.title))}</button>`).join('') || '<span>캠퍼스 소식을 기다리고 있어요.</span>'}</div><span class="ticker-demo">캠퍼스 속보</span></div>`;
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
    }).join('') || '<div class="today-free"><strong>오늘은 공강이에요.</strong><p>내 수업 교수님 소식과 다른 수강생들의 이야기를 둘러보세요.</p></div>'}<p class="class-window-note">${icon('info')}당일 마지막 수업 종료 후, 그날만 평가할 수 있어요.</p></section>`;
  }

  function watchlist() {
    const state = getState();
    const ids = [...new Set(state.selectedCourseIds.map(id => course(id).professorId))];
    return `<section class="card watchlist-card"><div class="section-head"><h3>내 시간표 교수님</h3><button class="text-button" data-action="edit">편집 ${icon('chevron')}</button></div>${ids.map(id => {
      const p = prof(id), stock = state.stocks[id];
      return `<button class="watch-row" data-action="stock" data-id="${id}"><span class="stock-avatar" style="--avatar-color:${colorFor(id)}">${professorInitials(p.name)}</span><span><strong>${esc(p.name)}</strong><small>${p.courseIds.length}개 개설 강의</small></span><span><strong>${number(stock.price)}</strong><small class="${direction(stock.todayReturn)}">${pct(stock.todayReturn)}</small></span></button>`;
    }).join('')}</section>`;
  }

  function commentCard(review, compact = false) {
    const state = getState(), c = course(review.courseId);
    if (!c) return '';
    return `<article class="student-comment ${compact ? 'compact' : ''}"><div class="comment-meta"><span class="comment-avatar" style="background:${colorFor(c.professorId)}15;color:${colorFor(c.professorId)}">${esc(review.nickname.slice(0,1))}</span><span><strong>${esc(review.nickname)}</strong><small>${review.date === clock().date ? '오늘' : esc(review.date?.slice(5).replace('-','.'))} ${timeLabel(review.minute)}${review.source === 'self' ? ' · 내 평가' : ''}</small></span><span class="comment-rating">★ ${(1 + review.score / 25).toFixed(1)}</span></div><p>${esc(review.comment || '점수로 수업 경험을 남겼어요.')}</p><div class="comment-footer"><button data-action="stock" data-id="${c.professorId}">${esc(prof(c.professorId).name)} · ${esc(c.name)}</button><button class="comment-like ${state.commentLikes?.[review.id] ? 'liked' : ''}" data-action="like-comment" data-id="${esc(review.id)}" aria-label="${esc(review.nickname)} 한 줄 평 공감" aria-pressed="${!!state.commentLikes?.[review.id]}">${state.commentLikes?.[review.id] ? '♥' : '♡'} ${reviewLikeCount(state, review).toLocaleString('ko-KR')}</button></div></article>`;
  }

  function commentFeed(limit = 5, mine = false) {
    const reviews = gatheredReviews(limit, mine);
    return reviews.map(r => commentCard(r, true)).join('') || '<p class="empty-feed">아직 종료된 수업의 수강평이 없어요.<br>시간이 흐르면 이곳에 학생들의 반응이 모여요.</p>';
  }

  function gatheredReviews(limit, mine) {
    return interleaveCommunityReviews(collectCommunityReviews(getState(), catalog, clock(), { mine }), catalog).slice(0, limit);
  }

  function liveComments() {
    return `<section class="card live-comments-card"><div class="section-head"><h3>지금 올라온 한 줄 💬</h3><button class="text-button" data-action="nav" data-view="community" aria-label="커뮤니티 전체 보기">${icon('chevron')}</button></div><div class="live-comments-list">${commentFeed(3)}</div></section>`;
  }

  function newsList() {
    return `<section class="card news-rail"><div class="section-head"><h3><i class="news-live-dot"></i>캠퍼스 속보</h3><button class="text-button" data-action="nav" data-view="news" aria-label="캠퍼스 소식 전체 보기">${icon('chevron')}</button></div>${recentEvents().slice(0,4).map(e => `<button data-action="news-detail" data-id="${esc(e.id)}"><span class="news-category ${direction(e.impact)}">${esc(e.label ?? (e.type === 'department' ? '학과 소식' : '연구 성과'))}</span><strong>${esc(newsTitle(e.title))}</strong><small>${e.date === clock().date ? '오늘' : esc(e.date?.slice(5).replace('-','.') ?? '이전 소식')} ${e.minute != null ? timeLabel(e.minute) : ''}${e.impact ? `<span class="${direction(e.impact)}">${pct(e.impact)}</span>` : ''}</small></button>`).join('')}</section>`;
  }

  function briefing() {
    const state = getState(), now = clock();
    const events = state.events.filter(e => e.date === now.date);
    const batches = Object.values(state.classBatches).filter(b => b.date === now.date);
    const responses = batches.reduce((s,b) => s + b.reviews.length, 0);
    return `<section class="market-pulse"><div><span class="pulse-icon">${icon('spark')}</span><span><strong>캠퍼스 시장 브리핑</strong><small>수강생 ${responses}명 · 종료 강의 ${batches.length}개 · 오늘 공시 ${events.length}건</small></span></div><p>${events.length ? `${esc(newsTitle(events.at(-1).title))} 소식이 들어왔어요. ` : ''}수업이 끝날 때마다 새로운 평가와 한 줄 평이 시세에 반영돼요.</p><span class="pulse-mode">캠퍼스 브리핑</span></section>`;
  }

  function loungeCard(review) {
    const state = getState(), c = course(review.courseId), p = prof(c.professorId), liked = !!state.commentLikes?.[review.id];
    const tone = review.score >= 72 ? ['positive', '이해도 떡상'] : review.score < 45 ? ['critical', '복습 메모'] : ['neutral', '천천히 소화 중'];
    return `<article class="rl-card" data-review-id="${esc(review.id)}"><button class="rl-course" data-action="stock-reviews" data-id="${p.id}" data-course="${esc(c.id)}" aria-label="${esc(c.name)} · ${esc(p.name)} 교수님 수강평 보기"><span class="rl-prof-avatar" style="--rl-avatar:${colorFor(p.id)}">${professorInitials(p.name)}</span><span><strong>${esc(c.name)}</strong><small>${esc(p.name)} 교수님 · ${c.credits}학점${state.selectedCourseIds.includes(c.id) ? ' · 내 수업' : ''}</small></span>${icon('chevron')}</button><div class="rl-card-caption"><span class="rl-tone ${tone[0]}">${tone[1]}</span><span class="rl-rating" aria-label="5점 만점에 ${(1 + review.score / 25).toFixed(1)}점">★ ${(1 + review.score / 25).toFixed(1)}</span></div><p>${esc(review.comment || '점수로 수업 경험을 남겼어요.')}</p><div class="rl-card-footer"><span><strong>${esc(review.nickname)}${review.source === 'self' ? '<b>나</b>' : ''}</strong><small>${review.date === clock().date ? '오늘' : review.date.slice(5).replace('-', '.')} ${timeLabel(review.minute ?? 0)}</small></span><button class="rl-like ${liked ? 'liked' : ''}" data-action="like-comment" data-id="${esc(review.id)}" aria-label="${esc(review.nickname)} 한 줄 평 공감" aria-pressed="${liked}">${liked ? '♥' : '♡'} 공감 <b>${reviewLikeCount(state, review).toLocaleString('ko-KR')}</b></button></div></article>`;
  }

  function community(mine = false, { tone = 'all', query = '', limit = 24, sort = 'recent' } = {}) {
    const state = getState(), now = clock();
    const selectedTone = ['all', 'positive', 'critical'].includes(tone) ? tone : 'all';
    const all = collectCommunityReviews(state, catalog, now, { mine });
    const filtered = collectCommunityReviews(state, catalog, now, { mine, tone: selectedTone, query });
    const selectedSort = sort === 'popular' ? 'popular' : 'recent';
    const ordered = selectedSort === 'popular' ? [...filtered].sort((a, b) => reviewLikeCount(state, b) - reviewLikeCount(state, a)) : interleaveCommunityReviews(filtered, catalog);
    const visibleLimit = Number.isFinite(limit) ? Math.max(12, Math.floor(limit)) : 24;
    const reviews = ordered.slice(0, visibleLimit);
    const groups = [all.filter(r => r.score >= 72).length, all.filter(r => r.score >= 45 && r.score < 72).length, all.filter(r => r.score < 45).length];
    const positive = all.find(r => r.score >= 72 && r.comment), critical = all.find(r => r.score < 45 && r.comment);
    const featured = [[positive, '수업에서 건진 이해', '✨', 'positive'], [critical, '함께 복습할 포인트', '📝', 'critical']].filter(([r]) => r);
    return `<section class="review-lounge"><div class="rl-hero"><div><span class="rl-eyebrow">AFTER CLASS CLUB</span><h2>수업 끝.<br>한 줄은 남기고 가자.</h2><p>제제이야부터 복습 메모까지.<br>같은 수업을 다르게 겪은 우리들의 이야기.</p><div class="rl-stats"><span><strong>${all.length.toLocaleString('ko-KR')}</strong>개의 수강평</span><span><strong>${new Set(all.map(r => r.courseId)).size}</strong>개 강의 이야기</span><span><strong>${all.filter(r => r.date === now.date).length.toLocaleString('ko-KR')}</strong>개 오늘 남긴 평</span></div></div><div class="rl-mood"><div class="rl-mood-top"><span>수강생 반응 스펙트럼</span><i>수강평</i></div><h3>오늘도 각자의 속도로<br>이해하는 중 <span>☕</span></h3><div class="rl-mood-bar" aria-hidden="true">${groups.map((n, i) => `<i class="rl-mood-${i}" style="flex:${all.length ? n : 1}"></i>`).join('')}</div><div class="rl-mood-labels">${['좋았어요', '소화 중', '복습 필요'].map((label, i) => `<span><i class="rl-mood-${i}"></i>${label}<strong>${all.length ? Math.round(groups[i] / all.length * 100) : 0}%</strong></span>`).join('')}</div><small>${mine ? '내 시간표 강의' : '캠퍼스 전체'}의 보관된 응답 ${all.length.toLocaleString('ko-KR')}개 기준</small></div></div>${featured.length ? `<div class="rl-featured" aria-label="수강생들의 서로 다른 시선">${featured.map(([r, label, emoji, key]) => { const c = course(r.courseId); return `<button class="rl-feature ${key}" data-action="stock-reviews" data-id="${c.professorId}" data-course="${esc(c.id)}"><span>${emoji} ${label}</span><blockquote>“${esc(r.comment)}”</blockquote><small>${esc(c.name)} · ${esc(prof(c.professorId).name)} 교수님 ${icon('arrow')}</small></button>`; }).join('')}</div>` : ''}<div class="rl-feed-header"><div><h2>강의실 밖 한 줄</h2><p>${selectedSort === 'popular' ? '공감이 많이 모인 한 줄부터. 같은 마음이었는지 읽어보세요.' : '여러 강의의 최근 이야기를 번갈아 보여드려요. 궁금한 수업은 검색해보세요.'}</p></div><button class="rl-write" data-action="review">${icon('plus')}내 수업 평가하기</button></div><div class="rl-toolbar"><div class="rl-scope" aria-label="수강평 범위"><button data-action="feed-scope" data-id="all" class="${!mine ? 'active' : ''}" aria-pressed="${!mine}">캠퍼스 전체</button><button data-action="feed-scope" data-id="mine" class="${mine ? 'active' : ''}" aria-pressed="${mine}">내 수업만</button></div><label class="rl-search">${icon('search')}<input id="community-search" type="search" aria-label="강의평 검색" placeholder="강의, 교수님, 한 줄 내용 검색" value="${esc(query)}"></label></div><div class="rl-feed-filters"><div aria-label="수강평 반응 필터">${[['all', '모든 반응'], ['positive', '✨ 좋았던 수업'], ['critical', '📝 복습이 필요한 수업']].map(([key, label]) => `<button data-action="community-tone" data-id="${key}" class="${selectedTone === key ? 'active' : ''}" aria-pressed="${selectedTone === key}">${label}</button>`).join('')}</div><div class="rl-sort" aria-label="수강평 정렬">${[['recent', '강의별 최신'], ['popular', '인기순']].map(([key, label]) => `<button data-action="community-sort" data-id="${key}" class="${selectedSort === key ? 'active' : ''}" aria-pressed="${selectedSort === key}">${label}</button>`).join('')}</div><span>총 ${filtered.length.toLocaleString('ko-KR')}개</span></div><div id="community-feed-region"><div class="rl-grid">${reviews.map(loungeCard).join('') || `<div class="rl-empty"><span>🔎</span><h3>조건에 맞는 수강평이 없어요</h3><p>${mine ? '내 시간표에 담긴 강의의 기록만 보고 있어요.' : '다른 강의 이름이나 반응으로 찾아보세요.'}</p><button data-action="community-clear">검색과 반응 필터 초기화</button></div>`}</div>${ordered.length > reviews.length ? `<button class="rl-more" data-action="community-more" data-id="${visibleLimit + 24}">수강평 더 보기 <span>${reviews.length} / ${ordered.length.toLocaleString('ko-KR')}</span>${icon('chevron')}</button>` : ''}</div><p class="rl-disclaimer">직접 평가는 당일 마지막 수업 종료 후에 열려요. 같은 수업을 듣는 친구들의 이야기에 공감을 남겨보세요.</p></section>`;
  }

  function news() {
    return `<div class="news-intro"><div><span class="eyebrow">CAMPUS DISCLOSURE</span><h2>호재도, 변수도. 캠퍼스는 진행 중.</h2><p>연구·수상·산학협력부터 서버 장애·일정 조정까지, 캠퍼스의 여러 소식을 한곳에서 만나보세요.</p></div></div><div class="news-grid">${recentEvents().slice(0,30).map(e => `<article class="card news-card"><div class="news-card-top"><span class="news-type ${e.type}">${esc(e.label ?? (e.type === 'department' ? '학과 공통' : '연구 성과'))}</span><span class="small-badge">${e.displayOnly ? '이전 소식' : e.applied ? (e.impact ? '시세 반영' : '정보 알림') : '반영 대기'}</span></div><div class="news-symbol ${direction(e.impact)}">${icon(e.impact < 0 ? 'info' : 'spark')}</div><span class="eyebrow">${esc(newsText(e.source))}</span><h3>${esc(newsTitle(e.title))}</h3><p>${esc(newsText(e.summary))}</p>${e.displayOnly ? '<div class="news-impact is-neutral">이전 소식 · 현재 시세에는 반영하지 않아요</div>' : e.impact ? `<div class="news-impact"><span>${e.type === 'department' ? '학과 전체' : '개별 교수님'} · 1회 영향</span><strong class="${direction(e.impact)}">${pct(e.impact)}</strong></div>` : '<div class="news-impact is-neutral">정보 알림 · 가격 영향 없음</div>'}<div class="news-card-bottom"><span>${e.date ? `${e.date.slice(5).replace('-','.')} ${timeLabel(e.minute)}` : '이전 기록'}</span><button class="text-button" data-action="news-detail" data-id="${esc(e.id)}">공시 보기 ${icon('arrow')}</button></div></article>`).join('')}</div>`;
  }

  return { topbar, sessionBar, ticker, todayClasses, watchlist, liveComments, newsList, briefing, community, news, statusFor, commentCard, todayCourses };
}
