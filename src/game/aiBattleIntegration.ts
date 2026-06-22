import type { GameState } from './GameState';
import type { Faction } from './types';
import type { PlacementActor } from './managers/CampPlacementService';

export const AI_STARTUP_FAILURE_NOTICE =
  '蓝方建造区没有合法位置，AI 对战暂未开始';

export function hasLivingCamp(gs: GameState, faction: Faction): boolean {
  return gs.allCamps().some(
    camp => camp.faction === faction && !camp.destroyed,
  );
}

export function economySignature(gs: GameState): string {
  return `${Math.floor(gs.economy.resources.red)}|${Math.floor(gs.economy.resources.blue)}`;
}

export function emitEconomyChangedIfNeeded(
  gs: GameState,
  previousSignature: string,
  emit: () => void,
): string {
  const signature = economySignature(gs);
  if (signature !== previousSignature) emit();
  return signature;
}

export interface AiBattleStepDependencies {
  economy(dt: number, gameOver: boolean): void;
  ai(dt: number, gameOver: boolean): boolean;
  camp(dt: number): void;
  unit(dt: number): void;
  combat(dt: number): void;
}

export function runAiBattleStep(
  deps: AiBattleStepDependencies,
  dt: number,
  gameOver: boolean,
): boolean {
  deps.economy(dt, gameOver);
  const built = deps.ai(dt, gameOver);
  deps.camp(dt);
  deps.unit(dt);
  deps.combat(dt);
  return built;
}

export function runAiBattleBatch<Winner>(
  steps: number,
  runStep: () => void,
  checkWinner: () => Winner | null,
  declareWinner: (winner: Winner) => void,
): void {
  for (let index = 0; index < steps; index++) {
    runStep();
    const winner = checkWinner();
    if (winner === null) continue;
    declareWinner(winner);
    break;
  }
}

export function clearStartupNoticeAfterAiBuild(
  built: boolean,
  currentNotice: string | null,
  setNotice: (notice: string | null) => void,
): void {
  if (built && currentNotice === AI_STARTUP_FAILURE_NOTICE) {
    setNotice(null);
  }
}

export interface AiBattleStartupDependencies {
  gs: GameState;
  deployInitialCamp(): boolean;
  setRunning(running: boolean): void;
  setNotice(notice: string | null): void;
}

export function handleAiBattleStartup(
  deps: AiBattleStartupDependencies,
): boolean {
  if (
    deps.gs.mode !== 'aiBattle'
    || !hasLivingCamp(deps.gs, 'red')
    || hasLivingCamp(deps.gs, 'blue')
  ) {
    return false;
  }

  const started = deps.deployInitialCamp();
  deps.setRunning(started);
  deps.setNotice(started ? null : AI_STARTUP_FAILURE_NOTICE);
  return true;
}

export interface PlayerCampRemovalDependencies {
  remove(actor: PlacementActor, campId: string): boolean;
  refreshViews(): void;
  emitEconomyChanged(): void;
}

export function removeCampByPlayer(
  deps: PlayerCampRemovalDependencies,
  campId: string,
): boolean {
  if (!deps.remove('player', campId)) return false;
  deps.refreshViews();
  deps.emitEconomyChanged();
  return true;
}
