import { AI_BATTLE } from '../../config/aiBattle';
import { CAMP_DEFS, CAMP_MIN_DISTANCE } from '../../config/camps';
import type { GameState } from '../GameState';
import { canPlaceCamp } from '../placement';
import type { Camp, CampKind, Faction } from '../types';
import { EconomySystem } from './EconomySystem';

export type PlacementActor = 'player' | 'ai';

export type PlacementFailure =
  | 'unauthorizedFaction'
  | 'outsideBattlefield'
  | 'wrongHalf'
  | 'tooClose'
  | 'insufficientResources';

export type PlacementResult =
  | { ok: true; camp: Camp }
  | { ok: false; reason: PlacementFailure };

export interface PlacementRequest {
  actor: PlacementActor;
  faction: Faction;
  kind: CampKind;
  x: number;
  y: number;
}

export class CampPlacementService {
  constructor(
    private gs: GameState,
    private createId: () => string = () => crypto.randomUUID(),
  ) {}

  validate(request: PlacementRequest): PlacementFailure | null {
    if (!canPlaceCamp(this.gs.allCamps(), request.x, request.y, CAMP_MIN_DISTANCE)) {
      return 'tooClose';
    }
    if (this.gs.mode === 'sandbox') return null;
    if (
      (request.actor === 'player' && request.faction !== 'red') ||
      (request.actor === 'ai' && request.faction !== 'blue')
    ) {
      return 'unauthorizedFaction';
    }

    const battlefield = AI_BATTLE.battlefield;
    if (
      request.x < battlefield.minX + battlefield.edgeMargin ||
      request.x > battlefield.maxX - battlefield.edgeMargin ||
      request.y < battlefield.minY + battlefield.edgeMargin ||
      request.y > battlefield.maxY - battlefield.edgeMargin
    ) {
      return 'outsideBattlefield';
    }
    if (
      (request.faction === 'red' && request.x >= battlefield.midX) ||
      (request.faction === 'blue' && request.x <= battlefield.midX)
    ) {
      return 'wrongHalf';
    }
    if (!EconomySystem.canAfford(
      this.gs,
      request.faction,
      AI_BATTLE.prices[request.kind],
    )) {
      return 'insufficientResources';
    }
    return null;
  }

  place(request: PlacementRequest): PlacementResult {
    const failure = this.validate(request);
    if (failure) return { ok: false, reason: failure };

    const paidCost = this.gs.mode === 'aiBattle'
      ? AI_BATTLE.prices[request.kind]
      : 0;
    if (paidCost > 0 && !EconomySystem.trySpend(this.gs, request.faction, paidCost)) {
      return { ok: false, reason: 'insufficientResources' };
    }

    const def = CAMP_DEFS[request.kind];
    const camp: Camp = {
      id: this.createId(),
      faction: request.faction,
      kind: request.kind,
      x: request.x,
      y: request.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnTimer: 0,
      upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0,
      destroyed: false,
      paidCost,
    };
    this.gs.addCamp(camp);
    return { ok: true, camp };
  }

  remove(actor: PlacementActor, campId: string): boolean {
    const camp = this.gs.getCamp(campId);
    if (!camp) return false;
    if (
      this.gs.mode === 'aiBattle' &&
      ((actor === 'player' && camp.faction !== 'red') ||
        (actor === 'ai' && camp.faction !== 'blue'))
    ) {
      return false;
    }

    this.gs.removeCamp(campId);
    if (this.gs.mode === 'aiBattle' && !camp.destroyed) {
      EconomySystem.refundCamp(this.gs, camp.faction, camp.paidCost ?? 0);
    }
    return true;
  }
}
