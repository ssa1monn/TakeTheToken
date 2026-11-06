// ───────────────────────────────────────────────
// 관계 이벤트 — 교수님 · 동기 · 선후배 · 부모님 평판을 직접 움직이는 이벤트
// (places/helpers.js 다음, game.js 전에 로드)
//
//   부모님: 3~5주마다 저녁에 정기 연락 (relationTick이 game.js update에서 불린다)
//   동기 · 선후배 · 교수님: 랜덤 이벤트 풀(EVENTS)에 추가 + 교수회관 이벤트 추가
// ───────────────────────────────────────────────
const CALL_GAP = [3, 5];          // 부모님 연락 간격 (주)
const CALL_HOURS = [19, 22];      // 연락 오는 시각

const isExam = s => (s.week >= 6 && s.week <= 8) || s.week >= 14;

// ── 부모님 (정기 연락)
const PARENT_EVENTS = [
  ev('mom_call', '📞', '일요일 저녁, 엄마 전화', '"밥은 먹었니? 요즘 뭐 하고 지내?"', [
    ch('영상통화로 30분 수다', { parents: 6, cond: 3, study: -1 }, '엄마가 내 방 상태를 보고 한숨을 쉬셨다. 그래도 웃으셨다.'),
    ch('"응 바빠 나중에"', { parents: -3 }, '"그래, 바쁘면 됐다." 그 말이 오래 남았다.'),
    ch('"근데 용돈이 좀…"', { money: 12, parents: -4 }, '입금 알림과 함께 "아껴 써라" 문자가 왔다.'),
  ]),
  ev('mom_box', '📦', '택배 왔어요', '기숙사 택배함에 아이스박스가 있다. 반찬 일곱 가지와 손편지.', [
    ch('바로 감사 전화', { parents: 6, cond: 4 }, '"잘 받았어?"라는 말에 목이 메었다. 반찬은 3일 만에 다 먹었다.'),
    ch('룸메랑 나눠 먹는다', { peers: 4, parents: 2, cond: 3 }, '룸메가 우리 엄마 팬이 됐다.'),
    ch('인증샷을 가족 단톡에', { parents: 4 }, '아빠가 엄지 이모티콘을 4개 보냈다.'),
  ]),
  ev('mom_grade', '🧾', '성적표 얘기', '"성적 나왔다며? 어떻게 나왔어?"', [
    act('사실대로 말한다', s => s.lastGpa >= 3.5
      ? { fx: { parents: 9 }, msg: `"${s.lastGpa.toFixed(2)}? 우리 애가?" 친척 단톡방에 캡처가 올라갔다.` }
      : { fx: { parents: 2, cond: -3 }, msg: '"…다음엔 잘하겠지." 그 침묵이 잔소리보다 무거웠다.' }),
    gamble('"아직 안 나왔어"', 0.5, [{ parents: 1 }, '넘어갔다. 일단은.'],
      [{ parents: -8 }, '학교 홈페이지 학부모 공지를 엄마가 먼저 봤다.']),
  ], { when: s => s.lastGpa != null && s.week <= 4 }),
  ev('mom_birthday', '🎂', '엄마 생신', '달력을 보니 이번 주가 엄마 생신이다. 오늘 알았다.', [
    ch('케이크와 선물을 보낸다', { parents: 10, money: -8 }, '엄마가 프로필 사진을 케이크로 바꾸셨다.'),
    ch('손편지를 쓴다', { parents: 7, cond: -1 }, '"글씨가 아빠 닮았네." 편지는 냉장고에 붙었다.'),
    ch('카톡으로 축하한다', { parents: 1 }, '"고마워 ^^" 이모티콘이 하나뿐이었다.'),
  ]),
  ev('dad_visit', '🚗', '부모님이 학교 구경 오신대', '"송도 간 김에 너 학교 좀 보자." 내일이다.', [
    ch('캠퍼스 투어를 시켜 드린다', { parents: 9, cond: -3, money: 2 }, '아빠가 도서관 앞에서 사진을 15장 찍으셨다. 학식도 사 주셨다.'),
    ch('"나 시험 기간이라…"', { parents: -5, study: 2 }, '부모님은 송도 바다만 보고 가셨다.'),
  ], { when: s => s.stage === 'ug' && year(s) <= 2 }),
  ev('mom_worry', '😟', '"목소리가 왜 그래?"', '전화를 받자마자 엄마가 알아채셨다.', [
    ch('요즘 힘들다고 털어놓는다', { parents: 6, cond: 10 }, '한 시간을 울면서 얘기했다. 다음 날 보약이 택배로 왔다.'),
    ch('"아니야 괜찮아"', { parents: 1, cond: -3 }, '괜찮다고 말하고 나니 더 안 괜찮았다.'),
  ], { when: s => s.cond < 40 }),
  ev('dad_career', '💼', '아빠의 진로 질문', '"그래서 졸업하면 뭐 할 거니?" 아빠가 처음으로 진지하게 물으셨다.', [
    act('계획을 차근차근 설명한다', s => s.stats.spec >= 40 || s.stats.research >= 20
      ? { fx: { parents: 8, spec: 1 }, msg: '"생각이 다 있구나." 아빠가 처음으로 술 한잔하자고 하셨다.' }
      : { fx: { parents: 2, cond: -2 }, msg: '설명하다 보니 계획이 없다는 걸 나도 알게 됐다.' }),
    ch('"아직 생각 중이야"', { parents: -3 }, '"너 3학년이야." 통화가 짧게 끝났다.'),
  ], { when: s => s.stage === 'ug' && year(s) >= 3 }),
];

function scheduleCall(s) {
  const h = CALL_HOURS[0] + Math.random() * (CALL_HOURS[1] - CALL_HOURS[0]);
  s.nextCall = { sem: `${s.stage}-${s.stageSem}`, week: s.week + randInt(...CALL_GAP), at: (h - DAY_START) / 24 };
}

// game.js update()가 매 프레임 부른다
function relationTick(s) {
  if (modalOpen) return;
  if (!s.nextCall || s.nextCall.sem !== `${s.stage}-${s.stageSem}`) { scheduleCall(s); return; }   // 첫 실행 · 새 학기
  const due = s.week > s.nextCall.week || (s.week === s.nextCall.week && s.weekT >= s.nextCall.at);
  if (!due) return;
  scheduleCall(s);
  const pool = PARENT_EVENTS.filter(e => !e.when || e.when(s));
  const recent = s.recentCalls || [];
  const fresh = pool.filter(e => !recent.includes(e.id));
  const e = pick(fresh.length ? fresh : pool);
  s.recentCalls = [e.id, ...recent].slice(0, 3);
  pushModal(() => showEvent(e));
}

// ── 선후배 · 동기 · 교수님 (랜덤 이벤트 풀)
EVENTS.push(
  // 선후배
  ev('sen_meal', '🍚', '선배의 밥약', '과 선배가 DM을 보냈다. "새내기! 밥 사줄게, 언제 시간 돼?"', [
    ch('냉큼 얻어먹는다', { seniors: 6, cond: 3 }, '선배가 시험 꿀팁과 교수님 성향표를 알려 줬다. 밥값보다 비쌌다.'),
    ch('"괜찮아요 ㅎㅎ"', { seniors: -3 }, '선배의 밥약 명단에서 조용히 빠졌다.'),
  ], { time: ['day', 'evening'], when: s => s.stage === 'ug' && year(s) === 1 }),
  ev('sen_treat', '💳', '후배가 밥 사달래요', '"선배님, 저 밥 사주세요!" 작년의 내가 했던 말이다.', [
    ch('맛있는 걸 사 준다', { seniors: 7, money: -5 }, '후배가 "제 롤모델이에요"라고 했다. 밥값이 아깝지 않았다.'),
    ch('학식으로 사 준다', { seniors: 3, money: -1 }, '학식도 밥이다. 후배도 그걸 알았다.'),
    ch('바쁘다고 한다', { seniors: -4 }, '"그 선배 밥 안 사줌" 소문이 후배 단톡에 돌았다.'),
  ], { time: ['day', 'evening'], when: s => s.stage === 'ug' && year(s) >= 2 }),
  ev('sen_jokbo', '📚', '족보 상속', '졸업반 선배가 USB를 건넨다. "4년치 족보야. 잘 써."', [
    ch('두 손으로 받는다', { seniors: 5, study: 6 }, 'USB 안에 폴더가 37개. 그중 하나는 선배의 연애편지였다.'),
    ch('"제 힘으로 할게요"', { study: 2, prof: 2, seniors: -1 }, '선배가 "멋있네"라고 했다. 시험은 멋있지 않았다.'),
  ], { when: s => s.stage === 'ug' && isExam(s) }),
  ev('sen_ot', '🧢', '신입생 OT 도우미', '"OT 조장 할 사람?" 과 단톡에 공지가 떴다. 2박 3일이다.', [
    ch('조장을 맡는다', { seniors: 9, social: 4, cond: -6 }, '새내기 8명이 나를 "조장님"이라 부른다. 1년 전엔 내가 그랬다.'),
    ch('조용히 넘긴다', { seniors: -2 }, '이번 새내기들은 내 얼굴을 모른다.'),
  ], { when: s => s.stage === 'ug' && year(s) >= 2 && s.week <= 3 }),
  ev('sen_army', '🪖', '휴가 나온 선배', '군대 간 선배가 휴가를 나왔다. "야 나와, 오늘은 내가 쏜다."', [
    act('나간다', s => { inc(s, 'drinks'); return { fx: { seniors: 6, social: 2, cond: -4 }, msg: '군대 얘기를 3시간 들었다. 축구 얘기가 2시간이었다.' }; }),
    ch('시험이라 못 간다', { seniors: -2, study: 2 }, '"전역하면 보자." 1년 뒤로 미뤄졌다.'),
  ], { time: ['evening', 'night'], when: s => s.stage === 'ug' }),
  ev('sen_career', '🎓', '취업한 선배 특강', '대기업 다니는 선배가 과 특강을 왔다. 정장이 낯설다.', [
    ch('맨 앞에서 질문을 많이 한다', { seniors: 5, spec: 4, cond: -1 }, '특강 끝나고 선배가 명함을 줬다. "궁금한 거 있으면 연락해."'),
    ch('뒷자리에서 듣기만 한다', { spec: 1 }, '"스펙보다 경험"이라는 말만 기억에 남았다.'),
  ], { time: ['day', 'evening'], when: s => s.stage === 'ug' && year(s) >= 3 }),

  // 동기
  ev('peer_team', '🧩', '팀플 조 짜기', '교수님: "조는 자유롭게 짜세요." 강의실이 술렁인다.', [
    ch('친한 동기들과 짠다', { peers: 5, study: -1 }, '회의는 즐거웠다. 진도는 즐겁지 않았다.'),
    ch('과탑 옆에 슬쩍 앉는다', { study: 5, peers: 1 }, '과탑이 "그럼 자료조사 해 줘"라고 했다. 자료조사 장인이 됐다.'),
    ch('남는 조에 들어간다', { peers: -1, cond: -2, study: 2 }, '편입생, 복학생, 교환학생, 그리고 나. 의외로 최강의 조였다.'),
  ], { time: ['morning', 'day'], when: s => s.stage === 'ug' && s.week <= 4 }),
  ev('peer_study', '📖', '시험 스터디 모집', '과 단톡: "이번 전공 같이 공부할 사람~ 도서관 스터디룸 예약함"', [
    ch('들어간다', { peers: 5, study: 5, cond: -3 }, '공부 2시간, 잡담 1시간, 야식 1시간. 그래도 범위는 다 봤다.'),
    ch('혼자 하는 게 편하다', { study: 4 }, '혼자서 효율 100%. 외로움도 100%.'),
  ], { when: s => s.stage === 'ug' && isExam(s) }),
  ev('peer_bday', '🎉', '동기 생일', '단톡방에 "오늘 ○○ 생일이래!!"가 올라왔다.', [
    ch('케이크를 들고 과방에 간다', { peers: 7, money: -3 }, '촛불 끄는 영상이 과 인스타에 올라갔다. 내 손만 나왔다.'),
    ch('기프티콘을 보낸다', { peers: 3, money: -2 }, '"ㅠㅠ 고마워!!" 커피 한 잔의 우정.'),
    ch('늦게 봤다…', { peers: -2 }, '다음 날 축하했다. "어제였는데 ㅎㅎ"'),
  ]),
  ev('peer_notice', '📌', '과 단톡 공지 대참사', '수강신청 공지를 누가 잘못 올려서 단톡방이 혼란에 빠졌다.', [
    ch('정리해서 다시 올린다', { peers: 5, spec: 1, cond: -1 }, '"헐 고마워"가 40개 달렸다. 비공식 과대가 됐다.'),
    ch('읽씹한다', { cond: 1 }, '나 혼자 다른 날 수강신청을 했다.'),
  ], { when: s => s.stage === 'ug' && s.week <= 2 }),

  // 교수님
  ev('prof_question', '🙋', '수업 끝나고 질문', '수업이 끝났다. 오늘 내용 중에 하나가 이해가 안 된다. 교수님이 짐을 싸고 계신다.', [
    ch('교탁으로 간다', { prof: 5, study: 3, cond: -1 }, '"좋은 질문이네." 교수님이 내 이름을 물어보셨다.'),
    ch('나중에 유튜브로 찾는다', { study: 1 }, '인도 아저씨가 10분 만에 설명해 줬다. 교수님은 모르신다.'),
  ], { time: ['morning', 'day'], when: s => s.stage === 'ug' }),
  ev('prof_front', '🪑', '강의실 맨 앞자리', '늦게 들어왔더니 남은 자리가 맨 앞 정중앙뿐이다.', [
    ch('당당하게 앉는다', { prof: 4, study: 3, cond: -2 }, '교수님과 눈이 23번 마주쳤다. 졸 수가 없었다.'),
    ch('뒤에 서서 듣는다', { prof: -1, cond: -1 }, '다리가 아팠다. 출석은 인정됐다.'),
  ], { time: ['morning', 'day'], when: s => s.stage === 'ug' }),
  ev('prof_ta', '🧑‍🏫', '조교 모집 공고', '"전공 수업 조교 구함. 채점 및 실습 보조."', [
    ch('지원한다', { prof: 6, money: 6, cond: -4 }, '후배들의 과제를 채점하며 교수님의 고통을 이해하게 됐다.'),
    ch('패스', {}, '채점의 세계는 나중에 알아도 된다.'),
  ], { when: s => s.stage === 'ug' && year(s) >= 3 }),
);

// 교수회관에 교수님 관계 이벤트 추가
(function extendFaculty() {
  const place = PLACES.faculty;
  if (!place) return;
  const base = place.events;
  const extra = [
    ev('fac_career', '🧭', '진로 상담 오피스아워', '교수님 연구실 문이 열려 있다. "들어오게, 무슨 고민인가?"', [
      ch('진로 고민을 털어놓는다', { prof: 6, spec: 2, cond: 2 }, '교수님이 20년 전 본인 얘기를 하셨다. 생각보다 방황하셨다.'),
      ch('수업 질문만 하고 나온다', { prof: 3, study: 3 }, '질문 하나에 A4 두 장 분량의 답이 돌아왔다.'),
    ], { time: ['day'] }),
    ev('fac_tea', '🍵', '교수님의 차 한 잔', '복도에서 마주친 교수님이 "차 한잔 하고 가게"라며 연구실로 부르신다.', [
      ch('들어간다', { prof: 5, research: 1 }, '보이차를 세 잔 마셨다. 대화 주제는 교수님의 화분이었다.'),
      ch('"수업이 있어서요"', { prof: -1 }, '진짜 수업이 있었다. 다행이다.'),
    ]),
  ];
  place.events = () => [...base(), ...extra];
})();
