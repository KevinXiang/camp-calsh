import type { Camp, CampKind, GameMode, Unit, Projectile, SideStats } from './types';
import type { CombatEvent } from './effects/types';

export interface EconomyState {
  initialized: boolean;
  resources: { red: number; blue: number };
}

export interface AiState {
  decisionCooldown: number;
  targetKind: CampKind | null;
  targetRedSignature: string;
  failedPlacements: number;
}

export interface SimState {
  running: boolean;
  speed: 1 | 2 | 3 | 4 | 5;
  timeMs: number;
  /** 每阵营独立的产兵速度倍率（1=默认，>1 加快，<1 减慢）。玩家可在战斗中实时调整。 */
  spawnMultiplier: { red: number; blue: number };
  /**
   * 投矛/爆破营解锁倒计时（秒）。> 0 时这两类营无需答题；每个 sim step 减 dt。
   * 仅 sim.running 时流逝（暂停冻结）。初始 0（首次必须先答题）。
   */
  unlockTimer: number;
}

export class GameState {
  mode: GameMode = 'sandbox';
  economy: EconomyState = {
    initialized: false,
    resources: { red: 0, blue: 0 },
  };
  ai: AiState = {
    decisionCooldown: 0,
    targetKind: null,
    targetRedSignature: '',
    failedPlacements: 0,
  };
  readonly camps = new Map<string, Camp>();
  readonly units = new Map<string, Unit>();
  projectiles: Projectile[] = [];
  events: CombatEvent[] = [];
  sim: SimState = { running: false, speed: 1, timeMs: 0, spawnMultiplier: { red: 1, blue: 1 }, unlockTimer: 0 };
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
