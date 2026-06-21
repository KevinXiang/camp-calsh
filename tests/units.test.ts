import { describe, it, expect } from 'vitest';
import { UNIT_DEFS } from '../src/config/units';
import type { UnitKind } from '../src/game/types';

describe('UNIT_DEFS', () => {
  it('包含 7 种小兵', () => {
    const kinds: UnitKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb', 'medic', 'artillery'];
    for (const k of kinds) expect(UNIT_DEFS[k]).toBeDefined();
  });
  it('剑兵数值：近战基础推进', () => {
    expect(UNIT_DEFS.sword).toMatchObject({ attackType: 'melee', maxHp: 100, attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60 });
  });
  it('盾兵数值：高血量前排', () => {
    expect(UNIT_DEFS.shield).toMatchObject({ attackType: 'melee', maxHp: 180, attack: 7 });
  });
  it('弓兵数值：通用远程持续输出', () => {
    expect(UNIT_DEFS.archer).toMatchObject({ attackType: 'ranged', maxHp: 60, attack: 8, attackRange: 180 });
  });
  it('投矛兵数值：高单发点杀', () => {
    expect(UNIT_DEFS.javelin).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 22, attackInterval: 2.2, preferredTarget: 'highestHp' });
  });
  it('炸弹兵数值：反密集 AOE', () => {
    expect(UNIT_DEFS.bomb).toMatchObject({ attackType: 'ranged', maxHp: 50, attack: 14, attackRange: 120, attackInterval: 2.6, moveSpeed: 35, preferredTarget: 'clustered' });
  });
  it('医疗兵数值：纯治疗支援（无攻击，无毒伤）', () => {
    expect(UNIT_DEFS.medic).toMatchObject({ attackType: 'ranged', maxHp: 110, attack: 0, attackRange: 150, attackInterval: 1.8, moveSpeed: 50, healAmount: 14, healSearchRange: 300 });
    expect(UNIT_DEFS.medic).not.toHaveProperty('poisonDamage');
    expect(UNIT_DEFS.medic).not.toHaveProperty('poisonDuration');
    expect(UNIT_DEFS.medic).not.toHaveProperty('poisonRange');
    expect(UNIT_DEFS.medic).not.toHaveProperty('poisonCooldown');
  });
  it('火炮兵数值：最远射程攻城，含最小射程弱点', () => {
    expect(UNIT_DEFS.artillery).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 14, attackRange: 280, attackInterval: 3.0, moveSpeed: 32, preferredTarget: 'campFirst', minimumAttackRange: 80 });
  });
});
