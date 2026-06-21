import type { UnitDef, CampKind } from '../game/types';
import { UNIT_DEFS } from '../config/units';
import { CAMP_ROLE_DEFS, ROLE_LABEL, TIER_LABEL } from '../config/campRoles';

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

export interface CampTooltipData {
  /** 数值指标 */
  metrics: UnitMetrics;
  /** 一句话定位 */
  slogan: string;
  /** 战场角色（中文） */
  roleLabel: string;
  /** 层级（中文） */
  tierLabel: string;
  /** 主要优势 */
  strengths: string[];
  /** 主要短板 */
  weaknesses: string[];
}

export function computeUnitMetrics(def: UnitDef): UnitMetrics {
  const dps = def.attackInterval > 0 ? def.attack / def.attackInterval : 0;
  return { dps, rangeClass: classifyRange(def.attackRange) };
}

/** 取军营的 tooltip 展示数据（数值指标 + 角色元数据） */
export function getCampTooltipData(kind: CampKind): CampTooltipData {
  const role = CAMP_ROLE_DEFS[kind];
  return {
    metrics: computeUnitMetrics(UNIT_DEFS[kind]),
    slogan: role.slogan,
    roleLabel: ROLE_LABEL[role.role],
    tierLabel: TIER_LABEL[role.tier],
    strengths: role.strengths,
    weaknesses: role.weaknesses,
  };
}
