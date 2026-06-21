import { describe, expect, it } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';
import { GameState } from '../src/game/GameState';
import { EconomySystem } from '../src/game/managers/EconomySystem';

describe('EconomySystem', () => {
  it('initializes both sides once and forces normal spawn rates', () => {
    const gs = new GameState();
    gs.sim.spawnMultiplier = { red: 3, blue: 0.5 };

    EconomySystem.enterAiBattle(gs);

    expect(gs.mode).toBe('aiBattle');
    expect(gs.economy.initialized).toBe(true);
    expect(gs.economy.resources).toEqual({
      red: AI_BATTLE.initialResources,
      blue: AI_BATTLE.initialResources,
    });
    expect(gs.sim.spawnMultiplier).toEqual({ red: 1, blue: 1 });

    gs.economy.resources.red = 123;
    gs.economy.resources.blue = 234;
    gs.sim.spawnMultiplier = { red: 2, blue: 4 };
    EconomySystem.enterAiBattle(gs);

    expect(gs.economy.resources).toEqual({ red: 123, blue: 234 });
    expect(gs.sim.spawnMultiplier).toEqual({ red: 1, blue: 1 });
  });

  it('grows both balances from fixed-step simulated time', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);
    gs.sim.running = true;

    EconomySystem.step(gs, 2, false);

    expect(gs.economy.resources).toEqual({ red: 350, blue: 350 });
  });

  it('does not grow while paused, in sandbox, or after game over', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);

    EconomySystem.step(gs, 10, false);
    gs.sim.running = true;
    gs.mode = 'sandbox';
    EconomySystem.step(gs, 10, false);
    gs.mode = 'aiBattle';
    EconomySystem.step(gs, 10, true);

    expect(gs.economy.resources).toEqual({ red: 330, blue: 330 });
  });

  it('checks affordability without changing the balance', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);

    expect(EconomySystem.canAfford(gs, 'red', 330)).toBe(true);
    expect(EconomySystem.canAfford(gs, 'blue', 331)).toBe(false);
    expect(EconomySystem.canAfford(gs, 'red', -10)).toBe(false);
    expect(EconomySystem.canAfford(gs, 'red', Number.NaN)).toBe(false);
    expect(EconomySystem.canAfford(gs, 'red', Number.POSITIVE_INFINITY)).toBe(false);
    expect(gs.economy.resources).toEqual({ red: 330, blue: 330 });
  });

  it('spends atomically and rejects insufficient balance', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);

    expect(EconomySystem.trySpend(gs, 'red', 240)).toBe(true);
    expect(EconomySystem.trySpend(gs, 'red', 100)).toBe(false);
    expect(gs.economy.resources.red).toBe(90);
  });

  it('rejects invalid costs without changing the balance', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);

    expect(EconomySystem.trySpend(gs, 'red', -10)).toBe(false);
    expect(EconomySystem.trySpend(gs, 'red', Number.NaN)).toBe(false);
    expect(EconomySystem.trySpend(gs, 'red', Number.POSITIVE_INFINITY)).toBe(false);
    expect(gs.economy.resources.red).toBe(330);
  });

  it('refunds half of paid cost and nothing for legacy camps', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);

    EconomySystem.refundCamp(gs, 'red', 120);
    EconomySystem.refundCamp(gs, 'red', 0);
    EconomySystem.refundCamp(gs, 'red', -10);
    EconomySystem.refundCamp(gs, 'red', Number.NaN);
    EconomySystem.refundCamp(gs, 'red', Number.POSITIVE_INFINITY);

    expect(gs.economy.resources.red).toBe(390);
  });
});
