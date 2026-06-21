import { AI_BATTLE } from '../../config/aiBattle';
import type { GameState } from '../GameState';
import {
  CampPlacementService,
  type PlacementRequest,
} from '../managers/CampPlacementService';
import { EconomySystem } from '../managers/EconomySystem';
import type { Camp, CampKind } from '../types';
import { chooseAiCampKind } from './aiStrategy';

const FRONTLINE = new Set<CampKind>(['sword', 'shield']);
const BACKLINE = new Set<CampKind>(['medic', 'artillery']);

interface PlacementCandidate {
  request: PlacementRequest;
  score: number;
}

export class AiController {
  constructor(
    private gs: GameState,
    private placement: CampPlacementService,
    private random: () => number = Math.random,
  ) {}

  deployInitialCamp(): boolean {
    if (this.gs.mode !== 'aiBattle' || !this.hasLivingRedCamp()) return false;
    this.gs.ai.decisionCooldown = 0;
    return this.tryBuild();
  }

  step(dt: number, gameOver: boolean): boolean {
    if (
      this.gs.mode !== 'aiBattle'
      || !this.gs.sim.running
      || gameOver
      || !this.hasLivingRedCamp()
    ) {
      return false;
    }

    this.gs.ai.decisionCooldown -= dt;
    if (this.gs.ai.decisionCooldown > 0) return false;
    this.gs.ai.decisionCooldown = AI_BATTLE.decisionInterval;
    return this.tryBuild();
  }

  private tryBuild(): boolean {
    const livingCamps = this.gs.allCamps().filter(camp => !camp.destroyed);
    const red = livingCamps.filter(camp => camp.faction === 'red');
    const blue = livingCamps.filter(camp => camp.faction === 'blue');
    const redSignature = this.redSignature(red);

    if (this.gs.ai.targetRedSignature !== redSignature) {
      this.gs.ai.targetKind = null;
    }

    const kind = this.gs.ai.targetKind ?? chooseAiCampKind(blue, red);
    this.gs.ai.targetKind = kind;
    this.gs.ai.targetRedSignature = redSignature;

    if (!EconomySystem.canAfford(
      this.gs,
      'blue',
      AI_BATTLE.prices[kind],
    )) {
      return false;
    }

    const candidates = this.candidates(kind)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (candidates.length === 0) {
      this.recordPlacementFailure();
      return false;
    }

    const chosen = candidates[Math.floor(this.random() * candidates.length)];
    const result = this.placement.place(chosen.request);
    if (!result.ok) {
      this.recordPlacementFailure();
      return false;
    }

    this.gs.ai.targetKind = null;
    this.gs.ai.targetRedSignature = '';
    this.gs.ai.failedPlacements = 0;
    return true;
  }

  private candidates(kind: CampKind): PlacementCandidate[] {
    const battlefield = AI_BATTLE.battlefield;
    const minX = battlefield.midX + battlefield.edgeMargin;
    const maxX = battlefield.maxX - battlefield.edgeMargin;
    const minY = battlefield.minY + battlefield.edgeMargin;
    const maxY = battlefield.maxY - battlefield.edgeMargin;
    const candidates: PlacementCandidate[] = [];

    for (let index = 0; index < AI_BATTLE.candidateCount; index++) {
      const x = minX + this.random() * (maxX - minX);
      const y = minY + this.random() * (maxY - minY);
      const request: PlacementRequest = {
        actor: 'ai',
        faction: 'blue',
        kind,
        x,
        y,
      };
      if (this.placement.validate(request) !== null) continue;
      candidates.push({
        request,
        score: -Math.abs(x - this.preferredX(kind)),
      });
    }

    return candidates;
  }

  private preferredX(kind: CampKind): number {
    const battlefield = AI_BATTLE.battlefield;
    if (FRONTLINE.has(kind)) return battlefield.midX + 160;
    if (BACKLINE.has(kind)) return battlefield.maxX - 180;
    return battlefield.midX
      + (battlefield.maxX - battlefield.midX) * 0.55;
  }

  private hasLivingRedCamp(): boolean {
    return this.gs.allCamps().some(
      camp => camp.faction === 'red' && !camp.destroyed,
    );
  }

  private redSignature(redCamps: Camp[]): string {
    return redCamps
      .map(camp => camp.kind)
      .sort()
      .join('|');
  }

  private recordPlacementFailure(): void {
    this.gs.ai.failedPlacements++;
    if (
      this.gs.ai.failedPlacements < AI_BATTLE.maxPlacementFailures
    ) {
      return;
    }

    this.gs.ai.targetKind = null;
    this.gs.ai.targetRedSignature = '';
    this.gs.ai.failedPlacements = 0;
  }
}
