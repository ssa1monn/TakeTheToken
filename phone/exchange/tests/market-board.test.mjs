import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState} from '../market.js';
import {currentClock} from '../campus.js';
import {createMarketBoard} from '../market-board.js';

const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const rowIds=html=>[...html.matchAll(/<tr data-action="stock" data-id="([^"]+)"/g)].map(m=>m[1]);
function boardFor(state){
  return createMarketBoard({getState:()=>state,catalog,esc:String,icon:()=>'',number:n=>n.toFixed(2),pct:n=>`${n*100}%`,direction:()=>'',colorFor:()=>'#314590',course:id=>catalog.courses.find(c=>c.id===id),live:{},reviewsFor:()=>[]});
}

test('default alphabetical order stays stable when all prices and returns change',()=>{
  const state=createState(catalog), board=boardFor(state);
  const expected=[...catalog.professors].sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id)).map(p=>p.id);
  assert.deepEqual(rowIds(board.table()),expected.slice(0,10));
  catalog.professors.forEach((p,i)=>Object.assign(state.stocks[p.id],{price:500-i*8,todayReturn:(i-20)/100,priceDate:currentClock(state).date}));
  assert.deepEqual(rowIds(board.table()),expected.slice(0,10));
  assert.deepEqual(rowIds(board.table({page:1})),expected.slice(10,20));
  assert.match(board.table(),/value="name" selected/);
});

test('explicit movement ranking orders by returns and resolves ties by name',()=>{
  const state=createState(catalog), board=boardFor(state);
  catalog.professors.forEach((p,i)=>Object.assign(state.stocks[p.id],{todayReturn:i%2?-.2:.2,priceDate:currentClock(state).date}));
  const expected=catalog.professors.filter((_,i)=>i%2).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id)).map(p=>p.id);
  assert.deepEqual(rowIds(board.table({ranking:'down'})),expected.slice(0,10));
  assert.deepEqual(rowIds(board.table({query:'김인수'})),catalog.professors.filter(p=>p.name==='김인수').map(p=>p.id));
});

test('one discovery card cycles through all three campus picks',()=>{
  const board=boardFor(createState(catalog));
  for(const [index,title] of ['오늘 폼 미쳤다','이 강의, 댓글 맛집','전공 롤러코스터'].entries()){
    const html=board.discovery(index);
    assert.match(html,new RegExp(`<h2><span>.*?</span>${title}</h2>`));
    assert.equal((html.match(/class="mb-discovery-main"/g)||[]).length,1);
    assert.equal((html.match(/data-action="discovery-select"/g)||[]).length,3);
  }
  assert.match(board.discovery(3),/data-slide="0"/);
  assert.match(board.discovery(-1,true),/data-slide="2"/);
  assert.match(board.discovery(-1,true),/자동 넘김 꺼짐/);
});
