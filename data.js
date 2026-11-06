// ───────────────────────────────────────────────
// 다시 사는 대학생활 — 게임 데이터
// ───────────────────────────────────────────────
const WEEKS = 16;          // 한 학기 주차
const WEEK_SECONDS = 40;   // 1배속에서 한 주가 흐르는 실제 시간(초) — 한 주를 "하루"로 압축해 보여준다
const DAY_START = 6;       // 한 주(=하루)는 06:00에 시작해 다음 날 06:00에 끝난다
const EVENT_GAP = [2, 3];  // 랜덤 이벤트 간격 (주)
const PAPER_COST = 110;    // 대학원: 연구 포인트 → 논문 1편

// ── 시간대 (이벤트의 time 태그로 쓴다. 태그가 없으면 아무 때나)
const TIME_PHASES = [
  { id: 'late',    from: 0,  to: 6,  name: '새벽', emoji: '🌌' },
  { id: 'morning', from: 6,  to: 9,  name: '아침', emoji: '🌅' },
  { id: 'day',     from: 9,  to: 17, name: '낮',   emoji: '☀️' },
  { id: 'evening', from: 17, to: 20, name: '저녁', emoji: '🌇' },
  { id: 'night',   from: 20, to: 24, name: '밤',   emoji: '🌙' },
];

const STAT_LABEL = {
  study: '공부', social: '인맥', spec: '스펙', romance: '낭만', research: '연구',
  money: '돈', cond: '컨디션', prof: '교수님', peers: '동기', seniors: '선후배',
  parents: '부모님', credits: '이수학점',
};
const STAT_ICON = {
  study: '📖', social: '🤝', spec: '📈', romance: '🌸', research: '🔬',
  money: '💰', cond: '❤️', prof: '👨‍🏫', peers: '👥', seniors: '🎓',
  parents: '👪', credits: '🧾',
};

const MAJORS = {
  cs:   { name: '컴퓨터공학과', emoji: '💻', studyMult: 1.1, bonus: { spec: 10 }, desc: '과제 마감이 곧 수면 시간. 시작 스펙 +10, 공부 난이도 ↑' },
  biz:  { name: '경영학과', emoji: '📊', studyMult: 1.0, bonus: { social: 20 }, desc: '팀플의 성지. 시작 인맥 +20' },
  kor:  { name: '국어국문학과', emoji: '🖋️', studyMult: 0.92, bonus: { romance: 20 }, desc: '낭만은 넘치는데 취업은…. 시작 낭만 +20, 공부 난이도 ↓' },
};

// ── 진로 테크트리
const PATHS = {
  ug: [
    { id: 'bigco',   emoji: '🏢', name: '대기업 입사',     reqText: '스펙 150+, 평점 3.3+',
      req: s => s.stats.spec >= 150 && cumGpa(s) >= 3.3 },
    { id: 'startup', emoji: '🚀', name: '창업',           reqText: '인맥 250+, 돈 100+',
      req: s => s.stats.social >= 250 && s.money >= 100 },
    { id: 'ms',      emoji: '🔬', name: '대학원 진학 (석사)', reqText: '연구 40+, 평점 3.5+, 교수님 평판 65+', next: 'ms',
      req: s => s.stats.research >= 40 && cumGpa(s) >= 3.5 && s.rep.prof >= 65 },
    { id: 'civil',   emoji: '📚', name: '공무원 시험 준비', reqText: '조건 없음', req: () => true },
    { id: 'neet',    emoji: '🛋️', name: '일단 쉰다',       reqText: '조건 없음', req: () => true },
  ],
  ms: [
    { id: 'phd',     emoji: '🧑‍🔬', name: '박사 진학',      reqText: '논문 2편+, 교수님 평판 70+', next: 'phd',
      req: s => papers(s) >= 2 && s.rep.prof >= 70 },
    { id: 'rnd',     emoji: '🏭', name: '연구소 연구원',   reqText: '논문 1편+', req: s => papers(s) >= 1 },
    { id: 'msjob',   emoji: '👔', name: '석사 출신 취업',  reqText: '조건 없음', req: () => true },
  ],
  phd: [
    { id: 'professor', emoji: '🏛️', name: '교수 임용',     reqText: '논문 8편+, 교수님 평판 80+', req: s => papers(s) >= 8 && s.rep.prof >= 80 },
    { id: 'industry',  emoji: '🧬', name: '기업 연구소',   reqText: '논문 4편+', req: s => papers(s) >= 4 },
    { id: 'postdoc',   emoji: '✈️', name: '해외 포닥',     reqText: '조건 없음', req: () => true },
  ],
};

const ENDINGS = {
  bigco:     { emoji: '🏢', title: '대기업 신입사원', text: '사원증을 목에 걸고 셀카를 찍었다. 3개월 뒤, 대학생활이 그리워지기 시작했다.' },
  startup:   { emoji: '🚀', title: '스타트업 대표', text: '동아리 동기 셋과 창업했다. 직함은 CEO, 월급은 0원. 그래도 눈은 반짝인다.' },
  civil:     { emoji: '📚', title: '노량진 입성', text: '"딱 1년만"이라고 말했다. 부모님은 그 말을 믿기로 했다.' },
  neet:      { emoji: '🛋️', title: '프로 휴식러', text: '졸업장은 받았다. 다음 계획은... 다음에 세우기로 했다.' },
  rnd:       { emoji: '🏭', title: '연구소 연구원', text: '석사 논문 한 편으로 연구원이 됐다. 회사 연구실은 학교 연구실보다 불이 일찍 꺼진다.' },
  msjob:     { emoji: '👔', title: '석사 출신 신입', text: '면접관이 물었다. "대학원에서 뭘 배웠나요?" 인내심이라고 답했다.' },
  professor: { emoji: '🏛️', title: '교수님', text: '드디어 "주말에 잠깐 나올 수 있지?"를 말하는 쪽이 되었다.' },
  industry:  { emoji: '🧬', title: '기업 연구소 책임연구원', text: '박사 학위와 연봉을 맞바꿨다. 꽤 괜찮은 거래였다.' },
  postdoc:   { emoji: '✈️', title: '해외 포닥', text: '비행기 표는 편도. 연구는 계속된다. 아마 영원히.' },
  expelled:  { emoji: '📛', title: '제적', text: '학사경고 세 번. 학교가 먼저 이별을 고했다. 인생 2회차가 필요해 보인다.' },
  ugfail:    { emoji: '⌛', title: '영원한 초과학기생', text: '12학기째. 후배의 후배가 졸업하는 걸 지켜봤다. 결국 학교를 떠났다.' },
  msfail:    { emoji: '📎', title: '석사 수료', text: '논문은 끝내 나오지 않았다. "수료"라는 단어가 이렇게 무거울 줄은 몰랐다.' },
  phdfail:   { emoji: '♾️', title: '박사 수료 (영원히)', text: '연구실 막내였던 나는 연구실 화석이 되었다.' },
};

// ── 랜덤 이벤트
// run(s) → { fx, msg, post }
const EVENTS = [
  { id: 'freeride', time: ['day', 'evening', 'night'], emoji: '🧟', title: '조별과제 무임승차', when: s => s.stage !== 'phd',
    text: '팀원 셋 중 둘이 단톡방에서 증발했다. 발표는 내일이다.',
    choices: [
      { label: '혼자 다 한다 (현실)', run: s => ({ fx: { study: 10, cond: -12, prof: 4 }, msg: '발표는 성공했다. 기여도 평가에 "다 같이 열심히 함"이라고 적었다.' }) },
      { label: '단톡방에 박제한다', run: s => { inc(s, 'expose'); return { fx: { study: 4, peers: -8, seniors: 3 }, msg: '캡처가 과 전체에 퍼졌다. 통쾌한데 분위기가 싸해졌다.', post: '조별과제 무임승차 박제 사건 봤음? 캡처 보니까 레전드던데 ㅋㅋ' }; } },
      { label: '나도 증발한다', run: s => ({ fx: { study: -6, peers: -4, prof: -6 }, msg: '아무도 하지 않았다. 교수님은 모든 것을 알고 계셨다.' }) },
    ] },
  { id: 'seniorcall', time: ['night'], emoji: '🍻', title: '밤 11시, 선배의 호출',
    text: '"야 너 지금 어디야? 학교 앞인데 잠깐만 나와~"',
    choices: [
      { label: '"갑니다!" (3차까지)', run: s => { inc(s, 'drinks'); return { fx: { social: 6, romance: 3, cond: -10, money: -5, seniors: 8 }, msg: '정신 차려보니 해가 떠 있었다. 선배가 족보를 약속했다... 아마도.' }; } },
      { label: '자는 척 읽씹', run: s => ({ fx: { seniors: -6, cond: 3 }, msg: '다음 날 "어제 왜 안 왔냐"는 말을 세 번 들었다.' }) },
    ] },
  { id: 'proxy', time: ['morning', 'day'], emoji: '🙋', title: '대리출석 부탁', when: s => s.stage === 'ug',
    text: '동기: "나 대신 대답 좀 해줘 ㅠ 오늘 진짜 못 감"',
    choices: [
      { label: '목소리 변조해서 대답', run: s => {
          if (Math.random() < 0.35) return { fx: { prof: -15, peers: 2 }, msg: '"방금 대답한 학생, 일어나 볼까?" ...들켰다.', post: '오늘 전공수업 대리출석 걸린 사람 실시간으로 봄 ㄷㄷ' };
          return { fx: { peers: 7 }, msg: '완벽했다. 동기가 학식을 샀다.' }; } },
      { label: '"미안, 그건 좀..."', run: s => ({ fx: { peers: -4, prof: 1 }, msg: '동기가 "ㅇㅋ"라고 답했다. 마침표가 없었다.' }) },
    ] },
  { id: 'mailkk', emoji: '📧', title: '교수님께 보낸 메일',
    text: '성적 문의 메일 끝에 "ㅋㅋ"가 붙어 있다. 친구한테 보내려던 말이었다.',
    choices: [
      { label: '정중한 사과 메일을 다시 보낸다', run: s => ({ fx: { prof: -3, cond: -3 }, msg: '"괜찮습니다 ㅎㅎ"라는 답장이 왔다. 그 ㅎㅎ의 의미를 밤새 고민했다.' }) },
      { label: '없던 일로 한다', run: s => ({ fx: { prof: -8 }, msg: '교수님은 기억력이 좋으시다.', post: '교수님한테 ㅋㅋ 붙여서 메일 보낸 사람 있다던데 누구임' }) },
    ] },
  { id: 'confess', time: ['evening', 'night'], emoji: '💌', title: '갑자기 고백을 받았다', once: true,
    when: s => !s.flags.crush && (s.stats.romance >= 15 || s.stats.social >= 30),
    text: '과 행사가 끝나고, 같은 과 동기가 조심스럽게 말을 꺼냈다.',
    choices: [
      { label: '"나도 좋아!"', run: s => { s.flags.crush = true; return { fx: { romance: 12, cond: 8 }, msg: '연애가 시작됐다! 캠퍼스가 갑자기 예뻐 보인다.', post: '우리 과 CC 탄생했다는데 ㅊㅋㅊㅋ (부럽다는 뜻)' }; } },
      { label: '"우리 그냥 친구로..."', run: s => ({ fx: { peers: -3, study: 3 }, msg: '도서관으로 향했다. 집중은 잘 안 됐다.' }) },
    ] },
  { id: 'mt', time: ['day', 'evening'], emoji: '🚌', title: '과 MT 공지', when: s => s.stage === 'ug' && year(s) <= 2,
    text: '1박 2일 MT. 회비 3만원. 불참하면 "사유서"를 내야 한다(농담이겠지?).',
    choices: [
      { label: '간다', run: s => { inc(s, 'drinks'); return { fx: { social: 10, romance: 5, money: -6, cond: -6, peers: 6 }, msg: '새벽 4시 마피아 게임에서 마피아였다. 아무도 의심하지 않았다.' }; } },
      { label: '안 간다', run: s => ({ fx: { peers: -6, cond: 5, study: 3 }, msg: 'MT 사진첩에 내가 없다.' }) },
    ] },
  { id: 'election', time: ['day'], emoji: '🗳️', title: '학생회 출마 권유', once: true,
    when: s => s.stage === 'ug' && s.stats.social >= 60,
    text: '"너 인맥 좋잖아. 과대 한번 나가봐!"',
    choices: [
      { label: '출마한다', run: s => {
          if (Math.random() < 0.4 + s.rep.peers / 200) { s.flags.rep = true; return { fx: { social: 15, spec: 8, peers: 10, cond: -8 }, msg: '당선! 이제 과 단톡방 공지는 내 몫이다.', post: '이번 과대 공약 "시험기간 간식 무한리필" 실화임?' }; }
          return { fx: { peers: -5, cond: -5 }, msg: '낙선. 득표율 31%. 생각보다 날 싫어하는 사람이 많다.' }; } },
      { label: '"나 그런 거 안 해"', run: s => ({ fx: {}, msg: '평화를 지켰다.' }) },
    ] },
  { id: 'coin', emoji: '📉', title: '동기의 코인 추천', when: s => s.money >= 20,
    text: '"이거 진짜야. 다음 주에 10배 간다."',
    choices: [
      { label: '용돈 몰빵', run: s => {
          const bet = Math.floor(s.money * 0.6);
          if (Math.random() < 0.35) return { fx: { money: bet * 2 }, msg: `떡상! 동기를 신으로 모시기로 했다.` };
          return { fx: { money: -bet, cond: -8 }, msg: `떡락. 동기는 "존버"라고만 했다.`, post: '코인으로 학식비 날린 사람 손 ✋' }; } },
      { label: '안 한다', run: s => ({ fx: {}, msg: '다음 주에 코인이 반토막 났는지, 10배가 됐는지는 확인하지 않기로 했다.' }) },
    ] },
  { id: 'snipe', emoji: '🎋', title: '대나무숲 저격글',
    text: '익명게시판에 누가 봐도 나를 저격하는 글이 올라왔다.',
    choices: [
      { label: '장문의 반박 댓글', run: s => Math.random() < 0.5
          ? { fx: { peers: 6, cond: -3 }, msg: '논리로 압살했다. 댓글 추천 87개.' }
          : { fx: { peers: -8, cond: -8 }, msg: '댓글이 캡처되어 2차 저격을 당했다.', post: '어제 그 저격글 본인 등판한 거 봄? 팝콘 각' } },
      { label: '못 본 척한다', run: s => ({ fx: { cond: -3 }, msg: '3일 동안 하루 40번씩 새로고침했다.' }) },
    ] },
  { id: 'labOffer', time: ['day'], emoji: '🔬', title: '교수님의 제안', once: true,
    when: s => s.stage === 'ug' && year(s) >= 2 && s.rep.prof >= 62,
    text: '"자네, 우리 연구실에서 학부연구생 해볼 생각 없나?"',
    choices: [
      { label: '"하겠습니다!"', run: s => { s.flags.labOffer = true; return { fx: { research: 5, prof: 8 }, msg: '학부연구생이 되었다. 대학원 테크트리에 한 발짝 다가갔다.' }; } },
      { label: '"생각해볼게요..." (영원히)', run: s => ({ fx: { prof: -4 }, msg: '교수님은 다른 학생에게 물어보셨다.' }) },
    ] },
  { id: 'call', time: ['morning', 'day', 'evening'], emoji: '📞', title: '부모님 전화',
    text: '"밥은 먹고 다니니? 요즘 뭐 하고 지내?"',
    choices: [
      { label: '"용돈 조금만..."', run: s => ({ fx: { money: 12, parents: -6 }, msg: '입금 알림과 함께 한숨 소리가 들렸다.' }) },
      { label: '"잘 지내요! 공부 열심히 해요"', run: s => ({ fx: { parents: 6 },
          msg: s.lastGpa != null && s.lastGpa < 2.5 ? '성적표가 집으로 간다는 사실을 잊고 있었다.' : '어머니가 친척들에게 자랑을 시작하셨다.' }) },
    ] },
  { id: 'yasik', time: ['late'], emoji: '🍗', title: '새벽 2시, 야식의 유혹',
    text: '룸메가 치킨을 시키자고 한다. 내일 9시 수업이 있다.',
    choices: [
      { label: '반반 무 많이', run: s => ({ fx: { money: -3, cond: 4, peers: 3, study: -2 }, msg: '9시 수업에 지각했다. 후회는 없다.' }) },
      { label: '참는다', run: s => ({ fx: { cond: -2, study: 2 }, msg: '치킨 냄새를 맡으며 잠들었다.' }) },
    ] },
  { id: 'leave', time: ['night', 'late'], emoji: '😵', title: '휴학 고민', when: s => s.cond < 35 && s.stage === 'ug' && !s.flags.leave,
    text: '요즘 너무 지친다. 다들 휴학한다던데...',
    choices: [
      { label: '다음 학기에 휴학한다', run: s => { s.flags.leave = true; return { fx: {}, msg: '학기가 끝나면 한 학기 쉰다. 동기들보다 졸업이 늦어진다.' }; } },
      { label: '버틴다', run: s => ({ fx: { cond: -5, parents: 3 }, msg: '버티는 것도 실력이라고 누가 그랬다.' }) },
    ] },
  { id: 'internOffer', time: ['day'], emoji: '💼', title: '인턴 서류 합격', once: true,
    when: s => s.stage === 'ug' && year(s) >= 3 && s.stats.spec >= 30,
    text: '넣은 줄도 몰랐던 인턴십 서류에 합격했다.',
    choices: [
      { label: '면접 보러 간다', run: s => Math.random() < 0.6
          ? { fx: { spec: 15, money: 10 }, msg: '합격! 이력서에 한 줄이 늘었다.' }
          : { fx: { cond: -6 }, msg: '"마지막으로 하고 싶은 말?"에 "감사합니다"만 했다. 탈락.' } },
      { label: '학점 관리가 먼저다', run: s => ({ fx: { study: 6 }, msg: '현명한 선택...이었을까?' }) },
    ] },
  // ── 대학원 전용
  { id: 'weekend', time: ['evening'], emoji: '📅', title: '"주말에 잠깐 나올 수 있지?"', when: s => s.stage !== 'ug',
    text: '금요일 오후 6시, 교수님의 메시지가 도착했다.',
    choices: [
      { label: '"넵 나가겠습니다"', run: s => ({ fx: { prof: 8, research: 4, cond: -10 }, msg: '"잠깐"은 토요일과 일요일 전부였다.' }) },
      { label: '"할머니 생신이라서요..."', run: s => ({ fx: { prof: -6, cond: 5 }, msg: '올해만 할머니 생신이 세 번째다.' }) },
    ] },
  { id: 'reject', emoji: '📮', title: '리뷰어 2의 리젝', when: s => s.stage !== 'ug' && s.stageResearch >= 30,
    text: '"The contribution is not clear." 리뷰어 2가 또 등장했다.',
    choices: [
      { label: '고쳐서 다른 곳에 낸다', run: s => ({ fx: { research: 6, cond: -8 }, msg: '3주 동안 Related Work를 다시 썼다.' }) },
      { label: '리뷰어 2를 저주한다', run: s => ({ fx: { research: -5, cond: 3 }, msg: '마음은 편해졌다. 논문은 그대로다.', post: '리뷰어 2는 대체 누구길래 매번 나만 만나는가' }) },
    ] },
  { id: 'salary', time: ['day'], emoji: '💸', title: '인건비가 밀렸다', when: s => s.stage !== 'ug',
    text: '이번 달 인건비가 아직 안 들어왔다. 과제 정산 중이라고 한다.',
    choices: [
      { label: '조용히 기다린다', run: s => ({ fx: { money: -10, prof: 2 }, msg: '라면 박스를 하나 더 샀다.' }) },
      { label: '행정실에 문의한다', run: s => ({ fx: { money: 6, prof: -4 }, msg: '돈은 들어왔다. 교수님 표정이 미묘하다.' }) },
    ] },
  { id: 'labpeer', time: ['evening', 'night'], emoji: '🧑‍🔬', title: '선배가 실험을 떠넘긴다', when: s => s.stage !== 'ug',
    text: '"이것만 좀 돌려줄래? 나 졸업이 걸려서..."',
    choices: [
      { label: '도와준다', run: s => ({ fx: { research: 3, seniors: 8, cond: -8 }, msg: '선배 논문 Acknowledgement에 이름이 올라갔다.' }) },
      { label: '"저도 졸업이 걸려서요"', run: s => ({ fx: { seniors: -8 }, msg: '연구실 공기가 2도쯤 내려갔다.' }) },
    ] },
  // ── 시간대 전용
  { id: 'oversleep', time: ['morning'], emoji: '⏰', title: '알람 5개를 전부 껐다', when: s => s.stage === 'ug',
    text: '눈을 떠보니 8시 52분. 1교시는 9시, 강의실은 캠퍼스 반대편이다.',
    choices: [
      { label: '세수 생략, 전력 질주', run: s => ({ fx: { study: 3, cond: -6 }, msg: '9시 01분 도착. 교수님이 출석을 막 끝내셨다.' }) },
      { label: '"오늘은 공결 사유가..." (없다)', run: s => ({ fx: { cond: 6, prof: -4 }, msg: '이불 속에서 출석 앱 알림을 끄고 다시 잤다.' }) },
    ] },
  { id: 'lunchline', time: ['day'], emoji: '🍱', title: '12시 학식 대기줄',
    text: '학생식당 줄이 건물 밖까지 이어졌다. 오늘 메뉴는 돈까스.',
    choices: [
      { label: '30분 기다린다', run: s => ({ fx: { cond: 5, money: -1, study: -1 }, msg: '돈까스는 두 조각 남아 있었다. 승리.' }) },
      { label: '편의점 삼각김밥', run: s => ({ fx: { cond: 2, money: -1 }, msg: '참치마요는 배신하지 않는다.' }) },
      { label: '동기들과 배달 시킨다', run: s => ({ fx: { cond: 4, money: -3, peers: 3 }, msg: '배달비가 음식값의 절반이었다.' }) },
    ] },
  { id: 'sunset', time: ['evening'], emoji: '🌇', title: '송도의 노을',
    text: '수업 끝나고 나오니 하늘이 분홍색이다. 바다 쪽으로 걸어가면 더 잘 보일 것 같다.',
    choices: [
      { label: '바닷가까지 걸어간다', run: s => ({ fx: { romance: 4, cond: 6, study: -2 }, msg: '사진은 실물을 못 담았다. 그래도 800장 찍었다.' }) },
      { label: '인스타 스토리만 올린다', run: s => ({ fx: { social: 2, romance: 1 }, msg: '좋아요 3개. 그중 하나는 엄마.' }) },
    ] },
  { id: 'curfew', time: ['night'], emoji: '🚪', title: '기숙사 통금 10분 전', when: s => s.stage === 'ug',
    text: '동기들이 "한 잔만 더"를 외친다. 기숙사 문은 자정에 닫힌다.',
    choices: [
      { label: '뛰어서 돌아간다', run: s => ({ fx: { cond: -3, parents: 2 }, msg: '11시 59분 50초에 카드를 찍었다. 경비 아저씨가 박수를 쳤다.' }) },
      { label: '"외박하지 뭐"', run: s => { inc(s, 'drinks'); return { fx: { social: 5, cond: -8, money: -4, peers: 4 }, msg: '벌점 3점. 대신 전설이 하나 생겼다.', post: '어제 기숙사 앞 벤치에서 자던 사람 괜찮음?' }; } },
    ] },
  { id: 'deadline', time: ['late'], emoji: '💻', title: '새벽 3시, 과제 마감 1시간 전',
    text: '과제 제출 마감은 04:00. 지금 진행률은... 제목만 썼다.',
    choices: [
      { label: '에너지 드링크 + 몰입', run: s => { inc(s, 'allnighter'); return { fx: { study: 8, cond: -12 }, msg: '03:59:47 제출 완료. 파일명은 "최종_진짜최종_ver3".' }; } },
      { label: '"서버 오류였어요" 메일 초안 작성', run: s => ({ fx: { cond: 4, prof: -5 }, msg: '교수님은 서버 로그를 볼 줄 아셨다.' }) },
      { label: '깔끔하게 포기하고 잔다', run: s => ({ fx: { cond: 10, study: -4 }, msg: '꿀잠을 잤다. 성적도 꿀처럼 녹아내릴 것이다.' }) },
    ] },
  { id: 'dawnwalk', time: ['late'], emoji: '🌌', title: '잠이 안 오는 새벽',
    text: '새벽 4시. 창밖 송도는 조용하고, 머릿속은 시끄럽다.',
    choices: [
      { label: '캠퍼스 한 바퀴 산책', run: s => ({ fx: { cond: 3, romance: 3 }, msg: '공대 7층에만 불이 켜져 있었다. 대학원생들이다.' }) },
      { label: '인생 계획을 세운다', run: s => ({ fx: { spec: 2, cond: -3 }, msg: '계획표가 완성됐다. 실행은 내일의 나에게 맡겼다.' }) },
    ] },
];

// ── 대나무숲(익명게시판) 자동 글

// ── 들어갈 수 있는 건물 (OSM 건물 이름으로 매칭)
// match: 이름에 포함된 문자열 / events: 들어가면 뜨는 이벤트 풀 / 주 1회 이용
// open: 시각(0~24) → 열려 있는지 / closedText: 닫혔을 때 안내
const PLACES = {
  library: { match: '학산도서관', emoji: '📚', name: '학산도서관', events: () => LIBRARY_EVENTS,
             open: h => h >= 6 || h < 2, closedText: '도서관은 새벽 2시부터 6시까지 문을 닫는다' },
};

// ── 학산도서관 이벤트
const LIBRARY_EVENTS = [
  { id: 'lib_window', time: ['morning', 'day'], emoji: '🪟', title: '창가 자리 전쟁',
    text: '햇살 좋은 창가 자리. 그런데 주인은 없고 가방만 3시간째 앉아 있다.',
    choices: [
      { label: '가방을 옆으로 치우고 앉는다', run: s => ({ fx: { study: 8, peers: -3 }, msg: '집중이 잘 됐다. 돌아온 가방 주인의 눈빛은 잊히지 않는다.', post: '도서관 3층 창가 자리 가방 치운 사람 누구임? 내 자리였는데' }) },
      { label: '구석 자리로 간다', run: s => ({ fx: { study: 5 }, msg: '구석은 조용했다. 와이파이도 조용했다.' }) },
      { label: '포기하고 카페로', run: s => ({ fx: { study: 2, money: -2, cond: 3 }, msg: '아아 한 잔에 3시간 버티기 성공.' }) },
    ] },
  { id: 'lib_keyboard', emoji: '⌨️', title: '열람실 키보드 빌런',
    text: '옆자리에서 기계식 키보드 청축 소리가 난다. 타닥타닥타닥.',
    choices: [
      { label: '포스트잇을 붙인다', run: s => Math.random() < 0.3
          ? { fx: { study: 4, cond: -4 }, msg: '포스트잇이 대나무숲에 박제됐다. "이 정도로 예민하면 집에서 하세요"', post: '도서관 포스트잇 빌런 vs 키보드 빌런 누가 더 잘못함?' }
          : { fx: { study: 6 }, msg: '키보드 소리가 멈췄다. 조용한 승리.' } },
      { label: '이어폰 끼고 참는다', run: s => ({ fx: { study: 4, cond: -3 }, msg: '노이즈캔슬링도 청축은 못 이긴다.' }) },
      { label: '나도 노트북을 꺼내 더 세게 친다', run: s => ({ fx: { study: 3, peers: -4 }, msg: '열람실에 키보드 협주곡이 울려 퍼졌다.', post: '오늘 도서관 4층에서 키보드 배틀 남 ㅋㅋㅋ' }) },
    ] },
  { id: 'lib_exam_seat', time: ['morning', 'day'], emoji: '🪑', title: '시험기간 좌석 대란', when: s => (s.week >= 6 && s.week <= 8) || s.week >= 14,
    text: '좌석 예약 앱이 열리자마자 매진됐다. 시험이 코앞이다.',
    choices: [
      { label: '새벽 6시에 줄을 선다', run: s => ({ fx: { study: 12, cond: -10 }, msg: '오픈런 성공. 해가 뜨는 걸 도서관에서 봤다.' }) },
      { label: '계단에 앉아서 한다', run: s => ({ fx: { study: 7, cond: -4 }, msg: '계단 3층 참이 생각보다 아늑하다.' }) },
      { label: '집에서 하면 되지', run: s => ({ fx: { study: 2, cond: 3 }, msg: '침대는 공부하는 곳이 아니었다.' }) },
    ] },
  { id: 'lib_note', emoji: '💌', title: '책 사이에 끼워진 쪽지',
    text: '빌린 책을 펼치자 쪽지가 떨어졌다. "매일 같은 자리에 앉으시네요. 혹시 커피 한잔?"',
    choices: [
      { label: '답장을 끼워서 반납한다', run: s => {
          if (!s.flags.crush && Math.random() < 0.4) { s.flags.crush = true; return { fx: { romance: 12, cond: 6 }, msg: '다음 날 책 사이에 답장의 답장이 있었다. 도서관 썸이 시작됐다.', post: '도서관 쪽지로 사귄 사람 실존함? (실존함)' }; }
          return { fx: { romance: 5 }, msg: '답장은 오지 않았다. 반납함이 너무 깊었나 보다.' }; } },
      { label: '공부에 집중한다', run: s => ({ fx: { study: 7 }, msg: '쪽지는 책갈피가 되었다.' }) },
    ] },
  { id: 'lib_sleep', emoji: '😴', title: '책상 위의 꿀잠',
    text: '전공책 3페이지 만에 눈꺼풀이 무거워진다.',
    choices: [
      { label: '엎드려서 잔다', run: s => ({ fx: { cond: 10, study: 1 }, msg: '일어나 보니 얼굴에 책 자국이 찍혀 있었다.' }) },
      { label: '에너지 드링크를 마신다', run: s => ({ fx: { study: 7, cond: -5, money: -2 }, msg: '심장이 공부하는 속도보다 빨리 뛴다.' }) },
    ] },
  { id: 'lib_studyroom', time: ['day', 'evening'], emoji: '🧑‍🤝‍🧑', title: '그룹 스터디룸', when: s => s.stage === 'ug',
    text: '팀플 회의를 하려고 스터디룸을 예약했다. 4명 중 2명이 왔다.',
    choices: [
      { label: '온 사람끼리 끝낸다', run: s => ({ fx: { study: 6, peers: 3, cond: -3 }, msg: '둘이서 넷의 몫을 했다. 서로를 전우라 부르기로 했다.' }) },
      { label: '안 온 사람 기다린다', run: s => ({ fx: { study: 2, cond: -2 }, msg: '1시간 뒤 "나 오늘 못 갈 듯 ㅠ"가 왔다.' }) },
    ] },
  { id: 'lib_research', time: ['day', 'evening'], emoji: '🔎', title: '교수님의 부탁', when: s => s.stage !== 'ug' || (s.stageSem >= 3 && s.rep.prof >= 55),
    text: '"도서관에서 이 논문 좀 찾아다 줄 수 있나?" 교수님의 메시지가 왔다.',
    choices: [
      { label: '찾아서 요약까지 해 간다', run: s => ({ fx: { research: 5, prof: 5, cond: -4 }, msg: '"오, 꼼꼼하군." 연구의 세계에 발을 들였다.' }) },
      { label: '링크만 보내드린다', run: s => ({ fx: { research: 1, prof: 1 }, msg: '"고맙네." 그게 다였다.' }) },
    ] },
  { id: 'lib_overdue', time: ['day'], emoji: '📕', title: '연체 도서',
    text: '지난 학기에 빌린 책이 아직 가방에 있다. 대출 정지 30일.',
    choices: [
      { label: '연체료를 내고 반성한다', run: s => ({ fx: { money: -3, study: 4 }, msg: '사서 선생님이 "다음엔 꼭이요"라고 했다.' }) },
      { label: '친구 학생증으로 빌린다', run: s => ({ fx: { study: 5, peers: -2 }, msg: '친구도 대출 정지가 됐다.' }) },
    ] },
  { id: 'lib_openrun', time: ['morning'], emoji: '🌅', title: '아침 6시 오픈런',
    text: '문 열자마자 들어왔다. 열람실이 텅 비어 있다. 이 고요함, 내 거다.',
    choices: [
      { label: '제일 좋은 자리에서 집중', run: s => ({ fx: { study: 9, cond: -3 }, msg: '점심때까지 한 번도 폰을 안 봤다. 기적이다.' }) },
      { label: '좋은 자리 잡고 다시 잔다', run: s => ({ fx: { study: 3, cond: 5 }, msg: '자리는 지켰다. 공부는 못 지켰다.' }) },
    ] },
  { id: 'lib_night', time: ['night', 'late'], emoji: '🌙', title: '야간 열람실',
    text: '불 꺼진 캠퍼스에서 열람실만 환하다. 남은 사람은 나와 정체불명의 고시생 둘.',
    choices: [
      { label: '고시생들과 무언의 연대', run: s => { inc(s, 'allnighter'); return { fx: { study: 10, cond: -8 }, msg: '새벽 1시, 서로 눈인사를 했다. 전우애가 생겼다.' }; } },
      { label: '자판기 커피 한 잔 하고 간다', run: s => ({ fx: { study: 4, money: -1, cond: -2 }, msg: '자판기 앞에서 고시생과 인생 상담을 했다.' }) },
    ] },
  { id: 'lib_closing', time: ['night', 'late'], emoji: '📢', title: '폐관 30분 전 방송',
    text: '"이용자 여러분, 잠시 후 도서관 문을 닫습니다." 아직 한 챕터 남았다.',
    choices: [
      { label: '30분 만에 몰아친다', run: s => ({ fx: { study: 6, cond: -4 }, msg: '경비 아저씨가 불을 끌 때 마지막 문장을 읽었다.' }) },
      { label: '책을 빌려서 기숙사로', run: s => ({ fx: { study: 3, cond: 2 }, msg: '책은 침대 옆에서 베개가 되었다.' }) },
    ] },
  { id: 'lib_plain',emoji: '📖', title: '평범한 도서관의 하루',
    text: '자리에 앉았다. 오늘은 얼마나 할까?',
    choices: [
      { label: '딱 3시간만', run: s => ({ fx: { study: 5, cond: -2 }, msg: '정확히 3시간 하고 일어났다. 뿌듯하다.' }) },
      { label: '막차 시간까지', run: s => { inc(s, 'allnighter'); return { fx: { study: 9, cond: -7 }, msg: '셔틀 막차를 놓쳤다. 공부량은 놓치지 않았다.' }; } },
      { label: '유튜브 "5분만"', run: s => ({ fx: { study: 1, cond: 3 }, msg: '알고리즘이 나를 3시간 붙잡았다.' }) },
    ] },
];

// ── 대나무숲(익명게시판) 자동 글
const POST_TEMPLATES = [
  { when: s => visits(s, 'library') >= 6 && s.stats.social < 40, text: '도서관 3층 창가 자리는 항상 같은 사람임. 거기 사는 거 아님?' },
  { when: s => visits(s, 'library') === 0 && s.week >= 6, text: '이번 학기 도서관 한 번도 안 간 사람 손 ✋ (시험은 어떻게 하려고)' },
  { when: s => s.cond < 25, text: '과방에 좀비처럼 걸어 다니는 사람 있던데 괜찮은 거냐' },
  { when: s => s.lastGpa != null && s.lastGpa >= 4.2, text: '이번 학기 과탑 누군지 앎? 소문으로는 {who}래' },
  { when: s => s.lastGpa != null && s.lastGpa < 2.0, text: '학고 기준 1.75 맞지? 친구가 물어봐 달래 (친구임)' },
  { when: s => s.flags.crush, text: 'CC는 헤어지면 과 생활 끝나는 거 알지? (부럽다는 뜻)' },
  { when: s => s.stage !== 'ug', text: '대학원생은 사람이 아니라 연구실 비품이다 - 익명의 석사 3학기' },
  { when: s => s.stats.spec >= 80 && s.stage === 'ug', text: '{who} 이력서 보면 대외활동만 A4 두 장이래 ㄷㄷ' },
  { when: () => true, text: '오늘 학식 제육 나옴. 이번 학기 최고의 사건' },
  { when: () => true, text: '학산도서관 4층 키보드 소리 큰 분 제발...' },
  { when: () => true, text: '송도 바닷바람 때문에 우산 세 개째 뒤집힘' },
  { when: () => true, text: '기숙사에서 공대까지 걸어가면 수업 끝나 있음' },
  { when: () => true, text: '교양 팀플 있는 거 강의계획서에 없었잖아요 ㅠㅠ' },
  { when: s => (s.week >= 6 && s.week <= 8) || s.week >= 14, text: '시험기간인데 왜 방 청소가 하고 싶을까' },
  { when: s => s.stage === 'ug' && year(s) === 1, text: '새내기인데 선배들이 밥 사준다는 거 언제까지임?' },
  { when: s => s.stage === 'ug' && year(s) === 4, text: '4학년 되니까 학교 오는 게 무서움. 아는 사람이 없음' },
];
