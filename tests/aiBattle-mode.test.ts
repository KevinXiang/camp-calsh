import { describe, expect, it, vi } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';
import { GameState } from '../src/game/GameState';
import type { BattleScene } from '../src/game/BattleScene';
import {
  AI_STARTUP_FAILURE_NOTICE,
  clearStartupNoticeAfterAiBuild,
  economySignature,
  emitEconomyChangedIfNeeded,
  handleAiBattleStartup,
  hasLivingCamp,
  removeCampByPlayer,
  runAiBattleBatch,
  runAiBattleStep,
} from '../src/game/aiBattleIntegration';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';
import { PlacementController } from '../src/game/managers/PlacementController';
import type { GameMode } from '../src/game/types';
import {
  setGameMode,
  UiBridge,
} from '../src/ui/UiBridge';
import { mkCamp } from './test-helpers';

describe('AI battle configuration', () => {
  it('encodes the approved economy and AI timing', () => {
    expect(AI_BATTLE.initialResources).toBe(330);
    expect(AI_BATTLE.resourcePerSecond).toBe(10);
    expect(AI_BATTLE.refundRatio).toBe(0.5);
    expect(AI_BATTLE.decisionInterval).toBe(2);
    expect(AI_BATTLE.maxPlacementFailures).toBe(3);
    expect(AI_BATTLE.candidateCount).toBe(24);
  });

  it('encodes the approved battlefield bounds', () => {
    expect(AI_BATTLE.battlefield).toEqual({
      minX: 0,
      maxX: 1600,
      minY: 0,
      maxY: 900,
      midX: 800,
      edgeMargin: 48,
    });
  });

  it('defines a price for every camp kind', () => {
    expect(AI_BATTLE.prices).toEqual({
      sword: 100,
      shield: 110,
      archer: 120,
      javelin: 160,
      bomb: 180,
      medic: 200,
      artillery: 240,
    });
  });
});

describe('AI battle mode integration helpers', () => {
  it('initializes AI battle once with normal spawn multipliers', () => {
    const gs = new GameState();
    gs.sim.spawnMultiplier = { red: 3, blue: 5 };

    setGameMode(gs, 'aiBattle');

    expect(gs.mode).toBe('aiBattle');
    expect(gs.economy.resources).toEqual({
      red: AI_BATTLE.initialResources,
      blue: AI_BATTLE.initialResources,
    });
    expect(gs.sim.spawnMultiplier).toEqual({ red: 1, blue: 1 });
  });

  it('switches to sandbox without clearing economy or AI state', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.economy.resources = { red: 123, blue: 234 };
    gs.ai.targetKind = 'bomb';

    setGameMode(gs, 'sandbox');

    expect(gs.mode).toBe('sandbox');
    expect(gs.economy.resources).toEqual({ red: 123, blue: 234 });
    expect(gs.ai.targetKind).toBe('bomb');
  });

  it('detects only living camps for a faction', () => {
    const gs = new GameState();
    gs.addCamp(mkCamp({ id: 'red-dead', faction: 'red', destroyed: true }));
    gs.addCamp(mkCamp({ id: 'blue-live', faction: 'blue' }));

    expect(hasLivingCamp(gs, 'red')).toBe(false);
    expect(hasLivingCamp(gs, 'blue')).toBe(true);
  });

  it('uses floored resources for the economy signature', () => {
    const gs = new GameState();
    gs.economy.resources = { red: 330.1, blue: 329.9 };

    expect(economySignature(gs)).toBe('330|329');
    gs.economy.resources = { red: 330.9, blue: 329.1 };
    expect(economySignature(gs)).toBe('330|329');
  });
});

describe('UiBridge AI battle integration', () => {
  it('emits mode and sim but leaves economy events to the scene', () => {
    const bridge = new UiBridge();
    const gs = new GameState();
    const changed = {
      mode: vi.fn(),
      economy: vi.fn(),
      sim: vi.fn(),
    };
    bridge.on('modeChanged', changed.mode);
    bridge.on('economyChanged', changed.economy);
    bridge.on('simChanged', changed.sim);

    bridge.setMode('sandbox', gs);

    expect(changed.mode).toHaveBeenCalledOnce();
    expect(changed.economy).not.toHaveBeenCalled();
    expect(changed.sim).toHaveBeenCalledOnce();
  });

  it('does not repeat side effects for the same initialized mode', () => {
    const bridge = new UiBridge();
    const gs = new GameState();
    const modeChanged = vi.fn();
    bridge.on('modeChanged', modeChanged);

    bridge.setMode('aiBattle', gs);
    gs.economy.resources = { red: 123, blue: 234 };
    gs.sim.spawnMultiplier = { red: 2, blue: 4 };
    bridge.setMode('aiBattle', gs);

    expect(gs.economy.resources).toEqual({ red: 123, blue: 234 });
    expect(gs.sim.spawnMultiplier).toEqual({ red: 2, blue: 4 });
    expect(modeChanged).toHaveBeenCalledOnce();
  });

  it('re-enters AI battle without resetting resources and restores multiplier one', () => {
    const bridge = new UiBridge();
    const gs = new GameState();

    bridge.setMode('aiBattle', gs);
    gs.economy.resources = { red: 123, blue: 234 };
    gs.sim.spawnMultiplier = { red: 2, blue: 4 };
    bridge.setMode('sandbox', gs);
    bridge.setMode('aiBattle', gs);

    expect(gs.economy.resources).toEqual({ red: 123, blue: 234 });
    expect(gs.sim.spawnMultiplier).toEqual({ red: 1, blue: 1 });
  });

  it('clears blue placement and camp selections when entering AI battle', () => {
    const bridge = new UiBridge();
    const gs = new GameState();
    gs.addCamp(mkCamp({ id: 'blue-1', faction: 'blue' }));
    bridge.selectFaction('blue');
    bridge.selectCampKind('bomb');
    bridge.selectCamp('blue-1');
    const placementChanged = vi.fn();
    const selectionChanged = vi.fn();
    bridge.on('placementChanged', placementChanged);
    bridge.on('selectionChanged', selectionChanged);

    bridge.setMode('aiBattle', gs);

    expect(bridge.getSelection()).toEqual({ faction: 'red', kind: null });
    expect(bridge.getSelectedCampId()).toBeNull();
    expect(placementChanged).toHaveBeenCalledOnce();
    expect(selectionChanged).toHaveBeenCalledOnce();
  });

  it('stores notices and emits only when the notice changes', () => {
    const bridge = new UiBridge();
    const noticeChanged = vi.fn();
    bridge.on('noticeChanged', noticeChanged);

    bridge.setNotice('blocked');
    bridge.setNotice('blocked');
    bridge.setNotice(null);

    expect(bridge.getNotice()).toBeNull();
    expect(noticeChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps selection when player deletion fails', () => {
    const bridge = new UiBridge();
    const selectionChanged = vi.fn();
    const economyChanged = vi.fn();
    bridge.selectCamp('blue-1');
    bridge.on('selectionChanged', selectionChanged);
    bridge.on('economyChanged', economyChanged);
    const scene = {
      removeCampByPlayer: vi.fn(() => false),
    };

    bridge.deleteSelected(scene);

    expect(scene.removeCampByPlayer).toHaveBeenCalledWith('blue-1');
    expect(bridge.getSelectedCampId()).toBe('blue-1');
    expect(selectionChanged).not.toHaveBeenCalled();
    expect(economyChanged).not.toHaveBeenCalled();
  });

  it('clears selection without bypassing scene economy dedupe after deletion succeeds', () => {
    const bridge = new UiBridge();
    const selectionChanged = vi.fn();
    const economyChanged = vi.fn();
    bridge.selectCamp('red-1');
    bridge.on('selectionChanged', selectionChanged);
    bridge.on('economyChanged', economyChanged);
    const scene = {
      removeCampByPlayer: vi.fn(() => true),
    };

    bridge.deleteSelected(scene);

    expect(bridge.getSelectedCampId()).toBeNull();
    expect(selectionChanged).toHaveBeenCalledOnce();
    expect(economyChanged).not.toHaveBeenCalled();
  });

  it.each<GameMode>(['sandbox', 'aiBattle'])(
    'emits mode changes when switching to %s',
    (mode) => {
      const bridge = new UiBridge();
      const gs = new GameState();
      const modeChanged = vi.fn();
      bridge.on('modeChanged', modeChanged);

      bridge.setMode(mode === 'sandbox' ? 'aiBattle' : 'sandbox', gs);
      modeChanged.mockClear();
      bridge.setMode(mode, gs);

      expect(modeChanged).toHaveBeenCalledOnce();
    },
  );
});

describe('BattleScene AI battle collaboration', () => {
  it('runs fixed-step systems in Economy, AI, Camp, Unit, Combat order', () => {
    const calls: string[] = [];

    runAiBattleStep({
      economy: () => calls.push('economy'),
      ai: () => {
        calls.push('ai');
        return false;
      },
      camp: () => calls.push('camp'),
      unit: () => calls.push('unit'),
      combat: () => calls.push('combat'),
    }, 1 / 60, false);

    expect(calls).toEqual(['economy', 'ai', 'camp', 'unit', 'combat']);
  });

  it('returns whether the AI built during the fixed step', () => {
    const built = runAiBattleStep({
      economy: vi.fn(),
      ai: () => true,
      camp: vi.fn(),
      unit: vi.fn(),
      combat: vi.fn(),
    }, 1 / 60, false);

    expect(built).toBe(true);
  });

  it('stops a fixed-step batch immediately after the first winner', () => {
    const runStep = vi.fn();
    const checkBatchWinner = vi.fn()
      .mockReturnValueOnce('red')
      .mockReturnValue(null);
    const declareWinner = vi.fn();

    runAiBattleBatch(3, runStep, checkBatchWinner, declareWinner);

    expect(runStep).toHaveBeenCalledOnce();
    expect(checkBatchWinner).toHaveBeenCalledOnce();
    expect(declareWinner).toHaveBeenCalledOnce();
    expect(declareWinner).toHaveBeenCalledWith('red');
  });

  it('runs every fixed step when no winner is produced', () => {
    const runStep = vi.fn();
    const checkBatchWinner = vi.fn(() => null);
    const declareWinner = vi.fn();

    runAiBattleBatch(3, runStep, checkBatchWinner, declareWinner);

    expect(runStep).toHaveBeenCalledTimes(3);
    expect(checkBatchWinner).toHaveBeenCalledTimes(3);
    expect(declareWinner).not.toHaveBeenCalled();
  });

  it('clears only the startup failure notice after a normal AI build', () => {
    const setNotice = vi.fn();

    clearStartupNoticeAfterAiBuild(
      true,
      AI_STARTUP_FAILURE_NOTICE,
      setNotice,
    );

    expect(setNotice).toHaveBeenCalledOnce();
    expect(setNotice).toHaveBeenCalledWith(null);
  });

  it('keeps the startup failure notice when AI did not build', () => {
    const setNotice = vi.fn();

    clearStartupNoticeAfterAiBuild(
      false,
      AI_STARTUP_FAILURE_NOTICE,
      setNotice,
    );

    expect(setNotice).not.toHaveBeenCalled();
  });

  it('does not clear unrelated notices after an AI build', () => {
    const setNotice = vi.fn();

    clearStartupNoticeAfterAiBuild(true, 'future notice', setNotice);

    expect(setNotice).not.toHaveBeenCalled();
  });

  it('starts after the first red camp deploys a blue camp', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    const setRunning = vi.fn();
    const setNotice = vi.fn();

    expect(handleAiBattleStartup({
      gs,
      deployInitialCamp: () => true,
      setRunning,
      setNotice,
    })).toBe(true);

    expect(setRunning).toHaveBeenCalledWith(true);
    expect(setNotice).toHaveBeenCalledWith(null);
  });

  it('keeps the first red camp startup paused when deployment fails', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    const setRunning = vi.fn();
    const setNotice = vi.fn();

    expect(handleAiBattleStartup({
      gs,
      deployInitialCamp: () => false,
      setRunning,
      setNotice,
    })).toBe(true);

    expect(setRunning).toHaveBeenCalledWith(false);
    expect(setNotice).toHaveBeenCalledWith(
      '蓝方建造区没有合法位置，AI 对战暂未开始',
    );
  });

  it.each([
    ['success', true, null],
    ['failure', false, '蓝方建造区没有合法位置，AI 对战暂未开始'],
  ] as const)(
    'handles existing red camp mode startup %s',
    (_name, deployed, notice) => {
      const gs = new GameState();
      gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
      setGameMode(gs, 'aiBattle');
      const setRunning = vi.fn();
      const setNotice = vi.fn();

      expect(handleAiBattleStartup({
        gs,
        deployInitialCamp: () => deployed,
        setRunning,
        setNotice,
      })).toBe(true);

      expect(setRunning).toHaveBeenCalledWith(deployed);
      expect(setNotice).toHaveBeenCalledWith(notice);
    },
  );

  it('does not deploy when a living blue camp already exists', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    gs.addCamp(mkCamp({ id: 'blue-1', faction: 'blue' }));
    const deployInitialCamp = vi.fn(() => true);

    expect(handleAiBattleStartup({
      gs,
      deployInitialCamp,
      setRunning: vi.fn(),
      setNotice: vi.fn(),
    })).toBe(false);
    expect(deployInitialCamp).not.toHaveBeenCalled();
  });

  it('emits the initial AI economy once and dedupes an unchanged signature', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    const emit = vi.fn();

    const first = emitEconomyChangedIfNeeded(gs, '', emit);
    const second = emitEconomyChangedIfNeeded(gs, first, emit);

    expect(first).toBe('330|330');
    expect(second).toBe(first);
    expect(emit).toHaveBeenCalledOnce();
  });

  it('emits once after startup spending and not again for the same balance', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    let signature = emitEconomyChangedIfNeeded(gs, '', vi.fn());
    const emit = vi.fn();
    gs.economy.resources.blue -= AI_BATTLE.prices.sword;

    signature = emitEconomyChangedIfNeeded(gs, signature, emit);
    signature = emitEconomyChangedIfNeeded(gs, signature, emit);

    expect(signature).toBe('330|230');
    expect(emit).toHaveBeenCalledOnce();
  });

  it('emits one economy event when mode startup succeeds', () => {
    const gs = new GameState();
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    const bridge = new UiBridge();
    const economyChanged = vi.fn();
    let signature = '';
    bridge.on('economyChanged', economyChanged);
    bridge.on('modeChanged', () => {
      handleAiBattleStartup({
        gs,
        deployInitialCamp: () => {
          gs.economy.resources.blue -= AI_BATTLE.prices.sword;
          return true;
        },
        setRunning: running => {
          gs.sim.running = running;
        },
        setNotice: vi.fn(),
      });
      signature = emitEconomyChangedIfNeeded(
        gs,
        signature,
        () => bridge.emit('economyChanged'),
      );
    });

    bridge.setMode('aiBattle', gs);

    expect(signature).toBe('330|230');
    expect(economyChanged).toHaveBeenCalledOnce();
  });

  it('delegates successful player removal, refreshes, and emits through economy path', () => {
    const remove = vi.fn(() => true);
    const refreshViews = vi.fn();
    const emitEconomyChanged = vi.fn();

    expect(removeCampByPlayer({
      remove,
      refreshViews,
      emitEconomyChanged,
    }, 'red-1')).toBe(true);

    expect(remove).toHaveBeenCalledWith('player', 'red-1');
    expect(refreshViews).toHaveBeenCalledOnce();
    expect(emitEconomyChanged).toHaveBeenCalledOnce();
  });

  it('does not refresh or emit when player removal fails', () => {
    const remove = vi.fn(() => false);
    const refreshViews = vi.fn();
    const emitEconomyChanged = vi.fn();

    expect(removeCampByPlayer({
      remove,
      refreshViews,
      emitEconomyChanged,
    }, 'blue-1')).toBe(false);

    expect(refreshViews).not.toHaveBeenCalled();
    expect(emitEconomyChanged).not.toHaveBeenCalled();
  });
});

describe('PlacementController AI battle integration', () => {
  it('notifies the scene after a successful player placement', () => {
    const gs = new GameState();
    const bridge = new UiBridge();
    bridge.selectCampKind('sword');
    const inputHandlers = new Map<string, (pointer: any) => void>();
    const preview = {
      setStrokeStyle: vi.fn().mockReturnThis(),
      setVisible: vi.fn().mockReturnThis(),
      setPosition: vi.fn().mockReturnThis(),
      setFillStyle: vi.fn().mockReturnThis(),
    };
    const scene = {
      add: {
        circle: vi.fn(() => preview),
      },
      input: {
        on: vi.fn((event: string, cb: (pointer: any) => void) => {
          inputHandlers.set(event, cb);
        }),
      },
      game: {
        canvas: {
          addEventListener: vi.fn(),
        },
      },
      cameras: {
        main: {
          getWorldPoint: (x: number, y: number) => ({ x, y }),
        },
      },
      exposeGameState: () => gs,
      onCampPlaced: vi.fn(),
      refreshViews: vi.fn(),
    };
    const service = new CampPlacementService(gs, () => 'red-1');
    new PlacementController(
      scene as unknown as BattleScene,
      bridge,
      service,
    );

    inputHandlers.get('pointerdown')!({
      x: 300,
      y: 300,
      leftButtonDown: () => true,
    });

    expect(scene.onCampPlaced).toHaveBeenCalledWith(gs.getCamp('red-1'));
  });
});
