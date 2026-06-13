import type { Camp, Unit, Projectile, SideStats } from './types';

export interface SimState {
  running: boolean;
  speed: 1 | 2 | 4;
  timeMs: number;
}

export class GameState {
  readonly camps = new Map<string, Camp>();
  readonly units = new Map<string, Unit>();
  projectiles: Projectile[] = [];
  sim: SimState = { running: false, speed: 1, timeMs: 0 };
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

  clearUnits(): void {
    this.units.clear();
    for (const c of this.camps.values()) c.aliveUnits = 0;
  }

  clearAll(): void {
    this.camps.clear();
    this.units.clear();
    this.projectiles = [];
    this.stats = { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
                   blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } };
    this.sim.timeMs = 0;
  }
}
