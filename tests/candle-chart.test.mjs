import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandles, createCandleChartUI, priceLinePath, smoothPath } from '../dist/candle-chart.js';

const clock = { date: '2026-11-06', minute: 960 };
const point = (minute, open, high, low, close, causes = [], extra = {}) => ({ date: clock.date, day: minute, minute, open, high, low, close, price: close, causes, ...extra });
const review = { id: 'review:graphics', type: 'review', title: '컴퓨터그래픽스 강의평', summary: '수업 종료 후 응답 반영', impact: .03, courseId: 'graphics', count: 20, score: 82, reviews: [{ id: 'student:1', nickname: '행렬두부', comment: '이제 내가 도형 돌림. 제제이야', score: 85 }] };
const news = { id: 'news:1', type: 'news', title: '실습 장비 업그레이드', summary: '새로운 실습 환경 안내', impact: .02, eventId: 'news:1' };
const variation = { id: 'variation:1', type: 'variation', title: '시연 변동 · 불규칙', summary: '시연 가격 변화예요.', impact: -.01 };

test('30-minute candles preserve first open, extrema, last close and each causal update', () => {
  const history = [point(900, 100, 106, 99, 103, [review]), point(910, 103, 104, 100, 102, [variation]), point(930, 102, 105, 101, 104, [news])];
  const before = structuredClone(history);
  const candles = buildCandles(history, clock, 'today');
  assert.equal(candles.length, 2);
  assert.deepEqual([candles[0].open, candles[0].high, candles[0].low, candles[0].close], [100, 106, 99, 102]);
  assert.equal(candles[0].key, '2026-11-06:T900');
  assert.equal(candles[1].key, '2026-11-06:T930');
  assert.equal(candles[0].reviewCount, 1);
  assert.equal(candles[0].eventCount, 1, 'simulation variation is not a fake news marker');
  assert.equal(candles[0].updates[0].causes[0].reviews[0].comment, review.reviews[0].comment);
  assert.deepEqual(history, before, 'chart aggregation must not mutate source snapshots');
});

test('daily candles combine intraday observations and exclude later timestamps and dates', () => {
  const history = [
    point(600, 99, 102, 98, 100, [], { date: '2026-11-05' }),
    point(900, 100, 104, 99, 103, [review]), point(960, 103, 105, 102, 104, [news]),
    point(961, 104, 999, 1, 999, [variation]), point(600, 999, 999, 1, 1, [variation], { date: '2026-11-07' }),
  ];
  const candles = buildCandles(history, clock, 'month');
  assert.equal(candles.length, 2);
  assert.equal(candles[1].key, '2026-11-06');
  assert.deepEqual([candles[1].open, candles[1].high, candles[1].low, candles[1].close], [100, 105, 99, 104]);
  assert.deepEqual(candles[1].causes.map(cause => cause.type), ['review', 'news']);
});

test('range boundaries and legacy observations use recorded prices without invented wicks', () => {
  const history = [
    { date: '2026-09-30', minute: 1080, price: 90 },
    { date: '2026-10-06', minute: 1080, price: 100 },
    { date: '2026-10-07', minute: 1080, price: 104 },
    { date: '2026-10-30', minute: 1080, price: 102 },
    { date: clock.date, minute: 900, price: 106 },
  ];
  assert.equal(buildCandles(history, clock, 'all').length, 5);
  assert.equal(buildCandles(history, clock, 'month').length, 3);
  assert.equal(buildCandles(history, clock, 'week').length, 2);
  const today = buildCandles(history, clock, 'today');
  assert.deepEqual([today[0].open, today[0].high, today[0].low, today[0].close], [102,106,102,106]);
  assert.equal(today[0].legacy, true);
  assert.equal(today[0].eventCount, 0);
  assert.deepEqual(buildCandles([], clock, 'today'), []);
});

test('candle return is compounded across updates instead of adding percentage contributions', () => {
  const history = [point(900,100,111,99,110,[{...news, impact:.1}]),point(910,110,111,98,99,[{...variation, impact:-.1}])];
  const [candle] = buildCandles(history, clock, 'today');
  const chain = candle.updates.reduce((value, update) => value * (1 + update.change), 1)-1;
  assert.ok(Math.abs(chain - (candle.close/candle.open-1)) < 1e-12);
  assert.ok(Math.abs(chain - -.01) < 1e-12);
  assert.equal(candle.causes.reduce((sum,cause)=>sum+cause.impact,0), 0, 'simple addition would misleadingly imply no price change');
});

test('chart stories retain dated snapshots, escape student text and expose keyboard/click markers', () => {
  const state = { clockMode:'demo',demoDate:clock.date,minute:clock.minute };
  const chart = createCandleChartUI({ getState:()=>state, esc: v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]), number:v=>Number(v).toFixed(2), pct:v=>`${(v*100).toFixed(2)}%`, icon:()=>'' });
  const cause = structuredClone(review);
  cause.reviews[0].comment = '<img src=x onerror=alert(1)>';
  const stock = { history:[point(900,100,104,99,103,[cause])] };
  const html = chart.render(stock,{name:'교수'}, {range:'today',selectedCandleKey:'2026-11-06:T900'});
  assert.ok(html.includes('data-action="chart-event" data-id="2026-11-06:T900"'));
  assert.ok(html.includes('class="cc-chart-svg"') && html.includes('tabindex="0"'));
  assert.ok(html.includes('응답 <strong>20명</strong>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('복리로 연결'));
  assert.ok(!html.includes('NaN'));
  const flat = chart.render({history:[point(900,100,100,100,100)]},{name:'교수'},{range:'today'});
  assert.ok(!flat.includes('NaN'));
  assert.ok(flat.includes('height="1.5"'));
  assert.ok(chart.render({history:[]},{name:'교수'},{range:'today'}).includes('첫 봉'));
});

test('price lines connect every recorded observation with straight segments and preserve empty/single paths', () => {
  const points=[{x:0,y:100},{x:1,y:180},{x:2,y:110},{x:4,y:110},{x:9,y:45},{x:10,y:47},{x:11,y:250}];
  const before=structuredClone(points);
  const path=priceLinePath(points);
  assert.equal(path,'M0,100 L1,180 L2,110 L4,110 L9,45 L10,47 L11,250');
  assert.deepEqual(path.match(/[A-Za-z]/g), ['M', ...Array(points.length-1).fill('L')]);
  assert.equal(smoothPath(points),path,'legacy callers must also use straight segments');
  assert.equal(priceLinePath([]),'');
  assert.equal(priceLinePath([{x:0,y:10}]),'M0,10');
  assert.deepEqual(points,before,'rendering leaves recorded coordinates unchanged');
});

test('selected chart point survives mount setup and simulation variations stay secondary', () => {
  const state={clockMode:'demo',demoDate:clock.date,minute:clock.minute};
  const chart=createCandleChartUI({getState:()=>state,esc:v=>String(v??'').replaceAll('"','&quot;'),number:v=>Number(v).toFixed(2),pct:v=>`${(v*100).toFixed(2)}%`,icon:()=>''});
  const stock={history:[point(900,100,105,99,103,[review, {...variation,impact:0}]),point(930,103,104,100,102,[{...variation,type:'flow',title:'가상 매매',summary:'익절'}])]};
  const html=chart.render(stock,{name:'교수'},{range:'today',chartType:'line',selectedCandleKey:'2026-11-06:T900'});
  assert.ok(html.includes('data-selected-key="2026-11-06:T900"'));
  const linePath=html.match(/<path class="cc-price-line" d="([^"]+)"/)[1];
  assert.deepEqual(linePath.match(/[A-Za-z]/g),['M','L'],'rendered detail line has one straight segment between the two observed candles');
  assert.ok(html.includes('유니코인'));
  assert.ok(!html.includes('가상 매매')&&!html.includes('익절'));
  assert.equal((html.match(/<article class="cc-cause">/g)??[]).length,1,'only the review appears as a major story card');
  const later=chart.render(stock,{name:'교수'},{range:'today',selectedCandleKey:'2026-11-06:T930'});
  assert.ok(later.includes('<details class="cc-variation-history">'));
  assert.ok(!later.includes('가상 매매')&&!later.includes('익절'));

  const listeners={}, values={}, initial={date:null};
  const fields=Object.fromEntries(['open','high','low','close','change'].map(key=>[key,{textContent:'',className:''}]));
  const initialDate={textContent:''};
  const attributeNode={setAttribute:(name,value)=>{values[name]=value;}};
  const crosshair={setAttribute:()=>{},querySelector:()=>attributeNode};
  const tooltip={hidden:true,style:{},querySelector:selector=>selector==='small'?initialDate:fields.close};
  const svg={querySelector:()=>crosshair,addEventListener:(name,listener)=>{listeners[name]=listener;}};
  const fakeChart={dataset:{selectedKey:'early',ccPoints:JSON.stringify([{key:'early',x:10,y:10,label:'15:00',open:'100',high:'105',low:'99',close:'103',change:'3%',direction:'cc-up'},{key:'late',x:30,y:20,label:'15:30',open:'103',high:'104',low:'100',close:'102',change:'-1%',direction:'cc-down'}])},querySelector:selector=>selector==='.cc-chart-svg'?svg:selector==='.cc-tooltip'?tooltip:selector==='.cc-ohlc-date'?initialDate:fields[selector.match(/"(\w+)"/)?.[1]]};
  chart.mount({querySelector:()=>fakeChart});
  listeners.focus();
  assert.equal(initialDate.textContent,'15:00');
  assert.equal(fields.close.textContent,'103');
  listeners.keydown({key:'End',preventDefault(){}});
  assert.equal(initialDate.textContent,'15:30');
  listeners.blur();
  assert.equal(initialDate.textContent,'15:00','leaving hover restores the selected candle, not the newest one');
});
