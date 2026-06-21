import { describe, it, expect } from 'vitest';
import { computeUnitMetrics } from '../src/ui/campTooltipData';
import { UNIT_DEFS } from '../src/config/units';

describe('computeUnitMetrics', () => {
  it('剑兵: DPS=10，近战档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.sword);
    expect(m.dps).toBeCloseTo(10, 2); // 10 / 1.0
    expect(m.rangeClass).toBe('近战'); // range 35 < 60
  });

  it('弓兵: DPS≈6.67，远程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.archer);
    expect(m.dps).toBeCloseTo(6.67, 1); // 8 / 1.2
    expect(m.rangeClass).toBe('远程'); // range 180 > 150
  });

  it('炸弹兵: DPS=6，中程档（range 120）', () => {
    const m = computeUnitMetrics(UNIT_DEFS.bomb);
    expect(m.dps).toBeCloseTo(6, 2); // 15 / 2.5
    expect(m.rangeClass).toBe('中程'); // 60 <= 120 <= 150
  });

  it('医疗兵: attack=0 → DPS=0，range=150 属中程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.medic);
    expect(m.dps).toBe(0);
    expect(m.rangeClass).toBe('中程'); // range 150，按 60<=range<=150 规则属"中程"
  });

  it('盾兵 range=35 属近战档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.shield).rangeClass).toBe('近战');
  });

  it('标枪 range=150 属中程档（边界含右端）', () => {
    expect(computeUnitMetrics(UNIT_DEFS.javelin).rangeClass).toBe('中程');
  });

  it('火炮 range=250 属远程档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.artillery).rangeClass).toBe('远程');
  });
});
