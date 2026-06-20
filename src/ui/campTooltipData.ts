import type { UnitDef } from '../game/types';

/** 射程分档边界（含两端）：<60 近战，60..150 中程，>150 远程 */
function classifyRange(range: number): '近战' | '中程' | '远程' {
  if (range < 60) return '近战';
  if (range <= 150) return '中程';
  return '远程';
}

export interface UnitMetrics {
  /** 每秒伤害 = attack / attackInterval；attack 为 0 时为 0 */
  dps: number;
  /** 射程分档标签 */
  rangeClass: '近战' | '中程' | '远程';
}

export function computeUnitMetrics(def: UnitDef): UnitMetrics {
  const dps = def.attackInterval > 0 ? def.attack / def.attackInterval : 0;
  return { dps, rangeClass: classifyRange(def.attackRange) };
}
