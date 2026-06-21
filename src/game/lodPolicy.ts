/**
 * 缩放 LOD 策略：按 zoom 区间决定显示降级。
 *  - near:   zoom >= 1.2   全细节，血条/轻反馈/动作都开
 *  - mid:    0.7 <= zoom < 1.2  收起轻反馈血条抽样
 *  - far:    zoom < 0.7    只保留关键反馈（高/mid），血条隐藏
 *
 * 用于 BattleScene 在 dispatch 前过滤事件、以及 unitRenderer/campRenderer 决定血条可见。
 */
export type ZoomTier = 'near' | 'mid' | 'far';

export const LOD_THRESHOLDS = {
  NEAR: 1.2,
  FAR: 0.7,
} as const;

export function classifyZoom(zoom: number): ZoomTier {
  if (zoom >= LOD_THRESHOLDS.NEAR) return 'near';
  if (zoom >= LOD_THRESHOLDS.FAR) return 'mid';
  return 'far';
}

/**
 * 在给定 LOD 下，是否应播放该 CombatEvent 类型。
 * - near：全部播放
 * - mid：跳过 meleeHit / arrowHit（轻反馈抽样，但保留约一半）
 * - far：仅保留 mid/high 层（shieldBlock / healHit / javelinHit / bombExplosion / artilleryExplosion / campDestroyed / unitDeath 等）
 *
 * mid 的轻反馈通过 frameSeed 抽样（约 1/2 概率），避免完全无声但减少视觉嘈杂。
 */
export function shouldDispatchEvent(
  kind: string,
  tier: ZoomTier,
  frameSeed: number,
): boolean {
  if (tier === 'near') return true;
  // 远景：完全跳过轻反馈
  if (tier === 'far') {
    return kind !== 'meleeHit' && kind !== 'arrowHit' && kind !== 'bombHit';
  }
  // 中景：轻反馈抽样
  if (kind === 'meleeHit' || kind === 'arrowHit' || kind === 'bombHit') {
    return (frameSeed & 1) === 0;  // 约一半
  }
  return true;
}

/** 远景/中景下隐藏普通单位血条，仅 camp 血条始终显示。 */
export function shouldShowUnitHpBar(tier: ZoomTier): boolean {
  return tier === 'near';
}
