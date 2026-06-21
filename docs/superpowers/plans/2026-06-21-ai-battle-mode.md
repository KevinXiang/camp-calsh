# AI Battle Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a switchable AI battle mode where the player controls red, a rule-based AI controls blue, and both sides build camps through the same simulated-time resource economy.

**Architecture:** Extend `GameState` with persistent mode/economy/AI state, then add focused `EconomySystem`, `CampPlacementService`, and `AiController` modules. `BattleScene` coordinates those systems in the fixed-step loop, while the existing UI reads and changes mode through `UiBridge`; sandbox behavior remains free-form and backward compatible.

**Tech Stack:** TypeScript 5.4, Phaser 3.80, Vite 5.2, Vitest 1.6

---

## File map

### New files

- `src/config/aiBattle.ts` — battlefield bounds, prices, economy rate, refund rate, AI timing.
- `src/game/managers/EconomySystem.ts` — initialize, grow, spend, and refund resources.
- `src/game/managers/CampPlacementService.ts` — shared player/AI placement and deletion rules.
- `src/game/ai/aiStrategy.ts` — pure, deterministic camp-kind scoring.
- `src/game/ai/AiController.ts` — target persistence, candidate position scoring, and AI placement.
- `tests/EconomySystem.test.ts` — economy behavior.
- `tests/CampPlacementService.test.ts` — shared placement/deletion behavior.
- `tests/aiStrategy.test.ts` — rule-based composition and counter selection.
- `tests/AiController.test.ts` — startup, saving, placement, and no-space behavior.
- `tests/aiBattle-mode.test.ts` — mode transition state rules.

### Modified files

- `src/game/types.ts` — add `GameMode` and optional `Camp.paidCost`.
- `src/game/GameState.ts` — persist mode, economy, and AI state.
- `src/ui/UiBridge.ts` — expose mode changes, resource notifications, and protected deletion.
- `src/game/managers/PlacementController.ts` — delegate all camp creation to the shared service.
- `src/game/BattleScene.ts` — wire economy/AI into fixed steps and draw battlefield guides.
- `src/ui/BuildPanel.ts` — prices, red-only control, AI-controlled blue panel, fixed multipliers.
- `src/ui/ControlBar.ts` — mode toggle.
- `src/ui/HudController.ts` — mode and resource display.
- `src/ui/ui.css` — AI-disabled and resource UI states.
- `tests/test-helpers.ts` — shared fixtures explicitly mark newly created test camps as unpaid.

### Task 1: Add AI battle configuration and persistent state

**Files:**
- Create: `src/config/aiBattle.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/GameState.ts`
- Test: `tests/GameState.test.ts`
- Test: `tests/aiBattle-mode.test.ts`

- [ ] **Step 1: Write failing state tests**

Append tests that define the default state and first-entry initialization contract:

```ts
import { AI_BATTLE } from '../src/config/aiBattle';

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
    failedPlacements: 0,
  });
});

it('legacy camps without paidCost are treated as unpaid', () => {
  const camp = makeCamp('legacy');
  expect(camp.paidCost ?? 0).toBe(0);
});

it('AI battle configuration encodes the approved fast economy', () => {
  expect(AI_BATTLE.initialResources).toBe(330);
  expect(AI_BATTLE.resourcePerSecond).toBe(10);
  expect(AI_BATTLE.refundRatio).toBe(0.5);
  expect(AI_BATTLE.prices.artillery).toBe(240);
  expect(AI_BATTLE.battlefield.midX).toBe(800);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npx vitest run tests/GameState.test.ts tests/aiBattle-mode.test.ts
```

Expected: FAIL because `AI_BATTLE`, `mode`, `economy`, and `ai` do not exist.

- [ ] **Step 3: Add the configuration and state types**

Create `src/config/aiBattle.ts`:

```ts
import type { CampKind } from '../game/types';

export const AI_BATTLE = {
  initialResources: 330,
  resourcePerSecond: 10,
  refundRatio: 0.5,
  decisionInterval: 2,
  maxPlacementFailures: 3,
  candidateCount: 24,
  battlefield: {
    minX: 0,
    maxX: 1600,
    minY: 0,
    maxY: 900,
    midX: 800,
    edgeMargin: 48,
  },
  prices: {
    sword: 100,
    shield: 110,
    archer: 120,
    javelin: 160,
    bomb: 180,
    medic: 200,
    artillery: 240,
  } satisfies Record<CampKind, number>,
} as const;
```

Add to `src/game/types.ts`:

```ts
export type GameMode = 'sandbox' | 'aiBattle';

// Add this field at the end of the existing Camp interface.
// Missing means the camp predates the economy and is equivalent to zero.
paidCost?: number;
```

Add to `src/game/GameState.ts`:

```ts
import type { Camp, Unit, Projectile, SideStats, GameMode, CampKind } from './types';

export interface EconomyState {
  initialized: boolean;
  resources: { red: number; blue: number };
}

export interface AiState {
  decisionCooldown: number;
  targetKind: CampKind | null;
  targetRedSignature: string;
  failedPlacements: number;
}

export class GameState {
  mode: GameMode = 'sandbox';
  economy: EconomyState = {
    initialized: false,
    resources: { red: 0, blue: 0 },
  };
  ai: AiState = {
    decisionCooldown: 0,
    targetKind: null,
    targetRedSignature: '',
    failedPlacements: 0,
  };
}
```

Insert these three fields at the top of the existing `GameState` class; retain its existing `camps`, `units`, `projectiles`, `events`, `sim`, and `stats` fields unchanged.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/GameState.test.ts tests/aiBattle-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the build to catch fixture/type regressions**

Run:

```bash
npm run build
```

Expected: PASS. `paidCost` is optional so existing camp literals remain valid and mean “unpaid legacy camp.”

- [ ] **Step 6: Commit**

```bash
git add src/config/aiBattle.ts src/game/types.ts src/game/GameState.ts tests/GameState.test.ts tests/aiBattle-mode.test.ts
git commit -m "feat(ai): add battle mode state and configuration"
```

### Task 2: Implement the simulated-time economy

**Files:**
- Create: `src/game/managers/EconomySystem.ts`
- Create: `tests/EconomySystem.test.ts`

- [ ] **Step 1: Write failing economy tests**

Create `tests/EconomySystem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState';
import { EconomySystem } from '../src/game/managers/EconomySystem';
import { AI_BATTLE } from '../src/config/aiBattle';

describe('EconomySystem', () => {
  it('initializes both sides once', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);
    EconomySystem.enterAiBattle(gs);
    expect(gs.economy.resources).toEqual({
      red: AI_BATTLE.initialResources,
      blue: AI_BATTLE.initialResources,
    });
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
    expect(gs.economy.resources.red).toBe(330);
  });

  it('spends atomically and rejects insufficient balance', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);
    expect(EconomySystem.trySpend(gs, 'red', 240)).toBe(true);
    expect(EconomySystem.trySpend(gs, 'red', 100)).toBe(false);
    expect(gs.economy.resources.red).toBe(90);
  });

  it('refunds half of paid cost and nothing for legacy camps', () => {
    const gs = new GameState();
    EconomySystem.enterAiBattle(gs);
    EconomySystem.refundCamp(gs, 'red', 120);
    EconomySystem.refundCamp(gs, 'red', 0);
    expect(gs.economy.resources.red).toBe(390);
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npx vitest run tests/EconomySystem.test.ts
```

Expected: FAIL because `EconomySystem` does not exist.

- [ ] **Step 3: Implement the minimum economy system**

Create `src/game/managers/EconomySystem.ts`:

```ts
import { AI_BATTLE } from '../../config/aiBattle';
import type { Faction } from '../types';
import type { GameState } from '../GameState';

export class EconomySystem {
  static enterAiBattle(gs: GameState): void {
    gs.mode = 'aiBattle';
    gs.sim.spawnMultiplier.red = 1;
    gs.sim.spawnMultiplier.blue = 1;
    if (gs.economy.initialized) return;
    gs.economy.initialized = true;
    gs.economy.resources.red = AI_BATTLE.initialResources;
    gs.economy.resources.blue = AI_BATTLE.initialResources;
  }

  static step(gs: GameState, dt: number, gameOver: boolean): void {
    if (gs.mode !== 'aiBattle' || !gs.sim.running || gameOver) return;
    const gain = AI_BATTLE.resourcePerSecond * dt;
    gs.economy.resources.red += gain;
    gs.economy.resources.blue += gain;
  }

  static canAfford(gs: GameState, faction: Faction, cost: number): boolean {
    return gs.economy.resources[faction] >= cost;
  }

  static trySpend(gs: GameState, faction: Faction, cost: number): boolean {
    if (!this.canAfford(gs, faction, cost)) return false;
    gs.economy.resources[faction] -= cost;
    return true;
  }

  static refundCamp(gs: GameState, faction: Faction, paidCost: number): void {
    if (paidCost <= 0) return;
    gs.economy.resources[faction] += paidCost * AI_BATTLE.refundRatio;
  }
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/EconomySystem.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/managers/EconomySystem.ts tests/EconomySystem.test.ts
git commit -m "feat(ai): add simulated-time resource economy"
```

### Task 3: Route player and AI construction through one placement service

**Files:**
- Create: `src/game/managers/CampPlacementService.ts`
- Create: `tests/CampPlacementService.test.ts`
- Modify: `src/game/managers/PlacementController.ts`
- Modify: `src/ui/UiBridge.ts`

- [ ] **Step 1: Write failing placement and deletion tests**

Create `tests/CampPlacementService.test.ts` with a deterministic ID factory:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState';
import { EconomySystem } from '../src/game/managers/EconomySystem';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';

describe('CampPlacementService', () => {
  let gs: GameState;
  let service: CampPlacementService;

  beforeEach(() => {
    gs = new GameState();
    service = new CampPlacementService(gs, () => 'camp-id');
  });

  it('keeps sandbox placement free and unrestricted by faction half', () => {
    const result = service.place({
      actor: 'player', faction: 'blue', kind: 'sword', x: 100, y: 100,
    });
    expect(result.ok).toBe(true);
    expect(gs.getCamp('camp-id')?.paidCost).toBe(0);
  });

  it('allows player red only on the left and AI blue only on the right', () => {
    EconomySystem.enterAiBattle(gs);
    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 300, y: 300,
    }).ok).toBe(true);
    expect(service.place({
      actor: 'player', faction: 'blue', kind: 'sword', x: 1200, y: 300,
    })).toEqual({ ok: false, reason: 'unauthorizedFaction' });
  });

  it('rejects wrong half, battlefield edge, and minimum-distance violations without spending', () => {
    EconomySystem.enterAiBattle(gs);
    const before = gs.economy.resources.red;
    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 1000, y: 300,
    })).toEqual({ ok: false, reason: 'wrongHalf' });
    expect(service.place({
      actor: 'player', faction: 'red', kind: 'sword', x: 10, y: 10,
    })).toEqual({ ok: false, reason: 'outsideBattlefield' });
    expect(gs.economy.resources.red).toBe(before);
  });

  it('records paidCost and deducts the configured price on success', () => {
    EconomySystem.enterAiBattle(gs);
    const result = service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });
    expect(result.ok).toBe(true);
    expect(gs.getCamp('camp-id')?.paidCost).toBe(120);
    expect(gs.economy.resources.red).toBe(210);
  });

  it('refunds only paid red camps and rejects player deletion of blue camps', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });
    expect(service.remove('player', 'camp-id')).toBe(true);
    expect(gs.economy.resources.red).toBe(270);

    const blue = new CampPlacementService(gs, () => 'blue-id');
    blue.place({ actor: 'ai', faction: 'blue', kind: 'sword', x: 1200, y: 300 });
    expect(blue.remove('player', 'blue-id')).toBe(false);
  });

  it('does not refund a camp that was destroyed by combat', () => {
    EconomySystem.enterAiBattle(gs);
    service.place({
      actor: 'player', faction: 'red', kind: 'archer', x: 300, y: 300,
    });
    gs.getCamp('camp-id')!.destroyed = true;
    const before = gs.economy.resources.red;
    expect(service.remove('player', 'camp-id')).toBe(true);
    expect(gs.economy.resources.red).toBe(before);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/CampPlacementService.test.ts
```

Expected: FAIL because `CampPlacementService` does not exist.

- [ ] **Step 3: Implement shared placement and removal**

Create `src/game/managers/CampPlacementService.ts`:

```ts
import { AI_BATTLE } from '../../config/aiBattle';
import { CAMP_DEFS, CAMP_MIN_DISTANCE } from '../../config/camps';
import { canPlaceCamp } from '../placement';
import type { Camp, CampKind, Faction } from '../types';
import type { GameState } from '../GameState';
import { EconomySystem } from './EconomySystem';

export type PlacementActor = 'player' | 'ai';
export type PlacementFailure =
  | 'unauthorizedFaction'
  | 'outsideBattlefield'
  | 'wrongHalf'
  | 'tooClose'
  | 'insufficientResources';
export type PlacementResult =
  | { ok: true; camp: Camp }
  | { ok: false; reason: PlacementFailure };

export interface PlacementRequest {
  actor: PlacementActor;
  faction: Faction;
  kind: CampKind;
  x: number;
  y: number;
}

export class CampPlacementService {
  constructor(
    private gs: GameState,
    private createId: () => string = () => crypto.randomUUID(),
  ) {}

  validate(request: PlacementRequest): PlacementFailure | null {
    if (!canPlaceCamp(this.gs.allCamps(), request.x, request.y, CAMP_MIN_DISTANCE)) {
      return 'tooClose';
    }
    if (this.gs.mode === 'sandbox') return null;
    if (
      (request.actor === 'player' && request.faction !== 'red') ||
      (request.actor === 'ai' && request.faction !== 'blue')
    ) return 'unauthorizedFaction';

    const b = AI_BATTLE.battlefield;
    if (
      request.x < b.minX + b.edgeMargin ||
      request.x > b.maxX - b.edgeMargin ||
      request.y < b.minY + b.edgeMargin ||
      request.y > b.maxY - b.edgeMargin
    ) return 'outsideBattlefield';
    if (
      (request.faction === 'red' && request.x >= b.midX) ||
      (request.faction === 'blue' && request.x <= b.midX)
    ) return 'wrongHalf';
    if (!EconomySystem.canAfford(this.gs, request.faction, AI_BATTLE.prices[request.kind])) {
      return 'insufficientResources';
    }
    return null;
  }

  place(request: PlacementRequest): PlacementResult {
    const failure = this.validate(request);
    if (failure) return { ok: false, reason: failure };
    const paidCost = this.gs.mode === 'aiBattle' ? AI_BATTLE.prices[request.kind] : 0;
    if (paidCost > 0 && !EconomySystem.trySpend(this.gs, request.faction, paidCost)) {
      return { ok: false, reason: 'insufficientResources' };
    }
    const def = CAMP_DEFS[request.kind];
    const camp: Camp = {
      id: this.createId(),
      faction: request.faction,
      kind: request.kind,
      x: request.x,
      y: request.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnTimer: 0,
      upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0,
      destroyed: false,
      paidCost,
    };
    this.gs.addCamp(camp);
    return { ok: true, camp };
  }

  remove(actor: PlacementActor, campId: string): boolean {
    const camp = this.gs.getCamp(campId);
    if (!camp) return false;
    if (this.gs.mode === 'aiBattle' && actor === 'player' && camp.faction !== 'red') return false;
    this.gs.removeCamp(campId);
    if (this.gs.mode === 'aiBattle' && actor === 'player' && !camp.destroyed) {
      EconomySystem.refundCamp(this.gs, camp.faction, camp.paidCost ?? 0);
    }
    return true;
  }
}
```

- [ ] **Step 4: Run placement tests**

Run:

```bash
npx vitest run tests/CampPlacementService.test.ts tests/placement.test.ts
```

Expected: PASS.

- [ ] **Step 5: Replace direct player camp creation**

Modify `PlacementController`:

Change the constructor signature to:

```ts
constructor(
  private scene: BattleScene,
  private bridge: UiBridge,
  placementService?: CampPlacementService,
) 
```

Add the property and assignment before the current preview/input initialization:

```ts
private placementService: CampPlacementService;

// First statement inside the constructor body:
  this.placementService =
    placementService ?? new CampPlacementService(scene.exposeGameState());
```

Replace the current `placeCamp` body with:

```ts
private placeCamp(x: number, y: number, faction: Faction, kind: CampKind): void {
  const result = this.placementService.place({
    actor: 'player', faction, kind, x, y,
  });
  if (!result.ok) {
    this.bridge.reportPlacementFailure(result.reason);
    return;
  }
  const gs = this.scene.exposeGameState();
  if (!gs.sim.running && this.bridge.getGameOver() === null) {
    const all = gs.allCamps();
    if (all.some(c => c.faction === 'red') && all.some(c => c.faction === 'blue')) {
      this.bridge.setRunning(true, gs);
    }
  }
  this.scene.refreshViews();
  this.preview.setVisible(false);
  this.bridge.selectCampKind(null);
}
```

Update preview validation to call `placementService.validate(...)` instead of only `canPlaceCamp`.

Add explicit placement feedback state to `UiBridge`:

```ts
private lastPlacementFailure: PlacementFailure | null = null;

reportPlacementFailure(reason: PlacementFailure): void {
  this.lastPlacementFailure = reason;
  this.emit('placementChanged');
}

getPlacementFailure(): PlacementFailure | null {
  return this.lastPlacementFailure;
}

clearPlacementFailure(): void {
  this.lastPlacementFailure = null;
}
```

Keep the existing deletion path unchanged until Task 6, where mode switching becomes reachable and deletion is routed through the same service.

- [ ] **Step 6: Build and run focused regressions**

Run:

```bash
npm run build
npx vitest run tests/CampPlacementService.test.ts tests/placement.test.ts tests/GameState.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/managers/CampPlacementService.ts src/game/managers/PlacementController.ts src/ui/UiBridge.ts tests/CampPlacementService.test.ts
git commit -m "feat(ai): unify player and AI camp placement"
```

### Task 4: Implement pure rule-based camp selection

**Files:**
- Create: `src/game/ai/aiStrategy.ts`
- Create: `tests/aiStrategy.test.ts`

- [ ] **Step 1: Write failing strategy tests**

Create `tests/aiStrategy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chooseAiCampKind } from '../src/game/ai/aiStrategy';
import { mkCamp } from './test-helpers';

describe('chooseAiCampKind', () => {
  it('builds frontline first when blue has no camps', () => {
    expect(chooseAiCampKind([], [mkCamp({ faction: 'red', kind: 'archer' })])).toBe('sword');
  });

  it('adds sustained ranged after frontline exists', () => {
    const blue = [mkCamp({ id: 'b1', faction: 'blue', kind: 'sword' })];
    expect(chooseAiCampKind(blue, [])).toBe('archer');
  });

  it('uses configured counter relationships after the basic structure exists', () => {
    const blue = [
      mkCamp({ id: 'b1', faction: 'blue', kind: 'sword' }),
      mkCamp({ id: 'b2', faction: 'blue', kind: 'archer' }),
      mkCamp({ id: 'b3', faction: 'blue', kind: 'medic' }),
    ];
    const red = [
      mkCamp({ id: 'r1', faction: 'red', kind: 'shield' }),
      mkCamp({ id: 'r2', faction: 'red', kind: 'shield' }),
    ];
    expect(chooseAiCampKind(blue, red)).toBe('bomb');
  });

  it('does not filter expensive targets by current balance', () => {
    const blue = [
      mkCamp({ id: 'b1', faction: 'blue', kind: 'sword' }),
      mkCamp({ id: 'b2', faction: 'blue', kind: 'archer' }),
      mkCamp({ id: 'b3', faction: 'blue', kind: 'medic' }),
    ];
    const red = [
      mkCamp({ id: 'r1', faction: 'red', kind: 'artillery' }),
      mkCamp({ id: 'r2', faction: 'red', kind: 'artillery' }),
    ];
    expect(chooseAiCampKind(blue, red)).toBe('javelin');
  });
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx vitest run tests/aiStrategy.test.ts
```

Expected: FAIL because `chooseAiCampKind` does not exist.

- [ ] **Step 3: Implement deterministic scoring**

Create `src/game/ai/aiStrategy.ts`:

```ts
import { CAMP_ROLE_DEFS } from '../../config/campRoles';
import type { Camp, CampKind } from '../types';

const ORDER: CampKind[] = [
  'sword', 'shield', 'archer', 'javelin', 'bomb', 'medic', 'artillery',
];
const FRONTLINE = new Set<CampKind>(['sword', 'shield']);
const SUSTAINED_RANGED = new Set<CampKind>(['archer']);
const SUPPORT_OR_SPECIAL = new Set<CampKind>(['javelin', 'bomb', 'medic', 'artillery']);

function aliveKinds(camps: Camp[]): CampKind[] {
  return camps.filter(c => !c.destroyed).map(c => c.kind);
}

export function chooseAiCampKind(blueCamps: Camp[], redCamps: Camp[]): CampKind {
  const blueKinds = aliveKinds(blueCamps);
  if (!blueKinds.some(kind => FRONTLINE.has(kind))) return 'sword';
  if (!blueKinds.some(kind => SUSTAINED_RANGED.has(kind))) return 'archer';
  if (blueKinds.length >= 2 && !blueKinds.some(kind => SUPPORT_OR_SPECIAL.has(kind))) {
    return 'medic';
  }

  let best = ORDER[0];
  let bestScore = -Infinity;
  for (const candidate of ORDER) {
    const role = CAMP_ROLE_DEFS[candidate];
    let score = -blueKinds.filter(kind => kind === candidate).length * 4;
    const redCounts = new Map<CampKind, number>();
    for (const red of redCamps) {
      if (red.destroyed) continue;
      redCounts.set(red.kind, (redCounts.get(red.kind) ?? 0) + 1);
      if (role.bestAgainst.includes(red.kind)) score += 12;
      if (role.weakAgainst.includes(red.kind)) score -= 8;
    }
    if (role.role === 'aoe-ranged' && Math.max(0, ...redCounts.values()) >= 2) {
      score += 6;
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run strategy tests**

Run:

```bash
npx vitest run tests/aiStrategy.test.ts
```

Expected: PASS. If a test reveals that the existing role metadata produces a different correct counter, adjust only the explicit score weights or expected configured counter; do not hard-code red compositions.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/aiStrategy.ts tests/aiStrategy.test.ts
git commit -m "feat(ai): add rule-based camp selection"
```

### Task 5: Implement AI saving, startup deployment, and position selection

**Files:**
- Create: `src/game/ai/AiController.ts`
- Create: `tests/AiController.test.ts`

- [ ] **Step 1: Write failing controller tests**

Use injected randomness and ID generation:

```ts
import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState';
import { EconomySystem } from '../src/game/managers/EconomySystem';
import { CampPlacementService } from '../src/game/managers/CampPlacementService';
import { AiController } from '../src/game/ai/AiController';
import { mkCamp } from './test-helpers';

function setup() {
  const gs = new GameState();
  EconomySystem.enterAiBattle(gs);
  gs.sim.running = true;
  const service = new CampPlacementService(gs, () => `c${gs.camps.size + 1}`);
  const ai = new AiController(gs, service, () => 0.5);
  return { gs, ai };
}

describe('AiController', () => {
  it('does nothing before red owns a living camp', () => {
    const { gs, ai } = setup();
    expect(ai.step(10, false)).toBe(false);
    expect(gs.camps.size).toBe(0);
  });

  it('can perform startup deployment while simulation is paused', () => {
    const { gs, ai } = setup();
    gs.sim.running = false;
    gs.addCamp(mkCamp({ id: 'r1', x: 300, y: 300, paidCost: 0 }));
    expect(ai.deployInitialCamp()).toBe(true);
    expect([...gs.camps.values()].some(c => c.faction === 'blue')).toBe(true);
  });

  it('keeps an expensive target while saving', () => {
    const { gs, ai } = setup();
    gs.addCamp(mkCamp({ id: 'r1', kind: 'artillery', x: 300, y: 300 }));
    gs.addCamp(mkCamp({ id: 'r2', kind: 'artillery', x: 500, y: 300 }));
    gs.addCamp(mkCamp({ id: 'b1', faction: 'blue', kind: 'sword', x: 1100, y: 300 }));
    gs.addCamp(mkCamp({ id: 'b2', faction: 'blue', kind: 'archer', x: 1300, y: 300 }));
    gs.addCamp(mkCamp({ id: 'b3', faction: 'blue', kind: 'medic', x: 1100, y: 500 }));
    gs.economy.resources.blue = 0;
    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('javelin');
    expect(gs.camps.size).toBe(5);
  });

  it('re-evaluates a saved target when the red composition changes', () => {
    const { gs, ai } = setup();
    gs.addCamp(mkCamp({ id: 'b1', faction: 'blue', kind: 'sword', x: 1100, y: 300 }));
    gs.addCamp(mkCamp({ id: 'b2', faction: 'blue', kind: 'archer', x: 1300, y: 300 }));
    gs.addCamp(mkCamp({ id: 'b3', faction: 'blue', kind: 'medic', x: 1100, y: 500 }));
    gs.addCamp(mkCamp({ id: 'r1', kind: 'artillery', x: 300, y: 300 }));
    gs.addCamp(mkCamp({ id: 'r2', kind: 'artillery', x: 500, y: 300 }));
    gs.economy.resources.blue = 0;
    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('javelin');

    gs.removeCamp('r1');
    gs.removeCamp('r2');
    gs.addCamp(mkCamp({ id: 'r3', kind: 'shield', x: 300, y: 300 }));
    gs.addCamp(mkCamp({ id: 'r4', kind: 'shield', x: 500, y: 300 }));
    gs.ai.decisionCooldown = 0;
    ai.step(2, false);
    expect(gs.ai.targetKind).toBe('bomb');
  });

  it('does not spend when no candidate position is valid', () => {
    const { gs, ai } = setup();
    gs.addCamp(mkCamp({ id: 'r1', x: 300, y: 300 }));
    for (let x = 880; x <= 1520; x += 90) {
      for (let y = 80; y <= 820; y += 90) {
        gs.addCamp(mkCamp({ id: `block-${x}-${y}`, faction: 'blue', x, y }));
      }
    }
    const before = gs.economy.resources.blue;
    ai.step(2, false);
    expect(gs.economy.resources.blue).toBe(before);
  });
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx vitest run tests/AiController.test.ts
```

Expected: FAIL because `AiController` does not exist.

- [ ] **Step 3: Implement the controller**

Create `src/game/ai/AiController.ts`:

```ts
import { AI_BATTLE } from '../../config/aiBattle';
import type { GameState } from '../GameState';
import type { Camp, CampKind } from '../types';
import { EconomySystem } from '../managers/EconomySystem';
import {
  CampPlacementService,
  type PlacementRequest,
} from '../managers/CampPlacementService';
import { chooseAiCampKind } from './aiStrategy';

const FRONTLINE = new Set<CampKind>(['sword', 'shield']);
const BACKLINE = new Set<CampKind>(['medic', 'artillery']);

export class AiController {
  constructor(
    private gs: GameState,
    private placement: CampPlacementService,
    private random: () => number = Math.random,
  ) {}

  deployInitialCamp(): boolean {
    if (this.gs.mode !== 'aiBattle' || !this.hasLivingRedCamp()) return false;
    this.gs.ai.decisionCooldown = 0;
    return this.tryBuild();
  }

  step(dt: number, gameOver: boolean): boolean {
    if (
      this.gs.mode !== 'aiBattle' ||
      !this.gs.sim.running ||
      gameOver ||
      !this.hasLivingRedCamp()
    ) return false;
    this.gs.ai.decisionCooldown -= dt;
    if (this.gs.ai.decisionCooldown > 0) return false;
    this.gs.ai.decisionCooldown = AI_BATTLE.decisionInterval;
    return this.tryBuild();
  }

  private preferredX(kind: CampKind): number {
    const b = AI_BATTLE.battlefield;
  if (FRONTLINE.has(kind)) return b.midX + 160;
  if (BACKLINE.has(kind)) return b.maxX - 180;
  return b.midX + (b.maxX - b.midX) * 0.55;
}

  private scorePosition(kind: CampKind, x: number): number {
    return -Math.abs(x - this.preferredX(kind));
  }

  private hasLivingRedCamp(): boolean {
    return this.gs.allCamps().some(c => c.faction === 'red' && !c.destroyed);
  }

  private tryBuild(): boolean {
    const blue = this.gs.allCamps().filter(c => c.faction === 'blue');
    const red = this.gs.allCamps().filter(c => c.faction === 'red');
    const redSignature = this.redSignature(red);
    if (this.gs.ai.targetRedSignature !== redSignature) {
      this.gs.ai.targetKind = null;
    }
    const kind = this.gs.ai.targetKind ?? chooseAiCampKind(blue, red);
    this.gs.ai.targetKind = kind;
    this.gs.ai.targetRedSignature = redSignature;

    if (!EconomySystem.canAfford(this.gs, 'blue', AI_BATTLE.prices[kind])) {
      return false;
    }

    const candidates = this.candidates(kind)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (candidates.length === 0) {
      this.recordPlacementFailure();
      return false;
    }

    const chosen = candidates[Math.floor(this.random() * candidates.length)];
    const result = this.placement.place(chosen.request);
    if (!result.ok) {
      this.recordPlacementFailure();
      return false;
    }
    this.gs.ai.targetKind = null;
    this.gs.ai.targetRedSignature = '';
    this.gs.ai.failedPlacements = 0;
    return true;
  }

  private candidates(kind: CampKind): Array<{
    request: PlacementRequest;
    score: number;
  }> {
    const b = AI_BATTLE.battlefield;
    const minX = b.midX + b.edgeMargin;
    const maxX = b.maxX - b.edgeMargin;
    const minY = b.minY + b.edgeMargin;
    const maxY = b.maxY - b.edgeMargin;
    const result: Array<{ request: PlacementRequest; score: number }> = [];

    for (let i = 0; i < AI_BATTLE.candidateCount; i++) {
      const x = minX + this.random() * (maxX - minX);
      const y = minY + this.random() * (maxY - minY);
      const request: PlacementRequest = {
        actor: 'ai',
        faction: 'blue',
        kind,
        x,
        y,
      };
      if (this.placement.validate(request) !== null) continue;
      result.push({ request, score: this.scorePosition(kind, x) });
    }
    return result;
  }

  private recordPlacementFailure(): void {
    this.gs.ai.failedPlacements++;
    if (this.gs.ai.failedPlacements < AI_BATTLE.maxPlacementFailures) return;
    this.gs.ai.targetKind = null;
    this.gs.ai.targetRedSignature = '';
    this.gs.ai.failedPlacements = 0;
  }

  private redSignature(redCamps: Camp[]): string {
    return redCamps
      .filter(c => !c.destroyed)
      .map(c => c.kind)
      .sort()
      .join('|');
  }
}
```

- [ ] **Step 4: Run controller and strategy tests**

Run:

```bash
npx vitest run tests/AiController.test.ts tests/aiStrategy.test.ts tests/CampPlacementService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai/AiController.ts tests/AiController.test.ts
git commit -m "feat(ai): add blue camp construction controller"
```

### Task 6: Integrate mode transitions and fixed-step systems into BattleScene

**Files:**
- Modify: `src/ui/UiBridge.ts`
- Modify: `src/game/BattleScene.ts`
- Modify: `src/game/managers/PlacementController.ts`
- Test: `tests/aiBattle-mode.test.ts`

- [ ] **Step 1: Add failing mode-transition tests**

Create bridge-independent tests around exported transition helpers in `UiBridge.ts` or a small exported `setGameMode` function:

```ts
import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState';
import { setGameMode } from '../src/ui/UiBridge';

describe('AI battle mode transitions', () => {
  it('initializes once, fixes spawn multipliers, and preserves balances', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.economy.resources.red = 123;
    setGameMode(gs, 'sandbox');
    setGameMode(gs, 'aiBattle');
    expect(gs.economy.resources.red).toBe(123);
    expect(gs.sim.spawnMultiplier).toEqual({ red: 1, blue: 1 });
  });

  it('freezes mode state without clearing AI progress when returning to sandbox', () => {
    const gs = new GameState();
    setGameMode(gs, 'aiBattle');
    gs.ai.targetKind = 'artillery';
    setGameMode(gs, 'sandbox');
    expect(gs.mode).toBe('sandbox');
    expect(gs.ai.targetKind).toBe('artillery');
  });
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx vitest run tests/aiBattle-mode.test.ts
```

Expected: FAIL because `setGameMode` is missing.

- [ ] **Step 3: Implement transition API in UiBridge**

Add:

```ts
export function setGameMode(gs: GameState, mode: GameMode): void {
  if (mode === 'aiBattle') EconomySystem.enterAiBattle(gs);
  else gs.mode = 'sandbox';
}
```

Extend bridge events:

```ts
type EventName =
  | 'placementChanged'
  | 'selectionChanged'
  | 'simChanged'
  | 'statsChanged'
  | 'gameOver'
  | 'hoverChanged'
  | 'modeChanged'
  | 'economyChanged'
  | 'noticeChanged';
```

Add:

```ts
setMode(mode: GameMode, gs: GameState): void {
  setGameMode(gs, mode);
  if (mode === 'aiBattle' && this.selection.faction === 'blue') {
    this.selection = { faction: 'red', kind: null };
    this.emit('placementChanged');
  }
  this.emit('modeChanged');
  this.emit('economyChanged');
  this.emit('simChanged');
}

setNotice(message: string | null): void {
  this.notice = message;
  this.emit('noticeChanged');
}

getNotice(): string | null {
  return this.notice;
}
```

Add `private notice: string | null = null;` and initialize listener sets for `modeChanged`, `economyChanged`, and `noticeChanged`.

- [ ] **Step 4: Wire systems into BattleScene**

In `create()` instantiate one shared placement service and AI controller:

```ts
this.placementService = new CampPlacementService(this.gameState);
this.placement = new PlacementController(this, this.bridge, this.placementService);
this.aiController = new AiController(this.gameState, this.placementService);
this.bridge.on('modeChanged', () => this.handleModeChanged());
```

In each fixed step:

```ts
for (let i = 0; i < steps; i++) {
  const gameOver = this.bridge.getGameOver() !== null;
  EconomySystem.step(this.gameState, dt, gameOver);
  this.aiController.step(dt, gameOver);
  this.campManager.step(dt);
  this.unitManager.step(dt);
  CombatSystem.step(this.gameState, dt);
  this.gameState.sim.timeMs += dt * 1000;
}
```

Emit `economyChanged` only when rounded resource values change, using a cached signature like the existing stats signature.

Add public scene methods:

```ts
onCampPlaced(camp: Camp): void {
  if (
    this.gameState.mode === 'aiBattle' &&
    camp.faction === 'red' &&
    !this.hasLivingCamp('blue')
  ) {
    const deployed = this.aiController.deployInitialCamp();
    if (deployed) {
      this.bridge.setNotice(null);
      this.bridge.setRunning(true, this.gameState);
    } else {
      this.bridge.setNotice('蓝方建造区没有合法位置，AI 对战暂未开始');
    }
  } else if (!this.gameState.sim.running && this.hasLivingCamp('red') && this.hasLivingCamp('blue')) {
    this.bridge.setRunning(true, this.gameState);
  }
}

removeCampByPlayer(id: string): boolean {
  const removed = this.placementService.remove('player', id);
  if (removed) this.refreshViews();
  return removed;
}
```

Replace the temporary auto-start block added to `PlacementController.placeCamp()` in Task 3 with:

```ts
this.scene.onCampPlaced(result.camp);
```

Add mode-transition startup handling:

```ts
private handleModeChanged(): void {
  if (this.gameState.mode !== 'aiBattle') {
    this.bridge.setNotice(null);
    return;
  }
  if (!this.hasLivingCamp('red') || this.hasLivingCamp('blue')) return;
  const deployed = this.aiController.deployInitialCamp();
  if (deployed) {
    this.bridge.setNotice(null);
    this.bridge.setRunning(true, this.gameState);
  } else {
    this.bridge.setNotice('蓝方建造区没有合法位置，AI 对战暂未开始');
  }
}
```

Replace `UiBridge.deleteSelected` with:

```ts
deleteSelected(scene: { removeCampByPlayer(id: string): boolean }): void {
  if (!this.selectedCampId) return;
  if (!scene.removeCampByPlayer(this.selectedCampId)) return;
  this.selectedCampId = null;
  this.emit('selectionChanged');
  this.emit('economyChanged');
}
```

Keep victory checks unchanged; the existing rule already avoids declaring a winner before both sides have ever placed a camp.

- [ ] **Step 5: Run mode, economy, placement, and victory tests**

Run:

```bash
npx vitest run tests/aiBattle-mode.test.ts tests/EconomySystem.test.ts tests/CampPlacementService.test.ts tests/AiController.test.ts tests/victory.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiBridge.ts src/game/BattleScene.ts src/game/managers/PlacementController.ts tests/aiBattle-mode.test.ts
git commit -m "feat(ai): integrate AI battle into simulation loop"
```

### Task 7: Add battlefield guides and AI battle UI states

**Files:**
- Modify: `src/game/BattleScene.ts`
- Modify: `src/ui/ControlBar.ts`
- Modify: `src/ui/BuildPanel.ts`
- Modify: `src/ui/HudController.ts`
- Modify: `src/ui/ui.css`

- [ ] **Step 1: Add the mode toggle to ControlBar**

Add a button before the separator:

```html
<button data-action="mode-toggle" title="切换沙盒 / AI 对战">沙盒</button>
```

Handle it:

```ts
case 'mode-toggle':
  this.bridge.setMode(gs.mode === 'sandbox' ? 'aiBattle' : 'sandbox', gs);
  break;
```

Render it:

```ts
const modeBtn = this.root.querySelector('[data-action="mode-toggle"]')!;
modeBtn.textContent = gs.mode === 'aiBattle' ? 'AI 对战' : '沙盒';
modeBtn.classList.toggle('active', gs.mode === 'aiBattle');
```

- [ ] **Step 2: Render prices and blue AI control in BuildPanel**

Store title and slider wrappers per faction. In `render()`:

```ts
const aiMode = this.gs().mode === 'aiBattle';
this.blueTitle.textContent = aiMode ? '🔵 蓝方 · AI 控制' : '🔵 蓝方';

for (const [kind, btn] of this.leftButtons) {
  btn.disabled = false;
  btn.classList.toggle(
    'unaffordable',
    aiMode && this.gs().economy.resources.red < AI_BATTLE.prices[kind],
  );
  btn.querySelector('.camp-price')!.textContent =
    aiMode ? String(AI_BATTLE.prices[kind]) : '';
}
for (const btn of this.rightButtons.values()) {
  btn.disabled = aiMode;
}
this.spawnSliderWrap.red.classList.toggle('ai-fixed', aiMode);
this.spawnSliderWrap.blue.classList.toggle('ai-fixed', aiMode);
```

Do not use `disabled` for unaffordable red buttons if hover tooltips must remain available; guard click/drag handlers with the balance check and apply the `unaffordable` class instead.

Add this guard at the start of red button click and drag handlers:

```ts
if (
  faction === 'red' &&
  this.gs().mode === 'aiBattle' &&
  this.gs().economy.resources.red < AI_BATTLE.prices[k.key]
) {
  this.bridge.reportPlacementFailure('insufficientResources');
  return;
}
```

Subscribe `BuildPanel.render()` to `modeChanged` and `economyChanged` so affordability updates as resources grow.

Add price markup:

```ts
`<span class="camp-price"></span>`
```

- [ ] **Step 3: Render mode and resources in HUD**

Listen to `modeChanged`, `economyChanged`, and `noticeChanged`, then append:

```ts
const economy = s.mode === 'aiBattle'
  ? `<span class="hud-section hud-economy">
       <span class="hud-sublabel">资源</span>
       <span class="hud-red-resource">${Math.floor(s.economy.resources.red)}</span>
       <span class="hud-sublabel">:</span>
       <span class="hud-blue-resource">${Math.floor(s.economy.resources.blue)}</span>
     </span>`
  : '';
const mode = `<span class="hud-mode">${s.mode === 'aiBattle' ? 'AI 对战' : '沙盒'}</span>`;
const notice = this.bridge.getNotice()
  ? `<span class="hud-notice">${this.bridge.getNotice()}</span>`
  : '';
```

Insert `mode`, `economy`, and `notice` without removing existing combat statistics.

- [ ] **Step 4: Draw battlefield guides in BattleScene**

Create one persistent graphics object:

```ts
private battlefieldGuide!: Phaser.GameObjects.Graphics;

private redrawBattlefieldGuide(): void {
  const g = this.battlefieldGuide;
  g.clear();
  if (this.gameState.mode !== 'aiBattle') return;
  const b = AI_BATTLE.battlefield;
  g.fillStyle(0xe53935, 0.07).fillRect(b.minX, b.minY, b.midX - b.minX, b.maxY - b.minY);
  g.fillStyle(0x1e88e5, 0.07).fillRect(b.midX, b.minY, b.maxX - b.midX, b.maxY - b.minY);
  g.lineStyle(3, 0xffffff, 0.55).strokeRect(
    b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY,
  );
  g.lineStyle(2, 0xffffff, 0.4).lineBetween(b.midX, b.minY, b.midX, b.maxY);
}
```

Create it below camp/unit views and redraw on `modeChanged`.

At the start of the existing `handleModeChanged()` method added in Task 6, add:

```ts
this.redrawBattlefieldGuide();
```

- [ ] **Step 5: Add focused CSS**

Add:

```css
.camp-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
}
.camp-btn.unaffordable {
  opacity: 0.5;
  box-shadow: inset 0 0 0 1px rgba(244, 67, 54, 0.55);
}
.camp-price {
  min-width: 24px;
  color: var(--ui-gold);
  font-size: 10px;
  text-align: right;
}
.spawn-slider.ai-fixed {
  opacity: 0.45;
  pointer-events: none;
}
.hud-mode {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  font-size: 12px;
  font-weight: bold;
}
.hud-economy {
  font-size: 14px;
}
.hud-red-resource { color: #ff8a80; font-weight: bold; }
.hud-blue-resource { color: #82b1ff; font-weight: bold; }
.hud-notice { color: #ffcc80; font-size: 12px; }
```

- [ ] **Step 6: Build and manually verify in the browser**

Run:

```bash
npm run build
npm run dev
```

Expected manual checks:

1. Sandbox starts unchanged and both factions remain controllable.
2. Toggle to AI battle; prices appear, blue controls disable, multipliers show fixed `1x`.
3. Battlefield border and red/blue halves appear.
4. First red camp causes one blue startup camp to appear and simulation to start.
5. Pause freezes resources; 5x increases them roughly five times faster than 1x.
6. Toggle back to sandbox; guides disappear and both panels unlock.

- [ ] **Step 7: Commit**

```bash
git add src/game/BattleScene.ts src/ui/ControlBar.ts src/ui/BuildPanel.ts src/ui/HudController.ts src/ui/ui.css
git commit -m "feat(ai): add AI battle controls and battlefield UI"
```

### Task 8: Complete regression coverage and final verification

**Files:**
- Modify: `tests/test-helpers.ts`
- Modify: `README.md`

- [ ] **Step 1: Normalize the shared camp fixture**

Update `mkCamp` in `tests/test-helpers.ts`:

```ts
export function mkCamp(o: Partial<Camp> = {}): Camp {
  return {
    id: 'c1',
    faction: 'red',
    kind: 'sword',
    x: 0,
    y: 0,
    hp: 500,
    maxHp: 500,
    spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 1,
    destroyed: false,
    paidCost: 0,
    ...o,
  };
}
```

Leave other direct fixtures unchanged; the optional field deliberately preserves their legacy unpaid meaning.

- [ ] **Step 2: Document the new mode**

Add a concise README section:

```md
## AI 对战模式

- 在底部控制栏随时切换“沙盒 / AI 对战”。
- AI 对战中玩家控制红方，蓝方由规则型 AI 控制。
- 双方按模拟时间获得相同资源，军营按兵种造价扣费。
- 红方只能在左半场新建，蓝方 AI 只能在右半场新建。
- 暂停会冻结经济；游戏倍速会同步加快经济和 AI。
```

- [ ] **Step 3: Run all focused AI battle tests**

Run:

```bash
npx vitest run tests/GameState.test.ts tests/aiBattle-mode.test.ts tests/EconomySystem.test.ts tests/CampPlacementService.test.ts tests/aiStrategy.test.ts tests/AiController.test.ts tests/placement.test.ts tests/victory.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Run the full suite**

Run:

```bash
npm test
```

Expected: all existing and new tests PASS.

- [ ] **Step 5: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript check and Vite production build PASS.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended AI battle files are modified. Preserve the existing untracked `.claude/` directory.

- [ ] **Step 7: Commit documentation and final fixture cleanup**

```bash
git add README.md tests/test-helpers.ts
git commit -m "docs: document AI battle mode"
```

## Completion criteria

- Sandbox behavior remains free and unrestricted except for the existing camp-distance rule.
- AI battle can be entered and exited repeatedly without resetting resources.
- Existing camps and units survive mode changes, including out-of-bounds camps.
- Player construction, AI construction, and deletion all use the same placement service.
- Resources advance only through fixed simulation steps.
- Blue AI waits for the first red camp, performs startup deployment while paused, then joins the normal fixed-step loop.
- The AI fills basic composition gaps, counters red composition, and saves for expensive targets.
- UI clearly communicates mode, prices, resources, battlefield halves, and blue AI control.
- Full tests and production build pass.
