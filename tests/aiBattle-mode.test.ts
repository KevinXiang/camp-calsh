import { describe, expect, it } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';

describe('AI battle configuration', () => {
  it('encodes the approved economy and AI timing', () => {
    expect(AI_BATTLE.initialResources).toBe(330);
    expect(AI_BATTLE.resourcePerSecond).toBe(10);
    expect(AI_BATTLE.refundRatio).toBe(0.5);
    expect(AI_BATTLE.decisionInterval).toBe(2);
    expect(AI_BATTLE.maxPlacementFailures).toBe(3);
    expect(AI_BATTLE.candidateCount).toBe(24);
  });

  it('encodes the approved battlefield bounds', () => {
    expect(AI_BATTLE.battlefield).toEqual({
      minX: 0,
      maxX: 1600,
      minY: 0,
      maxY: 900,
      midX: 800,
      edgeMargin: 48,
    });
  });

  it('defines a price for every camp kind', () => {
    expect(AI_BATTLE.prices).toEqual({
      sword: 100,
      shield: 110,
      archer: 120,
      javelin: 160,
      bomb: 180,
      medic: 200,
      artillery: 240,
    });
  });
});
