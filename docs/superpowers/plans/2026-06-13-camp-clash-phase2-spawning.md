# 阶段 2：产兵与基础小兵 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 军营按间隔自动产兵，小兵出生后朝敌方推进（仅移动、无攻击），渲染含阵营色与头顶血条。

**Architecture:** 在阶段 1 GameState + BattleScene 基础上，新增 CampManager（纯逻辑产兵）、UnitManager（纯逻辑移动）、小兵渲染（Graphics + 血条）。模拟循环在 BattleScene.update 中直接步进（阶段 4 再引入 SimulationClock 固定步进）。

**Tech Stack:** Phaser 3 · TypeScript · Vite · Vitest

**依据 Spec:** [docs/superpowers/specs/2026-06-13-camp-clash-mvp-design.md](../specs/2026-06-13-camp-clash-mvp-design.md) 第 5-6 节

**本阶段范围（PRD 25.2）：** 产兵 / 小兵移动 / 小兵渲染与血条。**不含：** 寻敌、攻击、战斗结算、军营摧毁（阶段 3）、加速/暂停控制（阶段 4）。

---

## 文件结构

```
新增:
  src/config/units.ts                  # 小兵配置（UnitDef，4 种全部）
  src/game/managers/CampManager.ts     # 产兵逻辑（纯 TS，可单测）
  src/game/managers/UnitManager.ts     # 移动逻辑（纯 TS，可单测）
  src/game/unitRenderer.ts             # 小兵渲染（圆点 + 血条）
  tests/units.test.ts
  tests/CampManager.test.ts
  tests/UnitManager.test.ts

修改:
  src/game/types.ts          # 追加 Unit, UnitDef 接口
  src/game/GameState.ts      # 追加 units Map + 方法
  src/game/BattleScene.ts    # 追加管理器 + 模拟循环 + 渲染同步
```

---

## Task 1: 小兵类型与配置表（TDD）

**Files:**
- Modify: `src/game/types.ts`（追加 Unit, UnitDef）
- Create: `src/config/units.ts`, `tests/units.test.ts`

- [ ] **Step 1: 创建测试 `tests/units.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_DEFS } from '../src/config/units';
import type { UnitKind } from '../src/game/types';

describe('UNIT_DEFS', () => {
  it('包含 4 种小兵', () => {
    const kinds: UnitKind[] = ['sword', 'shield', 'archer', 'javelin'];
    for (const k of kinds) {
      expect(UNIT_DEFS[k]).toBeDefined();
    }
  });

  it('剑兵数值符合 PRD 9.3', () => {
    expect(UNIT_DEFS.sword).toMatchObject({
      attackType: 'melee', maxHp: 100, attack: 10,
      attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    });
  });

  it('盾兵数值', () => {
    expect(UNIT_DEFS.shield).toMatchObject({ attackType: 'melee', maxHp: 160, attack: 7 });
  });

  it('弓兵数值', () => {
    expect(UNIT_DEFS.archer).toMatchObject({ attackType: 'ranged', maxHp: 60, attack: 8, attackRange: 180 });
  });

  it('投矛兵数值', () => {
    expect(UNIT_DEFS.javelin).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 18, attackInterval: 2.0 });
  });
});
```

- [ ] **Step 2: 验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/config/units'`

- [ ] **Step 3: 追加类型到 `src/game/types.ts`**

```ts
// 在文件末尾追加：

export interface UnitDef {
  kind: UnitKind;
  attackType: AttackType;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
}

export interface Unit {
  id: string;
  faction: Faction;
  kind: UnitKind;
  campId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  attackTimer: number;
  targetId: string | null;
  state: 'moving' | 'attacking' | 'idle';
  alive: boolean;
  deathTimer: number;
}
```

- [ ] **Step 4: 创建 `src/config/units.ts`**

```ts
import type { UnitDef, UnitKind } from '../game/types';

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  sword:   { kind: 'sword',   attackType: 'melee',  maxHp: 100, attack: 10, attackRange: 35,  attackInterval: 1.0, moveSpeed: 60 },
  shield:  { kind: 'shield',  attackType: 'melee',  maxHp: 160, attack: 7,  attackRange: 35,  attackInterval: 1.2, moveSpeed: 45 },
  archer:  { kind: 'archer',  attackType: 'ranged', maxHp: 60,  attack: 8,  attackRange: 180, attackInterval: 1.2, moveSpeed: 45 },
  javelin: { kind: 'javelin', attackType: 'ranged', maxHp: 70,  attack: 18, attackRange: 150, attackInterval: 2.0, moveSpeed: 40 },
};
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npm test`
Expected: PASS（5 tests for UNIT_DEFS）

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/config/units.ts tests/units.test.ts
git commit -m "feat(types): 小兵 UnitDef 配置表与 Unit 类型"
```

---

## Task 2: GameState 扩展 + CampManager 产兵（TDD）

**Files:**
- Modify: `src/game/GameState.ts`
- Create: `src/game/managers/CampManager.ts`, `tests/CampManager.test.ts`

- [ ] **Step 1: 扩展 GameState 支持 units**

修改 `src/game/GameState.ts`，追加：

```ts
// 字段追加：
readonly units = new Map<string, Unit>();

// 方法追加：
addUnit(unit: Unit): void {
  this.units.set(unit.id, unit);
}

removeUnit(id: string): void {
  this.units.delete(id);
}

getUnit(id: string): Unit | undefined {
  return this.units.get(id);
}

allUnits(): Unit[] {
  return [...this.units.values()];
}
```

- [ ] **Step 2: 创建测试 `tests/CampManager.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CampManager } from '../src/game/managers/CampManager';
import type { Camp, Unit } from '../src/game/types';

interface TestState {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  addUnit(u: Unit): void;
}

function makeCamp(overrides: Partial<Camp> = {}): Camp {
  return {
    id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100,
    hp: 500, maxHp: 500, spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
    ...overrides,
  };
}

function makeState(camps: Camp[]): TestState {
  const cm = new Map<string, Camp>();
  for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>();
  return { camps: cm, units: um, addUnit(u: Unit) { um.set(u.id, u); } };
}

describe('CampManager', () => {
  it('产兵间隔到后产出一兵', () => {
    const camp = makeCamp({ spawnTimer: 0.01 });
    const state = makeState([camp]);
    const mgr = new CampManager(state);
    mgr.step(4.0);
    expect(state.units.size).toBe(1);
  });

  it('产兵时小兵属性取自配置', () => {
    const camp = makeCamp({ spawnTimer: 0.01 });
    const state = makeState([camp]);
    const mgr = new CampManager(state);
    mgr.step(4.0);
    const u = [...state.units.values()][0];
    expect(u.faction).toBe('red');
    expect(u.kind).toBe('sword');
    expect(u.campId).toBe('c1');
    expect(u.maxHp).toBe(100);
  });

  it('军营摧毁后不产兵', () => {
    const camp = makeCamp({ spawnTimer: 0.01, destroyed: true });
    const state = makeState([camp]);
    const mgr = new CampManager(state);
    mgr.step(4.0);
    expect(state.units.size).toBe(0);
  });

  it('aliveUnits 达 unitCap(20) 时不产兵', () => {
    const camp = makeCamp({ spawnTimer: 0.01, aliveUnits: 20 });
    const state = makeState([camp]);
    const mgr = new CampManager(state);
    mgr.step(4.0);
    expect(state.units.size).toBe(0);
  });

  it('多个军营独立产兵', () => {
    const a = makeCamp({ id: 'a', spawnTimer: 0.01 });
    const b = makeCamp({ id: 'b', spawnTimer: 0.01, kind: 'archer', x: 300 });
    const state = makeState([a, b]);
    const mgr = new CampManager(state);
    mgr.step(5.0);
    expect(state.units.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: 验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/managers/CampManager'`

- [ ] **Step 4: 创建 `src/game/managers/CampManager.ts`**

```ts
import type { Camp, Unit } from '../types';
import { CAMP_DEFS } from '../../config/camps';
import { UNIT_DEFS } from '../../config/units';

interface GameStateView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  addUnit(u: Unit): void;
}

export class CampManager {
  constructor(private gs: GameStateView) {}

  step(dt: number): void {
    for (const c of this.gs.camps.values()) {
      if (c.destroyed) continue;
      if (c.aliveUnits >= (CAMP_DEFS[c.kind]?.unitCap ?? 20)) continue;

      c.spawnTimer -= dt;
      if (c.spawnTimer <= 0) {
        const campDef = CAMP_DEFS[c.kind];
        const unitDef = UNIT_DEFS[c.kind];
        const factor = [1, 0.85, 0.70][c.upgrades.production - 1] ?? 1;
        c.spawnTimer += campDef.spawnInterval * factor;

        const unit: Unit = {
          id: crypto.randomUUID(),
          faction: c.faction,
          kind: c.kind,
          campId: c.id,
          x: c.x + (Math.random() - 0.5) * 30,
          y: c.y + (Math.random() - 0.5) * 30,
          hp: unitDef.maxHp,
          maxHp: unitDef.maxHp,
          attack: unitDef.attack,
          attackRange: unitDef.attackRange,
          attackInterval: unitDef.attackInterval,
          moveSpeed: unitDef.moveSpeed,
          attackTimer: 0,
          targetId: null,
          state: 'moving',
          alive: true,
          deathTimer: 0,
        };
        this.gs.addUnit(unit);
        c.aliveUnits++;
      }
    }
  }
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/GameState.ts src/game/managers/CampManager.ts tests/CampManager.test.ts
git commit -m "feat(game): CampManager 自动产兵 + GameState 扩展 units"
```

---

## Task 3: UnitManager 基础移动（TDD）

**Files:**
- Create: `src/game/managers/UnitManager.ts`, `tests/UnitManager.test.ts`

> 阶段 2 只做移动：朝最近敌方军营推进。无寻敌、无攻击。

- [ ] **Step 1: 创建测试 `tests/UnitManager.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { UnitManager } from '../src/game/managers/UnitManager';
import type { Camp, Unit } from '../src/game/types';

interface TestState {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
}

function makeCamp(overrides: Partial<Camp> = {}): Camp {
  return {
    id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100,
    hp: 500, maxHp: 500, spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
    ...overrides,
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', faction: 'red', kind: 'sword', campId: 'c1',
    x: 0, y: 0, hp: 100, maxHp: 100, attack: 10,
    attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving',
    alive: true, deathTimer: 0,
    ...overrides,
  };
}

function makeState(camps: Camp[], units: Unit[]): TestState {
  const cm = new Map<string, Camp>();
  for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>();
  for (const u of units) um.set(u.id, u);
  return { camps: cm, units: um };
}

describe('UnitManager', () => {
  it('朝敌方军营方向移动', () => {
    const unit = makeUnit({ faction: 'red', x: 0, y: 0 });
    const enemy = makeCamp({ id: 'ec', faction: 'blue', x: 100, y: 0 });
    const state = makeState([enemy], [unit]);
    const mgr = new UnitManager(state);
    mgr.step(0.5);
    expect(unit.x).toBeGreaterThan(0);
    expect(unit.x).toBeLessThanOrEqual(31);
  });

  it('不存在敌方军营时 idle', () => {
    const unit = makeUnit({ faction: 'red', x: 0, y: 0 });
    const state = makeState([], [unit]);
    const mgr = new UnitManager(state);
    mgr.step(1.0);
    expect(unit.state).toBe('idle');
    expect(unit.x).toBe(0);
  });

  it('已死亡小兵不移动', () => {
    const unit = makeUnit({ faction: 'red', x: 0, y: 0, alive: false });
    const enemy = makeCamp({ id: 'ec', faction: 'blue', x: 100, y: 0 });
    const state = makeState([enemy], [unit]);
    const mgr = new UnitManager(state);
    mgr.step(1.0);
    expect(unit.x).toBe(0);
  });

  it('同阵营军营不是目标', () => {
    const unit = makeUnit({ faction: 'red', x: 0, y: 0 });
    const ally = makeCamp({ id: 'ac', faction: 'red', x: 100, y: 0 });
    const state = makeState([ally], [unit]);
    const mgr = new UnitManager(state);
    mgr.step(1.0);
    expect(unit.state).toBe('idle');
  });
});
```

- [ ] **Step 2: 验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/managers/UnitManager'`

- [ ] **Step 3: 创建 `src/game/managers/UnitManager.ts`**

```ts
import type { Camp, Unit } from '../types';

interface GameStateView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
}

export class UnitManager {
  constructor(private gs: GameStateView) {}

  step(dt: number): void {
    for (const u of this.gs.units.values()) {
      if (!u.alive) continue;
      const enemies = [...this.gs.camps.values()].filter(
        (c) => c.faction !== u.faction && !c.destroyed,
      );
      if (enemies.length === 0) {
        u.state = 'idle';
        continue;
      }
      // 最近敌方军营
      let closest = enemies[0];
      let minD = Math.hypot(closest.x - u.x, closest.y - u.y);
      for (let i = 1; i < enemies.length; i++) {
        const d = Math.hypot(enemies[i].x - u.x, enemies[i].y - u.y);
        if (d < minD) { closest = enemies[i]; minD = d; }
      }
      u.state = 'moving';
      const dx = closest.x - u.x;
      const dy = closest.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      u.x += (dx / dist) * u.moveSpeed * dt;
      u.y += (dy / dist) * u.moveSpeed * dt;
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/managers/UnitManager.ts tests/UnitManager.test.ts
git commit -m "feat(game): UnitManager 基础移动（朝敌方军营推进）"
```

---

## Task 4: 小兵渲染与血条

**Files:**
- Create: `src/game/unitRenderer.ts`

> Phaser 渲染，无法单测。小兵 = Graphics 圆点 + 阵营色 + 兵种标识 + 头顶血条。

- [ ] **Step 1: 创建 `src/game/unitRenderer.ts`**

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit } from './types';

const KIND_CHAR: Record<string, string> = {
  sword: 'S', shield: 'Sh', archer: 'A', javelin: 'J',
};

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[unit.faction];
  const shadow = scene.add.ellipse(0, 7, 20, 10, 0x000000, 0.2).setOrigin(0.5);
  const body = scene.add.circle(0, 0, 10, color).setOrigin(0.5);
  body.setStrokeStyle(1, 0x000000, 0.3);
  const label = scene.add.text(0, 0, KIND_CHAR[unit.kind] ?? '?', {
    fontSize: '9px', color: '#ffffff',
  }).setOrigin(0.5);
  const hpBg = scene.add.rectangle(0, -16, 20, 3, 0x000000, 0.6).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpColor = ratio > 0.5 ? 0x43a047 : ratio > 0.25 ? 0xfdd835 : 0xe53935;
  const hpFill = scene.add.rectangle(-10, -16, 20 * ratio, 3, hpColor).setOrigin(0, 0.5);

  return scene.add.container(unit.x, unit.y, [shadow, body, label, hpBg, hpFill]);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);
  const hpFill = view.getAt(4) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(20 * ratio, 3);
    const c = ratio > 0.5 ? 0x43a047 : ratio > 0.25 ? 0xfdd835 : 0xe53935;
    hpFill.setFillStyle(c);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(game): 小兵渲染（圆点+兵种标识+血条）"
```

---

## Task 5: BattleScene 集成——模拟循环与渲染同步

**Files:**
- Modify: `src/game/BattleScene.ts`

- [ ] **Step 1: 添加 import 与字段**

新增 import：
```ts
import { CampManager } from './managers/CampManager';
import { UnitManager } from './managers/UnitManager';
import { drawUnit, updateUnitView } from './unitRenderer';
import type { Unit } from './types';
```

新增字段（在 `private bridge!: UiBridge;` 附近）：
```ts
private campManager!: CampManager;
private unitManager!: UnitManager;
private unitViews = new Map<string, Phaser.GameObjects.Container>();
```

- [ ] **Step 2: 在 `create()` 末尾追加管理器初始化**

在 PlacementController/SelectionInput 初始化之后追加：
```ts
this.campManager = new CampManager(this.gameState);
this.unitManager = new UnitManager(this.gameState);
```

- [ ] **Step 3: 修改 `update()` 追加模拟步进与渲染同步**

```ts
update(time: number, deltaMs: number): void {
  const cam = this.cameras.main;
  this.ground.tilePositionX = cam.scrollX;
  this.ground.tilePositionY = cam.scrollY;

  const dt = deltaMs / 1000;
  this.campManager.step(dt);
  this.unitManager.step(dt);

  this.syncUnitViews();
}

private syncUnitViews(): void {
  const seen = new Set<string>();
  for (const u of this.gameState.allUnits()) {
    seen.add(u.id);
    let view = this.unitViews.get(u.id);
    if (!view) {
      view = drawUnit(this, u);
      this.unitViews.set(u.id, view);
    }
    updateUnitView(view, u);
  }
  for (const [id, view] of this.unitViews) {
    if (!seen.has(id)) {
      view.destroy();
      this.unitViews.delete(id);
    }
  }
}
```

- [ ] **Step 4: tsc 编译检查**

Run: `npx tsc --noEmit`
Expected: TSC OK

- [ ] **Step 5: Commit**

```bash
git add src/game/BattleScene.ts
git commit -m "feat(game): BattleScene 集成 CampManager/UnitManager 与模拟循环"
```

---

## Task 6: 阶段 2 集成验收

- [ ] **Step 1: 全量单测**

Run: `npm test`
Expected: 全部 PASS（22 阶段 1 + 14 新增 = 36 tests）

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npx vite build`
Expected: OK

- [ ] **Step 3: 手动浏览器验收（PRD 23.2）**

Run: `npm run dev`

| # | 操作 | 期望 |
|---|------|------|
| 放置 | 红方剑兵营 + 蓝方弓兵营 | 两军营可见 |
| 产兵 | 等 ~4s | 剑兵营出红 S 兵、弓兵营出蓝 A 兵（圆点+血条） |
| 移动 | 观察 | 小兵朝对方军营推进 |
| 产兵上限 | 等足够久 | 单军营 ≤ 20 小兵 |

- [ ] **Step 4: 修复发现的问题（若有）**

```bash
git add -A
git commit -m "fix: 阶段 2 验收修复"
```

---

## 新增测试数量

| 模块 | 测试数 |
|------|--------|
| units.test.ts | 5 |
| CampManager.test.ts | 5 |
| UnitManager.test.ts | 4 |
| **合计新增** | **14** |
| 累计（含阶段 1） | **36** |
