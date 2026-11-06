// ───────────────────────────────────────────────
// 소속 활동 — 한 번 가입하면 매주 조금씩 쌓이고, 활동 전용 이벤트가 생긴다
// (places/helpers.js 다음, game.js 전에 로드)
//
//   home: 가입 · 활동하러 가는 건물 (PLACES 키). 그 건물에 가면 가입 권유 / 활동 이벤트가 뜬다
//   weekly: 매주 자동으로 붙는 효과 (번아웃 주에는 없음)
//   req: 가입 조건 (reqText로 안내)
//   events: 활동 중일 때만 뜨는 이벤트 — 집 건물 방문과 랜덤 이벤트 양쪽에서 나온다
// ───────────────────────────────────────────────
const MAX_ACTIVITIES = 3;
const HOME_EVENT_CHANCE = 0.6;   // 활동 중인 집 건물에 가면 이 확률로 건물 이벤트 대신 활동 이벤트

const ACTIVITIES = {
  club: {
    name: '밴드 동아리', emoji: '🎸', home: 'union', stage: 'ug',
    weekly: { social: 1.5, romance: 0.8, seniors: 0.8, cond: -1 },
    pitch: '학생회관 계단에서 기타 멘 선배가 전단지를 내민다. "보컬 아니어도 돼! 탬버린도 악기야!"',
    joinMsg: '동아리 단톡방에 초대됐다. 공지보다 술자리 투표가 더 많다.',
    quit: { fx: { seniors: -6, peers: -2 }, msg: '단톡방을 나갔다. "○○님이 나갔습니다" 아래로 정적이 흘렀다.' },
    events: [
      ev('club_concert', '🎤', '정기 공연 D-7', '공연이 일주일 남았다. 합주는 아직 한 번도 끝까지 못 갔다.', [
        ch('매일 밤 합주실에 간다', { romance: 4, seniors: 4, cond: -8, study: -3 }, '공연 날, 2절 가사를 까먹었다. 관객이 대신 불러줬다.', '이번 밴드 동아리 공연 2절 떼창 레전드였음'),
        ch('적당히 한다', { romance: 2, seniors: 1 }, '무난했다. 무난한 게 제일 어렵다.'),
      ], { time: ['evening', 'night'] }),
      ev('club_drink', '🍻', '동아리 뒤풀이', '연습 끝나고 "딱 한 잔만"이 시작됐다.', [
        act('끝까지 남는다', s => { inc(s, 'drinks'); return { fx: { social: 4, seniors: 5, cond: -6, money: -4 }, msg: '막차가 끊겼다. 선배가 택시비를 반 내줬다.' }; }),
        ch('1차만 하고 간다', { social: 2, seniors: 1, money: -2 }, '"벌써 가?" 소리를 세 번 듣고 나왔다.'),
      ], { time: ['night', 'late'] }),
      ev('club_role', '📋', '차기 임원 선출', '"다음 학기 총무 해볼 사람?" 모두의 시선이 나에게 꽂혔다.', [
        ch('맡는다', { spec: 4, seniors: 5, social: 3, cond: -4 }, '동아리 통장 비밀번호를 알게 됐다. 잔고 3만 2천원.'),
        ch('화장실 간다', { seniors: -3 }, '돌아오니 총무가 돼 있었다. …농담이었다.'),
      ], { when: s => year(s) >= 2 }),
      ev('club_crush', '🎶', '합주실의 그 사람', '같이 합주하는 동기가 연습 끝나고 남아서 코드를 물어본다.', [
        act('남아서 같이 연습한다', s => {
          if (!s.flags.crush && Math.random() < 0.35) { s.flags.crush = true; return { fx: { romance: 10, cond: 5 }, msg: '코드 진행보다 대화 진행이 빨랐다. 동아리 CC가 됐다.', post: '밴드 동아리 CC 또 생겼다는데 저 동아리 뭐 있음?' }; }
          return { fx: { romance: 4, peers: 2 }, msg: 'F코드를 같이 정복했다. 그 이상은 정복하지 못했다.' };
        }),
        ch('"유튜브 보면 나와"', { peers: -2 }, '맞는 말이었다. 그래서 더 차가웠다.'),
      ]),
    ],
  },

  study: {
    name: '취업 스터디', emoji: '📝', home: 'library', stage: 'ug',
    weekly: { spec: 1.5, peers: 0.5, study: 0.8, cond: -1 },
    pitch: '스터디룸 앞 게시판: "자소서·인적성·면접 스터디원 구함. 지각 벌금 2천원."',
    joinMsg: '스터디 단톡방 규칙이 12개다. 1번: 출석은 사진으로.',
    quit: { fx: { peers: -4, spec: -2 }, msg: '"개인 사정으로…"라고 남기고 나왔다. 벌금은 정산했다.' },
    events: [
      ev('study_mock', '🎙️', '모의 면접', '스터디원들 앞에서 1분 자기소개를 한다. 타이머가 켜졌다.', [
        ch('준비한 대로 한다', { spec: 5, cond: -3 }, '"말이 너무 빨라요" 피드백이 7개 나왔다. 전부 맞았다.'),
        ch('즉흥으로 간다', { spec: 2, peers: 2 }, '다들 웃었다. 면접관이었으면 안 웃었을 것이다.'),
      ], { time: ['day', 'evening'] }),
      ev('study_fine', '💸', '지각 벌금', '스터디 시작 10분 지났다. 아직 버스 안이다.', [
        ch('벌금 내고 뛰어간다', { money: -2, spec: 2, peers: 1 }, '벌금 통이 회식비가 된다는 걸 알았다.'),
        ch('"버스가 사고 나서…"', { peers: -3 }, '같은 버스를 탄 스터디원이 있었다.'),
      ], { time: ['morning', 'day'] }),
      ev('study_essay', '✍️', '자소서 첨삭 품앗이', '서로의 자소서를 빨간 펜으로 고쳐 준다. 내 자소서에 "그래서요?"가 5번 적혀 있다.', [
        ch('전부 다시 쓴다', { spec: 6, cond: -5 }, '세 번째 버전에서 드디어 "그래서요?"가 사라졌다.'),
        ch('남의 것만 열심히 본다', { peers: 4, spec: 1 }, '남의 자소서는 잘 보인다. 내 자소서만 안 보인다.'),
      ]),
      ev('study_pass', '📨', '스터디원 서류 합격', '같이 준비하던 동기가 먼저 서류에 붙었다.', [
        ch('진심으로 축하한다', { peers: 5, spec: 1 }, '합격자가 면접 후기를 몽땅 풀었다. 정보는 나눌수록 커진다.'),
        ch('축하한다 (이 악물고)', { spec: 3, cond: -3 }, '그날 밤 자소서를 두 개 더 썼다.'),
      ], { when: s => year(s) >= 3 }),
    ],
  },

  lab: {
    name: '학부연구생', emoji: '🔬', home: 'faculty', stage: 'ug',
    weekly: { research: 2, prof: 0.8, study: 0.5, cond: -1.5 },
    req: s => s.flags.labOffer || (s.rep.prof >= 60 && year(s) >= 2),
    reqText: '교수님 제안을 받았거나, 2학년 이상 + 교수님 평판 60 이상',
    pitch: '교수회관 복도에서 교수님이 부르신다. "자네, 우리 랩 미팅에 한번 와 보겠나?"',
    joinMsg: '연구실 책상 하나와 슬리퍼 한 켤레를 받았다. 슬리퍼가 의미심장하다.',
    quit: { fx: { prof: -8, research: -3 }, msg: '"그래, 학업에 집중하게." 교수님 목소리가 2도 낮았다.' },
    events: [
      ev('lab_meeting', '📊', '랩 미팅 발표', '이번 주 발표 차례다. 결과가 아직 안 나왔다.', [
        ch('밤새 결과를 뽑는다', { research: 6, prof: 4, cond: -8 }, '새벽 5시에 그래프가 나왔다. 축 이름을 반대로 썼다.'),
        ch('"진행 중입니다"로 버틴다', { prof: -3, research: 1 }, '"지난주에도 진행 중이었지?"'),
      ], { time: ['day', 'evening'] }),
      ev('lab_senior', '🧑‍🔬', '사수 선배', '대학원생 사수가 실험 프로토콜을 알려주며 말한다. "이거 망가뜨리면 나 졸업 못 해."', [
        ch('메모하며 배운다', { research: 4, seniors: 5, cond: -2 }, '노트 3장 분량이었다. 선배가 커피를 사 줬다.'),
        ch('눈으로만 배운다', { research: 1, seniors: -2 }, '다음 날 같은 걸 다시 물어봤다.'),
      ]),
      ev('lab_paper', '📄', '논문 공저자 제안', '"이번 학회 논문에 자네 이름도 넣어 주지. 대신 그림 좀 그려 와."', [
        ch('그림을 20장 그린다', { research: 8, spec: 5, prof: 5, cond: -8 }, '저자 목록 맨 끝에 내 이름이 있다. 맨 끝도 끝까지 읽으면 보인다.'),
        ch('시험 기간이라 사양한다', { study: 3, prof: -2 }, '논문은 내 이름 없이 붙었다.'),
      ], { when: s => (s.activities?.lab?.weeks || 0) >= 6 }),
      ev('lab_night', '🌙', '연구실 불 끄는 사람', '밤 11시. 연구실에 나와 교수님만 남았다.', [
        ch('교수님보다 늦게 나간다', { prof: 5, research: 3, cond: -6 }, '교수님이 "일찍 들어가게"라고 하셨다. 그게 11시 반이었다.'),
        ch('조용히 먼저 나간다', { cond: 3 }, '복도에서 교수님과 마주쳤다. 서로 못 본 척했다.'),
      ], { time: ['night', 'late'] }),
    ],
  },

  council: {
    name: '과 학생회', emoji: '🗳️', home: 'hq', stage: 'ug',
    weekly: { peers: 1.2, social: 1, spec: 0.6, cond: -1.5 },
    req: s => s.stats.social >= 20 || year(s) >= 2,
    reqText: '인맥 20 이상 또는 2학년 이상',
    pitch: '대학본부 앞에서 과 학생회장이 붙잡는다. "집행부 한 자리 비었어. 너 일 잘하게 생겼어."',
    joinMsg: '집행부 조끼를 받았다. 사이즈가 하나뿐이다.',
    quit: { fx: { peers: -5, social: -2 }, msg: '"그동안 고생했어." 회의록에서 내 이름이 지워졌다.' },
    events: [
      ev('council_snack', '🍙', '시험기간 간식 배부', '학생회 예산으로 간식 300개를 나눠 준다. 줄이 과방 밖까지 섰다.', [
        ch('웃으며 나눠 준다', { peers: 6, cond: -4 }, '"고생 많으세요"를 287번 들었다. 13개는 학생회가 먹었다.'),
        ch('남은 걸 챙긴다', { cond: 3, peers: -2 }, '대나무숲에 "학생회 간식 빼돌림 의혹"이 올라왔다.', '학생회 간식 빼돌린다는 거 진짜임? 증거 사진 있음'),
      ], { when: s => (s.week >= 6 && s.week <= 8) || s.week >= 14 }),
      ev('council_budget', '🧾', '예산 결산', '학생회비 결산이 3만원 안 맞는다.', [
        ch('영수증을 전부 다시 맞춘다', { spec: 4, peers: 3, cond: -5 }, '새벽 2시, 편의점 영수증 한 장을 찾았다. 결산 완료.'),
        ch('"이월"이라고 적는다', { peers: -4 }, '다음 집행부가 나를 원망하게 됐다.'),
      ], { time: ['evening', 'night'] }),
      ev('council_event', '🎪', '과 행사 기획', '개강총회 장소를 잡아야 한다. 예산은 1인 만원.', [
        ch('발품 팔아 맛집을 잡는다', { peers: 5, social: 3, cond: -3 }, '단체석 사장님과 의형제가 됐다.'),
        ch('작년 데 그대로 간다', { peers: 1 }, '"또 여기야?" 소리가 나왔지만 다들 잘 먹었다.'),
      ]),
      ev('council_complaint', '📢', '익명 건의함', '건의함에 "학생회는 뭐 하는 곳인가요?"라는 쪽지가 들어 있다.', [
        ch('활동 보고서를 올린다', { peers: 4, spec: 2, cond: -2 }, '조회수 38. 그래도 38명은 알게 됐다.'),
        ch('조용히 쪽지를 버린다', { cond: 1 }, '다음 주 같은 쪽지가 3장 들어왔다.'),
      ]),
    ],
  },

  tutor: {
    name: '과외', emoji: '✏️', home: 'costay', stage: null,
    weekly: { money: 5, parents: 0.5, cond: -1 },
    pitch: '코스테이 1층 게시판에 "중3 수학 과외 선생님 구합니다 (대학생 환영)" 전단이 붙어 있다.',
    joinMsg: '학부모님과 상담했다. "우리 애가 좀 산만해요"가 세 번 나왔다.',
    quit: { fx: { parents: -2, money: 3 }, msg: '마지막 수업료를 받았다. 학생이 처음으로 아쉬워했다.' },
    events: [
      ev('tutor_score', '📈', '학생 시험 점수', '과외 학생의 중간고사 결과가 나왔다.', [
        gamble('떨리는 마음으로 확인한다', 0.6, [{ money: 8, parents: 3, cond: 3 }, '20점이 올랐다! 학부모님이 수업료를 올려 주셨다.'],
          [{ cond: -4 }, '5점이 내려갔다. "선생님, 다음엔 꼭이요."']),
      ]),
      ev('tutor_noshow', '🚪', '학생 잠수', '수업 시간인데 학생이 안 나온다. 학부모님 전화도 안 받는다.', [
        ch('30분 기다린다', { cond: -3, money: 3 }, '학생은 PC방에 있었다. 수업료는 받았다.'),
        ch('바로 돌아간다', { cond: 2 }, '그 시간에 낮잠을 잤다. 공짜 낮잠이었다.'),
      ], { time: ['evening'] }),
      ev('tutor_question', '❓', '학생의 역습', '"선생님 이거 어떻게 풀어요?" 고등 경시 문제다.', [
        ch('"다음 시간에 알려줄게"', { study: 3, cond: -3 }, '그날 밤 유튜브로 공부했다. 다음 시간에 멋지게 풀었다.'),
        ch('솔직히 모른다고 한다', { parents: 1 }, '학생이 처음으로 나를 사람으로 봤다.'),
      ]),
    ],
  },

  parttime: {
    name: '상가 카페 알바', emoji: '☕', home: 'caisson', stage: null,
    weekly: { money: 6, cond: -2, peers: 0.2 },
    pitch: '케이슨24 1층 카페 유리문에 "주말·저녁 알바 구함, 경험 무관"이 붙어 있다.',
    joinMsg: '앞치마를 받았다. 시럽 펌프 한 번이 몇 ml인지 외웠다.',
    quit: { fx: { money: 4 }, msg: '마지막 날 사장님이 남은 케이크를 싸 주셨다.' },
    events: [
      ev('pt_rush', '🧾', '시험기간 카페 러시', '근처 대학생들이 다 몰려왔다. 주문이 20개 밀렸다.', [
        ch('정신없이 쳐낸다', { money: 6, cond: -6 }, '아아 47잔. 손목이 아아를 기억한다.'),
        ch('사장님을 부른다', { money: 3, cond: -2 }, '사장님이 앞치마를 매고 나오셨다. 둘이서 겨우 버텼다.'),
      ], { when: s => (s.week >= 6 && s.week <= 8) || s.week >= 14 }),
      ev('pt_regular', '😊', '단골손님', '매일 같은 시간에 오는 손님이 오늘은 말을 건다. "혹시 인천대 학생이세요?"', [
        ch('수다를 떤다', { social: 3, romance: 2 }, '알고 보니 같은 과 선배였다. 시험 범위를 알려 줬다.'),
        ch('업무 모드로 응대한다', { money: 1 }, '"영수증 드릴까요?" 대화는 거기서 끝났다.'),
      ], { time: ['morning', 'day', 'evening'] }),
      ev('pt_complain', '😤', '진상 손님', '"아까 시킨 거 말고 다른 거 달라니까요?" 아까 시킨 것과 똑같은 것이다.', [
        ch('웃으며 다시 만든다', { money: 2, cond: -5 }, '손님은 만족했다. 나는 만족하지 않았다.'),
        ch('사장님께 넘긴다', { cond: -1 }, '사장님은 진상을 30초 만에 해결했다. 경력이란 그런 것이다.'),
      ]),
    ],
  },
};

// ── 상태 도우미
function activitiesOf(s) { return (s.activities ||= {}); }
function inActivity(s, id) { return !!activitiesOf(s)[id]; }
function activityOk(s, id) {
  const a = ACTIVITIES[id];
  return (!a.stage || a.stage === s.stage) && (!a.req || a.req(s));
}
function fxText(fx) { return Object.entries(fx).map(([k, v]) => `${STAT_ICON[k] || ''}${STAT_LABEL[k] || k} ${v > 0 ? '+' : ''}${v}`).join(' · '); }

// 활동 이벤트는 활동 중일 때만 랜덤 이벤트 풀에도 섞인다
for (const [id, a] of Object.entries(ACTIVITIES)) {
  for (const e of a.events) {
    const cond = e.when;
    e.when = s => inActivity(s, id) && (!cond || cond(s));
    e.emoji = e.emoji || a.emoji;
    EVENTS.push({ ...e, title: `${a.emoji} ${a.name} · ${e.title}` });
  }
}

// 가입 권유 이벤트
function joinEvent(id) {
  const a = ACTIVITIES[id];
  const n = Object.keys(activitiesOf(S)).length;
  return ev(`join_${id}`, a.emoji, `${a.name} 모집`, a.pitch, [
    {
      label: '가입한다', sub: n < MAX_ACTIVITIES ? `매주 ${fxText(a.weekly)}` : `활동이 꽉 찼다 (${n}/${MAX_ACTIVITIES}) — 하나를 그만둬야 한다`,
      req: s => Object.keys(activitiesOf(s)).length < MAX_ACTIVITIES,
      run: s => { activitiesOf(s)[id] = { since: semLabel(s), weeks: 0 }; inc(s, 'joined'); return { fx: {}, msg: a.joinMsg }; },
    },
    ch('다음에', {}, '전단지를 접어 주머니에 넣었다. 다음 학기에 다시 물어볼 것이다.'),
  ]);
}

// game.js enterBuilding이 부른다: 이 건물에서 뜰 활동 관련 이벤트 (없으면 null → 원래 건물 이벤트)
function activityPick(s, placeKey, h) {
  for (const [id, a] of Object.entries(ACTIVITIES)) {
    if (a.home !== placeKey) continue;
    if (!inActivity(s, id)) {
      const asked = `asked_${id}`, sem = `${s.stage}-${s.stageSem}`;
      if (!activityOk(s, id) || s.flags[asked] === sem) continue;
      s.flags[asked] = sem;                     // 한 학기에 한 번만 권유
      return joinEvent(id);
    }
    if (Math.random() < HOME_EVENT_CHANCE) {
      // 시간대에 맞고 최근 두 번 안에 안 본 활동 이벤트 — 없으면 원래 건물 이벤트로
      const recent = (s.recentActEvents ||= {})[id] || [];
      const list = a.events.filter(e => e.when(s) && fitsTime(e, h) && !recent.includes(e.id));
      if (list.length) {
        const e = pick(list);
        s.recentActEvents[id] = [e.id, ...recent].slice(0, 2);
        return { ...e, title: `${a.name} · ${e.title}` };
      }
    }
  }
  return null;
}

// game.js weekStep이 부른다: 매주 효과 + 조건이 깨진 활동 정리
function weeklyActivities(s) {
  for (const [id, info] of Object.entries(activitiesOf(s))) {
    const a = ACTIVITIES[id];
    if (!a || (a.stage && a.stage !== s.stage)) {
      delete s.activities[id];
      if (a) toast(`${a.emoji} ${a.name} 활동이 끝났다 (학부 과정 종료)`);
      continue;
    }
    applyFx(s, a.weekly);
    info.weeks++;
  }
}

function quitActivity(id) {
  const a = ACTIVITIES[id];
  if (!S || !inActivity(S, id)) return;
  pushModal(() => showEvent(ev(`quit_${id}`, a.emoji, `${a.name} 그만두기`, `${activitiesOf(S)[id].weeks}주 동안 했다. 정말 그만둘까?`, [
    act('그만둔다', s => { delete s.activities[id]; return { fx: a.quit.fx, msg: a.quit.msg }; }),
    ch('조금 더 해 본다', {}, '마음을 다잡았다.'),
  ])));
}

// 평가 패널의 "내 활동"
function activitiesHtml(s) {
  const mine = Object.entries(activitiesOf(s));
  const rows = mine.map(([id, info]) => {
    const a = ACTIVITIES[id];
    return `<div class="act"><div class="act-top"><b>${a.emoji} ${a.name}</b><button class="act-quit" data-quit="${id}">그만두기</button></div>
      <div class="act-fx">매주 ${fxText(a.weekly)}</div><div class="muted act-meta">${esc(info.since)}부터 · ${info.weeks}주째</div></div>`;
  }).join('');
  const hint = Object.entries(ACTIVITIES).filter(([id]) => !inActivity(s, id))
    .map(([, a]) => `${a.emoji} ${a.name} — ${esc(PLACES[a.home]?.name || '')}${a.reqText ? ` (${a.reqText})` : ''}`).join('<br>');
  return `<h4>내 활동 <span class="muted">${mine.length}/${MAX_ACTIVITIES}</span></h4>${rows || '<div class="muted">아직 소속된 곳이 없다.</div>'}
    <details class="act-hint"><summary>가입할 수 있는 곳</summary><div class="muted">${hint}</div></details>`;
}

document.addEventListener('click', e => {
  const id = e.target.closest?.('[data-quit]')?.dataset.quit;
  if (id) quitActivity(id);
});
