import { describe, expect, it } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';
import { AiController } from '../src/game/ai/AiController';
import { GameState } from '../src/game/GameState';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';
import { EconomySystem } from '../src/game/managers/EconomySystem';
import type { CampKind } from '../src/game/types';
import { mkCamp } from './test-helpers';

function setup(random: () => number = () => 0.5) {
  const gs = new GameState();
  EconomySystem.enterAiBattle(gs);
  gs.sim.running = true;
  let nextId = 1;
  const placement = new CampPlacementService(gs, () => `ai-${nextId++}`);
  const ai = new AiController(gs, placement, random);
  return { gs, ai };
}

function addCamp(
  gs: GameState,
  id: string,
  faction: 'red' | 'blue',
  kind: CampKind,
  x: number,
  y: number,
): void {
  gs.addCamp(mkCamp({ id, faction, kind, x, y }));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function cyclingCandidateRandom(xs: number[], y: number): () => number {
  const battlefield = AI_BATTLE.battlefield;
  const minX = battlefield.midX + battlefield.edgeMargin;
  const maxX = battlefield.maxX - battlefield.edgeMargin;
  const minY = battlefield.minY + battlefield.edgeMargin;
  const maxY = battlefield.maxY - battlefield.edgeMargin;
  const values: number[] = [];

  for (let index = 0; index < AI_BATTLE.candidateCount; index++) {
    const x = xs[index % xs.length];
    values.push((x - minX) / (maxX - minX));
    values.push((y - minY) / (maxY - minY));
  }
  values.push(0);

  let index = 0;
  return () => values[index++] ?? 0;
}

describe('AiController', () => {
  it('does nothing without a living red camp', () => {
    const { gs, ai } = setup();
    gs.ai.decisionCooldown = 1;

    expect(ai.step(10, false)).toBe(false);
    expect(ai.deployInitialCamp()).toBe(false);
    expect(gs.ai.decisionCooldown).toBe(1);
    expect(gs.camps.size).toBe(0);
  });

  it('can deploy its initial camp while simulation is paused', () => {
    const { gs, ai } = setup();
    gs.sim.running = false;
    gs.ai.decisionCooldown = 7;
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);

    expect(ai.deployInitialCamp()).toBe(true);
    expect(gs.ai.decisionCooldown).toBe(0);
    expect(gs.allCamps().filter(camp => camp.faction === 'blue')).toHaveLength(1);
  });

  it('does not run normal decisions while simulation is paused', () => {
    const { gs, ai } = setup();
    gs.sim.running = false;
    gs.ai.decisionCooldown = 1;
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);

    expect(ai.step(10, false)).toBe(false);
    expect(gs.ai.decisionCooldown).toBe(1);
    expect(gs.allCamps()).toHaveLength(1);
  });

  it('keeps an unaffordable target while saving resources', () => {
    const { gs, ai } = setup();
    addCamp(gs, 'red-1', 'red', 'artillery', 300, 300);
    addCamp(gs, 'red-2', 'red', 'artillery', 500, 300);
    addCamp(gs, 'blue-1', 'blue', 'sword', 1050, 200);
    addCamp(gs, 'blue-2', 'blue', 'archer', 1250, 200);
    addCamp(gs, 'blue-3', 'blue', 'medic', 1450, 200);
    gs.economy.resources.blue = 0;

    expect(ai.step(2, false)).toBe(false);
    expect(gs.ai.targetKind).toBe('javelin');
    const signature = gs.ai.targetRedSignature;

    gs.ai.decisionCooldown = 0;
    expect(ai.step(2, false)).toBe(false);
    expect(gs.ai.targetKind).toBe('javelin');
    expect(gs.ai.targetRedSignature).toBe(signature);
    expect(gs.allCamps()).toHaveLength(5);
  });

  it('re-evaluates a saved target when the living red composition changes', () => {
    const { gs, ai } = setup();
    addCamp(gs, 'blue-1', 'blue', 'sword', 1050, 200);
    addCamp(gs, 'blue-2', 'blue', 'archer', 1250, 200);
    addCamp(gs, 'blue-3', 'blue', 'medic', 1450, 200);
    addCamp(gs, 'red-1', 'red', 'artillery', 300, 300);
    addCamp(gs, 'red-2', 'red', 'artillery', 500, 300);
    gs.economy.resources.blue = 0;

    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('javelin');

    gs.getCamp('red-1')!.destroyed = true;
    gs.getCamp('red-2')!.destroyed = true;
    addCamp(gs, 'red-3', 'red', 'shield', 300, 500);
    addCamp(gs, 'red-4', 'red', 'shield', 500, 500);
    gs.ai.decisionCooldown = 0;

    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('bomb');
    expect(gs.ai.targetRedSignature).toBe('shield|shield');
  });

  it('does not spend when every sampled position is blocked', () => {
    const { gs, ai } = setup(() => 0.5);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    addCamp(gs, 'blocker', 'blue', 'shield', 1200, 450);
    const before = gs.economy.resources.blue;

    expect(ai.step(2, false)).toBe(false);
    expect(gs.economy.resources.blue).toBe(before);
    expect(gs.allCamps()).toHaveLength(2);
    expect(gs.ai.failedPlacements).toBe(1);
  });

  it('clears a blocked target after the maximum placement failures', () => {
    const { gs, ai } = setup(() => 0.5);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    addCamp(gs, 'blocker', 'blue', 'shield', 1200, 450);

    for (let attempt = 0; attempt < AI_BATTLE.maxPlacementFailures; attempt++) {
      gs.ai.decisionCooldown = 0;
      ai.step(2, false);
    }

    expect(gs.ai.targetKind).toBeNull();
    expect(gs.ai.targetRedSignature).toBe('');
    expect(gs.ai.failedPlacements).toBe(0);
  });

  it('spends on success and clears the saved target state', () => {
    const { gs, ai } = setup(() => 0.5);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    gs.ai.failedPlacements = 2;

    expect(ai.step(2, false)).toBe(true);
    expect(gs.economy.resources.blue).toBe(
      AI_BATTLE.initialResources - AI_BATTLE.prices.sword,
    );
    expect(gs.ai.targetKind).toBeNull();
    expect(gs.ai.targetRedSignature).toBe('');
    expect(gs.ai.failedPlacements).toBe(0);
  });

  it('uses simulated dt for its decision cooldown', () => {
    const { gs, ai } = setup(() => 0.5);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    gs.ai.decisionCooldown = 1;

    expect(ai.step(0.4, false)).toBe(false);
    expect(gs.ai.decisionCooldown).toBeCloseTo(0.6);
    expect(ai.step(0.6, false)).toBe(true);
    expect(gs.ai.decisionCooldown).toBe(AI_BATTLE.decisionInterval);
  });

  it('freezes decisions and cooldown after game over', () => {
    const { gs, ai } = setup();
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    gs.ai.decisionCooldown = 1;

    expect(ai.step(10, true)).toBe(false);
    expect(gs.ai.decisionCooldown).toBe(1);
    expect(gs.allCamps()).toHaveLength(1);
  });

  it('produces the same placement from the same random seed', () => {
    const first = setup(seededRandom(12345));
    const second = setup(seededRandom(12345));
    addCamp(first.gs, 'red-1', 'red', 'sword', 300, 300);
    addCamp(second.gs, 'red-1', 'red', 'sword', 300, 300);

    expect(first.ai.deployInitialCamp()).toBe(true);
    expect(second.ai.deployInitialCamp()).toBe(true);
    const firstBlue = first.gs.allCamps().find(camp => camp.faction === 'blue');
    const secondBlue = second.gs.allCamps().find(camp => camp.faction === 'blue');

    expect({ x: firstBlue?.x, y: firstBlue?.y }).toEqual({
      x: secondBlue?.x,
      y: secondBlue?.y,
    });
  });

  it('prefers a forward region for frontline camps', () => {
    const random = cyclingCandidateRandom([960, 1240, 1420], 700);
    const { gs, ai } = setup(random);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);

    expect(ai.deployInitialCamp()).toBe(true);
    const blue = gs.allCamps().find(camp => camp.faction === 'blue');
    expect(blue?.kind).toBe('sword');
    expect(blue?.x).toBeCloseTo(960);
    expect(blue!.x).toBeLessThan(1100);
  });

  it('prefers a rear region for medic camps', () => {
    const random = cyclingCandidateRandom([960, 1240, 1420], 700);
    const { gs, ai } = setup(random);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    addCamp(gs, 'blue-1', 'blue', 'sword', 1050, 200);
    addCamp(gs, 'blue-2', 'blue', 'archer', 1250, 200);

    expect(ai.deployInitialCamp()).toBe(true);
    const medic = gs.allCamps().find(camp => camp.kind === 'medic');
    expect(medic?.x).toBeCloseTo(1420);
    expect(medic!.x).toBeGreaterThan(1300);
  });
});
