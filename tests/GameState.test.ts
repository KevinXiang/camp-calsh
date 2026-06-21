import { describe, it, expect } from 'vitest';
import { GameState } from '../src/game/GameState';
import type { Camp } from '../src/game/types';

function makeCamp(id: string, x = 0, y = 0): Camp {
  return {
    id, faction: 'red', kind: 'sword', x, y,
    hp: 500, maxHp: 500, spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
  };
}

describe('GameState', () => {
  it('defaults to sandbox with uninitialized persistent AI battle state', () => {
    const gs = new GameState();
    expect(gs.mode).toBe('sandbox');
    expect(gs.economy).toEqual({
      initialized: false,
      resources: { red: 0, blue: 0 },
    });
    expect(gs.ai).toEqual({
      decisionCooldown: 0,
      targetKind: null,
      targetRedSignature: '',
      targetBlueSignature: '',
      failedPlacements: 0,
    });
  });

  it('treats legacy camps without paidCost as unpaid', () => {
    const camp = makeCamp('legacy');
    expect(camp.paidCost ?? 0).toBe(0);
  });

  it('addCamp 后可通过 getCamp 取回', () => {
    const gs = new GameState();
    const c = makeCamp('c1');
    gs.addCamp(c);
    expect(gs.getCamp('c1')).toBe(c);
  });

  it('addCamp 后 camps 列表包含该军营', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1'));
    expect(gs.camps.size).toBe(1);
  });

  it('removeCamp 后 getCamp 返回 undefined', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1'));
    gs.removeCamp('c1');
    expect(gs.getCamp('c1')).toBeUndefined();
    expect(gs.camps.size).toBe(0);
  });

  it('removeCamp 不存在的 id 不报错', () => {
    const gs = new GameState();
    expect(() => gs.removeCamp('nope')).not.toThrow();
  });

  it('allCamps 返回所有军营数组', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1', 0, 0));
    gs.addCamp(makeCamp('c2', 100, 0));
    expect(gs.allCamps().map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});
