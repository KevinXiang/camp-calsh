import type { Camp } from './types';

/** 判断在 (x,y) 放置军营是否合法：与所有未摧毁军营距离 ≥ minDistance */
export function canPlaceCamp(
  existing: Camp[],
  x: number,
  y: number,
  minDistance: number,
): boolean {
  for (const c of existing) {
    if (c.destroyed) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    if (Math.hypot(dx, dy) < minDistance) return false;
  }
  return true;
}
