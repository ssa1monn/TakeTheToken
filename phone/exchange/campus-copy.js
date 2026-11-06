// Keep saved demo news readable without rewriting its historical receipts.
export function newsTitle(value) {
  return newsText(value).replace(/^([가-힣]{2,6}) 종목(?=\s*[·,])/, '$1 교수님');
}

// Presentation-only compatibility for notices already kept in browser storage.
export function newsText(value) {
  return String(value ?? '')
    .replace('학과 공통 실습 자원이 확충되는 가상 시나리오입니다. 관련 학과 종목 전체에 같은 효과를 반영합니다.', '학과 공통 실습 자원이 확충돼요. 해당 학과 교수님 전체에 같은 효과를 반영해요.')
    .replace('연구 성과가 새로 공개되는 가상 시나리오입니다. 선택한 교수님 종목에 한 번 반영합니다.', '새 연구 성과가 공개됐어요. 해당 교수님의 주가에 한 번 반영해요.')
    .replace(/시연용 가상 공시/g, '캠퍼스 공시')
    .replace(/종목별 가상 가격 변화|종목마다 독립적으로 생성한 가상 가격 변화/g, '교수님별 주가 변동')
    .replace(/가상\s*/g, '')
    .replace(/시연 변동/g, '시장 변동');
}
