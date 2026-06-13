import type { Camp } from './types';

export class GameState {
  readonly camps = new Map<string, Camp>();

  addCamp(camp: Camp): void {
    this.camps.set(camp.id, camp);
  }

  removeCamp(id: string): void {
    this.camps.delete(id);
  }

  getCamp(id: string): Camp | undefined {
    return this.camps.get(id);
  }

  allCamps(): Camp[] {
    return [...this.camps.values()];
  }
}
