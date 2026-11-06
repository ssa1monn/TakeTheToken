# 인천대 시뮬레이터 시간 연결

현재 `dist/`는 독립 실행과 Bae의 휴대폰 iframe 실행을 함께 지원한다. 이 문서는 개발용이며 서비스 화면에는 표시하지 않는다. Bae 브랜치 자체는 수정하거나 푸시하지 않았다.

## 확인한 Bae 구조

- `phone/phone.js`: `phone/exchange/index.html`을 같은 출처의 iframe으로 한 번 만들고 유지한다.
- `game.js`: `window.Game.hour()`, `isActive()`, `inputBlocked()`를 공개한다. 날짜나 세이브 식별자는 기존 API에 없다.
- `data.js`: `WEEKS = 16`, `WEEK_SECONDS = 40`, `DAY_START = 6`. 게임의 한 주가 화면상 06:00부터 다음날 06:00까지 한 일주기로 흐른다.
- 휴대폰을 여는 동작은 `pushModal()`에 들어가므로 **기존 Bae는 휴대폰이 열려 있는 동안 게임 시간이 멈춘다**. 거래소 역시 그 시간을 유지한다. 휴대폰을 닫으면 부모 게임의 시간이 다시 흐르고, iframe은 유지되므로 다음 접속에 그 진행이 반영된다.

## 현재 Bae에 바로 넣을 경우

`dist/`의 파일 전체를 Bae의 `phone/exchange/`에 함께 옮긴다. 새 모듈과 CSS를 포함해야 한다. iframe이 기존 `parent.Game.hour()`를 감지해 시간과 평가 종료 조건을 따르고, 거래소 자체 시계의 자동 진행을 중단한다.

기존 API만으로는 날짜, 새 게임, 과거 저장 복원 여부를 정확히 알 수 없다. 호환 모드는 `2026-11-06`을 첫 날짜로 삼고 관찰한 자정 통과만 날짜에 더한다. 마지막 날짜/분 커서를 저장해 reload에 사용할 수 있으나, iframe이 존재하지 않는 동안 지나간 날짜와 같은 이름의 새 게임은 기존 API만으로 복원할 수 없다. 정확한 연결에는 다음 패치를 적용한다.

## 정확한 날짜와 세이브 연동

`docs/bae-game-clock.patch`는 이번에 확인한 Bae의 `game.js`를 기준으로 만든 적용 전 패치다. 새로운 `exchangeSessionId`와 `exchangeDay`를 게임 세이브에 저장하고, `window.Game.exchangeClock()`을 공개한다.

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
  paused: false
}
```

일주기 시작은 06:00이며 `exchangeDay`는 주가 넘어갈 때 한 번 증가한다. 학기 또는 학위 과정 전환으로 `week`가 다시 1이 되더라도 날짜가 되돌아가지 않는다. 구형 게임 저장을 처음 읽을 때는 완료한 학기/현재 주차로 시작 날짜를 추정한 뒤 이후부터 누적 일수를 정확히 저장한다. 2026-11-06 기준 날짜는 현재 거래소 데이터와 맞추기 위한 기본값이며, 게임의 기준 날짜가 확정되면 패치의 기준일과 거래소 초기 이력을 함께 바꾼다.

게임에서 휴대폰을 연 채 시간도 흐르게 바꾸고 싶다면 부모의 `pushModal()` 방식부터 변경해야 한다. 거래소만 독자 진행시켜 부모 시계와 어긋나게 하지 않는다.

## 거래소 모듈 계약

`game-clock.js`:

- `createGameClockReader(window, {baseDate, legacyCursor})`: 즉시 부모의 같은 출처 `Game` API만 읽는다. `Game.exchangeClock()`이 있으면 우선한다. 외부 출처의 `postMessage`는 수신하지 않는다.
- `reader.read()`: 정상 스냅샷, `{active:false, source}`, 또는 연결 불가/잘못된 값일 때 `null`.
- `reader.connected()`: 인식한 게임 호스트 여부. 연결이 잠시 사라져도 독립 시계로 멋대로 전환하지 않도록 한 번 확인한 연결을 유지한다.
- `gameStorageKey(snapshot)`: `inu-exchange-game-v1:<sessionId>` 형식으로 독립 실행 데이터 및 다른 세이브와 분리한다.
- `applyGameClock(state, catalog, snapshot, {process:processCampus})`: 진행한 시간만 처리하고 `{changed, resetRequired, reason, steps}`를 반환한다. 마지막 스냅샷은 `state.gameClock`, 모드는 `state.clockMode = 'game'`으로 둔다.
- `currentClock(state)`: 게임 모드에서는 한국 실제 시각이나 독립 데모 날짜 대신 `state.gameClock`을 사용한다. 강의 평가 가능 시간과 날짜 필터도 같은 시간을 따른다.

같은 분이 반복되면 평가, 뉴스, 가격을 추가 생성하지 않는다. 정지 직전에 게임 시간이 변경되었으면 최종 시간을 한 번 반영한 뒤 고정한다. 시간 간격은 10분 샘플, 각 강의의 당일 최종 종료 시점, 23:59를 시간순으로 처리한다. 따라서 배경 진행 중 수업 종료와 날짜 변경을 놓치지 않는다.

다른 세이브, 역행, 7일보다 큰 이동에는 상태를 바꾸기 전에 `resetRequired:true`를 반환한다. 호출자는 해당 세이브의 별도 기록을 선택하거나 대상 시점에 맞는 상태를 새로 구성한다. 기존 미래 기록을 그대로 덮어 과거 시점의 평가에 섞지 않는다. 신규 상태를 `ensureDemoContent()`에 넘기려고 `gameClock`을 미리 설정했다면 첫 `processCampus()`를 한 번 호출해야 한다. 이미 같은 시간의 `gameClock`을 넣은 후 `applyGameClock()`을 호출하면 중복 분으로 취급한다.

## 검증

`tests/game-clock.test.mjs`는 입력 날짜/분 검증, 같은 출처 경계, 자정 및 커서 복구, 정지/중복 스냅샷, 마지막 강의 종료 및 자정 catch-up, 역행/새 저장/큰 이동의 무변경 반환, 실제 `processCampus()`와 평가 제출 종료 조건을 확인한다.
