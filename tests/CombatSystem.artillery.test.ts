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

describe('Artillery splash damage', () => {
  it('溅射范围内多个目标同时受伤', () => {
    const gs = makeGs();
    const target: Unit = { id: 't1', faction: 'blue', kind: 'sword', campId: 'c1', x: 100, y: 100, hp: 100, maxHp: 100, attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60, attackTimer: 0, targetId: null, state: 'idle', alive: true, deathTimer: 0 };
    const nearby: Unit = { id: 't2', faction: 'blue', kind: 'shield', campId: 'c1', x: 140, y: 100, hp: 180, maxHp: 180, attack: 7, attackRange: 35, attackInterval: 1.3, moveSpeed: 42, attackTimer: 0, targetId: null, state: 'idle', alive: true, deathTimer: 0 };
    gs.units.set('t1', target);
    gs.units.set('t2', nearby);

    CombatSystem.applyArtillerySplash(100, 100, 12, 'red', gs, 80, 1);

    expect(target.hp).toBe(88);
    expect(nearby.hp).toBe(168);
  });

  it('对军营 2x 伤害', () => {
    const gs = makeGs();
    const camp: Camp = { id: 'c1', faction: 'blue', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500, spawnTimer: 0, upgrades: { production: 0, health: 0, weapon: 0 }, aliveUnits: 0, destroyed: false };
    gs.camps.set('c1', camp);

    CombatSystem.applyArtillerySplash(100, 100, 12, 'red', gs, 80, 2);

    expect(camp.hp).toBe(476);
  });
});
