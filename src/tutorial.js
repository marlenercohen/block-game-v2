// Tutorial script (data only). Teaches the goal, clicking on images, that location matters, that image-less blocks cannot be hit, and the novel/familiar rule
// (novel -> hit low, familiar -> hit high). It tells participants that block colour carries a hint but deliberately does NOT say what it means.
// Tutorial image blocks all use the neutral middle colour cue; images come from a separate pool (experiment.js TUTORIAL_IMAGES).
const W = 1.2, H = 1.2, D = 0.9, Z = -0.55;
const blk = (x, k, extra = {}) => ({ size: [W, H, D], pos: [x, H / 2 + k * H, Z], cue: 0.5, image: false, ...extra });

/** First card (shown before the tutorial trials). Every trial starts with the plus sign. */
export const INTRO_CARD = { title: 'Block game', text: 'In this game you will knock blocks off a platform by clicking on them.\n\nEvery trial begins with a plus sign (+) in the middle of the screen. Click the plus to begin the trial.\n\nFirst, a short practice.', button: 'Start' };
/** Shown (in the last tutorial card) only when the horizontal-error penalty is on. Does not say what triggers it. */
export const PENALTY_INSTRUCTION = "Some hits may add extra blocks to the platform. You'll need to clear these blocks before moving on to the next tower. Learning where to hit can help you avoid adding extra blocks.";
export const CROSS_CAPTION_TUTORIAL = 'Click the plus (+) to begin the trial.';

export const TUTORIAL_TOWERS = {
  single: { name: 'tutorial: one picture block', blocks: [blk(0, 0, { image: true })] },
  withGray: { name: 'tutorial: picture block on a gray block', blocks: [blk(0, 0), blk(0.05, 1, { image: true })] },
};

/** Each step: a card with text, then a practice trial (cross -> tower). image: index into the tutorial pool; 'novel'/'familiar' labels are the intended status. */
export const TUTORIAL_STEPS = [
  { id: 'goal', title: 'Welcome!', text: 'Each tower has blocks with pictures on them. Your goal is to knock the blocks that show a picture off the platform.\n\nClick (or tap) a picture to hit its block.', button: 'Try it', tower: 'single', image: 0, hint: 'Click the picture to hit the block.' },
  { id: 'location', title: 'Where you click matters', text: 'Hits push the block harder in some places than in others. Try hitting different spots on the picture and watch what happens.', button: 'Continue', tower: 'single', image: 1, hint: 'Try different spots on the picture.' },
  { id: 'gray', title: 'Blocks without pictures', text: 'Some blocks have no picture. You cannot hit those directly, but a moving block can push them.\n\nOnly the blocks with pictures need to leave the platform.', button: 'Continue', tower: 'withGray', image: 2, hint: 'Gray blocks cannot be hit. Use the picture block.' },
  { id: 'novel', title: 'New pictures', text: 'The first time you see a picture, it is NEW. For a new picture, hitting toward the BOTTOM of the picture works best.', button: 'Try it', tower: 'single', image: 3, role: 'novel', hint: 'A new picture: try hitting near the bottom of it.' },
  { id: 'familiar', title: 'Familiar pictures', text: 'The same picture is back! A picture you have already seen is FAMILIAR. For a familiar picture, hitting toward the TOP of the picture works best.', button: 'Try it', tower: 'single', image: 3, role: 'familiar', hint: 'A familiar picture: try hitting near the top of it.' },
  { id: 'color', title: 'One more hint', text: 'The color of a block also gives you a hint about where to hit. You will discover how as you play.\n\nWhere you click on a block affects how strongly it moves. There are patterns that can help you figure out where to click. These patterns generally stay the same across many towers, but they may sometimes change. Pay attention to what works, and use what you learn to knock down the towers.\n\n{{PENALTY}}The real game starts now. Try to clear each tower with as few hits as you can.', button: 'Begin', tower: null },
];
