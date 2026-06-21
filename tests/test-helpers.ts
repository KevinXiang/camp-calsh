import type { Camp, Unit, Projectile } from '../src/game/types';
import type { CombatGSView } from '../src/game/managers/CombatSystem';

export function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}

export function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0, ...o };
}

export function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

export function mkProj(overrides: Partial<Projectile> = {}): Projectile {
  return { id: 'p1', kind: 'arrow', x: 0, y: 0, targetId: 'u1', speed: 200, damage: 10, faction: 'blue', elapsed: 0, maxTime: 2, ...overrides };
}
