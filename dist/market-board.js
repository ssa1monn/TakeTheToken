import { DEPARTMENTS, indexHistory, portfolio } from './market.js';
import { currentClock, timeLabel } from './campus.js';
import { professorInitials } from './identity.js';
import { smoothPath } from './candle-chart.js';

export function createMarketBoard({ getState, catalog, esc, icon, number, pct, direction, colorFor, course, live, reviewsFor }) {
  const avatar = p => `<span class="mb-avatar" style="--avatar:${colorFor(p.id)}">${professorInitials(p.name)}</span>`;
  const deptShort = name => ({ 컴퓨터공학부: '컴퓨터공학', 정보통신공학과: '정보통신', 임베디드시스템공학과: '임베디드' })[name] ?? name;
  const daily = id => { const state = getState(), stock = state.stocks[id]; return stock.priceDate === currentClock(state).date ? stock.todayReturn : 0; };
  function spark(history, change) {
    const points = history.slice(-32).map(p => p.price);
    const low = Math.min(...points) - .08, spread = Math.max(...points) - low + .08;
    const path = smoothPath(points.map((v,i) => ({x:i / Math.max(1, points.length - 1) * 110,y:39 - (v-low)/spread*34})));
    return `<svg class="mb-spark ${direction(change)}" viewBox="0 0 112 44" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function indices(department) {
    const state = getState(), now = currentClock(state);
    return `<section class="mb-indices" aria-label="학과 지수">${[null, ...DEPARTMENTS].map((dept, i) => {
      const history = indexHistory(state, catalog, dept), price = history.at(-1).price;
      const baseline = [...history].reverse().find(p => p.date !== now.date) ?? history[0];
      const change = price / baseline.price - 1;
      return `<button class="mb-index ${department === (dept ?? 'all') ? 'selected' : ''}" data-action="filter-dept" data-id="${dept ?? 'all'}"><span class="mb-index-label"><i class="mb-index-symbol s${i}">${['I','C','N','E'][i]}</i>${dept ? deptShort(dept) : 'INU 종합'}${icon('chevron')}</span><span class="mb-index-values"><strong>${number(price)}</strong>${spark(history,change)}</span><span class="${direction(change)}">${change > 0 ? '▲' : change < 0 ? '▼' : '−'} ${pct(change)}<small>오늘</small></span></button>`;
    }).join('')}</section>`;
  }
  function highlights() {
    const state = getState();
    const sorted = [...catalog.professors].sort((a,b) => daily(b.id) - daily(a.id));
    const rising = sorted[0];
    const talked = [...catalog.professors].filter(p => p.id !== rising.id).sort((a,b) => reviewsFor(b.id).length - reviewsFor(a.id).length)[0];
    const span = p => {
      const stock = state.stocks[p.id], points = stock.history.filter(point => point.date === currentClock(state).date);
      const high = Math.max(stock.price, ...points.map(point=>point.high??point.price));
      const low = Math.min(stock.price, ...points.map(point=>point.low??point.price));
      return high / low - 1;
    };
    const wild = [...catalog.professors].filter(p=>p.id!==rising.id&&p.id!==talked.id).sort((a,b)=>span(b)-span(a))[0];
    const picks = [
      [rising, daily(rising.id) > 0 ? '오늘 폼 미쳤다' : '오늘의 관전 종목', '🚀', 'rise', `${pct(daily(rising.id))} · 오늘 등락률`],
      [talked, '이 강의, 댓글 맛집', '💬', 'talk', `${reviewsFor(talked.id).length}개의 수강평`],
      [wild, '전공 롤러코스터', '🎢', 'cool', `오늘 고저폭 ${(span(wild)*100).toFixed(2)}%`],
    ];
    return `<section class="mb-highlights" aria-label="오늘의 종목 발견">${picks.map(([p,label,emoji,theme,caption]) => {
      const reviews=reviewsFor(p.id), quote=reviews.find(r=>/제제|뇌|폼|이왜진|ㅋㅋ|내일|정적|국밥|로딩/.test(r.comment))??reviews[0];
      return `<button class="mb-highlight ${theme}" data-action="stock" data-id="${p.id}"><span class="mb-highlight-label">${emoji} ${label}</span><span class="mb-highlight-identity">${avatar(p)}<span><strong>${esc(p.name)} <small>교수님</small></strong><span>${esc(caption)}</span></span>${icon('chevron')}</span><span class="mb-pick-quote">${quote?`“${esc(quote.comment)}”`:'오늘의 수업이 다음 캔들을 만듭니다.'}</span></button>`;
    }).join('')}</section>`;
  }
  function table({ department = 'all', query = '', page = 0, sort = 'return', onlyMine = false, ranking = 'all' } = {}) {
    const state = getState(), myIds = new Set(portfolio(state,catalog).holdings.map(h=>h.id));
    const normalized = query.trim().toLowerCase();
    const counts = new Map(catalog.professors.map(p => [p.id,reviewsFor(p.id).length]));
    let members = catalog.professors.filter(p => (department === 'all' || p.department === department) && (!onlyMine || myIds.has(p.id)) && `${p.name} ${p.department} ${p.courseIds.map(id=>course(id).name).join(' ')}`.toLowerCase().includes(normalized));
    if (ranking === 'favorites') members = members.filter(p => state.favorites.includes(p.id));
    if (ranking === 'up') members = members.filter(p => daily(p.id) > .000001);
    if (ranking === 'down') members = members.filter(p => daily(p.id) < -.000001);
    members.sort((a,b) => ranking === 'reviews' ? counts.get(b.id)-counts.get(a.id) : ranking === 'down' ? daily(a.id)-daily(b.id) : sort === 'name' ? a.name.localeCompare(b.name,'ko') : sort === 'price' ? state.stocks[b.id].price-state.stocks[a.id].price : daily(b.id)-daily(a.id));
    const pageSize = 10, pages = Math.max(1,Math.ceil(members.length/pageSize)), current = Math.min(page,pages-1);
    const display = members.slice(current*pageSize,(current+1)*pageSize);
    return `<section class="mb-market"><div class="mb-table-heading"><h2>실시간 종목 <span>${members.length}</span></h2><span class="mb-updating"><i></i>${timeLabel(currentClock(state).minute)} 기준</span></div><div class="mb-rank-tabs" aria-label="종목 순위 필터">${[['all','전체'],['up','급상승'],['down','급하락'],['reviews','한 줄 많은'],['favorites','관심 종목']].map(([key,label])=>`<button class="${ranking===key?'active':''}" data-action="ranking" data-id="${key}" aria-pressed="${ranking===key}">${key==='favorites'?icon('star'):''}${label}</button>`).join('')}</div><div class="mb-table-tools"><select id="market-department" aria-label="종목 학과"><option value="all">전체 학과</option>${DEPARTMENTS.map(d=>`<option value="${d}" ${department===d?'selected':''}>${deptShort(d)}</option>`).join('')}</select><label class="mb-search">${icon('search')}<input id="market-search" type="search" aria-label="교수님 또는 강의 검색" placeholder="교수님, 강의 검색" value="${esc(query)}"></label><label class="mb-mine"><input type="checkbox" id="mine-toggle" ${onlyMine?'checked':''}>내 수업</label><select id="market-sort" aria-label="종목 정렬"><option value="return" ${sort==='return'?'selected':''}>등락률순</option><option value="price" ${sort==='price'?'selected':''}>현재가순</option><option value="name" ${sort==='name'?'selected':''}>이름순</option></select></div><table class="mb-table"><thead><tr><th colspan="2">순위 · 종목</th><th>현재가</th><th>오늘 등락률</th><th>최근 흐름</th><th>한 줄 평</th><th><span class="sr-only">관심 종목</span></th></tr></thead><tbody>${display.map((p,i)=>{
      const stock=state.stocks[p.id], favorite=state.favorites.includes(p.id);
      return `<tr data-action="stock" data-id="${p.id}"><td class="mb-rank">${current*pageSize+i+1}</td><td><button class="mb-stock-name" data-action="stock" data-id="${p.id}" aria-label="${esc(p.name)} 종목 상세">${avatar(p)}<span><strong>${esc(p.name)}${myIds.has(p.id)?'<i class="mb-my-dot" title="내 수업 종목"></i>':''}</strong><small>${deptShort(p.department)}</small></span></button></td><td class="mb-price">${number(stock.price)}<small>유니코인</small></td><td class="${direction(daily(p.id))} mb-change">${pct(daily(p.id))}</td><td>${spark(stock.history,daily(p.id))}</td><td class="mb-reviews">${counts.get(p.id).toLocaleString()}<small>개</small></td><td><button class="mb-favorite ${favorite?'selected':''}" data-action="favorite" data-id="${p.id}" aria-label="${esc(p.name)} 관심 종목 ${favorite?'해제':'등록'}" aria-pressed="${favorite}">${icon('star')}</button></td></tr>`;
    }).join('')||`<tr><td colspan="7"><div class="mb-empty">${ranking==='favorites'?'아직 관심 종목이 없어요.<br>종목 옆 별을 눌러 담아보세요.':'조건에 맞는 종목이 없어요.<br>다른 필터나 검색어로 찾아보세요.'}</div></td></tr>`}</tbody></table><div class="mb-table-footer"><span>${members.length ? current*pageSize+1:0}–${Math.min(members.length,(current+1)*pageSize)} / ${members.length}개 종목</span><div><button data-action="page" data-id="-1" aria-label="이전 종목" ${current===0?'disabled':''}>‹</button><strong>${current+1}<span> / ${pages}</span></strong><button data-action="page" data-id="1" aria-label="다음 종목" ${current===pages-1?'disabled':''}>›</button></div></div></section>`;
  }
  function pulse() {
    const state=getState(), counts=catalog.professors.reduce((all,p)=>{const v=daily(p.id); all[v>.000001?'up':v<-.000001?'down':'flat']++;return all;},{up:0,flat:0,down:0});
    return `<div class="mb-breadth"><span>오늘의 캠퍼스 온도</span><div class="mb-breadth-track" aria-hidden="true"><i class="positive" style="flex:${counts.up}"></i><i class="neutral" style="flex:${counts.flat}"></i><i class="negative" style="flex:${counts.down}"></i></div><strong class="up">상승 ${counts.up}</strong><span>보합 ${counts.flat}</span><strong class="down">하락 ${counts.down}</strong></div>`;
  }
  function render(options) {
    return `${indices(options.department)}<div class="mb-layout"><div class="mb-main">${highlights()}<div id="market-table-region">${table(options)}</div>${pulse()}</div><aside class="mb-rail">${live.newsList()}${live.liveComments()}${live.todayClasses()}</aside></div>`;
  }
  return { render, table };
}
