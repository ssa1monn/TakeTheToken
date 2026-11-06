// ───────────────────────────────────────────────
// 이스터에그: 대학본부 총장실 → 총장 시뮬레이터 (easter/president.html, 원작 SW 브랜치)
// (places/helpers.js 다음, game.js 전에 로드)
//
//   대학본부에 들어갈 때 가끔 "총장실 문이 열려 있다"가 뜬다 — 퇴근 무렵(16시~)에 더 잘 열린다
//   학기에 한 번. 총장 의자에 앉으면 시뮬레이터가 iframe으로 열리고, 임기 결과에 따라 보상
// ───────────────────────────────────────────────
const PRESIDENT_PLACE = 'hq';
const PRESIDENT_CHANCE = h => (h >= 16 ? 0.7 : 0.3);   // 퇴근 무렵(16~18시) 70%, 그 외 30%

// 판정(시뮬레이터 verdict) → 게임 보상
const PRESIDENT_REWARDS = {
  '전설의 총장':       { fx: { social: 8, spec: 5, peers: 6 }, msg: '다음 날 대학본부 앞에 "어제 그 총장님 누구냐"는 대자보가 붙었다.', post: '어제 총장실에서 결재 도장 찍고 나온 학생 봤다는 제보 있음. 총장보다 결재 잘했다던데' },
  '무난한 총장':       { fx: { spec: 3, social: 3 }, msg: '아무도 모르게 학교를 하루 운영했다. 아무 일도 없었다. 그게 제일 어렵다.' },
  '면담 요청 받은 총장': { fx: { spec: 2, peers: -2, cond: -3 }, msg: '나오는 길에 학생회장과 마주쳤다. "총장님 면담 요청… 어? 학생이세요?"' },
  '탄핵 서명 진행 중':  { fx: { peers: -5, cond: -5, spec: 1 }, msg: '익명게시판의 탄핵 서명이 진짜로 올라왔다. 서명자 명단에 내 친구가 있다.', post: '총장실에서 이상한 결재 한 사람 누구임? 대나무숲 서명 300명 돌파' },
  '재정 파탄 총장':     { fx: { social: 4, money: -5, parents: -3 }, msg: '총장 법인카드는 없었다. 대신 내 카드로 커피 50잔이 결제돼 있었다.', post: '본부 기획처 직원분이 퇴근길에 울면서 나가는 거 봤는데 무슨 일임?' },
};

function presidentPick(s, placeKey, h) {
  if (placeKey !== PRESIDENT_PLACE || s.stage !== 'ug') return null;
  const sem = `${s.stage}-${s.stageSem}`;
  if (s.flags.presidentSem === sem || Math.random() >= PRESIDENT_CHANCE(h)) return null;
  s.flags.presidentSem = sem;
  return ev('president_door', '🚪', '총장실 문이 열려 있다', '복도 끝 "총장실" 문이 반쯤 열려 있다. 비서실도 비었다. 책상 위에 결재판이 놓여 있고, 의자가 아직 따뜻하다.', [
    act('총장 의자에 앉아 본다', st => {
      inc(st, 'president');
      pushModal(openPresidentRoom);          // 결과 화면을 닫으면 시뮬레이터가 열린다
      return { fx: {}, msg: '의자가 생각보다 푹신하다. 결재판을 펼치자 첫 장에 "결재 요망 · 금일 18:00까지"라고 적혀 있다.' };
    }),
    ch('조용히 문을 닫는다', { cond: 1 }, '문틈으로 본 총장실은 생각보다 소박했다. 화분이 많았다.'),
  ]);
}

// 시뮬레이터를 전체 화면 iframe으로 띄운다 (게임 모달 큐 안에서 실행 → 시간은 멈춰 있다)
function openPresidentRoom() {
  document.getElementById('modal').classList.add('hidden');
  const wrap = document.createElement('div');
  wrap.id = 'president-room';
  wrap.innerHTML = '<iframe src="easter/president.html" title="총장 시뮬레이터"></iframe>';
  document.body.appendChild(wrap);
  const frame = wrap.querySelector('iframe');
  frame.addEventListener('load', () => frame.focus());

  const onMsg = e => {
    if (e.source !== frame.contentWindow || !e.data?.type?.startsWith('president-')) return;
    removeEventListener('message', onMsg);
    wrap.remove();
    document.getElementById('modal').classList.remove('hidden');
    if (e.data.type === 'president-exit') {
      showInfoModal('🚪', '총장실을 빠져나왔다', e.data.agendas
        ? `결재 ${e.data.agendas}건만 하고 슬그머니 나왔다. 나머지 서류는 진짜 총장님이 처리하실 것이다.`
        : '결재판만 넘겨 보고 나왔다. 아무도 눈치채지 못했다.');
      return;
    }
    const r = PRESIDENT_REWARDS[e.data.verdict] || PRESIDENT_REWARDS['무난한 총장'];
    S.flags.presidentVerdict = e.data.verdict;
    const parts = applyFx(S, r.fx);
    if (r.post) addPost(S, r.post);
    renderAll();
    showInfoModal('🏛️', `하루 총장 체험: ${e.data.verdict}`,
      `<p>${esc(r.msg)}</p><p class="muted">지지율 ${e.data.sup}% · 예산 ${e.data.bud}억 · 학업 평판 ${e.data.aca}</p>` +
      `<div class="fx">${parts.map(p => `<span>${esc(p)}</span>`).join('')}</div>`);
  };
  addEventListener('message', onMsg);
}

// 대나무숲 힌트
POST_TEMPLATES.push(
  { when: s => s.stage === 'ug' && !s.counters.president, text: '대학본부 총장실 오후 4시 넘으면 문 열어 두고 간다던데 진짜임?' },
  { when: s => !!s.counters.president, text: '총장실 의자 앉아 본 사람? 생각보다 푹신하다던데' },
);
