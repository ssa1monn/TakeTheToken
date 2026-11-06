// ───────────────────────────────────────────────
// 다시 사는 대학생활 — 게임 데이터
// ───────────────────────────────────────────────
const N = 9;               // 맵 크기 (9x9)
const HOURS_CAP = 70;      // 주당 쓸 수 있는 시간 (수면 제외)
const WEEKS = 16;          // 한 학기 주차
const PAPER_COST = 110;    // 대학원: 연구 포인트 → 논문 1편

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

const CATS = {
  study:    { name: '공부', color: '#4a7bd0' },
  social:   { name: '인싸', color: '#e0679a' },
  money:    { name: '돈벌이', color: '#e0a02b' },
  life:     { name: '생존', color: '#3fa56f' },
  career:   { name: '스펙', color: '#8a5cd0' },
  research: { name: '연구', color: '#1f9e96' },
};

const UG = ['ug'], ALL = ['ug', 'ms', 'phd'], GRAD = ['ms', 'phd'];

// eff: 매주 효과 / rep: 매주 평판 변화 / syn: 상하좌우 이웃 시너지
const TILES = {
  // ── 1학년
  lecture:   { name: '강의실', emoji: '📖', cat: 'study', cost: 0, hours: 15, stages: ['ug', 'ms'], minYear: 1,
               eff: { study: 3 }, rep: { prof: 0.15 }, desc: '출석은 기본 소양.' },
  library:   { name: '도서관', emoji: '📚', cat: 'study', cost: 10, hours: 10, stages: ALL, minYear: 1,
               eff: { study: 4, cond: -1 }, rep: { prof: 0.1 }, desc: '창가 자리는 전쟁이다.' },
  home:      { name: '자취방', emoji: '🏠', cat: 'life', cost: 15, hours: 0, stages: ALL, minYear: 1, max: 2,
               eff: { cond: 2, money: -1 }, syn: [{ with: '*', eff: { cond: 0.5 }, note: '가까운 건물마다 컨디션 +0.5' }],
               desc: '월세는 숨만 쉬어도 나간다.' },
  cafeteria: { name: '학식', emoji: '🍚', cat: 'life', cost: 5, hours: 2, stages: ALL, minYear: 1,
               eff: { cond: 1.5, money: -0.5 }, desc: '제육 나오는 날은 축제.' },
  club:      { name: '동아리방', emoji: '🎸', cat: 'social', cost: 10, hours: 8, stages: UG, minYear: 1,
               eff: { social: 3, romance: 2, study: -0.5 }, rep: { peers: 0.3, seniors: 0.2 }, desc: '공연 연습이라 쓰고 수다라 읽는다.' },
  bar:       { name: '학교 앞 술집', emoji: '🍺', cat: 'social', cost: 0, hours: 6, stages: ALL, minYear: 1,
               eff: { social: 3, romance: 2, cond: -2, money: -3 }, rep: { peers: 0.3, seniors: 0.3, parents: -0.1 },
               syn: [{ with: ['club'], eff: { social: 1.5 }, note: '동아리방 옆: 인맥 +1.5' },
                     { with: ['lecture'], eff: { study: -1 }, note: '강의실 옆: 해장 수업, 공부 -1' }],
               desc: '사장님이 이름을 외웠다.' },
  cvs:       { name: '편의점 알바', emoji: '🏪', cat: 'money', cost: 0, hours: 12, stages: UG, minYear: 1,
               eff: { money: 5, cond: -2 }, rep: { parents: 0.1 }, desc: '폐기 도시락이 주식.' },
  pcbang:    { name: 'PC방', emoji: '🎮', cat: 'life', cost: 0, hours: 6, stages: ALL, minYear: 1,
               eff: { cond: 2, money: -1, study: -0.5 }, rep: { peers: 0.1, parents: -0.1 },
               syn: [{ with: ['lecture'], eff: { study: -1 }, note: '강의실 옆: 수업 째기 쉬움, 공부 -1' }],
               desc: '"한 판만"은 거짓말이다.' },
  // ── 2학년
  cafe:      { name: '카페', emoji: '☕', cat: 'study', cost: 15, hours: 4, stages: ALL, minYear: 2,
               eff: { money: -2, cond: 1 }, syn: [{ with: ['lecture', 'library'], eff: { study: 1.5 }, note: '강의실/도서관 옆마다 공부 +1.5' }],
               desc: '아아 한 잔으로 세 시간 버티기.' },
  academy:   { name: '학회', emoji: '🧪', cat: 'career', cost: 10, hours: 8, stages: UG, minYear: 2,
               eff: { spec: 2, social: 1, study: 0.5 }, desc: '세션 끝나고 뒤풀이가 본론.' },
  tutor:     { name: '과외 알바', emoji: '✏️', cat: 'money', cost: 0, hours: 6, stages: ALL, minYear: 2,
               eff: { money: 7, cond: -1 }, rep: { parents: 0.15 }, desc: '학생이 나보다 똑똑하다.' },
  gym:       { name: '헬스장', emoji: '💪', cat: 'life', cost: 20, hours: 5, stages: ALL, minYear: 2,
               eff: { cond: 3, money: -1, romance: 0.5 }, syn: [{ with: ['home'], eff: { cond: 1 }, note: '자취방 옆: 컨디션 +1' }],
               desc: '등록만 해도 반은 한 것.' },
  dating:    { name: '연애', emoji: '💘', cat: 'social', cost: 0, hours: 10, stages: ALL, minYear: 1, max: 1,
               needFlag: 'crush', flagHint: '고백 이벤트로 해금',
               eff: { romance: 5, money: -3, cond: 1, study: -1 }, rep: { peers: 0.1 }, desc: '시험기간에도 데이트는 한다.' },
  // ── 3학년
  intern:    { name: '인턴', emoji: '💼', cat: 'career', cost: 0, hours: 20, stages: UG, minYear: 3,
               eff: { spec: 5, money: 3, cond: -3 }, desc: '커피 심부름도 경력이다.' },
  lab:       { name: '학부연구실', emoji: '🔬', cat: 'research', cost: 0, hours: 12, stages: ALL, minYear: 3, earlyFlag: 'labOffer',
               eff: { research: 3, spec: 1, study: 0.5 }, rep: { prof: 0.4 },
               syn: [{ with: ['library'], eff: { research: 1 }, note: '도서관 옆: 연구 +1' }],
               desc: '대학원으로 가는 문. 한번 열면 닫기 어렵다.' },
  contest:   { name: '공모전', emoji: '🏆', cat: 'career', cost: 5, hours: 10, stages: UG, minYear: 3,
               eff: { spec: 3, social: 0.5, cond: -1 }, desc: '상금보다 이력서 한 줄.' },
  // ── 4학년
  jobstudy:  { name: '취준 스터디', emoji: '📝', cat: 'career', cost: 0, hours: 10, stages: UG, minYear: 4,
               eff: { spec: 3, cond: -1 }, syn: [{ with: ['library'], eff: { spec: 1 }, note: '도서관 옆: 스펙 +1' }],
               desc: '자소서 첨삭은 서로 상처 주기.' },
  capstone:  { name: '졸업 프로젝트', emoji: '🎓', cat: 'study', cost: 0, hours: 15, stages: UG, minYear: 4, max: 1,
               eff: { study: 2, spec: 2, cond: -2 }, desc: '8주 이상 진행해야 졸업 가능.' },
  // ── 대학원
  paperroom: { name: '논문 작성실', emoji: '📄', cat: 'research', cost: 0, hours: 15, stages: GRAD, minYear: 1,
               eff: { research: 4, cond: -2 }, syn: [{ with: ['lab'], eff: { research: 2 }, note: '연구실 옆: 연구 +2' }],
               desc: 'Related Work만 3주째.' },
  ta:        { name: '조교실', emoji: '🧑‍🏫', cat: 'money', cost: 0, hours: 10, stages: GRAD, minYear: 1,
               eff: { money: 6, cond: -1 }, rep: { prof: 0.2 }, desc: '학부생 메일 답장 기계.' },
  conf:      { name: '학회 발표', emoji: '🎤', cat: 'career', cost: 15, hours: 6, stages: GRAD, minYear: 1,
               eff: { spec: 2, research: 1, social: 1, money: -2 }, desc: '질문 받을 때 심장이 멎는다.' },
  nightlab:  { name: '연구실 야근', emoji: '🌙', cat: 'research', cost: 0, hours: 20, stages: GRAD, minYear: 1,
               eff: { research: 6, cond: -4 }, rep: { prof: 0.3, parents: -0.1 }, desc: '불 꺼진 건물에 우리 랩만 환하다.' },
  meeting:   { name: '지도교수 미팅', emoji: '👨‍🏫', cat: 'research', cost: 0, hours: 4, stages: GRAD, minYear: 1, max: 1,
               eff: { research: 2, cond: -2 }, rep: { prof: 0.5 }, desc: '"그래서 결론이 뭔가?"' },
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
  { id: 'freeride', emoji: '🧟', title: '조별과제 무임승차', when: s => s.stage !== 'phd',
    text: '팀원 셋 중 둘이 단톡방에서 증발했다. 발표는 내일이다.',
    choices: [
      { label: '혼자 다 한다 (현실)', run: s => ({ fx: { study: 10, cond: -12, prof: 4 }, msg: '발표는 성공했다. 기여도 평가에 "다 같이 열심히 함"이라고 적었다.' }) },
      { label: '단톡방에 박제한다', run: s => { inc(s, 'expose'); return { fx: { study: 4, peers: -8, seniors: 3 }, msg: '캡처가 과 전체에 퍼졌다. 통쾌한데 분위기가 싸해졌다.', post: '조별과제 무임승차 박제 사건 봤음? 캡처 보니까 레전드던데 ㅋㅋ' }; } },
      { label: '나도 증발한다', run: s => ({ fx: { study: -6, peers: -4, prof: -6 }, msg: '아무도 하지 않았다. 교수님은 모든 것을 알고 계셨다.' }) },
    ] },
  { id: 'seniorcall', emoji: '🍻', title: '밤 11시, 선배의 호출',
    text: '"야 너 지금 어디야? 학교 앞인데 잠깐만 나와~"',
    choices: [
      { label: '"갑니다!" (3차까지)', run: s => { inc(s, 'drinks'); return { fx: { social: 6, romance: 3, cond: -10, money: -5, seniors: 8 }, msg: '정신 차려보니 해가 떠 있었다. 선배가 족보를 약속했다... 아마도.' }; } },
      { label: '자는 척 읽씹', run: s => ({ fx: { seniors: -6, cond: 3 }, msg: '다음 날 "어제 왜 안 왔냐"는 말을 세 번 들었다.' }) },
    ] },
  { id: 'proxy', emoji: '🙋', title: '대리출석 부탁', when: s => s.stage === 'ug',
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
  { id: 'confess', emoji: '💌', title: '갑자기 고백을 받았다', once: true,
    when: s => !s.flags.crush && (s.stats.romance >= 15 || s.stats.social >= 30),
    text: '과 행사가 끝나고, 같은 과 동기가 조심스럽게 말을 꺼냈다.',
    choices: [
      { label: '"나도 좋아!"', run: s => { s.flags.crush = true; return { fx: { romance: 12, cond: 8 }, msg: '연애가 시작됐다! [💘 연애] 건물이 해금되었다.', post: '우리 과 CC 탄생했다는데 ㅊㅋㅊㅋ (부럽다는 뜻)' }; } },
      { label: '"우리 그냥 친구로..."', run: s => ({ fx: { peers: -3, study: 3 }, msg: '도서관으로 향했다. 집중은 잘 안 됐다.' }) },
    ] },
  { id: 'mt', emoji: '🚌', title: '과 MT 공지', when: s => s.stage === 'ug' && year(s) <= 2,
    text: '1박 2일 MT. 회비 3만원. 불참하면 "사유서"를 내야 한다(농담이겠지?).',
    choices: [
      { label: '간다', run: s => { inc(s, 'drinks'); return { fx: { social: 10, romance: 5, money: -6, cond: -6, peers: 6 }, msg: '새벽 4시 마피아 게임에서 마피아였다. 아무도 의심하지 않았다.' }; } },
      { label: '안 간다', run: s => ({ fx: { peers: -6, cond: 5, study: 3 }, msg: 'MT 사진첩에 내가 없다.' }) },
    ] },
  { id: 'election', emoji: '🗳️', title: '학생회 출마 권유', once: true,
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
  { id: 'labOffer', emoji: '🔬', title: '교수님의 제안', once: true,
    when: s => s.stage === 'ug' && year(s) >= 2 && s.rep.prof >= 62,
    text: '"자네, 우리 연구실에서 학부연구생 해볼 생각 없나?"',
    choices: [
      { label: '"하겠습니다!"', run: s => { s.flags.labOffer = true; return { fx: { research: 5, prof: 8 }, msg: '[🔬 학부연구실]이 일찍 해금되었다. 대학원 테크트리에 한 발짝 다가갔다.' }; } },
      { label: '"생각해볼게요..." (영원히)', run: s => ({ fx: { prof: -4 }, msg: '교수님은 다른 학생에게 물어보셨다.' }) },
    ] },
  { id: 'call', emoji: '📞', title: '부모님 전화',
    text: '"밥은 먹고 다니니? 요즘 뭐 하고 지내?"',
    choices: [
      { label: '"용돈 조금만..."', run: s => ({ fx: { money: 12, parents: -6 }, msg: '입금 알림과 함께 한숨 소리가 들렸다.' }) },
      { label: '"잘 지내요! 공부 열심히 해요"', run: s => ({ fx: { parents: 6 },
          msg: s.lastGpa != null && s.lastGpa < 2.5 ? '성적표가 집으로 간다는 사실을 잊고 있었다.' : '어머니가 친척들에게 자랑을 시작하셨다.' }) },
    ] },
  { id: 'yasik', emoji: '🍗', title: '새벽 2시, 야식의 유혹',
    text: '룸메가 치킨을 시키자고 한다. 내일 9시 수업이 있다.',
    choices: [
      { label: '반반 무 많이', run: s => ({ fx: { money: -3, cond: 4, peers: 3, study: -2 }, msg: '9시 수업에 지각했다. 후회는 없다.' }) },
      { label: '참는다', run: s => ({ fx: { cond: -2, study: 2 }, msg: '치킨 냄새를 맡으며 잠들었다.' }) },
    ] },
  { id: 'leave', emoji: '😵', title: '휴학 고민', when: s => s.cond < 35 && s.stage === 'ug' && !s.flags.leave,
    text: '요즘 너무 지친다. 다들 휴학한다던데...',
    choices: [
      { label: '다음 학기에 휴학한다', run: s => { s.flags.leave = true; return { fx: {}, msg: '학기가 끝나면 한 학기 쉰다. 동기들보다 졸업이 늦어진다.' }; } },
      { label: '버틴다', run: s => ({ fx: { cond: -5, parents: 3 }, msg: '버티는 것도 실력이라고 누가 그랬다.' }) },
    ] },
  { id: 'internOffer', emoji: '💼', title: '인턴 서류 합격', once: true,
    when: s => s.stage === 'ug' && year(s) >= 3 && s.stats.spec >= 30,
    text: '넣은 줄도 몰랐던 인턴십 서류에 합격했다.',
    choices: [
      { label: '면접 보러 간다', run: s => Math.random() < 0.6
          ? { fx: { spec: 15, money: 10 }, msg: '합격! 이력서에 한 줄이 늘었다.' }
          : { fx: { cond: -6 }, msg: '"마지막으로 하고 싶은 말?"에 "감사합니다"만 했다. 탈락.' } },
      { label: '학점 관리가 먼저다', run: s => ({ fx: { study: 6 }, msg: '현명한 선택...이었을까?' }) },
    ] },
  // ── 대학원 전용
  { id: 'weekend', emoji: '📅', title: '"주말에 잠깐 나올 수 있지?"', when: s => s.stage !== 'ug',
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
  { id: 'salary', emoji: '💸', title: '인건비가 밀렸다', when: s => s.stage !== 'ug',
    text: '이번 달 인건비가 아직 안 들어왔다. 과제 정산 중이라고 한다.',
    choices: [
      { label: '조용히 기다린다', run: s => ({ fx: { money: -10, prof: 2 }, msg: '라면 박스를 하나 더 샀다.' }) },
      { label: '행정실에 문의한다', run: s => ({ fx: { money: 6, prof: -4 }, msg: '돈은 들어왔다. 교수님 표정이 미묘하다.' }) },
    ] },
  { id: 'labpeer', emoji: '🧑‍🔬', title: '선배가 실험을 떠넘긴다', when: s => s.stage !== 'ug',
    text: '"이것만 좀 돌려줄래? 나 졸업이 걸려서..."',
    choices: [
      { label: '도와준다', run: s => ({ fx: { research: 3, seniors: 8, cond: -8 }, msg: '선배 논문 Acknowledgement에 이름이 올라갔다.' }) },
      { label: '"저도 졸업이 걸려서요"', run: s => ({ fx: { seniors: -8 }, msg: '연구실 공기가 2도쯤 내려갔다.' }) },
    ] },
];

// ── 대나무숲(익명게시판) 자동 글
const POST_TEMPLATES = [
  { when: s => countTile(s, 'bar') >= 2, text: '학교 앞 술집 사장님 말로는 {who}가 단골이래. 수업에선 본 적 없음' },
  { when: s => countTile(s, 'library') >= 2 && s.stats.social < 40, text: '도서관 3층 창가 자리는 항상 같은 사람임. 거기 사는 거 아님?' },
  { when: s => s.cond < 25, text: '과방에 좀비처럼 걸어 다니는 사람 있던데 괜찮은 거냐' },
  { when: s => countTile(s, 'cvs') + countTile(s, 'tutor') >= 2, text: '알바 두 탕 뛰면서 수업 듣는 사람 실존함. 리스펙' },
  { when: s => s.lastGpa != null && s.lastGpa >= 4.2, text: '이번 학기 과탑 누군지 앎? 소문으로는 {who}래' },
  { when: s => s.lastGpa != null && s.lastGpa < 2.0, text: '학고 기준 1.75 맞지? 친구가 물어봐 달래 (친구임)' },
  { when: s => countTile(s, 'pcbang') >= 1, text: '공강 때 PC방 가면 우리 과 절반이 있음' },
  { when: s => s.flags.crush, text: 'CC는 헤어지면 과 생활 끝나는 거 알지? (부럽다는 뜻)' },
  { when: s => s.stage !== 'ug', text: '대학원생은 사람이 아니라 연구실 비품이다 - 익명의 석사 3학기' },
  { when: s => countTile(s, 'nightlab') >= 1, text: '공대 7층 불이 새벽 4시까지 켜져 있던데 누구냐' },
  { when: s => countTile(s, 'gym') >= 1, text: '헬스장에서 거울 보며 셀카 찍는 {who} 봤다는 제보' },
  { when: s => s.stats.spec >= 80 && s.stage === 'ug', text: '{who} 이력서 보면 대외활동만 A4 두 장이래 ㄷㄷ' },
  { when: () => true, text: '오늘 학식 제육 나옴. 이번 학기 최고의 사건' },
  { when: () => true, text: '중도 4층 키보드 소리 큰 분 제발...' },
  { when: () => true, text: '교양 팀플 있는 거 강의계획서에 없었잖아요 ㅠㅠ' },
  { when: s => (s.week >= 6 && s.week <= 8) || s.week >= 14, text: '시험기간인데 왜 방 청소가 하고 싶을까' },
  { when: s => s.stage === 'ug' && year(s) === 1, text: '새내기인데 선배들이 밥 사준다는 거 언제까지임?' },
  { when: s => s.stage === 'ug' && year(s) === 4, text: '4학년 되니까 학교 오는 게 무서움. 아는 사람이 없음' },
];
