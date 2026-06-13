# 阶段 3：自动战斗 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小兵自动寻敌（空间分区加速）、近战即时伤害、远程弹道、死亡淡出、军营被摧毁后停止产兵。

**Architecture:** 新增 SpatialGrid（均匀网格空间分区）加速寻敌；UnitManager 升级为 acquireTarget + act 两阶段；CombatSystem 独立管理弹道推进/伤害结算/死亡/军营摧毁/统计；BattleScene 模拟循环追加 CombatSystem.step。

**Tech Stack:** Phaser 3 · TypeScript · Vite · Vitest

**依据 Spec:** [docs/superpowers/specs/2026-06-13-camp-clash-mvp-design.md](../specs/2026-06-13-camp-clash-mvp-design.md) 第 6 节

**本阶段范围（PRD 25.3）：** 自动寻敌 / 近战远程攻击 / 弹道 / 扣血死亡 / 军营摧毁。**不含：** 暂停加速（阶段 4）、升级系统（阶段 5）。

---

## 文件结构

```
新增:
  src/game/spatial/SpatialGrid.ts          # 均匀网格空间分区
  src/game/managers/CombatSystem.ts        # 伤害/死亡/弹道/军营摧毁
  tests/SpatialGrid.test.ts
  tests/CombatSystem.test.ts

修改:
  src/game/types.ts          # 追加 Projectile, SideStats
  src/game/GameState.ts      # 追加 projectiles + stats
  src/game/managers/UnitManager.ts   # 升级: acquireTarget + act
  src/game/unitRenderer.ts   # 死亡淡出
  src/game/BattleScene.ts    # 模拟循环加 CombatSystem
```

---

## Task 1: Projectile 类型 + GameState 扩展

**Files:**
- Modify: `src/game/types.ts`（追加 Projectile, SideStats）
- Modify: `src/game/GameState.ts`（追加 projectiles + stats）

- [ ] **Step 1: 追加类型到 `src/game/types.ts`**

```ts
// 文件末尾追加：
export interface Projectile {
  id: string;
  x: number; y: number;
  targetId: string;
  speed: number;
  damage: number;
  faction: Faction;
  elapsed: number;
  maxTime: number;
}

export interface SideStats {
  unitsAlive: number;
  campsAlive: number;
  kills: number;
  campsDestroyed: number;
}
```

- [ ] **Step 2: 扩展 `src/game/GameState.ts`**

在类体内追加字段：
```ts
projectiles: Projectile[] = [];
stats: { red: SideStats; blue: SideStats } = {
  red:  { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
  blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
};
```
顶部 import 改为 `import type { Camp, Unit, Projectile, SideStats } from './types';`

- [ ] **Step 3: tsc + npm test**

Run: `npx tsc --noEmit && npm test`
Expected: TSC OK + 36 pass

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/GameState.ts
git commit -m "feat(types): Projectile + SideStats + GameState 扩展战斗数据"
```

---

## Task 2: SpatialGrid 空间分区（TDD）

**Files:**
- Create: `src/game/spatial/SpatialGrid.ts`, `tests/SpatialGrid.test.ts`

- [ ] **Step 1: 创建测试 `tests/SpatialGrid.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid } from '../src/game/spatial/SpatialGrid';

interface E { id: string; x: number; y: number; }

describe('SpatialGrid', () => {
  let grid: SpatialGrid<E>;
  beforeEach(() => { grid = new SpatialGrid<E>(80); });

  it('空网格查不到', () => {
    expect(grid.queryCircle(0, 0, 100)).toEqual([]);
  });

  it('insert 后可查到', () => {
    const e: E = { id: 'a', x: 50, y: 50 };
    grid.insert(e);
    expect(grid.queryCircle(0, 0, 100)).toEqual([e]);
  });

  it('范围外查不到', () => {
    grid.insert({ id: 'a', x: 0, y: 0 });
    expect(grid.queryCircle(200, 200, 10)).toEqual([]);
  });

  it('跨 cell 查询', () => {
    const ents: E[] = [
      { id: 'a', x: 10, y: 10 }, { id: 'b', x: 100, y: 10 },
      { id: 'c', x: 10, y: 100 }, { id: 'd', x: 200, y: 200 },
    ];
    for (const e of ents) grid.insert(e);
    const ids = grid.queryCircle(10, 10, 120).map(e => e.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('rebuild 替换全部', () => {
    grid.insert({ id: 'a', x: 10, y: 10 });
    grid.rebuild([{ id: 'b', x: 100, y: 100 }]);
    expect(grid.queryCircle(100, 100, 10).map(e => e.id)).toEqual(['b']);
    expect(grid.queryCircle(10, 10, 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: 验证失败 → 创建实现 → 验证通过 → Commit**

`SpatialGrid<E>` 实现：
```ts
interface Entity { x: number; y: number; }

export class SpatialGrid<E extends Entity> {
  private cells = new Map<number, E[]>();

  constructor(private cellSize: number) {}

  insert(e: E): void {
    const k = this.cellKey(e.x, e.y);
    const arr = this.cells.get(k) ?? [];
    arr.push(e);
    this.cells.set(k, arr);
  }

  rebuild(entities: E[]): void {
    this.cells.clear();
    for (const e of entities) this.insert(e);
  }

  queryCircle(x: number, y: number, radius: number): E[] {
    const sqrR = radius * radius;
    const result: E[] = [];
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const k = cx * 1000003 + cy;
        for (const e of this.cells.get(k) ?? []) {
          const dx = e.x - x; const dy = e.y - y;
          if (dx * dx + dy * dy <= sqrR) result.push(e);
        }
      }
    }
    return result;
  }

  private cellKey(x: number, y: number): number {
    return Math.floor(x / this.cellSize) * 1000003 + Math.floor(y / this.cellSize);
  }
}
```

```bash
git add src/game/spatial/SpatialGrid.ts tests/SpatialGrid.test.ts
git commit -m "feat(game): SpatialGrid 均匀网格空间分区（寻敌加速）"
```

---

## Task 3: UnitManager 寻敌升级

**Files:**
- Modify: `src/game/managers/UnitManager.ts`（重写 step，新增 acquireTarget + act）
- Modify: `tests/UnitManager.test.ts`（适配新接口）

**核心逻辑**（来自 spec 6.2）：
```
acquireTarget: 目标存活→保持; 否则攻击距离内最近敌方小兵>最近敌方小兵>最近敌方军营
act: 在攻击距离内→攻击(近战即时/远程弹道); 有目标→朝目标移动; 无目标→idle
```

- [ ] **Step 1: 重写 `UnitManager.ts`**

```ts
import type { Camp, Unit, Projectile } from '../types';
import { UNIT_DEFS } from '../../config/units';
import { SpatialGrid } from '../spatial/SpatialGrid';

export interface UnitGSView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  projectiles: Projectile[];
}

export class UnitManager {
  private grid = new SpatialGrid<Unit>(80);
  private readonly SIGHT = 250;

  constructor(private gs: UnitGSView) {}

  step(dt: number): void {
    this.grid.rebuild([...this.gs.units.values()].filter(u => u.alive));
    for (const u of this.gs.units.values()) {
      if (!u.alive) continue;
      this.acquireTarget(u);
      this.act(u, dt);
    }
  }

  private acquireTarget(u: Unit): void {
    if (u.targetId) {
      const t = this.gs.units.get(u.targetId) ?? this.gs.camps.get(u.targetId);
      const alive = t ? ('alive' in t ? (t as Unit).alive : !(t as Camp).destroyed) : false;
      if (alive) return;
      u.targetId = null;
    }
    const cands = this.grid.queryCircle(u.x, u.y, this.SIGHT);
    // 攻击距离内的敌方小兵（最近）
    const inRange = cands.filter(e => e.faction !== u.faction && e.alive &&
      Math.hypot(e.x - u.x, e.y - u.y) <= u.attackRange
    );
    if (inRange.length > 0) {
      inRange.sort((a, b) => Math.hypot(a.x-u.x,a.y-u.y) - Math.hypot(b.x-u.x,b.y-u.y));
      u.targetId = inRange[0].id; return;
    }
    // 最近敌方小兵
    const enemies = cands.filter(e => e.faction !== u.faction && e.alive);
    if (enemies.length > 0) {
      enemies.sort((a, b) => Math.hypot(a.x-u.x,a.y-u.y) - Math.hypot(b.x-u.x,b.y-u.y));
      u.targetId = enemies[0].id; return;
    }
    // 最近敌方军营
    const camps = [...this.gs.camps.values()].filter(c => c.faction !== u.faction && !c.destroyed);
    if (camps.length > 0) {
      camps.sort((a, b) => Math.hypot(a.x-u.x,a.y-u.y) - Math.hypot(b.x-u.x,b.y-u.y));
      u.targetId = camps[0].id;
    }
  }

  private act(u: Unit, dt: number): void {
    if (!u.targetId) { u.state = 'idle'; return; }
    const target = this.gs.units.get(u.targetId) ?? this.gs.camps.get(u.targetId);
    if (!target) { u.targetId = null; u.state = 'idle'; return; }
    const tx = target.x; const ty = target.y;
    const dist = Math.hypot(tx - u.x, ty - u.y);

    if (dist <= u.attackRange) {
      u.state = 'attacking';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer = u.attackInterval;
        if (UNIT_DEFS[u.kind]?.attackType === 'ranged') {
          const dx = tx - u.x; const dy = ty - u.y; const d = Math.hypot(dx, dy) || 1;
          this.gs.projectiles.push({
            id: crypto.randomUUID(), x: u.x, y: u.y, targetId: u.targetId,
            speed: 200, damage: u.attack, faction: u.faction, elapsed: 0, maxTime: 2,
          });
        }
        // 近战伤害由 CombatSystem.applyDamage 统一结算
      }
    } else {
      u.state = 'moving';
      const speed = u.moveSpeed * dt;
      const ratio = Math.min(1, speed / dist);
      u.x += (tx - u.x) * ratio;
      u.y += (ty - u.y) * ratio;
    }
  }
}
```

- [ ] **Step 2: 更新测试 `tests/UnitManager.test.ts`**

原测试的 `mkState` 返回值扩展为 `UnitGSView`（加 `projectiles: []`），测试逻辑不变。原 4 个测试保留，新增寻敌测试：

```ts
it('寻敌：攻击距离内有敌方小兵时设为目标', () => {
  const ally = mkUnit({ id: 'a', faction: 'red', x: 0, y: 0, attackRange: 180, targetId: null });
  const enemy = mkUnit({ id: 'e', faction: 'blue', x: 50, y: 0 });
  const s: UnitGSView = { camps: new Map(), units: new Map([[ally.id, ally], [enemy.id, enemy]]), projectiles: [] };
  new UnitManager(s).step(0.1);
  expect(ally.targetId).toBe('e');
});
```

- [ ] **Step 3: npm test + tsc → Commit**

```bash
git add src/game/managers/UnitManager.ts tests/UnitManager.test.ts
git commit -m "feat(game): UnitManager 寻敌升级（acquireTarget + 攻击 + 弹道）"
```

---

## Task 4: CombatSystem 伤害/死亡/军营摧毁（TDD）

**Files:**
- Create: `src/game/managers/CombatSystem.ts`, `tests/CombatSystem.test.ts`

CombatSystem 职责：近战伤害结算（遍历所有 attacking 状态小兵，对目标 applyDamage）、弹道推进/命中、死亡处理（alive=false → camp.aliveUnits-- → stats.kills++）、军营摧毁（destroyed=true → stats.campsDestroyed++）、死亡单位清理（deathTimer 倒计时后移除）。

`applyDamage` 为静态纯函数：
```ts
static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView): void
```
扣血 ≤0 → 根据类型处理死亡/摧毁。

`step(dt)` 处理：近战结算 + 弹道推进 + 死亡清理。

```ts
// tests/CombatSystem.test.ts 核心用例：
it('小兵 hp≤0 则 alive=false, camp.aliveUnits--, kills++')
it('军营 hp≤0 则 destroyed=true, campsDestroyed++')
it('弹道命中目标扣血')
it('弹道超时落空')
it('死亡 0.3s 后从 Map 移除')
```

实现后 Commit：
```bash
git add src/game/managers/CombatSystem.ts tests/CombatSystem.test.ts
git commit -m "feat(game): CombatSystem 伤害结算/死亡/弹道/军营摧毁"
```

---

## Task 5: 死亡视觉 + 弹道渲染

**Files:**
- Modify: `src/game/unitRenderer.ts`（`updateUnitView`: alive=false 时 alpha 渐淡，deathTimer=0 时销毁）
- Create: `src/game/projectileRenderer.ts`（弹道渲染：小圆点）

```ts
// updateUnitView 追加：
if (!unit.alive) {
  unit.deathTimer -= 0.016; // 近似 dt，后续换阶段 4 固定步进
  view.setAlpha(Math.max(0, unit.deathTimer / 0.3));
  if (unit.deathTimer <= 0) view.setVisible(false);
}
```

弹道渲染：每帧从 GameState.projectiles 读取，小圆点 + 阵营色。独立函数 `drawProjectile`。

Commit:
```bash
git add src/game/unitRenderer.ts src/game/projectileRenderer.ts
git commit -m "feat(game): 死亡淡出 + 弹道渲染"
```

---

## Task 6: BattleScene 集成

**Files:**
- Modify: `src/game/BattleScene.ts`

`update()` 中模拟步骤顺序：
```ts
const dt = deltaMs / 1000;
this.campManager.step(dt);
this.unitManager.step(dt);
CombatSystem.step(this.gameState, dt);   // 新增
this.syncCampViews();
this.syncUnitViews();
this.syncProjectileViews();              // 新增
```

StatsTracker 变更点即时累加（已在 CampManager 产兵/CombatSystem 死亡时维护 `stats` 与 `aliveUnits`）。

Commit:
```bash
git add src/game/BattleScene.ts
git commit -m "feat(game): BattleScene 集成 CombatSystem 与战斗循环"
```

---

## Task 7: 阶段 3 验收

- [ ] **全量测试**：`npm test`（预计 ~44 tests）
- [ ] **tsc + build**：`npx tsc --noEmit && npx vite build`
- [ ] **浏览器验收**（PRD 23.3）：放置红蓝军营→等产兵→观察自动战斗→验证小兵死亡淡出→验证军营被摧毁后停止产兵

---

## 新增测试估算

| 模块 | 测试数 |
|------|--------|
| SpatialGrid.test.ts | 5 |
| CombatSystem.test.ts | 6 |
| UnitManager.test.ts | +1 寻敌 |
| **合计新增** | **12** |
| 累计（含阶段 1+2） | **48** |
