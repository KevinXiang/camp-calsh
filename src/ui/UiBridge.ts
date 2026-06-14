import type { Faction, CampKind } from '../game/types';
import type { GameState } from '../game/GameState';

export interface PlacementSelection {
  faction: Faction;
  kind: CampKind | null;
}

type EventName = 'placementChanged' | 'selectionChanged' | 'simChanged' | 'statsChanged' | 'gameOver';

export class UiBridge {
  private listeners: Record<EventName, Set<() => void>> = {
    placementChanged: new Set(),
    selectionChanged: new Set(),
    simChanged: new Set(),
    statsChanged: new Set(),
    gameOver: new Set(),
  };
  private selection: PlacementSelection = { faction: 'red', kind: null };
  private selectedCampId: string | null = null;
  private gameOverFaction: Faction | null = null;

  getSelection(): PlacementSelection {
    return this.selection;
  }

  selectFaction(f: Faction): void {
    this.selection.faction = f;
    this.emit('placementChanged');
  }

  selectCampKind(k: CampKind | null): void {
    this.selection.kind = k;
    this.emit('placementChanged');
  }

  getSelectedCampId(): string | null {
    return this.selectedCampId;
  }

  selectCamp(id: string | null): void {
    this.selectedCampId = id;
    this.emit('selectionChanged');
  }

  deleteSelected(scene: { exposeGameState(): GameState; refreshViews(): void }): void {
    if (this.selectedCampId) {
      scene.exposeGameState().removeCamp(this.selectedCampId);
      scene.refreshViews();
      this.selectedCampId = null;
      this.emit('selectionChanged');
    }
  }

  setRunning(b: boolean, gs: GameState): void {
    gs.sim.running = b;
    this.emit('simChanged');
  }

  setSpeed(s: 1 | 2 | 4, gs: GameState): void {
    gs.sim.speed = s;
    this.emit('simChanged');
  }

  /** 宣布胜方：停止模拟并触发胜利界面 */
  declareGameOver(winner: Faction, gs: GameState): void {
    if (this.gameOverFaction !== null) return;  // 只宣布一次
    this.gameOverFaction = winner;
    gs.sim.running = false;
    this.emit('simChanged');
    this.emit('gameOver');
  }

  getGameOver(): Faction | null {
    return this.gameOverFaction;
  }

  on(event: EventName, cb: () => void): void {
    this.listeners[event].add(cb);
  }

  emit(event: EventName): void {
    for (const cb of this.listeners[event]) cb();
  }
}
