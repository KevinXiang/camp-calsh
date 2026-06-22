import type { Faction, CampKind, GameMode } from '../game/types';
import type { GameState } from '../game/GameState';
import type { PlacementFailure } from '../game/managers/CampPlacementService';
import { EconomySystem } from '../game/managers/EconomySystem';

export interface PlacementSelection {
  faction: Faction;
  kind: CampKind | null;
}

type EventName =
  | 'placementChanged'
  | 'selectionChanged'
  | 'simChanged'
  | 'statsChanged'
  | 'gameOver'
  | 'hoverChanged'
  | 'modeChanged'
  | 'economyChanged'
  | 'noticeChanged';

export function setGameMode(gs: GameState, mode: GameMode): void {
  if (mode === 'aiBattle') {
    EconomySystem.enterAiBattle(gs);
    return;
  }
  gs.mode = 'sandbox';
}

export class UiBridge {
  private listeners: Record<EventName, Set<() => void>> = {
    placementChanged: new Set(),
    selectionChanged: new Set(),
    simChanged: new Set(),
    statsChanged: new Set(),
    gameOver: new Set(),
    hoverChanged: new Set(),
    modeChanged: new Set(),
    economyChanged: new Set(),
    noticeChanged: new Set(),
  };
  private selection: PlacementSelection = { faction: 'red', kind: null };
  private selectedCampId: string | null = null;
  private gameOverFaction: Faction | null = null;
  private hoveredKind: CampKind | null = null;
  private lastPlacementFailure: PlacementFailure | null = null;
  private notice: string | null = null;
  private modeInitialized = false;

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

  reportPlacementFailure(reason: PlacementFailure): void {
    this.lastPlacementFailure = reason;
    this.emit('placementChanged');
  }

  getPlacementFailure(): PlacementFailure | null {
    return this.lastPlacementFailure;
  }

  clearPlacementFailure(): void {
    this.lastPlacementFailure = null;
  }

  getSelectedCampId(): string | null {
    return this.selectedCampId;
  }

  getHoveredCampKind(): CampKind | null {
    return this.hoveredKind;
  }

  hoverCamp(kind: CampKind | null): void {
    if (this.hoveredKind === kind) return;
    this.hoveredKind = kind;
    this.emit('hoverChanged');
  }

  selectCamp(id: string | null): void {
    this.selectedCampId = id;
    this.emit('selectionChanged');
  }

  deleteSelected(scene: { removeCampByPlayer(id: string): boolean }): void {
    if (!this.selectedCampId) return;
    if (!scene.removeCampByPlayer(this.selectedCampId)) return;
    this.selectedCampId = null;
    this.emit('selectionChanged');
  }

  setMode(mode: GameMode, gs: GameState): void {
    if (this.modeInitialized && gs.mode === mode) return;
    this.modeInitialized = true;
    setGameMode(gs, mode);

    if (mode === 'aiBattle' && this.selection.faction === 'blue') {
      this.selection = { faction: 'red', kind: null };
      this.emit('placementChanged');
    }
    if (mode === 'aiBattle' && this.selectedCampId) {
      const selected = gs.getCamp(this.selectedCampId);
      if (selected?.faction === 'blue') {
        this.selectedCampId = null;
        this.emit('selectionChanged');
      }
    }

    this.emit('modeChanged');
    this.emit('simChanged');
  }

  setNotice(notice: string | null): void {
    if (this.notice === notice) return;
    this.notice = notice;
    this.emit('noticeChanged');
  }

  getNotice(): string | null {
    return this.notice;
  }

  setRunning(b: boolean, gs: GameState): void {
    gs.sim.running = b;
    this.emit('simChanged');
  }

  setSpeed(s: 1 | 2 | 3 | 4 | 5, gs: GameState): void {
    gs.sim.speed = s;
    this.emit('simChanged');
  }

  /** 设置某阵营的产兵倍率（slider 实时调节） */
  setSpawnMultiplier(faction: Faction, mult: number, gs: GameState): void {
    gs.sim.spawnMultiplier[faction] = mult;
    this.emit('simChanged');
  }

  getSpawnMultiplier(faction: Faction, gs: GameState): number {
    return gs.sim.spawnMultiplier[faction];
  }

  /** 答对算术题 → 解锁投矛/爆破 60 秒 */
  unlockGate(gs: GameState, seconds = 120): void {
    gs.sim.unlockTimer = seconds;
    this.emit('simChanged');
  }

  /** 当前是否在解锁窗口内 */
  isUnlocked(gs: GameState): boolean {
    return gs.sim.unlockTimer > 0;
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
