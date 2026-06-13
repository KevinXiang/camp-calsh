import { describe, it, expect } from 'vitest';
import { EffectBudget } from '../src/game/effects/EffectManager';

describe('EffectBudget', () => {
  it('未达上限时 tryAdd 返回 true', () => {
    const b = new EffectBudget(50);
    for (let i = 0; i < 10; i++) expect(b.tryAdd()).toBe(true);
    expect(b.active()).toBe(10);
  });

  it('达上限后 tryAdd 返回 false', () => {
    const b = new EffectBudget(3);
    expect(b.tryAdd()).toBe(true);
    expect(b.tryAdd()).toBe(true);
    expect(b.tryAdd()).toBe(true);
    expect(b.tryAdd()).toBe(false);
  });

  it('release 后又能容纳', () => {
    const b = new EffectBudget(2);
    b.tryAdd(); b.tryAdd();
    expect(b.tryAdd()).toBe(false);
    b.release();
    expect(b.tryAdd()).toBe(true);
  });

  it('release 不能减到负数', () => {
    const b = new EffectBudget(5);
    b.release();
    expect(b.active()).toBe(0);
  });
});
