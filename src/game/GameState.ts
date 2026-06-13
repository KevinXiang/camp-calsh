import type { Camp, Unit } from './types';

export class GameState {
  readonly camps = new Map<string, Camp>();
  readonly units = new Map<string, Unit>();

  addCamp(camp: Camp): void { this.camps.set(camp.id, camp); }
  removeCamp(id: string): void { this.camps.delete(id); }
  getCamp(id: string): Camp | undefined { return this.camps.get(id); }
  allCamps(): Camp[] { return [...this.camps.values()]; }

  addUnit(unit: Unit): void { this.units.set(unit.id, unit); }
  removeUnit(id: string): void { this.units.delete(id); }
  getUnit(id: string): Unit | undefined { return this.units.get(id); }
  allUnits(): Unit[] { return [...this.units.values()]; }
}
