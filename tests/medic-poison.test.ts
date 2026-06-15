import { describe, it, expect } from 'vitest';
import { CombatSystem } from '../src/game/managers/CombatSystem';
import type { CombatGSView } from '../src/game/managers/CombatSystem';
import type { Unit, Camp } from '../src/game/types';

function makeGs(): CombatGSView {
  return {
    units: new Map<string, Unit>(),
    camps: new Map<string, Camp>(),
    projectiles: [],
    events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 }, blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', faction: 'blue', kind: 'sword', campId: 'c1',
    x: 100, y: 100, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'idle',
    alive: true, deathTimer: 0,
    poisonTimer: 0, poisonDps: 0, poisonCooldownTimer: 0,
    ...overrides,
  };
}

describe('Poison DOT', () => {
  it('applyPoison 设置中毒状态', () => {
    const gs = makeGs();
    const target = makeUnit();
    gs.units.set('u1', target);

    CombatSystem.applyPoison(target, 8, 2, gs);

    expect(target.poisonTimer).toBe(2);
    expect(target.poisonDps).toBe(8);
    expect(gs.events).toContainEqual(expect.objectContaining({ kind: 'poisonApplied' }));
  });

  it('tickPoison 造成持续伤害', () => {
    const gs = makeGs();
    const target = makeUnit({ poisonTimer: 2, poisonDps: 8 });
    gs.units.set('u1', target);

    CombatSystem.tickPoison(target, 1, gs);

    expect(target.hp).toBe(92);
    expect(target.poisonTimer).toBe(1);
  });

  it('中毒结束后清除状态', () => {
    const gs = makeGs();
    const target = makeUnit({ poisonTimer: 0.5, poisonDps: 8 });
    gs.units.set('u1', target);

    CombatSystem.tickPoison(target, 1, gs);

    expect(target.poisonTimer).toBe(0);
    expect(target.poisonDps).toBe(0);
    expect(target.hp).toBe(96);
  });
});
