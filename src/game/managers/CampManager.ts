import type { Camp, Unit, Faction } from '../types';
import { CAMP_DEFS } from '../../config/camps';
import { UNIT_DEFS } from '../../config/units';

export interface GameStateView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  sim: { spawnMultiplier: { red: number; blue: number } };
  addUnit(u: Unit): void;
}

export class CampManager {
  constructor(private gs: GameStateView) {}

  step(dt: number): void {
    for (const c of this.gs.camps.values()) {
      if (c.destroyed) continue;
      if (c.aliveUnits >= (CAMP_DEFS[c.kind]?.unitCap ?? 20)) continue;
      // 玩家可调倍率（>1 加快），下限 0.01 防 div-zero
      const mult = Math.max(0.01, this.gs.sim.spawnMultiplier[c.faction as Faction] ?? 1);
      c.spawnTimer -= dt * mult;
      if (c.spawnTimer <= 0) {
        const def = CAMP_DEFS[c.kind];
        const udef = UNIT_DEFS[c.kind];
        const factor = [1, 0.85, 0.70][c.upgrades.production - 1] ?? 1;
        c.spawnTimer += def.spawnInterval * factor;
        const unit: Unit = {
          id: crypto.randomUUID(), faction: c.faction, kind: c.kind, campId: c.id,
          x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 30,
          hp: udef.maxHp, maxHp: udef.maxHp, attack: udef.attack,
          attackRange: udef.attackRange, attackInterval: udef.attackInterval, moveSpeed: udef.moveSpeed,
          attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
        };
        this.gs.addUnit(unit);
        c.aliveUnits++;
      }
    }
  }
}
