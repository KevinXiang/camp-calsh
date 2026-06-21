import { describe, it, expect } from 'vitest';
import { EffectBudget, eventPriority } from '../src/game/effects/EffectManager';
import type { CombatEvent } from '../src/game/effects/types';
import type { Faction } from '../src/game/types';

function ev(kind: CombatEvent['kind']): CombatEvent {
  // 最小合法事件字面量（仅 kind + 必填字段按类型补足）
  const f: Faction = 'red';
  switch (kind) {
    case 'meleeHit':
    case 'arrowHit':
    case 'javelinHit':
    case 'shieldBlock':
    case 'bombHit':
    case 'unitDeath':
      return { kind, unitId: 'u', x: 0, y: 0, faction: f } as CombatEvent;
    case 'bombExplosion':
    case 'artilleryExplosion':
    case 'healHit':
      return { kind, x: 0, y: 0, faction: f } as CombatEvent;
    case 'campHit':
      return { kind, campId: 'c', x: 0, y: 0 } as CombatEvent;
    case 'campDestroyed':
      return { kind, campId: 'c', x: 0, y: 0, faction: f } as CombatEvent;
  }
}

describe('EffectBudget priority', () => {
  it('满额前 high 永远胜过 low', () => {
    const b = new EffectBudget(50);
    // 先填到接近上限，留 8 个名额
    for (let i = 0; i < 42; i++) expect(b.tryAdd('high')).toBe(true);
    // 此时剩 8 名额，<low cutoff(12) → low 被拒
    expect(b.tryAdd('low')).toBe(false);
    expect(b.tryAdd('mid')).toBe(true);  // 8 >= midCutoff(4)
    expect(b.tryAdd('high')).toBe(true); // high 仍可
  });

  it('mid 在剩 <= 4 名额时被拒', () => {
    const b = new EffectBudget(50);
    for (let i = 0; i < 46; i++) expect(b.tryAdd('high')).toBe(true);
    expect(b.tryAdd('mid')).toBe(false);
    expect(b.tryAdd('high')).toBe(true);
  });

  it('release 回收名额', () => {
    const b = new EffectBudget(2);
    expect(b.tryAdd('high')).toBe(true);
    expect(b.tryAdd('high')).toBe(true);
    expect(b.tryAdd('high')).toBe(false);  // 满
    b.release();
    expect(b.tryAdd('high')).toBe(true);
  });
});

describe('eventPriority mapping', () => {
  it('campDestroyed / artilleryExplosion 属 high', () => {
    expect(eventPriority(ev('campDestroyed').kind)).toBe('high');
    expect(eventPriority(ev('artilleryExplosion').kind)).toBe('high');
  });
  it('shieldBlock / healHit / javelinHit / bombExplosion 属 mid', () => {
    expect(eventPriority(ev('shieldBlock').kind)).toBe('mid');
    expect(eventPriority(ev('healHit').kind)).toBe('mid');
    expect(eventPriority(ev('javelinHit').kind)).toBe('mid');
    expect(eventPriority(ev('bombExplosion').kind)).toBe('mid');
  });
  it('meleeHit / arrowHit 属 low', () => {
    expect(eventPriority(ev('meleeHit').kind)).toBe('low');
    expect(eventPriority(ev('arrowHit').kind)).toBe('low');
  });
});
