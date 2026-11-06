(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Cutscenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function resultStage(result) {
    return { kind: 'result', result };
  }

  function buildStage(choice, result) {
    if (choice && choice.cutscene) {
      return { kind: 'cutscene', cutscene: choice.cutscene, result };
    }
    return resultStage(result);
  }

  function resolveChoice(choice, state, custom) {
    const result = choice.run(state) || {};
    if (custom && custom(result)) return { bypassed: true, result, stage: null };
    return { bypassed: false, result, stage: buildStage(choice, result) };
  }

  function cutsceneMarkup(cutscene, message, escapeHtml) {
    const src = escapeHtml(cutscene.src);
    const alt = escapeHtml(cutscene.alt);
    const caption = escapeHtml(message || '');
    return `<figure class="cutscene"><div class="cutscene-frame"><img class="cutscene-image" src="${src}" alt="${alt}"><div class="cutscene-fallback" hidden>장면 이미지를 불러오지 못했습니다.</div></div><figcaption class="cutscene-caption">${caption}</figcaption></figure>`;
  }

  function markImageFailed(image) {
    image.classList.add('failed');
    const fallback = image.parentElement && image.parentElement.querySelector('.cutscene-fallback');
    if (fallback) fallback.hidden = false;
  }

  function presentChoice({ choice, state, custom, applyResult, showCutscene, showResult }) {
    const outcome = resolveChoice(choice, state, custom);
    if (outcome.bypassed) return outcome;
    const prepared = applyResult(outcome.result);
    if (outcome.stage.kind === 'cutscene') {
      let continued = false;
      const next = () => {
        if (continued) return;
        continued = true;
        showResult(outcome.result, prepared);
      };
      showCutscene(outcome.stage.cutscene, outcome.result, prepared, next);
    } else {
      showResult(outcome.result, prepared);
    }
    return outcome;
  }

  return { resultStage, buildStage, resolveChoice, cutsceneMarkup, markImageFailed, presentChoice };
});
