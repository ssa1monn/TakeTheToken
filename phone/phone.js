// ───────────────────────────────────────────────
// 휴대폰 — 화면 왼쪽의 작은 폰을 누르면 가로로 돌아가며 커지고, 인천대 거래소 앱이 열린다
// 앱: phone/exchange/ (원작: GO 브랜치 dist/, 고우석) — 원본 그대로 iframe으로 띄운다
// (game.js 전에 로드. pushModal 등 game.js 함수는 실행 시점에만 부른다)
// ───────────────────────────────────────────────
const PHONE_APP_URL = 'phone/exchange/index.html';
const PHONE_APP_MIN_W = 1000;   // 거래소는 데스크톱 전용(body min-width 1000px) → 좁으면 축소해서 보여준다

let phoneOpen = false, phoneEl = null, phoneFrame = null;

function clockNow() {
  const h = window.Game?.hour?.() ?? 9;
  const m = Math.floor(h * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── 작은 폰 (메인 화면)
function mountPhoneWidget() {
  const w = document.createElement('button');
  w.id = 'phone-mini';
  w.title = '휴대폰 (인천대 거래소)';
  w.innerHTML = `<span class="pm-notch"></span><span class="pm-time">09:00</span>
    <span class="pm-app"><span class="pm-icon"><i></i><i></i><i></i></span><small>거래소</small></span>`;
  w.onclick = openPhone;
  document.getElementById('game').appendChild(w);
  setInterval(() => { w.querySelector('.pm-time').textContent = clockNow(); }, 500);
}

// ── 큰 폰 (가로) + 거래소 앱. 한 번 만든 iframe은 유지해서 앱 상태가 그대로 남는다
function buildPhone() {
  phoneEl = document.createElement('div');
  phoneEl.id = 'phone-room';
  phoneEl.innerHTML = `
    <div class="pr-phone">
      <div class="pr-screen">
        <div class="pr-status"><b class="pr-time">09:00</b><span>인천대 거래소</span><span class="pr-bat">5G ▮▮▮ 87%</span></div>
        <div class="pr-app"><iframe src="${PHONE_APP_URL}" title="인천대 거래소"></iframe></div>
      </div>
      <button class="pr-home" title="닫기 (Esc)" aria-label="휴대폰 닫기"></button>
    </div>`;
  document.body.appendChild(phoneEl);
  phoneFrame = phoneEl.querySelector('iframe');
  phoneEl.querySelector('.pr-home').onclick = closePhone;
  phoneEl.addEventListener('click', e => { if (e.target === phoneEl) closePhone(); });   // 바깥 클릭
  addEventListener('resize', fitPhoneApp);
}

// 앱 영역이 1000px보다 좁으면 iframe을 1000px로 두고 축소
function fitPhoneApp() {
  if (!phoneEl) return;
  const box = phoneEl.querySelector('.pr-app'), W = box.clientWidth, H = box.clientHeight;
  const k = Math.min(1, W / PHONE_APP_MIN_W);
  Object.assign(phoneFrame.style, { width: `${W / k}px`, height: `${H / k}px`, transform: `scale(${k})` });
}

function openPhone() {
  if (phoneOpen || !window.Game?.isActive() || window.Game.inputBlocked()) return;
  pushModal(() => {                                  // 게임 모달 큐 안에서 열기 → 시간이 멈춘다
    document.getElementById('modal').classList.add('hidden');
    save();
    if (!phoneEl) buildPhone();
    phoneOpen = true;
    phoneEl.querySelector('.pr-time').textContent = clockNow();
    phoneEl.classList.add('show');
    document.getElementById('phone-mini').classList.add('away');
    requestAnimationFrame(fitPhoneApp);
    setTimeout(fitPhoneApp, 450);                    // 회전 애니메이션이 끝난 뒤 한 번 더
  });
}

function closePhone() {
  if (!phoneOpen) return;
  phoneOpen = false;
  phoneEl.classList.remove('show');
  document.getElementById('phone-mini').classList.remove('away');
  save();
  nextModal();
}

addEventListener('keydown', e => { if (phoneOpen && e.code === 'Escape') closePhone(); });
document.addEventListener('DOMContentLoaded', mountPhoneWidget);
