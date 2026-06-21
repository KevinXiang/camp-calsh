import type { CampKind } from '../game/types';

export const AI_BATTLE = {
  initialResources: 330,
  resourcePerSecond: 10,
  refundRatio: 0.5,
  decisionInterval: 2,
  maxPlacementFailures: 3,
  candidateCount: 24,
  battlefield: {
    minX: 0,
    maxX: 1600,
    minY: 0,
    maxY: 900,
    midX: 800,
    edgeMargin: 48,
  },
  prices: {
    sword: 100,
    shield: 110,
    archer: 120,
    javelin: 160,
    bomb: 180,
    medic: 200,
    artillery: 240,
  } satisfies Record<CampKind, number>,
} as const;
