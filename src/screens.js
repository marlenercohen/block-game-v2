// Full-screen screens (instruction cards, central start cross, end screen) and small overlays (hint bar, skip button, trial info). DOM only.
const $ = id => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

function showScreen(which) {           // which: 'card' | 'cross' | 'end' | null
  show($('screen'), !!which); show($('card'), which === 'card'); show($('crossBtn'), which === 'cross'); if (which !== 'cross') show($('crossHint'), false); show($('endBox'), which === 'end');
}
export function hideScreen() { showScreen(null); }

/** Instruction card; resolves 'next' or 'back' when the participant presses a button. `canBack` shows the Back button (not on the first card). Only DOM state changes here. */
export function showCard({ title, text, button = 'Continue' }, { canBack = false } = {}) {
  $('cardTitle').textContent = title; $('cardText').textContent = text; $('cardBtn').textContent = button; show($('cardBack'), canBack); showScreen('card');
  return new Promise(res => { const done = v => { $('cardBtn').onclick = null; $('cardBack').onclick = null; res(v); }; $('cardBtn').onclick = () => done('next'); $('cardBack').onclick = () => done('back'); });
}
/** Show the central plus (neutral background, no tower), optionally with a small instruction under it (tutorial only). Returns the element to attach the start control to. */
export function showCross(caption = null) { showScreen('cross'); $('crossHint').textContent = caption ?? ''; show($('crossHint'), !!caption); return $('crossBtn'); }
export function showEnd() { showScreen('end'); }

export const setHint = text => { $('hintBar').textContent = text ?? ''; show($('hintBar'), !!text); };
export const setSkipVisible = on => show($('skipBtn'), on);
export const setTrialInfo = text => { $('trialInfo').textContent = text ?? ''; show($('trialInfo'), !!text); };
export const onSkip = fn => { $('skipBtn').onclick = fn; };
