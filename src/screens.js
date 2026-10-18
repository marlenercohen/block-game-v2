// Full-screen screens (instruction cards, central start cross, end screen) and small overlays (hint bar, skip button, trial info). DOM only.
const $ = id => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

function showScreen(which) {           // which: 'card' | 'cross' | 'end' | null
  show($('screen'), !!which); show($('card'), which === 'card'); show($('crossBtn'), which === 'cross'); if (which !== 'cross') show($('crossHint'), false); show($('endBox'), which === 'end');
}
export function hideScreen() { showScreen(null); }

/** Instruction card; resolves when the participant presses the button. */
export function showCard({ title, text, button = 'Continue' }) {
  $('cardTitle').textContent = title; $('cardText').textContent = text; $('cardBtn').textContent = button; showScreen('card');
  return new Promise(res => { $('cardBtn').onclick = () => { $('cardBtn').onclick = null; res(); }; });
}
/** Show the central plus (neutral background, no tower), optionally with a small instruction under it (tutorial only). Returns the element to attach the start control to. */
export function showCross(caption = null) { showScreen('cross'); $('crossHint').textContent = caption ?? ''; show($('crossHint'), !!caption); return $('crossBtn'); }
export function showEnd() { showScreen('end'); }

export const setHint = text => { $('hintBar').textContent = text ?? ''; show($('hintBar'), !!text); };
export const setSkipVisible = on => show($('skipBtn'), on);
export const setTrialInfo = text => { $('trialInfo').textContent = text ?? ''; show($('trialInfo'), !!text); };
export const onSkip = fn => { $('skipBtn').onclick = fn; };
