import { AI_BATTLE } from '../../config/aiBattle';
import type { GameState } from '../GameState';
import type { Faction } from '../types';

export class EconomySystem {
  static enterAiBattle(gs: GameState): void {
    gs.mode = 'aiBattle';
    gs.sim.spawnMultiplier.red = 1;
    gs.sim.spawnMultiplier.blue = 1;
    if (gs.economy.initialized) return;

    gs.economy.initialized = true;
    gs.economy.resources.red = AI_BATTLE.initialResources;
    gs.economy.resources.blue = AI_BATTLE.initialResources;
  }

  static step(gs: GameState, dt: number, gameOver: boolean): void {
    if (gs.mode !== 'aiBattle' || !gs.sim.running || gameOver) return;

    const gain = AI_BATTLE.resourcePerSecond * dt;
    gs.economy.resources.red += gain;
    gs.economy.resources.blue += gain;
  }

  static canAfford(gs: GameState, faction: Faction, cost: number): boolean {
    return Number.isFinite(cost) && cost >= 0 && gs.economy.resources[faction] >= cost;
  }

  static trySpend(gs: GameState, faction: Faction, cost: number): boolean {
    if (!this.canAfford(gs, faction, cost)) return false;
    gs.economy.resources[faction] -= cost;
    return true;
  }

  static refundCamp(gs: GameState, faction: Faction, paidCost: number): void {
    if (!Number.isFinite(paidCost) || paidCost <= 0) return;
    gs.economy.resources[faction] += paidCost * AI_BATTLE.refundRatio;
  }
}
