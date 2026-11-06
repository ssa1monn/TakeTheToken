export const toMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const timeLabel = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function calendarClock(date, minute) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return { date, minute, weekday: WEEKDAYS[parsed.getUTCDay()] };
}

export function realKoreanClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return calendarClock(`${values.year}-${values.month}-${values.day}`, Number(values.hour) * 60 + Number(values.minute));
}

export function currentClock(state, now) {
  return state.clockMode === 'live' ? realKoreanClock(now) : calendarClock(state.demoDate, state.minute);
}

export function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function evaluationWindow(course, clock) {
  const meetings = course.meetings.filter(m => m.day === clock.weekday);
  if (!meetings.length) return { allowed: false, status: 'not_today', reason: '오늘 수업이 없는 강의예요.', end: null };
  const start = Math.min(...meetings.map(m => toMinutes(m.start)));
  const end = Math.max(...meetings.map(m => toMinutes(m.end)));
  if (clock.minute < start) return { allowed: false, status: 'before', reason: `${timeLabel(start)} 수업 시작 · 종료 후 평가`, start, end };
  if (clock.minute < end) return { allowed: false, status: 'in_class', reason: `${timeLabel(end)} 종료 후 평가할 수 있어요.`, start, end };
  return { allowed: true, status: 'finished', reason: `${timeLabel(end)} 수업 종료 · 평가 가능`, start, end };
}

export function validateComment(text) {
  const value = String(text ?? '').trim().replace(/\s*[\r\n]+\s*/g, ' ');
  if (value.length > 120) throw new Error('한 줄 평가는 120자 이내로 적어주세요.');
  return value;
}

// Every handle and line below is a fictional student's demo text.
const NICK_FIRST = ['졸린', '배고픈', '열공하는', '마감앞의', '송도의', '오류잡는', '커피마신', '조용한', '새벽의', '과제하는', '행렬먹는', '공강찾는', '풀충전된', '집가고싶은', '질문하는', '마지막까지', '출석한', '에러없는', '야식먹는', '버그잡는', '학식먹은', '산책하는', '복습하는', '캐시된', '수요일의', '야무진', '종강기다리는', '코드짜는', '오늘도', '숨은', '알고보니', '반짝이는'];
const NICK_LAST = ['너구리', '감자', '횃불', '개발자', '오리', '햄스터', '고양이', '수강생', '학부생', '디버거', '전공생', '새싹', '붕어빵', '쿼카', '카피바라', '돌고래', '바이트', '세미콜론', '새우', '포인터', '커서', '푸딩', '토큰', '펭귄', '키위', '두부', '밤톨', '북극곰', '다람쥐', '노트북', '김밥', '알파카'];
const POSITIVE = [
  '오늘 설명 폼 미쳤다… 예제 보고 이해해버림',
  '제제이야… 오늘은 예제까지 혼자 풀었다',
  '이해 완. 나 제법 전공생일지도?',
  '이건 좀 낭만인데? 필기하다가 공책 꽉 참',
  '어제 막혔던 부분이 오늘 딱 이어졌어요',
  '이해되는 순간 도파민 터짐. 이런 맛에 전공 듣지',
  '예제 따라가니까 머릿속에서 퍼즐 맞춰짐',
  '수업 시작 전의 나와 끝난 뒤의 나, 제법 다름',
  '질문했는데 다른 예시로 다시 풀어주셔서 좋았어요',
  '설명이 단계별이라 따라가기 편했어요',
  '실습이랑 개념이 연결돼서 오늘은 집중 잘 됐어요',
  '자료에 예제가 자세해서 복습하기 좋겠어요',
  '오늘 수업은 꽤 알찼습니다. 특히 마지막 예시요',
  '오늘 수업 퍼컬은 명강의. 내 뇌랑 잘 맞음',
  '이렇게 설명하면 나도 이해하잖아. 완전 럭키전공생',
  '분명 75분인데 체감 20분. 시간 누가 압축함?',
  '오 이게 되네? 상태로 수업 끝남',
  '오늘은 필기보다 고개 끄덕이는 횟수가 더 많았음',
  '이해도 떡상해서 기분이 주주총회임',
  '아 이거였구나 하고 소리 낼 뻔ㅋㅋ',
  '수업 끝났는데 한 예제만 더 보고 싶었음. 이왜진',
  '수업이 친절해요. 제 뇌가 아직 낯가리는 중이었네',
  '혼자 끙끙댄 거 5분 만에 풀림. 어이없고 감사합니다',
  '오늘 배운 거 바로 과제에 써먹었어요',
  '다음 개념으로 넘어가기 전에 정리해주셔서 좋았어요',
  '지난 시간 질문을 기억하고 다시 설명해주셨네요',
  '실수하기 쉬운 부분을 콕 집어주셔서 도움 됐어요',
  '예시를 바꿔가며 설명해주니까 확실히 이해됐어요',
  '개념부터 실습까지 흐름이 자연스러웠어요',
  '질문하기 편한 분위기라 좋았어요',
  '왜 이렇게 구현하는지까지 설명해주셔서 좋았습니다',
];
const MIXED = [
  '뇌에 일단 저장은 했는데 복습 때 압축 풀어야 할 듯',
  '아는 것 같다가 다음 페이지에서 다시 겸손해짐',
  '오늘 이해도: 알 것 같음 50%, 집에서 다시 보기 50%',
  '분명 들었는데 설명해 보라면 잠깐만요 상태',
  '앞부분은 괜찮았고 마지막 부분은 다시 봐야겠어요',
  '질문할 타이밍을 놓쳐서 다음 시간에 여쭤보려고요',
  '지난 시간 내용을 복습하고 오면 훨씬 나을 것 같아요',
  '흥미로운데 오늘은 집중이 좀 흐트러졌네요',
  '뇌: 네 알겠습니다 / 손: 근데 어떻게 구현하죠',
  '오늘 수업 요약: 이해한 나와 못한 내가 공존함',
  '뇌 저장공간 부족. 일단 외장 필기에 백업 완료',
  '집 가서 다시 보면 알 것 같은데 집 가면 눕겠지',
  '설명 들을 땐 끄덕끄덕, 문제 보니까 잠시 정적',
  '필기한 나 칭찬해. 이해는 내일의 내가 부탁해',
  '뇌에 입금은 됐는데 아직 출금이 안 됨',
  '전공이랑 썸 타는 중. 아직 서로 알아가는 단계',
  '오늘 진도는 제법 매콤했음. 우유 같은 복습 필요',
  '개념은 알겠는데 응용에서 조금 헤매요',
  '예시가 하나만 더 있었으면 딱 좋았을 것 같아요',
  '전체 흐름은 이해했는데 증명은 다시 봐야겠어요',
  '중간에 잠깐 놓쳤지만 마지막 정리가 도움 됐어요',
  '자료는 괜찮은데 제가 예습을 안 해왔네요',
  '다음 시간 실습하면서 이해가 더 될 것 같아요',
  '내용은 흥미로운데 오늘 분량은 좀 많았어요',
  '기본 문제는 풀었고 응용은 친구랑 더 얘기해봐야겠어요',
  '처음 보는 용어가 많아서 메모만 잔뜩 했어요',
  '오늘은 질문 목록만 늘었음. 이것도 성장인가요',
  '앞자리 버프는 받았는데 개념 이해는 복습 버프가 필요함',
  '이해할 듯 말 듯한 이 밀당. 오늘은 무승부',
  '어렴풋이 알겠어요. 이 어렴풋을 선명하게 만드는 게 과제네요',
];
const NEGATIVE = [
  '제 뇌는 아직 로딩 중인데 슬라이드가 먼저 가버림',
  '오늘의 나는 예제한테 졌다… 복습으로 재도전',
  '교수님 속도 1.25배, 제 뇌 0.75배. 일단 필기함',
  '예제를 조금 더 천천히 풀어주셨으면 좋겠어요',
  '오늘은 분량이 많아서 마지막 개념을 놓쳤어요',
  '설명 들을 때는 알겠는데 혼자 풀려니 막혀요',
  '실습 세팅에서 시간을 많이 써서 아쉬웠어요',
  '중간 단계 설명과 질문 시간이 조금 더 필요했어요',
  '이 수업은 제 뇌를 찢어. 근데 이제 필기를 곁들인',
  '제 이해도가 파란 불이라 복습으로 물타기합니다',
  '뇌가 파업 선언했는데 아직 슬라이드 32장 남음',
  '이해했다고 착각한 나, 제법 귀여워요',
  '강의는 정상 진행. 제 뇌만 서비스 점검 중',
  '출석은 했는데 이해도가 결석함',
  '오늘 개념한테 참교육 당했음. 내일 리벤지 간다',
  '한 번 더 설명해주시면 제 뇌도 합류할 수 있을 듯',
  '필기 속도가 수업 속도를 못 따라갔어요',
  '낯선 용어 설명이 조금 더 있었으면 좋겠어요',
  '오늘 실습은 오류 해결하느라 핵심을 놓쳤어요',
  '기초 부분부터 복습하고 와야겠다는 생각이 들었어요',
  '슬라이드 중간 과정이 생략돼서 혼자 보기는 어려워요',
  '마지막 문제 풀이 시간을 조금 더 주시면 좋겠어요',
  '예제 난이도가 갑자기 올라가서 당황했어요',
  '개념 간 연결을 못 잡아서 따로 질문드려야겠어요',
  '오늘은 설명을 놓친 부분이 많아 아쉬웠어요',
  '실습 환경을 미리 안내받았으면 좋았을 것 같아요',
  '저만 어려운가 했는데 옆자리도 같이 멈춰 있었음',
  '오늘의 이해도는 가출. 돌아올 때까지 복습한다',
  '복습 없이 이해하겠다는 꿈이 컸습니다',
  '뇌에 버퍼링 걸림. 다음 시간 전까지 캐시 채워갈게요',
];
// Each topic has its own positive / mixed / struggling line: high scores never get a negative topic joke.
const TOPIC_LINES = [
  [/자연어/, ['토큰화 예시 보고 이해도도 잘게 쪼개서 흡수함. 제제이야', '토큰은 잘 쪼개지는데 제 이해는 아직 한 덩어리임ㅋㅋ', '문장은 벡터가 됐는데 제 머릿속은 아직 빈 배열이에요']],
  [/심층|기계학습|인공지능/, ['오늘은 제 이해도도 학습률 잘 맞아서 수렴함', '역전파 이해했다고 생각한 순간 다시 순전파 당함', '손실함수는 줄어드는데 제 혼란은 증가 중. 예시 더 보고 싶어요']],
  [/보안|암호/, ['취약점 찾는 실습 도파민 미쳤음. 화이트해커 꿈 다시 켰다', '취약점 찾기 전에 제 지식 취약점부터 발견함', '암호는 안전한데 제 이해도가 취약해서 복습이 필요해요']],
  [/네트워크|통신/, ['오늘은 설명 패킷 손실 0%. 머릿속까지 잘 도착했어요', '패킷은 도착했는데 제 이해가 타임아웃남. 복습 갑니다', '프로토콜 순서가 헷갈려서 패킷 흐름을 한 번 더 보고 싶어요']],
  [/그래픽/, ['화면에 삼각형 떴을 뿐인데 내가 세상 만든 기분ㅋㅋ', '행렬 곱했더니 화면이랑 제 정신이 같이 회전함', '좌표계가 바뀌는 순간 저도 길을 잃었어요. 복습 필요']],
  [/비젼|비전|영상/, ['특징점 잡히는 거 보니까 제 흥미도 같이 검출됨', '모델은 인식했는데 제가 설명을 인식 못 함ㅋㅋ', '이미지 처리 단계가 많아서 중간 결과를 더 보고 싶었어요']],
  [/프로그래밍|언어/, ['드디어 컴파일 성공. 오늘은 이걸로 제제이야', '코드는 돌아가는데 왜 돌아가는지 설명하면 잠시만요', '오류 메시지랑 눈싸움하다가 실습 시간이 끝났어요']],
  [/수학|선형|미분/, ['식이 왜 이렇게 나오는지 드디어 보임. 수학이 좀 재밌네', '분명 숫자 배우러 왔는데 알파벳이 더 많음', '증명 한 줄 넘어갈 때마다 제 이해도가 한 칸씩 빠져요']],
  [/회로|전자/, ['회로가 예상대로 동작해서 오늘 기분 완전 정전압', '회로는 닫혔는데 제 이해는 아직 열린 회로', '부호 바뀌는 부분에서 막혔어요. 회로를 더 그려봐야겠어요']],
  [/운영체제|시스템/, ['프로세스 흐름을 그림으로 보니까 머릿속도 스케줄링 됨', '컨텍스트 스위칭 하다가 제 집중력도 전환됨', '동기화 예제에서 제 이해가 데드락 걸렸어요']],
  [/자료구조|알고리즘/, ['복잡도가 줄어드는 순간 제 행복은 증가함', '시간 복잡도는 알겠는데 제 풀이 시간은 무한대', '풀이 전환이 빨라서 작은 입력부터 같이 해보고 싶어요']],
  [/데이터베이스|데이터관리/, ['JOIN 예시가 찰떡이라 흩어진 개념도 조인 완료', '정규화 배우는데 제 생활부터 정규화 필요', '쿼리가 길어지니까 어느 테이블인지 헷갈려요']],
  [/임베디드|마이크로|IoT|로봇/, ['불 하나 켜졌을 뿐인데 너무 뿌듯함. 임베디드 낭만 있다', '센서는 예민한데 제 반응 속도는 둔감함', '배선부터 헤매서 코드 설명을 좀 놓쳤어요']],
  [/현장|실습/, ['오늘 실습에서 배운 팁 바로 써먹음. 경험치 제대로 쌓았다', '실습은 했고 정리는 미래의 나에게 맡긴 상태', '실습 환경 적응에 시간이 걸려서 진도를 따라가기 힘들었어요']],
  [/설계|프로젝트|캡스톤/, ['피드백 받고 막힌 설계가 풀렸어요. 팀원들 단톡방 난리남', '아이디어는 많은데 일정표는 왜 이렇게 짧죠', '요구사항을 좀 더 구체적으로 확인하고 진행하고 싶어요']],
];
const pick = (values, random) => values[Math.floor(random() * values.length)];

export function generateStudentReviews(course, date, endMinute, nowMinute, random = Math.random) {
  const count = 12 + Math.floor(random() * 25);
  const sharedMood = random();
  const usedLines = new Set();
  return Array.from({ length: count }, (_, i) => {
    const mood = random() * .75 + sharedMood * .25;
    const base = mood < .18 ? 2 : mood < .46 ? 3 : mood < .84 ? 4 : 5;
    const ratings = Array.from({ length: 6 }, () => Math.min(5, Math.max(1, base + (random() < .20 ? -1 : random() > .88 ? 1 : 0))));
    const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    const tone = average >= 3.65 ? 'positive' : average >= 2.65 ? 'mixed' : 'negative';
    const pool = tone === 'positive' ? POSITIVE : tone === 'mixed' ? MIXED : NEGATIVE;
    const contextual = TOPIC_LINES.find(([pattern]) => pattern.test(course.name));
    const topicLine = contextual?.[1][tone === 'positive' ? 0 : tone === 'mixed' ? 1 : 2];
    const candidates = pool.filter(line => !usedLines.has(line));
    const line = topicLine && !usedLines.has(topicLine) && random() < .22 ? topicLine : pick(candidates.length ? candidates : pool.map(text => `${text} ${pick(['복습 갑니다', '오늘의 기록 끝', '다음 시간에 다시 도전'], random)}`), random);
    usedLines.add(line);
    return {
      id: `${date}:${course.id}:student:${i}`, courseId: course.id, professorId: course.professorId,
      date, minute: endMinute + Math.floor(random() * (Math.max(0, nowMinute - endMinute) + 1)),
      nickname: `${pick(NICK_FIRST, random)}${pick(NICK_LAST, random)}${Math.floor(random() * 900 + 100)}`,
      gpa: Math.round((2 + random() * 2.5) * 100) / 100,
      ratings, tone, comment: line, source: 'simulation',
    };
  });
}

export const EVENT_TEMPLATES = [
  { key: 'research-grant', type: 'research', label: '연구 과제', title: '새 연구 프로젝트 선정', impact: .018, summary: '새 프로젝트와 함께 학부 연구 참여 자리도 열린다. 연구실 단톡방에 축하 이모지가 쏟아지는 중.' },
  { key: 'paper', type: 'research', label: '논문 발표', title: '학술대회 연구 성과 발표', impact: .013, summary: '밤샘 실험이 드디어 발표 자료가 됐다. 연구실 학생들 “이번엔 포스터 앞에서 당당하게 설명 가능”.' },
  { key: 'student-award', type: 'research', label: '학생 수상', title: '지도 학생팀, 경진대회 수상', impact: .011, summary: '시연 직전까지 고치던 프로젝트가 수상작으로. 팀원들 사이에서는 “버그도 서사였다”는 반응.' },
  { key: 'industry', type: 'research', label: '산학 협력', title: '기업 공동 프로젝트 시작', impact: .01, summary: '교실에서 배운 개념을 실제 문제에 써볼 기회가 생겼다. 참여 팀 모집 안내가 곧 올라올 예정이다.' },
  { key: 'example', type: 'research', label: '수업 소식', title: '실습 예제 저장소 전격 공개', impact: .005, summary: '주석까지 달린 예제 코드가 공개됐다. 복습하던 수강생들은 “이게 바로 깃허브 복지”라며 환영.' },
  { key: 'lab-server', type: 'research', label: '운영 이슈', title: '실습 서버 응답 지연, 점검 착수', impact: -.011, summary: '동시 접속이 몰려 실습 서버가 잠시 숨을 고르는 중. 로컬 실행 가이드가 우선 안내됐다.' },
  { key: 'lab-fix', type: 'research', label: '복구 소식', title: '실습 환경 최적화 완료', impact: .007, summary: '자원 설정을 조정해 실습 실행 시간이 단축됐다. “기다리는 동안 커피 타러 갈 틈이 없어짐”이라는 후기.' },
  { key: 'tutor', type: 'department', label: '학습 지원', title: '전공 튜터링 시간 확대', impact: .006, summary: '수업 뒤에도 막힌 문제를 물어볼 시간이 늘었다. 혼자 에러 창을 바라보던 학생들에게 작은 호재.' },
  { key: 'gpu', type: 'department', label: '실습 장비', title: '공동 실습 GPU 추가 도입', impact: .009, summary: '실습 서버에 새 연산 장비가 추가된다. 학습 대기열을 바라보던 학생들 사이에서 기대감 상승.' },
  { key: 'hackathon', type: 'department', label: '학과 행사', title: '학과 해커톤 개최 예고', impact: .005, summary: '아이디어와 노트북만 챙겨도 참여 가능. 벌써 팀원 모집 글과 야식 메뉴 투표가 함께 올라오는 중.' },
  { key: 'mentoring', type: 'department', label: '진로 지원', title: '졸업생 개발자 멘토링 신설', impact: .004, summary: '선배들이 이력서와 포트폴리오를 함께 봐준다. “README 어디서부터 고치죠” 질문이 사전 접수 1위.' },
  { key: 'maintenance', type: 'department', label: '시설 점검', title: '공용 실습실 임시 점검', impact: -.006, summary: '장비 점검 시간에는 대체 실습실을 이용해야 한다. 프로젝트 팀들이 자리 이동 일정을 조율 중.' },
  { key: 'delay', type: 'department', label: '일정 변경', title: '공동 프로젝트 일정 조정', impact: -.004, summary: '외부 협력 일정이 바뀌며 중간 점검이 미뤄졌다. 팀별 계획표도 함께 업데이트가 필요하다.' },
  { key: 'open-seminar', type: 'department', label: '세미나', title: '오픈 세미나, 전공생 누구나 참여', impact: .003, summary: '연구실 문턱을 낮춘 공개 세미나가 열린다. 전공 지식은 선택, 호기심은 필수라는 안내가 붙었다.' },
  { key: 'notice', type: 'department', label: '일반 공지', title: '이번 주 학과 일정 한눈에 보기', impact: 0, summary: '세미나와 행사 일정을 한 페이지에 모았다. 즐겨찾기에 넣어두면 단톡방에서 공지 찾는 시간을 아낄 수 있다.' },
  { key: 'paper-code', type: 'research', label: '연구 공개', title: '논문 재현 코드와 데이터 공개', impact: .012, summary: '설명만 읽던 연구를 직접 돌려볼 수 있게 됐다. 첫 실행 가이드도 함께 올라와 접근성이 좋아졌다.' },
  { key: 'poster-award', type: 'research', label: '학술 수상', title: '학부 연구 포스터 우수상', impact: .01, summary: '핵심을 한 장에 담아낸 발표가 좋은 평가를 받았다. 학생들은 “슬라이드보다 포스터가 더 어려웠다”고 회고.' },
  { key: 'demo-day', type: 'research', label: '연구실 행사', title: '연구실 데모데이 예약 조기 마감', impact: .008, summary: '직접 체험하는 연구 시연에 관심이 몰렸다. 추가 회차를 검토하며 대기 신청을 받고 있다.' },
  { key: 'office-hour', type: 'research', label: '질문 시간', title: '수업 뒤 30분, 오픈 질문 시간 신설', impact: .005, summary: '수업 중 놓친 질문을 편하게 이어갈 수 있다. “질문이 질문을 부르는 시간”이라는 별명이 벌써 생겼다.' },
  { key: 'walkthrough', type: 'research', label: '복습 자료', title: '어려웠던 예제, 풀이 영상 추가', impact: .006, summary: '막히기 쉬운 단계를 천천히 따라가는 영상이 올라왔다. 일시정지 버튼을 누를 수 있다는 점이 특히 환영받는 중.' },
  { key: 'starter-kit', type: 'research', label: '실습 지원', title: '환경 설정 5분 컷 스타터 배포', impact: .006, summary: '패키지 버전과 실행 방법을 맞춘 시작 프로젝트가 공개됐다. 오늘은 설치 오류보다 실습에 시간을 쓸 수 있을 전망.' },
  { key: 'rubric', type: 'research', label: '평가 안내', title: '프로젝트 평가 기준 상세 공개', impact: .004, summary: '기능·설명·협업 기록 등 평가 요소가 정리됐다. 수강생들은 “어디에 힘을 줘야 할지 보인다”는 반응.' },
  { key: 'open-dataset', type: 'research', label: '데이터', title: '실습용 공개 데이터셋 업데이트', impact: .005, summary: '작은 예제부터 도전 과제까지 데이터가 추가됐다. 수업 밖에서 개인 프로젝트로 확장하기에도 좋아졌다.' },
  { key: 'code-review', type: 'research', label: '수업 소식', title: '학생 코드 함께 읽는 리뷰 세션', impact: .004, summary: '돌아가는 코드에서 읽기 좋은 코드로 한 단계 더. 변수 이름을 둘러싼 토론이 예상보다 뜨거웠다.' },
  { key: 'field-trip', type: 'research', label: '현장 경험', title: '프로젝트 연계 현장 견학 모집', impact: .007, summary: '강의실에서 보던 시스템을 현장에서 만날 기회. 질문 목록부터 작성하는 학생들이 늘고 있다.' },
  { key: 'cloud-credit', type: 'research', label: '실습 지원', title: '수업 프로젝트 클라우드 크레딧 지원', impact: .008, summary: '팀 프로젝트 배포를 위한 체험 자원이 제공된다. “localhost를 벗어날 때가 왔다”는 반응이 나왔다.' },
  { key: 'benchmark', type: 'research', label: '연구 성과', title: '연구 프로토타입 성능 개선', impact: .014, summary: '반복 실험 끝에 처리 속도가 개선됐다. 성능 그래프를 다시 그리는 연구실의 키보드가 분주하다.' },
  { key: 'study-note', type: 'research', label: '학습 자료', title: '헷갈리는 개념 비교 노트 공개', impact: .004, summary: '비슷한 용어를 표로 정리한 자료가 추가됐다. 수강생들은 “이 표 한 장 때문에 퍼즐이 맞았다”고 반겼다.' },
  { key: 'assignment-bunch', type: 'research', label: '과제 일정', title: '프로젝트 중간 제출 일정 겹침', impact: -.005, summary: '여러 제출 일정이 같은 주에 모였다. 수강생들 사이에서는 일정을 미리 나눠 진행하자는 목소리가 나온다.' },
  { key: 'package-conflict', type: 'research', label: '실습 이슈', title: '실습 패키지 버전 충돌 안내', impact: -.006, summary: '일부 환경에서 예제 실행 오류가 확인됐다. 권장 버전과 우회 방법을 담은 안내가 공유되는 중.' },
  { key: 'device-shipping', type: 'research', label: '장비 일정', title: '프로젝트 센서 배송 일정 지연', impact: -.007, summary: '일부 부품 도착이 늦어져 초기 실습은 시뮬레이터로 진행한다. 팀들은 먼저 테스트 코드를 준비 중.' },
  { key: 'long-build', type: 'research', label: '실습 이슈', title: '실습 빌드 대기시간 증가', impact: -.004, summary: '동시 빌드 요청이 늘어 결과 확인에 시간이 걸린다. 캐시 설정 안내와 작업 분산 방안이 공유됐다.' },
  { key: 'dataset-clean', type: 'research', label: '자료 수정', title: '실습 데이터 일부 정제 작업', impact: -.003, summary: '중복 항목이 발견돼 데이터를 다시 정리하고 있다. 최신 버전 배포 전까지는 기존 예제 범위를 사용할 예정이다.' },
  { key: 'extra-quiz', type: 'research', label: '수업 공지', title: '다음 수업, 짧은 개념 확인 퀴즈', impact: -.002, summary: '핵심 개념을 점검하는 짧은 퀴즈가 예고됐다. “복습할 명분이 생겼다”는 긍정적 체념이 이어지는 중.' },
  { key: 'project-theme', type: 'research', label: '프로젝트', title: '기말 프로젝트 주제 선택 시작', impact: 0, summary: '팀별 관심 분야에 맞춰 주제를 정할 차례다. 아이디어는 거창하게, 첫 구현은 작게 시작하라는 조언이 함께 올라왔다.' },
  { key: 'reading-list', type: 'research', label: '읽을거리', title: '방학에 읽기 좋은 자료 목록 공유', impact: 0, summary: '입문 글부터 논문까지 난이도별로 정리됐다. 일단 북마크는 완료, 읽기는 미래의 나와 협의 중.' },
  { key: 'survey', type: 'research', label: '수업 설문', title: '다음 실습 주제, 수강생 투표 진행', impact: 0, summary: '직접 해보고 싶은 실습을 고르는 투표가 열렸다. 주제마다 이유를 붙인 댓글 경쟁도 시작됐다.' },
  { key: 'mini-lecture', type: 'research', label: '특별 강의', title: '10분 미니 특강: 실패한 실험의 기록', impact: .003, summary: '잘된 결과뿐 아니라 막혔던 과정도 함께 공유한다. “실패 로그에도 배울 게 많다”는 반응이 모였다.' },
  { key: 'room-reserve', type: 'department', label: '공간 지원', title: '팀 프로젝트실 예약 시간 확대', impact: .005, summary: '팀 회의를 잡기 쉬워졌다. 콘센트와 화이트보드가 있는 자리를 찾아 떠돌던 학생들에게 반가운 소식.' },
  { key: 'night-lab', type: 'department', label: '시설 지원', title: '프로젝트 주간 실습실 연장 운영', impact: .006, summary: '프로젝트 마감 주간에 실습 공간 이용 시간이 늘어난다. 팀별 이용 안내와 귀가 교통 시간도 함께 공지됐다.' },
  { key: 'wifi-upgrade', type: 'department', label: '시설 개선', title: '실습실 무선 네트워크 개선', impact: .006, summary: '동시 접속 환경이 보강됐다. 패키지 다운로드 진행률을 멍하니 보는 시간이 줄어들 것으로 기대된다.' },
  { key: 'laptop-loan', type: 'department', label: '장비 대여', title: '단기 노트북 대여 신청 시작', impact: .004, summary: '수리와 장비 문제로 수업 참여가 어려운 학생을 위한 대여 창구가 열린다. 신청 절차도 간소화됐다.' },
  { key: 'portfolio-clinic', type: 'department', label: '진로 지원', title: '개발자 포트폴리오 클리닉 운영', impact: .005, summary: '만든 프로젝트를 어떻게 설명할지 함께 고민하는 시간. 프로젝트 이름만 멋있게 짓던 단계에서 한 발 더 나아간다.' },
  { key: 'opensource', type: 'department', label: '개발 문화', title: '오픈소스 첫 기여 챌린지', impact: .004, summary: '문서 수정부터 작은 버그 해결까지 첫 PR을 돕는다. “초록 칸보다 의미 있는 한 줄”이 이번 챌린지의 구호.' },
  { key: 'lightning-talk', type: 'department', label: '학과 행사', title: '5분 발표회: 요즘 만든 것 자랑하기', impact: .003, summary: '완성도보다 흥미로운 시도를 환영하는 발표회. 실패한 사이드 프로젝트도 발표 가능하다는 안내에 신청이 늘었다.' },
  { key: 'coding-cafe', type: 'department', label: '학습 문화', title: '조용히 같이 코딩하는 모임 개설', impact: .003, summary: '각자 할 일을 하다가 막힐 때 질문하는 느슨한 모임. “카메라 없는 스터디윗미”라는 별명이 붙었다.' },
  { key: 'alumni-visit', type: 'department', label: '취업 이야기', title: '선배의 첫 출근 이야기 특강', impact: .004, summary: '취업 준비부터 첫 코드 리뷰까지 현실적인 이야기를 나눈다. 사전 질문함에는 궁금했던 질문이 쌓이는 중.' },
  { key: 'locker', type: 'department', label: '캠퍼스 생활', title: '프로젝트 장비 보관함 추가', impact: .002, summary: '센서와 부품 상자를 매번 들고 다닐 필요가 줄었다. 가방 무게는 가벼워지고 팀원들의 발걸음도 가벼워졌다.' },
  { key: 'room-move', type: 'department', label: '강의실 변경', title: '일부 실습 수업 강의실 임시 변경', impact: -.003, summary: '시설 작업으로 일부 수업 장소가 바뀐다. 익숙한 문을 열기 전에 시간표의 강의실을 확인해두면 좋겠다.' },
  { key: 'network-check', type: 'department', label: '네트워크 점검', title: '공용망 점검 시간 안내', impact: -.004, summary: '정해진 시간 동안 연결이 잠시 끊길 수 있다. 실습 파일은 미리 내려받고 진행 내용을 저장해둘 필요가 있다.' },
  { key: 'seat-shortage', type: 'department', label: '공간 수요', title: '프로젝트실 예약 수요 집중', impact: -.003, summary: '발표 준비가 몰리며 인기 시간대 예약이 빠르게 차고 있다. 빈 강의실 이용 안내가 추가될 예정이다.' },
  { key: 'career-shift', type: 'department', label: '행사 일정', title: '진로 특강 일정 변경 안내', impact: -.002, summary: '초청 연사 일정으로 특강 날짜가 바뀌었다. 기존 신청자는 변경된 참여 가능 여부를 확인하면 된다.' },
  { key: 'equipment-check', type: 'department', label: '장비 점검', title: '공동 대여 장비 정기 점검', impact: -.003, summary: '일부 대여 장비를 순차 점검한다. 팀별 실습에 필요한 장비는 예약 가능 목록을 먼저 확인해야 한다.' },
  { key: 'festival-booth', type: 'department', label: '캠퍼스 행사', title: '학과 체험 부스 아이디어 모집', impact: 0, summary: '전공을 모르는 친구도 즐길 수 있는 체험을 모집한다. 게임과 퀴즈 아이디어가 현재 인기 후보.' },
  { key: 'club-recruit', type: 'department', label: '동아리 소식', title: '전공 동아리 프로젝트원 모집', impact: 0, summary: '초보도 참여할 수 있는 작은 프로젝트가 열린다. “혼자라면 미루던 것, 같이 하면 일단 시작”이라는 모집 문구.' },
  { key: 'schedule-vote', type: 'department', label: '학과 소통', title: '다음 학과 행사 시간대 설문', impact: 0, summary: '공강 시간을 고려한 행사 편성을 위해 의견을 모은다. 시간표가 복잡한 학생들도 참여할 수 있는 시간을 찾는 중.' },
];
