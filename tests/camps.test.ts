import { describe, it, expect } from 'vitest';
import { CAMP_DEFS } from '../src/config/camps';
import type { CampKind } from '../src/game/types';

describe('CAMP_DEFS', () => {
  it('包含 6 种军营', () => {
    const kinds: CampKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb', 'medic'];
    for (const k of kinds) {
      expect(CAMP_DEFS[k]).toBeDefined();
    }
  });

  it('剑兵营数值符合 PRD 8.4', () => {
    expect(CAMP_DEFS.sword).toMatchObject({
      produces: 'sword',
      maxHp: 500,
      spawnInterval: 4,
      unitCap: 20,
    });
  });

  it('盾兵营数值 600/5', () => {
    expect(CAMP_DEFS.shield).toMatchObject({ maxHp: 600, spawnInterval: 5 });
  });

  it('弓兵营数值 450/5', () => {
    expect(CAMP_DEFS.archer).toMatchObject({ maxHp: 450, spawnInterval: 5 });
  });

  it('投矛营数值 450/6', () => {
    expect(CAMP_DEFS.javelin).toMatchObject({ maxHp: 450, spawnInterval: 6 });
  });

  it('爆破营数值 400/7/12', () => {
    expect(CAMP_DEFS.bomb).toMatchObject({ maxHp: 400, spawnInterval: 7, unitCap: 12 });
  });

  it('医疗营数值 350/7/10', () => {
    expect(CAMP_DEFS.medic).toMatchObject({ maxHp: 350, spawnInterval: 7, unitCap: 10 });
  });

  it('非特殊军营 unitCap 为 20', () => {
    expect(CAMP_DEFS.sword.unitCap).toBe(20);
    expect(CAMP_DEFS.shield.unitCap).toBe(20);
    expect(CAMP_DEFS.archer.unitCap).toBe(20);
    expect(CAMP_DEFS.javelin.unitCap).toBe(20);
    expect(CAMP_DEFS.bomb.unitCap).toBe(12);
    expect(CAMP_DEFS.medic.unitCap).toBe(10);
  });
});
