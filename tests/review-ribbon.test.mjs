import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewRibbon } from '../dist/review-ribbon.js';

const catalog = {
  professors: [{id:'a',name:'김인수'}, {id:'b',name:'이장호'}],
  courses: [{id:'nlp',name:'자연어처리',professorId:'a'}, {id:'vision',name:'컴퓨터비젼',professorId:'b'}],
};
const row = (id, overrides = {}) => ({id,courseId:'nlp',date:'2020-01-01',minute:500,nickname:'수강생',score:80,comment:`한 줄 ${id}`,demoLikes:14,...overrides});
const fresh = () => ({clockMode:'demo',demoDate:'2020-01-01',minute:600,selectedCourseIds:['nlp'],reviewArchive:{},reviewFeed:[],classBatches:{},userReviews:{},commentLikes:{}});
const esc = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ui = getState => createReviewRibbon({getState,catalog,esc,icon:()=>'',prof:id=>catalog.professors.find(p=>p.id===id),course:id=>catalog.courses.find(c=>c.id===id)});
const shown = ribbon => ribbon.render().match(/data-ribbon-review="([^"]+)"/)?.[1];

test('ribbon shows exactly one review and preserves its identity across live price and clock renders', () => {
  const state=fresh();
  state.reviewFeed=[row('first',{minute:590}),row('other',{courseId:'vision',minute:580}),row('third',{minute:570})];
  const ribbon=ui(()=>state);
  assert.equal(shown(ribbon),'first');
  assert.equal(ribbon.step(1),'other');
  state.minute=620;
  state.reviewFeed.unshift(row('incoming',{minute:610}));
  state.stocks={a:{price:193.41}};
  assert.equal(shown(ribbon),'other');
  assert.equal((ribbon.render().match(/data-ribbon-review=/g)??[]).length,1);
  assert.match(ribbon.render(),/data-action="stock-reviews" data-id="b" data-course="vision"/);
});

test('ribbon wraps next and previous, excludes blank or future reviews and limits its diversified pool', () => {
  const state=fresh();
  state.reviewFeed=[row('first',{minute:590}),row('other',{courseId:'vision',minute:580}),row('blank',{comment:'  '}),row('later',{minute:601})];
  const ribbon=ui(()=>state);
  assert.equal(shown(ribbon),'first');
  assert.equal(ribbon.step(-1),'other');
  assert.equal(ribbon.step(1),'first');
  assert.equal(ribbon.step(NaN),'first');
  state.reviewFeed=Array.from({length:45},(_,i)=>row(`r${i}`,{minute:550-i,courseId:i%2?'vision':'nlp'}));
  const markup=ribbon.render();
  assert.match(markup,/총 30개/);
  assert.equal(shown(ribbon),'r0');
  assert.equal(ribbon.step(30),'r0');
});

test('ribbon recovers from pruned data and resets selection on state or clock-mode replacement', () => {
  let state=fresh();
  state.reviewFeed=[row('first',{minute:590}),row('other',{courseId:'vision',minute:580}),row('third',{minute:570})];
  const ribbon=ui(()=>state);
  ribbon.step(1);
  assert.equal(shown(ribbon),'other');
  state.reviewFeed=state.reviewFeed.filter(r=>r.id!=='other');
  assert.equal(shown(ribbon),'first');
  ribbon.step(1);
  assert.equal(shown(ribbon),'third');
  state={...state};
  assert.equal(shown(ribbon),'first');
  ribbon.step(1);
  state.clockMode='live';
  assert.equal(shown(ribbon),'first');
});

test('ribbon reflects visible applause, controlled pause and escaped text without mutating reviews', () => {
  const state=fresh();
  state.reviewFeed=[row('html',{minute:590,comment:'<script>"안녕"</script>'}),row('second',{courseId:'vision',minute:580})];
  const ribbon=ui(()=>state), before=JSON.stringify(state);
  const markup=ribbon.render({paused:true});
  assert.doesNotMatch(markup,/<script>/);
  assert.match(markup,/&lt;script&gt;&quot;안녕&quot;&lt;\/script&gt;/);
  assert.match(markup,/공감 <b>14<\/b>/);
  assert.match(markup,/aria-label="한 줄 자동 넘김 재생" aria-pressed="true"/);
  assert.equal(JSON.stringify(state),before);
  state.commentLikes.html=true;
  assert.match(ribbon.render(),/공감 <b>15<\/b>/);
  state.commentLikes.html=false;
  assert.match(ribbon.render(),/공감 <b>14<\/b>/);
  assert.equal(shown(ribbon),'html');
});

test('empty and single-review ribbons are clear and do not offer unusable playback controls', () => {
  const state=fresh(), ribbon=ui(()=>state);
  assert.match(ribbon.render(),/첫 한 줄을 기다리고 있어요/);
  assert.equal(ribbon.step(1),null);
  assert.equal((ribbon.render().match(/ disabled/g)??[]).length,3);
  state.reviewFeed=[row('only')];
  assert.equal(shown(ribbon),'only');
  assert.equal(ribbon.step(1),'only');
  assert.equal((ribbon.render().match(/ disabled/g)??[]).length,3);
});
