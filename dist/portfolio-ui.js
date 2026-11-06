import { portfolio } from './market.js';
import { professorInitials } from './identity.js';

export function createPortfolioUI(context) {
  const { getState, catalog, icon, esc, number, pct, direction, prof, course, colorFor, chart } = context;
  const signed = value => `${value > .000001 ? '+' : ''}${number(value)}`;
  const changeClass = value => `pf-${direction(value)}`;
  const avatar = id => `<span class="pf-avatar" style="--pf-color:${colorFor(id)}">${esc(professorInitials(prof(id).name))}</span>`;
  const assetShare = (holding, assets) => assets.value > 0 ? holding.value / assets.value : 0;

  function allocation(assets) {
    return `<aside class="pf-allocation"><div class="pf-section-heading"><h2>이번 학기 구성</h2><span>시간표 기준</span></div><div class="pf-semester-stats"><div><strong>${assets.totalCredits}</strong><span>학점</span></div><div><strong>${assets.selected.length}</strong><span>강의</span></div><div><strong>${assets.holdings.length}</strong><span>종목</span></div></div><div class="pf-allocation-heading"><h3>학점 배분</h3><span>전체 ${assets.totalCredits}학점</span></div>${assets.holdings.length ? `<div class="pf-allocation-bar" aria-label="교수님별 학점 배분">${assets.holdings.map(holding => `<span style="flex:${holding.credits};background:${colorFor(holding.id)}" title="${esc(prof(holding.id).name)} ${holding.credits}학점 · ${(holding.weight * 100).toFixed(1)}%"></span>`).join('')}</div><div class="pf-allocation-list">${assets.holdings.map(holding => `<button data-action="stock" data-id="${esc(holding.id)}"><i style="background:${colorFor(holding.id)}"></i><strong>${esc(prof(holding.id).name)}</strong><span>${holding.credits}학점</span><b>${(holding.weight * 100).toFixed(1)}%</b></button>`).join('')}</div>` : '<div class="pf-allocation-empty">시간표에 강의를 담으면<br>교수님별로 학점이 모여요.</div>'}<div class="pf-formula"><span>${icon('calendar')}시간표가 곧 나의 구성</span><p>각 강의의 <strong>학점 × 교수님 주가</strong>를<br>모두 더한 값이 내 자산이에요.</p></div></aside>`;
  }

  function holdingsTable(assets) {
    const holdings = [...assets.holdings].sort((a, b) => b.value - a.value);
    return `<section class="pf-holdings"><div class="pf-section-heading"><div><h2>내 교수님 종목 <span>${holdings.length}</span></h2><p>수강하는 강의가 종목 구성에 자동으로 연결돼요.</p></div><button class="pf-text-button" data-action="edit">시간표 편집 ${icon('chevron')}</button></div>${holdings.length ? `<div class="pf-table-wrap"><table class="pf-table"><thead><tr><th scope="col">종목</th><th scope="col">연결 학점</th><th scope="col">현재 주가</th><th scope="col">평가액</th><th scope="col">시즌 평가손익</th><th scope="col">자산 비중</th></tr></thead><tbody>${holdings.map(holding => {
      const p = prof(holding.id), stock = getState().stocks[holding.id], count = assets.selected.filter(c => c.professorId === holding.id).length;
      const share = assetShare(holding, assets), totalReturn = holding.baseValue > 0 ? holding.profit / holding.baseValue : 0;
      return `<tr><td><button class="pf-stock-name" data-action="stock" data-id="${esc(holding.id)}" aria-label="${esc(p.name)} 종목 상세">${avatar(holding.id)}<span><strong>${esc(p.name)}</strong><small>${esc(p.department)}</small></span>${icon('chevron')}</button></td><td><strong>${holding.credits}<small>학점</small></strong><span class="pf-cell-secondary">${count}개 강의</span></td><td><strong>${number(stock.price)}</strong><span class="pf-cell-secondary">유니코인</span></td><td class="pf-value-cell"><strong>${number(holding.value)}</strong><span class="pf-cell-secondary">유니코인</span></td><td class="${changeClass(holding.profit)}"><strong>${signed(holding.profit)}</strong><span class="pf-cell-secondary">${pct(totalReturn)}</span></td><td><strong>${(share * 100).toFixed(1)}<small>%</small></strong><span class="pf-weight-track"><i style="width:${(share * 100).toFixed(4)}%;background:${colorFor(holding.id)}"></i></span></td></tr>`;
    }).join('')}</tbody></table></div><div class="pf-table-note"><span>평가액 = 연결 학점 × 현재 주가</span><span>자산 비중은 현재 평가액 기준이에요.</span></div>` : '<div class="pf-empty-holdings"><span>📚</span><h3>아직 연결된 종목이 없어요</h3><p>이번 학기 강의를 담고 나만의 캠퍼스 자산을 만들어보세요.</p><button class="pf-primary-button" data-action="edit">시간표에 강의 담기 '+icon('plus')+'</button></div>'}</section>`;
  }

  function connectedCourses(assets) {
    if (!assets.selected.length) return '';
    return `<details class="pf-connected"><summary><span>${icon('book')}어떤 수업이 연결돼 있나요? <b>${assets.selected.length}개</b></span>${icon('chevron')}</summary><div class="pf-course-grid">${assets.selected.map(c => {
      const professor = prof(c.professorId), value = c.credits * getState().stocks[c.professorId].price;
      return `<button class="pf-course" data-action="stock" data-id="${esc(c.professorId)}"><i style="background:${colorFor(c.professorId)}"></i><span><strong>${esc(c.name)}</strong><small>${esc(professor.name)} · ${c.credits}학점</small></span><b>${number(value)}<small>유니코인</small></b></button>`;
    }).join('')}</div></details>`;
  }

  function render({ range = 'month' } = {}) {
    const assets = portfolio(getState(), catalog);
    return `<div class="pf-page"><header class="pf-page-heading"><div><span class="pf-eyebrow">MY CAMPUS ASSETS</span><h1>내 자산</h1><p>${assets.totalCredits ? `${assets.totalCredits}학점이 열일 중. 내 전공력, 오늘은 얼마?` : '내 시간표로 시작하는, 이번 학기 전공력.'}</p></div><button class="pf-outline-button" data-action="nav" data-view="timetable">${icon('calendar')}내 시간표 보기</button></header><div class="pf-overview"><section class="pf-asset-card"><div class="pf-asset-label"><span>총 자산</span><span class="pf-auto-badge">${icon('check')}시간표 자동 구성</span></div><div class="pf-total"><strong>${number(assets.value)}</strong><span>유니코인</span></div><div class="pf-profit-row"><span>시즌 평가손익</span><strong class="${changeClass(assets.profit)}">${signed(assets.profit)}<small>유니코인</small></strong><b class="pf-return-badge ${changeClass(assets.totalReturn)}">${pct(assets.totalReturn)}</b></div><div class="pf-baseline">시즌 기준 자산 <strong>${number(assets.baseValue)} 유니코인</strong><span>${assets.totalCredits}학점 × 기준 주가 100</span></div><div class="pf-chart-heading"><h2>자산의 흐름</h2><div class="pf-range" aria-label="자산 차트 기간">${[['week','1주'],['month','1개월'],['all','전체']].map(([key,label]) => `<button data-action="range" data-id="${key}" class="${range === key ? 'active' : ''}" aria-pressed="${range === key}">${label}</button>`).join('')}</div></div>${assets.holdings.length ? `<div class="pf-chart">${chart(assets.history, '내 총 자산 · 유니코인', 'asset', range)}</div>` : '<div class="pf-empty-chart"><span>'+icon('trend')+'</span><p>시간표를 담으면 자산의 흐름이 보여요.</p></div>'}<p class="pf-chart-note">현재 시간표 구성으로 계산한 가상 자산의 변화예요.</p></section>${allocation(assets)}</div>${holdingsTable(assets)}${connectedCourses(assets)}</div>`;
  }

  function compact() {
    const assets = portfolio(getState(), catalog);
    return `<section class="pf-compact"><div class="pf-section-heading"><h2>내 자산</h2><button class="pf-text-button" data-action="nav" data-view="portfolio">전체 보기 ${icon('chevron')}</button></div><div class="pf-compact-total"><strong>${number(assets.value)}</strong><span>유니코인</span></div><div class="pf-compact-profit"><span>시즌 평가손익</span><strong class="${changeClass(assets.profit)}">${signed(assets.profit)} <small>(${pct(assets.totalReturn)})</small></strong></div><div class="pf-compact-summary">${assets.selected.length}개 강의 <i>·</i> ${assets.totalCredits}학점 <i>·</i> ${assets.holdings.length}개 종목</div>${assets.selected.length ? `<div class="pf-compact-courses">${assets.selected.map(c => `<button data-action="stock" data-id="${esc(c.professorId)}"><i style="background:${colorFor(c.professorId)}"></i><span>${esc(c.name)}</span><b>${c.credits}<small>학점</small></b></button>`).join('')}</div>` : '<p class="pf-compact-empty">강의를 담으면 교수님 주가와<br>학점으로 내 자산을 계산해요.</p>'}<button class="pf-compact-link" data-action="nav" data-view="portfolio">내 자산 자세히 보기 ${icon('arrow')}</button></section>`;
  }

  return { render, compact };
}
