import { describe, it, expect } from 'vitest';
import { computeUnitMetrics, getCampTooltipData } from '../src/ui/campTooltipData';
import { UNIT_DEFS } from '../src/config/units';
import { CAMP_ROLE_DEFS } from '../src/config/campRoles';
import type { CampKind } from '../src/game/types';

describe('computeUnitMetrics', () => {
  it('剑兵: DPS=10，近战档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.sword);
    expect(m.dps).toBeCloseTo(10, 2); // 10 / 1.0
    expect(m.rangeClass).toBe('近战'); // range 35 < 60
  });

  it('弓兵: DPS≈7.27，远程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.archer);
    expect(m.dps).toBeCloseTo(8 / 1.1, 1); // 8 / 1.1
    expect(m.rangeClass).toBe('远程'); // range 180 > 150
  });

  it('炸弹兵: DPS≈5.38，中程档（range 120）', () => {
    const m = computeUnitMetrics(UNIT_DEFS.bomb);
    expect(m.dps).toBeCloseTo(14 / 2.6, 2);
    expect(m.rangeClass).toBe('中程'); // 60 <= 120 <= 150
  });

  it('医疗兵: attack=0 → DPS=0，range=150 属中程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.medic);
    expect(m.dps).toBe(0);
    expect(m.rangeClass).toBe('中程');
  });

  it('盾兵 range=35 属近战档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.shield).rangeClass).toBe('近战');
  });

  it('投矛 range=160 属远程档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.javelin).rangeClass).toBe('远程'); // 160 > 150
  });

  it('火炮 range=280 属远程档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.artillery).rangeClass).toBe('远程');
  });
});

describe('getCampTooltipData', () => {
  const ALL_KINDS: CampKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb', 'medic', 'artillery'];

  it('每个 CampKind 都有角色数据和口号', () => {
    for (const k of ALL_KINDS) {
      const data = getCampTooltipData(k);
      expect(data.slogan).toBeTruthy();
      expect(data.roleLabel).toBeTruthy();
      expect(data.tierLabel).toBeTruthy();
      expect(data.strengths.length).toBeGreaterThan(0);
      expect(data.weaknesses.length).toBeGreaterThan(0);
      expect(CAMP_ROLE_DEFS[k]).toBeDefined();
    }
  });

  it('层级标签：基础营/战术营/特殊营', () => {
    expect(getCampTooltipData('sword').tierLabel).toBe('基础营');
    expect(getCampTooltipData('archer').tierLabel).toBe('基础营');
    expect(getCampTooltipData('shield').tierLabel).toBe('基础营');
    expect(getCampTooltipData('javelin').tierLabel).toBe('战术营');
    expect(getCampTooltipData('bomb').tierLabel).toBe('战术营');
    expect(getCampTooltipData('medic').tierLabel).toBe('特殊营');
    expect(getCampTooltipData('artillery').tierLabel).toBe('特殊营');
  });

  it('返回的 metrics 与 computeUnitMetrics 一致', () => {
    const data = getCampTooltipData('sword');
    expect(data.metrics.dps).toBeCloseTo(10, 2);
    expect(data.metrics.rangeClass).toBe('近战');
  });
});
