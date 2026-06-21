import { describe, expect, it, vi } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';
import { GameState } from '../src/game/GameState';
import type { BattleScene } from '../src/game/BattleScene';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';
import { PlacementController } from '../src/game/managers/PlacementController';
import type { GameMode } from '../src/game/types';
import {
  economySignature,
  hasLivingCamp,
  prepareAiBattleStartup,
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

  it('prepares startup deployment for an existing red camp only', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    const deployInitialCamp = vi.fn(() => true);

    expect(prepareAiBattleStartup(gs, deployInitialCamp)).toEqual({
      attempted: true,
      started: true,
      notice: null,
    });
    expect(deployInitialCamp).toHaveBeenCalledOnce();
    expect(gs.sim.running).toBe(true);
  });

  it('keeps startup paused and reports a failed initial deployment', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));

    expect(prepareAiBattleStartup(gs, () => false)).toEqual({
      attempted: true,
      started: false,
      notice: '蓝方建造区没有合法位置，AI 对战暂未开始',
    });
    expect(gs.sim.running).toBe(false);
  });

  it('does not deploy when a living blue camp already exists', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.addCamp(mkCamp({ id: 'red-1', faction: 'red' }));
    gs.addCamp(mkCamp({ id: 'blue-1', faction: 'blue' }));
    const deployInitialCamp = vi.fn(() => true);

    expect(prepareAiBattleStartup(gs, deployInitialCamp)).toEqual({
      attempted: false,
      started: false,
      notice: null,
    });
    expect(deployInitialCamp).not.toHaveBeenCalled();
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
  it('emits mode, economy, and sim events on first initialization', () => {
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
    expect(changed.economy).toHaveBeenCalledOnce();
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

  it('clears selection and emits refund events after player deletion succeeds', () => {
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
    expect(economyChanged).toHaveBeenCalledOnce();
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
