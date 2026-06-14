import type { Camp, Unit, Projectile, SideStats } from './types';
import type { CombatEvent } from './effects/types';

export interface SimState {
  running: boolean;
  speed: 1 | 2 | 4 | 8 | 10;
  timeMs: number;
  /** 每阵营独立的产兵速度倍率（1=默认，>1 加快，<1 减慢）。玩家可在战斗中实时调整。 */
  spawnMultiplier: { red: number; blue: number };
}

export class GameState {
  readonly camps = new Map<string, Camp>();
  readonly units = new Map<string, Unit>();
  projectiles: Projectile[] = [];
  events: CombatEvent[] = [];
  sim: SimState = { running: false, speed: 1, timeMs: 0, spawnMultiplier: { red: 1, blue: 1 } };
  stats: { red: SideStats; blue: SideStats } = {
    red:  { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
    blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
  };

  addCamp(camp: Camp): void { this.camps.set(camp.id, camp); }
  removeCamp(id: string): void { this.camps.delete(id); }
  getCamp(id: string): Camp | undefined { return this.camps.get(id); }
  allCamps(): Camp[] { return [...this.camps.values()]; }

  addUnit(unit: Unit): void { this.units.set(unit.id, unit); }
  removeUnit(id: string): void { this.units.delete(id); }
  getUnit(id: string): Unit | undefined { return this.units.get(id); }
  allUnits(): Unit[] { return [...this.units.values()]; }
}
