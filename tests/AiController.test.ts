import { describe, expect, it, vi } from 'vitest';
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
  return { gs, ai, placement };
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

  it('does not deploy or decide in sandbox mode', () => {
    const gs = new GameState();
    gs.sim.running = true;
    gs.economy.resources.blue = 500;
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    const placement = new CampPlacementService(gs, () => 'blue-1');
    const ai = new AiController(gs, placement, () => 0.5);
    const beforeResources = { ...gs.economy.resources };

    expect(ai.deployInitialCamp()).toBe(false);
    expect(ai.step(10, false)).toBe(false);
    expect(gs.allCamps()).toHaveLength(1);
    expect(gs.economy.resources).toEqual(beforeResources);
  });

  it('can deploy its initial camp while simulation is paused', () => {
    const { gs, ai } = setup();
    gs.sim.running = false;
    gs.ai.decisionCooldown = 7;
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);

    expect(ai.deployInitialCamp()).toBe(true);
    expect(gs.ai.decisionCooldown).toBe(AI_BATTLE.decisionInterval);
    expect(gs.allCamps().filter(camp => camp.faction === 'blue')).toHaveLength(1);

    gs.sim.running = true;
    expect(ai.step(1 / 60, false)).toBe(false);
    expect(gs.allCamps().filter(camp => camp.faction === 'blue')).toHaveLength(1);
  });

  it('keeps startup cooldown at zero when initial deployment fails', () => {
    const { gs, ai } = setup();
    gs.sim.running = false;
    gs.economy.resources.blue = 0;
    gs.ai.decisionCooldown = 7;
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);

    expect(ai.deployInitialCamp()).toBe(false);
    expect(gs.ai.decisionCooldown).toBe(0);
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
    gs.ai.failedPlacements = 2;
    gs.ai.decisionCooldown = 0;

    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('bomb');
    expect(gs.ai.targetRedSignature).toBe('shield|shield');
    expect(gs.ai.failedPlacements).toBe(0);
  });

  it('re-evaluates a saved target when the living blue composition changes', () => {
    const { gs, ai } = setup();
    addCamp(gs, 'blue-1', 'blue', 'sword', 1050, 200);
    addCamp(gs, 'blue-2', 'blue', 'archer', 1250, 200);
    addCamp(gs, 'blue-3', 'blue', 'medic', 1450, 200);
    addCamp(gs, 'red-1', 'red', 'artillery', 300, 300);
    addCamp(gs, 'red-2', 'red', 'artillery', 500, 300);
    gs.economy.resources.blue = 0;

    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('javelin');
    expect(gs.ai.targetBlueSignature).toBe('archer|medic|sword');

    gs.getCamp('blue-1')!.destroyed = true;
    gs.ai.failedPlacements = 2;
    gs.ai.decisionCooldown = 0;

    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('sword');
    expect(gs.ai.targetRedSignature).toBe('artillery|artillery');
    expect(gs.ai.targetBlueSignature).toBe('archer|medic');
    expect(gs.ai.failedPlacements).toBe(0);
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

  it('validates exactly candidateCount candidates within the blue bounds', () => {
    const { gs, ai, placement } = setup(() => 0.5);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    const validate = vi.spyOn(placement, 'validate').mockReturnValue(null);
    vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    ai.deployInitialCamp();

    expect(validate).toHaveBeenCalledTimes(AI_BATTLE.candidateCount);
    const battlefield = AI_BATTLE.battlefield;
    for (const [request] of validate.mock.calls) {
      expect(request.x).toBeGreaterThanOrEqual(
        battlefield.midX + battlefield.edgeMargin,
      );
      expect(request.x).toBeLessThanOrEqual(
        battlefield.maxX - battlefield.edgeMargin,
      );
      expect(request.y).toBeGreaterThanOrEqual(
        battlefield.minY + battlefield.edgeMargin,
      );
      expect(request.y).toBeLessThanOrEqual(
        battlefield.maxY - battlefield.edgeMargin,
      );
    }
  });

  it('applies edge margins at the minimum random extreme', () => {
    const { gs, ai, placement } = setup(() => 0);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    const validate = vi.spyOn(placement, 'validate').mockReturnValue(null);
    vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    ai.deployInitialCamp();

    const battlefield = AI_BATTLE.battlefield;
    expect(validate.mock.calls[0][0]).toMatchObject({
      x: battlefield.midX + battlefield.edgeMargin,
      y: battlefield.minY + battlefield.edgeMargin,
    });
  });

  it('applies edge margins at the maximum random extreme', () => {
    const randomValue = 0.999999;
    const { gs, ai, placement } = setup(() => randomValue);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    const validate = vi.spyOn(placement, 'validate').mockReturnValue(null);
    vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    ai.deployInitialCamp();

    const battlefield = AI_BATTLE.battlefield;
    const minX = battlefield.midX + battlefield.edgeMargin;
    const maxX = battlefield.maxX - battlefield.edgeMargin;
    const minY = battlefield.minY + battlefield.edgeMargin;
    const maxY = battlefield.maxY - battlefield.edgeMargin;
    expect(validate.mock.calls[0][0].x).toBeCloseTo(
      minX + randomValue * (maxX - minX),
    );
    expect(validate.mock.calls[0][0].y).toBeCloseTo(
      minY + randomValue * (maxY - minY),
    );
  });

  it.each([
    ['one', 1],
    ['NaN', Number.NaN],
    ['negative', -1],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('normalizes %s random values for coordinates and selection', (_, value) => {
    const { gs, ai, placement } = setup(() => value);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    const validate = vi.spyOn(placement, 'validate').mockReturnValue(null);
    const place = vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    expect(() => ai.deployInitialCamp()).not.toThrow();

    const battlefield = AI_BATTLE.battlefield;
    for (const [request] of validate.mock.calls) {
      expect(Number.isFinite(request.x)).toBe(true);
      expect(Number.isFinite(request.y)).toBe(true);
      expect(request.x).toBeGreaterThanOrEqual(
        battlefield.midX + battlefield.edgeMargin,
      );
      expect(request.x).toBeLessThanOrEqual(
        battlefield.maxX - battlefield.edgeMargin,
      );
      expect(request.y).toBeGreaterThanOrEqual(
        battlefield.minY + battlefield.edgeMargin,
      );
      expect(request.y).toBeLessThanOrEqual(
        battlefield.maxY - battlefield.edgeMargin,
      );
    }
    expect(place).toHaveBeenCalledOnce();
  });

  it('can choose a non-first candidate from the scored top three', () => {
    const battlefield = AI_BATTLE.battlefield;
    const minX = battlefield.midX + battlefield.edgeMargin;
    const maxX = battlefield.maxX - battlefield.edgeMargin;
    const minY = battlefield.minY + battlefield.edgeMargin;
    const maxY = battlefield.maxY - battlefield.edgeMargin;
    const candidates = [
      { x: 960, y: 200 },
      { x: 970, y: 300 },
      { x: 950, y: 400 },
      ...Array.from(
        { length: AI_BATTLE.candidateCount - 3 },
        (_, index) => ({ x: 1300, y: 100 + index * 10 }),
      ),
    ];
    const values = candidates.flatMap(candidate => [
      (candidate.x - minX) / (maxX - minX),
      (candidate.y - minY) / (maxY - minY),
    ]);
    values.push(0.5);
    let randomIndex = 0;
    const { gs, ai, placement } = setup(() => values[randomIndex++] ?? 0);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    vi.spyOn(placement, 'validate').mockReturnValue(null);
    const place = vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    ai.deployInitialCamp();

    expect(place).toHaveBeenCalledWith({
      actor: 'ai',
      faction: 'blue',
      kind: 'sword',
      x: 970,
      y: 300,
    });
  });

  it('prefers the 55 percent blue-half position for middle-line camps', () => {
    const battlefield = AI_BATTLE.battlefield;
    const preferredX = battlefield.midX
      + (battlefield.maxX - battlefield.midX) * 0.55;
    const random = cyclingCandidateRandom(
      [battlefield.midX + 160, preferredX, battlefield.maxX - 180],
      700,
    );
    const { gs, ai, placement } = setup(random);
    addCamp(gs, 'red-1', 'red', 'sword', 300, 300);
    addCamp(gs, 'blue-1', 'blue', 'sword', 1050, 200);
    vi.spyOn(placement, 'validate').mockReturnValue(null);
    const place = vi.spyOn(placement, 'place').mockReturnValue({
      ok: false,
      reason: 'tooClose',
    });

    ai.deployInitialCamp();

    expect(place).toHaveBeenCalledWith({
      actor: 'ai',
      faction: 'blue',
      kind: 'archer',
      x: preferredX,
      y: 700,
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
