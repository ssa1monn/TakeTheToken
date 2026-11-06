import test from 'node:test';
import assert from 'node:assert/strict';
import {demoReviewLikes,reviewLikeCount} from '../review-engagement.js';

test('demo reactions stay stable across reads and a personal toggle adds exactly one',()=>{
  const r={id:'demo:class:abc',source:'simulation'},s={commentLikes:{}};
  const base=reviewLikeCount(s,r);
  assert.ok(base>=0&&Number.isInteger(base));
  assert.equal(reviewLikeCount(s,{...r}),base);
  s.commentLikes[r.id]=true;assert.equal(reviewLikeCount(s,r),base+1);
  s.commentLikes[r.id]=false;assert.equal(reviewLikeCount(s,r),base);
  assert.equal(demoReviewLikes({...r,demoLikes:42}),42);
});

test('personal reviews never receive fabricated peer reactions',()=>{
  const r={id:'own:2026-11-06:course',source:'self',demoLikes:42};
  assert.equal(reviewLikeCount({commentLikes:{}},r),0);
  assert.equal(reviewLikeCount({commentLikes:{[r.id]:true}},r),1);
});
