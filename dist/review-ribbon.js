import { currentClock, timeLabel } from './campus.js';
import { collectCommunityReviews, interleaveCommunityReviews } from './live-ui.js';
import { reviewLikeCount } from './review-engagement.js';

// Playback is owned by the page so hover, keyboard focus and manual pause can
// suspend the same timer. Price updates do not advance the selected review.
export function createReviewRibbon({ getState, catalog, esc, icon, prof, course }) {
  let cachedState = null;
  let cachedMode = null;
  let activeId = null;

  function current() {
    const state = getState(), mode = state.clockMode;
    if (cachedState !== state || cachedMode !== mode) {
      activeId = null;
      cachedState = state;
      cachedMode = mode;
    }
    const now = currentClock(state);
    const eligible = collectCommunityReviews(state, catalog, now).filter(review => typeof review.comment === 'string' && review.comment.trim());
    const reviews = interleaveCommunityReviews(eligible, catalog).slice(0, 30);
    if (!reviews.some(review => review.id === activeId)) activeId = reviews[0]?.id ?? null;
    return { state, now, reviews, index: reviews.findIndex(review => review.id === activeId) };
  }

  function step(delta = 1) {
    const { reviews, index } = current();
    if (!reviews.length || !Number.isFinite(Number(delta))) return activeId;
    const offset = Math.trunc(Number(delta));
    const next = ((index + offset) % reviews.length + reviews.length) % reviews.length;
    activeId = reviews[next].id;
    return activeId;
  }

  function render({ paused = false } = {}) {
    const { state, now, reviews, index } = current();
    const review = reviews[index], multiple = reviews.length > 1;
    const controls = `<div class="rr-controls" aria-label="한 줄 평 넘기기"><button class="rr-prev" data-action="ribbon-step" data-id="-1" aria-label="이전 한 줄 평" ${multiple ? '' : 'disabled'}>${icon('chevron')}</button><span class="rr-position" aria-label="${review ? index + 1 : 0}번째, 총 ${reviews.length}개">${review ? index + 1 : 0}<small> / ${reviews.length}</small></span><button data-action="ribbon-step" data-id="1" aria-label="다음 한 줄 평" ${multiple ? '' : 'disabled'}>${icon('chevron')}</button><button class="rr-play ${paused ? 'paused' : ''}" data-action="ribbon-pause" aria-label="한 줄 자동 넘김 ${paused ? '재생' : '일시정지'}" aria-pressed="${paused}" ${multiple ? '' : 'disabled'}><span aria-hidden="true">${paused ? '▶' : 'Ⅱ'}</span></button></div>`;
    const heading = `<div class="rr-heading"><span class="rr-live-label"><i></i>AFTER CLASS</span><h2>지금 올라온 한 줄</h2></div>`;
    if (!review) return `<section class="review-ribbon rr-is-empty" aria-label="지금 올라온 한 줄">${heading}<div class="rr-empty"><strong>첫 한 줄을 기다리고 있어요.</strong><span>종료된 수업의 수강평이 모이면 여기서 한 개씩 보여드려요.</span></div>${controls}</section>`;
    const c = course(review.courseId), p = prof(c.professorId), liked = !!state.commentLikes?.[review.id];
    const date = review.date === now.date ? '오늘' : review.date.slice(5).replace('-', '.');
    const rating = (1 + review.score / 25).toFixed(1);
    const quote = review.comment.trim();
    return `<section class="review-ribbon" aria-label="지금 올라온 한 줄" data-ribbon-review="${esc(review.id)}">${heading}<button class="rr-story" data-action="stock-reviews" data-id="${esc(p.id)}" data-course="${esc(c.id)}" aria-label="${esc(c.name)} · ${esc(p.name)} 교수님 한 줄 평 보기" title="${esc(quote)}"><span class="rr-meta"><strong>${esc(c.name)}</strong><span>${esc(p.name)} 교수님</span><i></i><span class="rr-nickname">${esc(review.nickname)}</span><small>${esc(date)} ${timeLabel(review.minute ?? 0)}</small></span><span class="rr-quote">“${esc(quote)}”</span></button><div class="rr-side"><div class="rr-engagement"><span class="rr-rating" aria-label="5점 만점에 ${rating}점">★ ${rating}</span><button class="rr-like ${liked ? 'liked' : ''}" data-action="like-comment" data-id="${esc(review.id)}" aria-label="${esc(review.nickname)} 한 줄 평 공감" aria-pressed="${liked}">${liked ? '♥' : '♡'} 공감 <b>${reviewLikeCount(state, review).toLocaleString('ko-KR')}</b></button></div>${controls}</div></section>`;
  }

  return { render, step };
}
