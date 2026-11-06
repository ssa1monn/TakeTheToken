import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCommunityReviews, interleaveCommunityReviews, createLiveUI } from '../dist/live-ui.js';

const catalog = {
  professors: [{id:'a',name:'김인수',department:'컴퓨터공학부'}, {id:'b',name:'이장호',department:'컴퓨터공학부'}],
  courses: [
    {id:'nlp',name:'자연어처리',professorId:'a',credits:3},
    {id:'deep',name:'심층학습',professorId:'a',credits:3},
    {id:'vision',name:'컴퓨터비젼',professorId:'b',credits:3},
  ],
};
const now = {date:'2026-11-06',minute:900};
const row = (id, overrides={}) => ({id,courseId:'nlp',date:now.date,minute:850,nickname:'수강생',score:80,comment:`한 줄 ${id}`,...overrides});
const fresh = () => ({clockMode:'demo',simDate:now.date,minute:now.minute,selectedCourseIds:['nlp'],reviewArchive:{},reviewFeed:[],classBatches:{},userReviews:{},commentLikes:{}});

test('community collection deduplicates sources and excludes future, invalid and unselected-course reviews', () => {
  const state = fresh(), shared=row('shared');
  state.reviewArchive = {a:[shared]};
  state.reviewFeed = [shared,row('future',{minute:901}),row('tomorrow',{date:'2026-11-07'}),row('bad-score',{score:NaN}),row('missing',{courseId:'not-a-course'})];
  state.classBatches = {one:{reviews:[shared,row('other-class',{courseId:'deep'}),row('other-prof',{courseId:'vision'})]}};
  state.userReviews['2026-11-06:nlp'] = {date:now.date,minute:900,score:72,comment:'직접 남긴 평'};
  const all = collectCommunityReviews(state,catalog,now);
  assert.equal(all.length,4);
  assert.equal(all[0].source,'self');
  assert.deepEqual(collectCommunityReviews(state,catalog,now,{mine:true}).map(r=>r.id),['own:2026-11-06:nlp','shared']);
  assert.equal(all.find(r=>r.id==='other-class').professorId,'a');
});

test('community search and tone filters use actual comments and course metadata without altering state', () => {
  const state=fresh();
  state.reviewFeed=[row('good'),row('critical',{courseId:'vision',score:40,comment:'복습 한 바퀴 더'}),row('okay',{score:60})];
  const saved=JSON.stringify(state);
  assert.deepEqual(collectCommunityReviews(state,catalog,now,{tone:'positive'}).map(r=>r.id),['good']);
  assert.deepEqual(collectCommunityReviews(state,catalog,now,{tone:'critical',query:'이장호'}).map(r=>r.id),['critical']);
  assert.equal(collectCommunityReviews(state,catalog,now,{query:'컴퓨터비젼'}).length,1);
  assert.equal(collectCommunityReviews(state,catalog,now,{query:'복습'}).length,1);
  assert.equal(JSON.stringify(state),saved);
});

test('community interleaves courses without dropping duplicate text and reports matching result counts', () => {
  const state=fresh();
  state.reviewFeed=[row('1'),row('2'),row('3'),row('4',{courseId:'vision'}),row('5',{courseId:'deep',comment:'한 줄 1'}),row('escape',{comment:'<script>alert("x")</script>'})];
  const all=collectCommunityReviews(state,catalog,now), ordered=interleaveCommunityReviews(all,catalog);
  assert.equal(ordered.length,all.length);
  assert.equal(new Set(ordered.slice(0,2).map(r=>r.courseId)).size,2);
  assert.equal(ordered.at(-1).id,'5');
  const ui=createLiveUI({getState:()=>state,catalog,esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:()=>'',colorFor:()=> '#314590',prof:id=>catalog.professors.find(p=>p.id===id),course:id=>catalog.courses.find(c=>c.id===id)});
  const markup=ui.community(false,{query:'컴퓨터비젼'});
  assert.match(markup,/총 1개/);
  assert.equal((markup.match(/data-review-id=/g)??[]).length,1);
  assert.doesNotMatch(markup,/\b(?:NaN|undefined|Infinity)\b/);
  assert.doesNotMatch(ui.community(),/<script>/);
  assert.match(ui.community(),/&lt;script&gt;/);
});

test('community popularity sorting orders every filtered review by its visible applause count', () => {
  const state=fresh();
  state.reviewFeed=[
    row('new',{minute:899,demoLikes:2}),
    row('popular-a',{minute:850,demoLikes:30}),
    row('popular-b',{minute:840,demoLikes:25}),
    row('other-course',{courseId:'vision',minute:890,demoLikes:10}),
    row('zero',{source:'self',demoLikes:0}),
  ];
  state.commentLikes['popular-b']=true;
  const ui=createLiveUI({getState:()=>state,catalog,esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:()=>'',colorFor:()=> '#314590',prof:id=>catalog.professors.find(p=>p.id===id),course:id=>catalog.courses.find(c=>c.id===id)});
  const markup=ui.community(false,{sort:'popular'});
  assert.deepEqual([...markup.matchAll(/data-review-id="([^"]+)"/g)].map(match=>match[1]),['popular-a','popular-b','other-course','new','zero']);
  assert.match(markup,/공감 <b>26<\/b>/);
  assert.match(markup,/공감 <b>0<\/b>/);
  assert.match(markup,/data-action="community-sort" data-id="popular" class="active"/);
  assert.match(ui.commentCard(state.reviewFeed[4],true),/>♡ 0<\/button>/);
  state.commentLikes['popular-b']=false;
  assert.match(ui.community(false,{sort:'popular'}),/공감 <b>25<\/b>/);
  const mine=ui.community(true,{sort:'popular',tone:'positive',query:'자연어처리'});
  assert.doesNotMatch(mine,/data-review-id="other-course"/);
  assert.equal((mine.match(/data-review-id=/g)??[]).length,4);
});
