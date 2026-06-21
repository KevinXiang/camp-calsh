import { describe, it, expect } from 'vitest';
import { CAMP_DEFS } from '../src/config/camps';
import type { CampKind } from '../src/game/types';

describe('CAMP_DEFS', () => {
  it('包含 7 种军营', () => {
    const kinds: CampKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb', 'medic', 'artillery'];
    for (const k of kinds) {
      expect(CAMP_DEFS[k]).toBeDefined();
    }
  });

  it('剑兵营：最快出兵节奏', () => {
    expect(CAMP_DEFS.sword).toMatchObject({
      produces: 'sword',
      maxHp: 500,
      unitCap: 20,
    });
    expect(CAMP_DEFS.sword.spawnInterval).toBeLessThanOrEqual(4);
  });

  it('盾兵营：高营地血量，略慢产兵', () => {
    expect(CAMP_DEFS.shield).toMatchObject({ maxHp: 650 });
  });

  it('弓兵营：标准产兵', () => {
    expect(CAMP_DEFS.archer).toMatchObject({ maxHp: 450, spawnInterval: 5 });
  });

  it('投矛营：战术点杀', () => {
    expect(CAMP_DEFS.javelin).toMatchObject({ maxHp: 450 });
  });

  it('爆破营：反密集，低上限', () => {
    expect(CAMP_DEFS.bomb).toMatchObject({ maxHp: 400, unitCap: 10 });
  });

  it('医疗营：纯支援，低上限', () => {
    expect(CAMP_DEFS.medic).toMatchObject({ maxHp: 350, unitCap: 8 });
  });

  it('火炮营：攻城专用，最慢最低上限', () => {
    expect(CAMP_DEFS.artillery).toMatchObject({ maxHp: 420, unitCap: 6 });
  });

  it('基础三营 unitCap 保持 20', () => {
    expect(CAMP_DEFS.sword.unitCap).toBe(20);
    expect(CAMP_DEFS.archer.unitCap).toBe(20);
  });
});
