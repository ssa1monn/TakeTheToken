// Two-letter display monograms for the course catalog, not official romanized names.
const initials = {
  강석훈:'SH', 강승택:'ST', 김경원:'GW', 김도엽:'DY', 김동훈:'DH', 김영필:'YP',
  김우일:'WI', 김인수:'IS', 김지범:'JB', 김현범:'HB', 김현정:'HJ', 노송:'NS',
  박기석:'GS', 박문주:'MJ', 박종승:'JS', 송영록:'YR', 안승환:'SH', 안재균:'JG',
  우요섭:'YS', 원경호:'GH', 이근행:'GH', 이기영:'GY', 이병주:'BJ', 이상엽:'SY',
  이승수:'SS', 이은규:'EG', 이장호:'JH', 이종길:'JG', 이현규:'HG', 전광길:'GG',
  전현채:'HC', 전혜경:'HK', 조경훈:'GH', 조원서:'WS', 최병조:'BJ', 최승식:'SS',
  한상현:'SH', 한재현:'JH', 허혜선:'HS', 홍윤식:'YS', 황광일:'GI',
};
export function professorInitials(name) {
  return initials[name] ?? (String(name).replace(/[^a-z]/gi,'').slice(0,2).toUpperCase() || 'IN').padEnd(2,'U');
}

export function ratingStars(score) {
  const rating = Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : 0;
  return `<span class="rating-stars" role="img" aria-label="5점 만점에 ${rating.toFixed(1)}점"><span class="rating-stars-empty" aria-hidden="true">★★★★★</span><span class="rating-stars-fill" style="width:${(rating / 5 * 100).toFixed(2)}%" aria-hidden="true">★★★★★</span></span>`;
}
