import type { Faction } from './types';

export interface VictoryView {
  camps: Map<string, { faction: Faction; destroyed: boolean }>;
  units: Map<string, { faction: Faction; alive: boolean }>;
}

/**
 * 胜负判定（稳健、不闪烁）：
 * 一方彻底覆灭 = 0 存活军营 且 0 存活单位；且对手仍有军营 → 对手胜。
 * 双方都空（尚未放置）或对手也无军营时返回 null（无胜者）。
 */
export function checkWinner(gs: VictoryView): Faction | null {
  let redCamps = 0, blueCamps = 0, redUnits = 0, blueUnits = 0;
  for (const c of gs.camps.values()) {
    if (c.destroyed) continue;
    if (c.faction === 'red') redCamps++; else blueCamps++;
  }
  for (const u of gs.units.values()) {
    if (!u.alive) continue;
    if (u.faction === 'red') redUnits++; else blueUnits++;
  }
  const redDead = redCamps === 0 && redUnits === 0;
  const blueDead = blueCamps === 0 && blueUnits === 0;
  if (redDead && blueCamps > 0) return 'blue';
  if (blueDead && redCamps > 0) return 'red';
  return null;
}
