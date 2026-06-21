import { describe, it, expect } from 'vitest';
import { classifyZoom, shouldDispatchEvent, shouldShowUnitHpBar, LOD_THRESHOLDS } from '../src/game/lodPolicy';

describe('classifyZoom', () => {
  it('zoom >= 1.2 属 near', () => {
    expect(classifyZoom(1.2)).toBe('near');
    expect(classifyZoom(2.5)).toBe('near');
  });
  it('0.7 <= zoom < 1.2 属 mid', () => {
    expect(classifyZoom(0.7)).toBe('mid');
    expect(classifyZoom(1.0)).toBe('mid');
    expect(classifyZoom(1.19)).toBe('mid');
  });
  it('zoom < 0.7 属 far', () => {
    expect(classifyZoom(0.69)).toBe('far');
    expect(classifyZoom(0.3)).toBe('far');
  });
  it('阈值常量与文档一致', () => {
    expect(LOD_THRESHOLDS.NEAR).toBe(1.2);
    expect(LOD_THRESHOLDS.FAR).toBe(0.7);
  });
});

describe('shouldDispatchEvent', () => {
  it('near 全部播放', () => {
    expect(shouldDispatchEvent('meleeHit', 'near', 0)).toBe(true);
    expect(shouldDispatchEvent('arrowHit', 'near', 1)).toBe(true);
    expect(shouldDispatchEvent('bombExplosion', 'near', 0)).toBe(true);
    expect(shouldDispatchEvent('campDestroyed', 'near', 0)).toBe(true);
  });

  it('far 跳过 meleeHit/arrowHit/bombHit', () => {
    expect(shouldDispatchEvent('meleeHit', 'far', 0)).toBe(false);
    expect(shouldDispatchEvent('arrowHit', 'far', 0)).toBe(false);
    expect(shouldDispatchEvent('bombHit', 'far', 0)).toBe(false);
    // 中/高反馈保留
    expect(shouldDispatchEvent('shieldBlock', 'far', 0)).toBe(true);
    expect(shouldDispatchEvent('javelinHit', 'far', 0)).toBe(true);
    expect(shouldDispatchEvent('bombExplosion', 'far', 0)).toBe(true);
    expect(shouldDispatchEvent('artilleryExplosion', 'far', 0)).toBe(true);
    expect(shouldDispatchEvent('campDestroyed', 'far', 0)).toBe(true);
  });

  it('mid 对轻反馈按 frameSeed 抽样（约一半）', () => {
    // frameSeed 偶数 → 播放；奇数 → 跳过
    expect(shouldDispatchEvent('meleeHit', 'mid', 0)).toBe(true);
    expect(shouldDispatchEvent('meleeHit', 'mid', 1)).toBe(false);
    expect(shouldDispatchEvent('meleeHit', 'mid', 2)).toBe(true);
    expect(shouldDispatchEvent('arrowHit', 'mid', 3)).toBe(false);
    // 非轻反馈始终播放
    expect(shouldDispatchEvent('javelinHit', 'mid', 1)).toBe(true);
    expect(shouldDispatchEvent('bombExplosion', 'mid', 1)).toBe(true);
  });
});

describe('shouldShowUnitHpBar', () => {
  it('近景显示，中/远景隐藏', () => {
    expect(shouldShowUnitHpBar('near')).toBe(true);
    expect(shouldShowUnitHpBar('mid')).toBe(false);
    expect(shouldShowUnitHpBar('far')).toBe(false);
  });
});
