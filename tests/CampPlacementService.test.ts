import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_BATTLE } from '../src/config/aiBattle';
import { GameState } from '../src/game/GameState';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';
import { EconomySystem } from '../src/game/managers/EconomySystem';
import { PlacementController } from '../src/game/managers/PlacementController';
import type { BattleScene } from '../src/game/BattleScene';
import { UiBridge } from '../src/ui/UiBridge';

vi.mock('phaser', () => ({ default: {} }));

describe('CampPlacementService', () => {
  let gs: GameState;
  let nextId: number;
  let service: CampPlacementService;

  beforeEach(() => {
    gs = new GameState();
    nextId = 1;
    service = new CampPlacementService(gs, () => `camp-${nextId++}`);
  });

  it('keeps sandbox placement free and unrestricted except for minimum distance', () => {
    const result = service.place({
      actor: 'player', faction: 'blue', kind: 'sword', x: -100, y: -100,
    });

    expect(result.ok).toBe(true);
    expect(gs.getCamp('camp-1')?.paidCost).toBe(0);
    expect(gs.economy.resources).toEqual({ red: 0, blue: 0 });
    expect(service.place({
      actor: 'ai', faction: 'red', kind: 'archer', x: -120, y: -100,
    })).toEqual({ ok: false, reason: 'tooClose' });
  });

  it('allows player red and AI blue but rejects the opposite factions in AI battle', () => {
    EconomySystem.enterAiBattle(gs);

    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    }).ok).toBe(true);
    const beforeUnauthorized = { ...gs.economy.resources };
    expect(service.place({
      actor: 'player', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    })).toEqual({ ok: false, reason: 'unauthorizedFaction' });
    expect(service.place({
      actor: 'ai', faction: 'red', kind: 'sword', x: 500, y: 300,
    })).toEqual({ ok: false, reason: 'unauthorizedFaction' });
    expect(gs.economy.resources).toEqual(beforeUnauthorized);
    expect(service.place({
      actor: 'ai', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    }).ok).toBe(true);
  });

  it('checks minimum distance before faction authorization and does not spend', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    });
    const before = { ...gs.economy.resources };

    expect(service.place({
      actor: 'player', faction: 'blue', kind: 'archer', x: 320, y: 300,
    })).toEqual({ ok: false, reason: 'tooClose' });
    expect(gs.economy.resources).toEqual(before);
  });

  it('rejects battlefield edges and wrong halves without spending', () => {
    EconomySystem.enterAiBattle(gs);
    const before = gs.economy.resources.red;

    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 10, y: 10,
    })).toEqual({ ok: false, reason: 'outsideBattlefield' });
    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 1000, y: 300,
    })).toEqual({ ok: false, reason: 'wrongHalf' });
    expect(gs.economy.resources.red).toBe(before);
  });

  it('deducts the configured price and creates a complete camp with paidCost', () => {
    EconomySystem.enterAiBattle(gs);

    const result = service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });

    expect(result).toEqual({
      ok: true,
      camp: {
        id: 'camp-1',
        faction: 'red',
        kind: 'archer',
        x: 300,
        y: 300,
        hp: 450,
        maxHp: 450,
        spawnTimer: 0,
        upgrades: { production: 1, health: 1, weapon: 1 },
        aliveUnits: 0,
        destroyed: false,
        paidCost: AI_BATTLE.prices.archer,
      },
    });
    expect(gs.economy.resources.red).toBe(210);
  });

  it('rejects insufficient resources without creating a camp or spending', () => {
    EconomySystem.enterAiBattle(gs);
    gs.economy.resources.red = AI_BATTLE.prices.sword - 1;

    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    })).toEqual({ ok: false, reason: 'insufficientResources' });
    expect(gs.economy.resources.red).toBe(AI_BATTLE.prices.sword - 1);
    expect(gs.allCamps()).toEqual([]);
  });

  it('returns false when removing a missing camp', () => {
    expect(service.remove('player', 'missing')).toBe(false);
  });

  it('refunds half of a paid red camp when the player removes it', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });

    expect(service.remove('player', 'camp-1')).toBe(true);
    expect(gs.economy.resources.red).toBe(270);
    expect(gs.getCamp('camp-1')).toBeUndefined();
  });

  it('does not let the player remove a blue camp', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'ai', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    });
    const before = gs.economy.resources.blue;

    expect(service.remove('player', 'camp-1')).toBe(false);
    expect(gs.economy.resources.blue).toBe(before);
    expect(gs.getCamp('camp-1')).toBeDefined();
  });

  it('does not refund a destroyed paid camp', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });
    gs.getCamp('camp-1')!.destroyed = true;
    const before = gs.economy.resources.red;

    expect(service.remove('player', 'camp-1')).toBe(true);
    expect(gs.economy.resources.red).toBe(before);
  });

  it('does not refund sandbox camps', () => {
    gs.economy.resources.red = 50;
    service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    });

    expect(service.remove('player', 'camp-1')).toBe(true);
    expect(gs.economy.resources.red).toBe(50);
  });

  it('does not refund when AI removes its paid camp', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'ai', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    });
    const before = { ...gs.economy.resources };

    expect(service.remove('ai', 'camp-1')).toBe(true);
    expect(gs.economy.resources).toEqual(before);
  });
});

function makeScene(gs: GameState) {
  const inputHandlers = new Map<string, (pointer: any) => void>();
  const canvasHandlers = new Map<string, (event: any) => void>();
  const preview: any = {
    visible: false,
    setStrokeStyle: vi.fn(() => preview),
    setVisible: vi.fn((visible: boolean) => {
      preview.visible = visible;
      return preview;
    }),
    setPosition: vi.fn(() => preview),
    setFillStyle: vi.fn(() => preview),
  };
  const scene = {
    add: { circle: vi.fn(() => preview) },
    input: {
      on: vi.fn((event: string, cb: (pointer: any) => void) => {
        inputHandlers.set(event, cb);
      }),
    },
    game: {
      canvas: {
        width: 1600,
        height: 900,
        addEventListener: vi.fn((event: string, cb: (event: any) => void) => {
          canvasHandlers.set(event, cb);
        }),
        getBoundingClientRect: () => ({
          left: 0, top: 0, width: 1600, height: 900,
        }),
      },
    },
    cameras: {
      main: {
        getWorldPoint: (x: number, y: number) => ({ x, y }),
      },
    },
    exposeGameState: () => gs,
    refreshViews: vi.fn(),
  };
  return {
    scene: scene as unknown as BattleScene,
    inputHandlers,
    canvasHandlers,
    preview,
  };
}

describe('PlacementController shared service integration', () => {
  it('uses service validation for preview and service placement for clicks', () => {
    const gs = new GameState();
    const bridge = new UiBridge();
    bridge.selectCampKind('sword');
    const service = new CampPlacementService(gs, () => 'clicked-camp');
    const validate = vi.spyOn(service, 'validate');
    const place = vi.spyOn(service, 'place');
    const { scene, inputHandlers } = makeScene(gs);
    new PlacementController(scene, bridge, service);

    inputHandlers.get('pointermove')!({ x: 300, y: 300 });
    expect(validate).toHaveBeenCalledWith({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    });

    inputHandlers.get('pointerdown')!({
      x: 300, y: 300, leftButtonDown: () => true,
    });
    expect(place).toHaveBeenCalledWith({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    });
    expect(gs.getCamp('clicked-camp')).toBeDefined();
  });

  it('routes drag-drop through the service and reports placement failures', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);
    const bridge = new UiBridge();
    bridge.selectFaction('blue');
    bridge.selectCampKind('sword');
    const service = new CampPlacementService(gs, () => 'drop-camp');
    const place = vi.spyOn(service, 'place');
    const { scene, inputHandlers, canvasHandlers } = makeScene(gs);
    new PlacementController(scene, bridge, service);

    inputHandlers.get('pointerdown')!({
      x: 1200, y: 300, leftButtonDown: () => true,
    });
    expect(bridge.getPlacementFailure()).toBe('unauthorizedFaction');

    canvasHandlers.get('drop')!({
      preventDefault: vi.fn(),
      clientX: 1200,
      clientY: 300,
      dataTransfer: {
        getData: (type: string) => type.endsWith('faction') ? 'blue' : 'sword',
      },
    });
    expect(place).toHaveBeenLastCalledWith({
      actor: 'player', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    });
  });
});

describe('UiBridge placement failure state', () => {
  it('reports, reads, and clears the last placement failure', () => {
    const bridge = new UiBridge();
    const changed = vi.fn();
    bridge.on('placementChanged', changed);

    bridge.reportPlacementFailure('wrongHalf');
    expect(bridge.getPlacementFailure()).toBe('wrongHalf');
    expect(changed).toHaveBeenCalledTimes(1);

    bridge.clearPlacementFailure();
    expect(bridge.getPlacementFailure()).toBeNull();
  });
});
