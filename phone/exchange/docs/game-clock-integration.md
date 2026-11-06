# 인천대 시뮬레이터 시간 연결

현재 `phone/exchange/`는 독립 실행과 Bae의 휴대폰 iframe 실행을 함께 지원한다. 이 문서는 개발용이며 서비스 화면에는 표시하지 않는다. Bae 연결 코드는 새 캐릭터의 고유 ID와 누적 게임 날짜를 저장하고, 거래소는 그 ID에 해당하는 기록을 이어서 사용한다.

## 확인한 Bae 구조

- `phone/phone.js`: `phone/exchange/index.html`을 같은 출처의 iframe으로 한 번 만들고 유지한다.
- `game.js`: `window.Game.hour()`, `isActive()`, `inputBlocked()`와 연결용 `exchangeClock()`을 공개한다. `newState()`에서 새 캐릭터 ID를 만들며 `startGame()`은 기존 ID를 보존한다.
- `data.js`: `WEEKS = 16`, `WEEK_SECONDS = 40`, `DAY_START = 6`. 게임의 한 주가 화면상 06:00부터 다음날 06:00까지 한 일주기로 흐른다.
- 휴대폰을 여는 동작은 `pushModal()`에 들어가므로 **기존 Bae는 휴대폰이 열려 있는 동안 게임 시간이 멈춘다**. 거래소 역시 그 시간을 유지한다. 휴대폰을 닫으면 부모 게임의 시간이 다시 흐르고, iframe은 유지되므로 다음 접속에 그 진행이 반영된다.

## Bae에 거래소 파일 반영

`phone/exchange/`의 파일 전체를 Bae의 `phone/exchange/`에 함께 옮긴다. 새 모듈과 CSS를 포함해야 한다. iframe이 기존 `parent.Game.hour()`를 감지해 시간과 평가 종료 조건을 따르고, 거래소 자체 시계의 자동 진행을 중단한다.

`exchangeClock()`이 없는 구형 게임도 시간 호환 모드는 지원한다. 이 경우 `2026-11-06`을 첫 날짜로 삼고 관찰한 자정 통과만 날짜에 더한다. 마지막 날짜/분 커서를 저장해 reload에 사용할 수 있으나, iframe이 존재하지 않는 동안 지나간 날짜와 새 캐릭터는 `hour()`만으로 구분할 수 없다. **새 캐릭터에만 시장을 초기화하는 기능은 `exchangeClock()` 연결이 필요하다.**

## 정확한 날짜와 세이브 연동

`docs/bae-game-clock.patch`는 Bae의 4f29a15 상태에서 이번 초기화 규칙의 변경 내용을 확인하기 위한 패치다. 이미 반영한 브랜치에는 다시 적용하지 않는다. `exchangeSessionId`와 `exchangeDay`를 게임 세이브에 저장하고, `window.Game.exchangeClock()`을 공개한다.

```sh
git apply --check path/to/bae-game-clock.patch
git apply path/to/bae-game-clock.patch
```

반환값:

```js
{
  sessionId: '세이브마다 유지되는 UUID',
  date: '2026-11-06',
  minute: 885,       // 00:00부터 지난 정수 분, 0~1439
  active: true,
  paused: false,
  startedAt: { date: '2026-11-06', minute: 360 } // 캐릭터 생성 시 저장한 고정 시각
}
```

일주기 시작은 06:00이며 `exchangeDay`는 `weekStep()`에서 한 번 증가한다. 따라서 일반 시간 진행과 수면의 시간 건너뛰기 모두 같은 날짜 기준을 따른다. 학기 또는 학위 과정 전환으로 `week`가 다시 1이 되더라도 날짜가 되돌아가지 않는다. 구형 게임 저장을 처음 읽을 때는 완료한 학기/현재 주차로 시작 날짜를 추정한 뒤 이후부터 누적 일수를 정확히 저장한다. 2026-11-06은 게임 기준일이며, 초기 시장 이력은 호스트가 전달한 `startedAt.date` 직전 7일에 맞춰 생성된다. `startedAt`은 캐릭터 생성 시 저장하고 첫 거래소 방문 시각으로 바꾸지 않는다.

`newState()`만 새 UUID를 발급한다. 이어하기에서는 저장된 UUID를 그대로 사용하고, UUID가 없는 구형 저장만 `startGame()`에서 한 번 보완한 뒤 즉시 저장한다. 휴대폰 열기·닫기와 페이지 종료 시 현재 게임 기록을 저장하지만 UUID를 바꾸지 않는다. 따라서 같은 이름으로 새 캐릭터를 만들어도 새 시장이 생기며, 같은 캐릭터로 거래소를 반복해서 열거나 새로고침해 이어가면 기존 시장이 유지된다.

게임에서 휴대폰을 연 채 시간도 흐르게 바꾸고 싶다면 부모의 `pushModal()` 방식부터 변경해야 한다. 거래소만 독자 진행시켜 부모 시계와 어긋나게 하지 않는다.

## 거래소 모듈 계약

`game-clock.js`:

- `createGameClockReader(window, {baseDate, legacyCursor})`: 즉시 부모의 같은 출처 `Game` API만 읽는다. `Game.exchangeClock()`이 있으면 우선한다. 외부 출처의 `postMessage`는 수신하지 않는다.
- `reader.read()`: 정상 스냅샷, `{active:false, source}`, 또는 연결 불가/잘못된 값일 때 `null`.
- `reader.connected()`: 인식한 게임 호스트 여부. 연결이 잠시 사라져도 독립 시계로 멋대로 전환하지 않도록 한 번 확인한 연결을 유지한다.
- `normalizeGameClock(snapshot)`: 현재 날짜·분과 ID를 검사하고, 선택 항목 `startedAt`도 올바른 날짜·분인지 검사한다. 시작 시각이 현재보다 미래이면 전체 스냅샷을 거부한다. `startedAt`이 없는 구형 호스트는 기존 현재 시각 기준 동작을 유지한다.
- `gameStorageKey(snapshot)`: `inu-exchange-game-v1:<sessionId>` 형식으로 독립 실행 데이터 및 다른 세이브와 분리한다.
- `applyGameClock(state, catalog, snapshot, {process:processCampus})`: 진행한 시간만 처리하고 `{changed, resetRequired, reason, steps}`를 반환한다. 마지막 스냅샷은 `state.gameClock`, 모드는 `state.clockMode = 'game'`으로 둔다.
- `currentClock(state)`: 게임 모드에서는 한국 실제 시각이나 독립 데모 날짜 대신 `state.gameClock`을 사용한다. 강의 평가 가능 시간과 날짜 필터도 같은 시간을 따른다.

`market.js`의 `createGameState(catalog, snapshot)`은 해당 캐릭터의 저장된 시장이 없을 때만 사용한다. 캐릭터 ID로 고정된 난수 시드를 만들고 캐릭터 생성 직전 7일 중 평일 5일, 하루 8회의 시세를 계산한다. 초기 이력은 교수님별로 다르게 움직이면서 85~115 유니코인 범위를 유지한다. 강의 종료 후 평가, 각 캔들의 고가·저가와 변화 원인도 함께 기록한다. 완성된 상태의 `gameClock`, `lastMarketPulse`, 이벤트 기준 시각을 `startedAt`으로 설정하기 때문에 첫 화면을 열었다는 이유로 가격이 추가 변동하지 않는다.

첫 방문이 하루 이상 늦어져도 시작 시장을 방문 날짜로 다시 옮기지 않는다. 호출자는 `createGameState()` 뒤 현재 스냅샷으로 `applyGameClock()`을 호출해 캐릭터 생성부터 흘러간 시간을 반영한다. 생성 시각과 현재 시각이 같으면 중복 분으로 처리하여 가격이 그대로이고, 늦게 방문하면 그동안 끝난 강의와 시세를 순서대로 반영한다. 7일 초과 간격에는 아래의 목적 시각 한 번 처리 정책을 따른다.

호출자는 신규 상태를 `ensureDemoContent()`에 넘겨 댓글·뉴스 표시용 이력을 채운다. 이 함수는 가격을 바꾸지 않는다. 같은 시간에 `processCampus()`를 별도로 호출해 초기화를 다시 진행하지 않는다. 독립 실행은 기존 `createState()`와 기존 저장 공간을 유지한다.

같은 분이 반복되면 평가, 뉴스, 가격을 추가 생성하지 않는다. 정지 직전에 게임 시간이 변경되었으면 최종 시간을 한 번 반영한 뒤 고정한다. 시간 간격은 10분 샘플, 각 강의의 당일 최종 종료 시점, 23:59를 시간순으로 처리한다. 따라서 배경 진행 중 수업 종료와 날짜 변경을 놓치지 않는다.

다른 캐릭터 ID에만 상태를 바꾸기 전에 `resetRequired:true`, `reason:'different-session'`을 반환한다. 호출자는 그 ID의 저장 기록이 있으면 복원하고, 없으면 `createGameState()`를 사용한다.

같은 캐릭터의 과거 시각은 `reason:'rewind-ignored'`, `ignored:true`, `resetRequired:false`로 무시한다. 시장의 날짜·가격·평가를 되돌리거나 새로 만들지 않으며, 게임 시간이 저장된 시장 시각에 도달한 뒤 다시 진행한다. 7일보다 큰 전진은 `reason:'advanced-gap'`으로 기존 기록을 유지한 채 목적 시각만 한 번 처리한다. 긴 부재 동안 모든 분을 재생하거나 시장을 초기화하지 않는다.

## 검증

`phone/exchange/tests/game-clock.test.mjs`는 입력 날짜/분 검증, 같은 출처 경계, 자정 및 커서 복구, 정지/중복 스냅샷, 마지막 강의 종료 및 자정 catch-up, 같은 캐릭터의 역행 무시, 다른 ID 분리, 긴 이동의 기록 보존, 실제 `processCampus()`와 평가 제출 종료 조건을 확인한다.

`phone/exchange/tests/game-market.test.mjs`는 일주일 초기 이력과 가격 범위, OHLC와 원인별 등락 정합성, ID별 재현성·분리, 첫 열기·정지·닫기·저장 복원 시 가격 불변, 실제 시간 전진 시 갱신, 기존 독립 실행 보존을 확인한다. 하루 늦은 첫 방문에서도 생성 시각의 초기 이력이 동일하고 이전 수업이 처리되는지, 장기간 후 첫 방문에도 시작 이력을 유지하는지도 확인한다.
