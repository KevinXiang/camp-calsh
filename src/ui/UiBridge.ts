import type { Faction, CampKind } from '../game/types';
import type { GameState } from '../game/GameState';

export interface PlacementSelection {
  faction: Faction;
  kind: CampKind | null;
}

type EventName = 'placementChanged' | 'selectionChanged';

export class UiBridge {
  private listeners: Record<EventName, Set<() => void>> = {
    placementChanged: new Set(),
    selectionChanged: new Set(),
  };
  private selection: PlacementSelection = { faction: 'red', kind: null };
  private selectedCampId: string | null = null;

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

  on(event: EventName, cb: () => void): void {
    this.listeners[event].add(cb);
  }

  emit(event: EventName): void {
    for (const cb of this.listeners[event]) cb();
  }
}
