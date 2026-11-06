import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState, ensureMarketData, closeMarket, queueReview, portfolio} from '../dist/market.js';
import {processCampus, advanceSimulation, randomCampusEvent, fastForwardToday} from '../dist/simulation.js';
import {currentClock} from '../dist/campus.js';

const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const near = (a,b,tolerance=1e-10) => assert.ok(Math.abs(a-b)<=tolerance, `${a} != ${b}`);
const fresh = (volatilityMode='lively') => createState(catalog,{seed:81920,volatilityMode});

test('OHLC history follows prior close and its recorded causes reconcile at every update',()=>{
  const state=fresh();
  for(let i=0;i<35;i++)advanceSimulation(state,catalog,{minutes:10});
  for(const stock of Object.values(state.stocks)) {
    for(let i=1;i<stock.history.length;i++) {
      const candle=stock.history[i],prev=stock.history[i-1];
      near(candle.open,prev.close);
      near(candle.close,candle.price);
      assert.ok(candle.low<=Math.min(candle.open,candle.close));
      assert.ok(candle.high>=Math.max(candle.open,candle.close));
      assert.ok(candle.low>0);
      near(candle.causes.reduce((sum,cause)=>sum+cause.impact,0),candle.close/candle.open-1);
      near(Object.values(candle.contributions).reduce((a,b)=>a+b,0),candle.close/candle.open-1);
    }
  }
});

test('explicit market pulses generate bidirectional movement, while repeated same-minute polls do not',()=>{
  const state=fresh();
  processCampus(state,catalog);
  const first=Object.fromEntries(Object.entries(state.stocks).map(([id,stock])=>[id,stock.price]));
  // Keep event publication out of this polling check.
  state.lastEventDate=state.demoDate;state.lastEventMinute=state.minute;
  processCampus(state,catalog);
  for(const [id,price] of Object.entries(first))near(state.stocks[id].price,price);
  const stock=state.stocks[catalog.professors[0].id];
  for(let i=0;i<30;i++)advanceSimulation(state,catalog,{minutes:10});
  const moves=stock.history.slice(-30).map(p=>p.close/p.open-1);
  assert.ok(moves.filter(n=>n>.002).length>=5);
  assert.ok(moves.filter(n=>n<-.002).length>=5);
  assert.ok(stock.history.at(-1).causes.some(c=>c.type==='variation'));
  const prior=stock.price;closeMarket(state,catalog);near(stock.price,prior);
});

test('historical candles contain both directions and meaningful ranges with reproducible input',()=>{
  const a=fresh(),b=fresh();
  assert.deepEqual(a.stocks,b.stocks);
  for(const stock of Object.values(a.stocks)) {
    assert.ok(stock.history.filter(p=>p.close>p.open).length>=10);
    assert.ok(stock.history.filter(p=>p.close<p.open).length>=10);
    assert.ok(Math.max(...stock.history.map(p=>p.high))-Math.min(...stock.history.map(p=>p.low))>10);
    assert.ok(stock.history.some(p=>p.high>Math.max(p.open,p.close)||p.low<Math.min(p.open,p.close)));
  }
});

test('news clipping and total price limits stay visible in immutable cause receipts',()=>{
  const state=fresh(),p=catalog.professors[0],stock=state.stocks[p.id];
  const events=[.07,.07].map((impact,i)=>({id:`cap:${i}`,type:'research',targetId:p.id,impact,day:state.day+1,applied:false,title:`공시 ${i}`,summary:'원본 문장'}));
  state.events.push(...events);
  closeMarket(state,catalog);
  const point=stock.history.at(-1),news=point.causes.filter(c=>c.type==='news');
  near(news.reduce((sum,c)=>sum+c.impact,0),.12);
  news.forEach(c=>near(c.impact,.06));
  near(point.causes.reduce((sum,c)=>sum+c.impact,0),point.close/point.open-1);
  events[0].title='나중에 바뀐 문장';
  assert.equal(news[0].title,'공시 0');
  const previous=stock.price;closeMarket(state,catalog);near(stock.price,previous);
  assert.ok(!stock.history.at(-1).causes.some(c=>c.type==='news'));
});

test('a submitted classroom review is linked to the exact price update and retains its text',()=>{
  const state=fresh(),c=catalog.courses.find(c=>c.code==='0001423001');
  state.minute=900;
  queueReview(state,catalog,c.id,[5,5,5,5,5,5],'행렬 이해 완. 제제이야');
  closeMarket(state,catalog);
  const point=state.stocks[c.professorId].history.at(-1),cause=point.causes.find(cause=>cause.courseId===c.id);
  assert.equal(cause.type,'review');assert.equal(cause.count,1);
  assert.equal(cause.reviews[0].comment,'행렬 이해 완. 제제이야');
  assert.ok(cause.reviews.every(r=>r.date===point.date&&r.minute<=point.minute));
  state.userReviews[`${state.demoDate}:${c.id}`].comment='나중에 변경';
  assert.equal(cause.reviews[0].comment,'행렬 이해 완. 제제이야');
});

test('legacy line-chart saves are upgraded without rewriting prices, user work, or inventing causes',()=>{
  const state=fresh();delete state.marketVersion;delete state.volatilityMode;
  const originalPrices=Object.fromEntries(Object.entries(state.stocks).map(([id,stock])=>[id,stock.history.map(p=>p.price)]));
  for(const stock of Object.values(state.stocks))stock.history=stock.history.map(({day,date,label,price})=>({day,date,label,price}));
  const preferences=JSON.stringify({courses:state.selectedCourseIds,gpa:state.gpa,reviews:state.userReviews});
  assert.equal(ensureMarketData(state,catalog),true);
  for(const [id,stock] of Object.entries(state.stocks)) {
    assert.deepEqual(stock.history.map(p=>p.price),originalPrices[id]);
    assert.ok(stock.history.every(p=>p.legacy&&p.causes.length===0));
    assert.ok(stock.history.every(p=>p.high===Math.max(p.open,p.close)&&p.low===Math.min(p.open,p.close)));
  }
  assert.equal(JSON.stringify({courses:state.selectedCourseIds,gpa:state.gpa,reviews:state.userReviews}),preferences);
  assert.equal(ensureMarketData(state,catalog),false);
});

test('calm and lively settings affect future pulse and generated news amplitude',()=>{
  const lively=fresh('lively'),calm=structuredClone(lively);calm.volatilityMode='calm';
  closeMarket(lively,catalog,{marketPulse:true});closeMarket(calm,catalog,{marketPulse:true});
  const amount=s=>Object.values(s.stocks).reduce((sum,p)=>sum+Math.abs(p.contributions.variation),0);
  assert.ok(amount(lively)>amount(calm)*3);
  const a=randomCampusEvent(lively,catalog,currentClock(lively));
  const b=randomCampusEvent(calm,catalog,currentClock(calm));
  assert.equal(a.key,b.key);near(a.impact,b.impact*3.5);
});

test('version 2 cause migration removes trading narratives without touching prices or student input',()=>{
  const state=fresh(),stock=state.stocks[catalog.professors[0].id],point=stock.history.at(-1);
  state.marketVersion=2;
  point.causes=[{id:'flow:old',type:'flow',title:'가상 매수세 유입',summary:'시연 매수·매도 수급',impact:.01}];
  point.contributions={flow:.01};stock.contributions={flow:.01};
  state.userReviews.example={comment:'입력한 문장 그대로'};
  const prices=Object.values(state.stocks).map(s=>s.price);
  ensureMarketData(state,catalog);
  assert.equal(point.causes[0].type,'variation');
  assert.equal(point.causes[0].title,'시장 변동');
  assert.ok(!/매수|매도|매매|수급/.test(point.causes[0].summary));
  assert.equal(point.contributions.variation,.01);assert.ok(!('flow' in point.contributions));
  assert.equal(stock.contributions.variation,.01);assert.ok(!('flow' in stock.contributions));
  assert.deepEqual(Object.values(state.stocks).map(s=>s.price),prices);
  assert.equal(state.userReviews.example.comment,'입력한 문장 그대로');
});

test('timetable assets equal course credits times the professor price, including repeated professors',()=>{
  const state=fresh(),result=portfolio(state,catalog);
  const expected=result.selected.reduce((sum,c)=>sum+c.credits*state.stocks[c.professorId].price,0);
  near(result.value,expected);near(result.baseValue,1800);near(result.profit,expected-1800);
  near(result.totalReturn,expected/1800-1);near(result.indexValue,expected/18);
  const kim=catalog.professors.find(p=>p.name==='김인수'),holding=result.holdings.find(h=>h.id===kim.id);
  assert.equal(holding.credits,6);near(holding.value,6*state.stocks[kim.id].price);
  for(let i=0;i<result.history.length;i++)near(result.history[i].price,result.holdings.reduce((s,h)=>s+h.credits*state.stocks[h.id].history[i].price,0));
  state.selectedCourseIds=[];
  const empty=portfolio(state,catalog);assert.equal(empty.value,0);assert.equal(empty.profit,0);assert.equal(empty.totalReturn,0);
  assert.ok(empty.history.every(p=>p.price===0));
});

test('daily recap counts generated events after the visible event archive hits its limit',()=>{
  const state=fresh();
  state.events=Array.from({length:100},(_,i)=>({id:`already:${i}`,type:'research',targetId:catalog.professors[0].id,date:'2026-11-05',minute:700,day:0,impact:0,applied:true}));
  const before=state.generatedEventCount;
  const result=fastForwardToday(state,catalog);
  assert.ok(state.generatedEventCount>before);
  assert.equal(result.eventCount,state.generatedEventCount-before);
  assert.equal(state.events.length,100);
});
