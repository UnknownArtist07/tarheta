export const motionConfig = {
  durations: {
    quick: 0.18,
    entrance: 0.62,
    emphasis: 0.9,
    marquee: 28,
  },
  stagger: {
    headline: 0.07,
    content: 0.1,
    cards: 0.12,
  },
  springs: {
    card: { type: 'spring', stiffness: 190, damping: 22, mass: 0.8 },
    gentle: { type: 'spring', stiffness: 120, damping: 20, mass: 0.9 },
    press: { type: 'spring', stiffness: 420, damping: 28, mass: 0.35 },
  },
  easeOut: [0.22, 1, 0.36, 1],
};
