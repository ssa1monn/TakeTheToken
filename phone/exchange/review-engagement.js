// Fictional peer reactions are reproducible for each demo review. Personal
// reactions remain separate so clicking again restores the exact base count.
export function demoReviewLikes(review) {
  if (review.source === 'self' || String(review.id ?? '').startsWith('own:')) return 0;
  if (Number.isInteger(review.demoLikes) && review.demoLikes >= 0) return review.demoLikes;
  const key = String(review.id ?? `${review.date}:${review.courseId}:${review.nickname}:${review.comment}`);
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0),16777619) >>> 0;
  return hash % 19 === 0 ? 100 + hash % 180 : Math.floor(Math.pow((hash % 1000) / 1000,2.4) * 85);
}

export function reviewLikeCount(state, review) {
  return demoReviewLikes(review) + (state.commentLikes?.[review.id] ? 1 : 0);
}
