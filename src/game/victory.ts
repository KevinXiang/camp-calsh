import type { Faction } from './types';

export interface VictoryView {
  camps: Map<string, { faction: Faction; destroyed: boolean }>;
  units: Map<string, { faction: Faction; alive: boolean }>;
}

/**
 * 胜负判定（稳健、不闪烁）：
 * 一方【曾参战】（map 里有它的军营条目，含已摧毁）且现在 0 存活军营 + 0 存活单位
 * → 视为覆灭；对手未覆灭则对手胜。
 * 关键：从未放置军营的一方不算覆灭（避免一放置就立即判胜）。
 */
export function checkWinner(gs: VictoryView): Faction | null {
  let redEver = 0, blueEver = 0, redCamps = 0, blueCamps = 0, redUnits = 0, blueUnits = 0;
  for (const c of gs.camps.values()) {
    if (c.faction === 'red') { redEver++; if (!c.destroyed) redCamps++; }
    else { blueEver++; if (!c.destroyed) blueCamps++; }
  }
  for (const u of gs.units.values()) {
    if (!u.alive) continue;
    if (u.faction === 'red') redUnits++; else blueUnits++;
  }
  const redDefeated = redEver > 0 && redCamps === 0 && redUnits === 0;
  const blueDefeated = blueEver > 0 && blueCamps === 0 && blueUnits === 0;
  if (redDefeated && !blueDefeated) return 'blue';
  if (blueDefeated && !redDefeated) return 'red';
  return null;
}
