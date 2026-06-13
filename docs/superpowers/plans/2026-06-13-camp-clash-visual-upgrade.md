# 视觉升级：军营差异化 + 单位动作 + 攻击/死亡特效 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前模板化的同形军营/同动作小兵/无特效画面升级为：4 种差异化军营外形 + 5 种单位动作 + 5 类粒子/震屏/碎裂特效，提升战斗辨识度与观感。

**Architecture:**
- **数据层** 在 `CombatSystem` 中追加事件队列 `CombatEvent`（命中点 / 死亡 / 军营受击 / 军营摧毁），每次 step 由 `BattleScene` 排干并分发；保持模拟确定性与可单测。
- **特效层** 新增 `EffectManager`，所有瞬时视觉（粒子、屏幕抖动、积木散落）由它管理；软上限 50（弹道残影不计），超出丢弃新触发。
- **渲染层** 改写 `campRenderer` 按 `kind` 分支绘制四种造型；改写 `unitRenderer` 拆出 `body` 子容器并以 Phaser tween + 实时偏移驱动走/砍/击/射/投/受击/死亡 7 种动作；`projectileRenderer` 追加残影。
- **驱动方式** 走路弹跳基于 `(performance.now()/周期 + unitId hash) % 周期` 的程序化偏移（无需 tween 实例，零内存负担）；攻击 / 受击 / 死亡用一次性 Phaser tween 触发。

**Tech Stack:** Phaser 3 · TypeScript · Vite · Vitest

**依据：** brainstorm 决策（B 中等范围 + 4 形状 + 5 动作 + 5 特效 + 软上限 50）

**Mockup 参考：**
- `.superpowers/brainstorm/12713-1781363787/content/camp-shapes.html`
- `.superpowers/brainstorm/12713-1781363787/content/unit-animations.html`
- `.superpowers/brainstorm/12713-1781363787/content/effects.html`

**本计划范围：** 纯渲染/特效升级，不修改战斗规则、单位数值、UI 布局。

---

## 文件结构

```
新增:
  src/game/effects/EffectManager.ts          # 特效管理器（粒子/震屏/散落）
  src/game/effects/types.ts                  # CombatEvent 类型
  tests/EffectManager.test.ts                # 软上限 + 队列管理
  tests/CombatSystem.events.test.ts          # 事件发射测试

修改:
  src/game/managers/CombatSystem.ts          # 发射事件到 gs.events
  src/game/managers/UnitManager.ts           # applyDamage 调用适配 + UnitGSView 加 events
  src/game/GameState.ts                      # 追加 events: CombatEvent[]
  src/game/campRenderer.ts                   # 改为按 kind 分支绘制
  src/game/unitRenderer.ts                   # 拆 body 子容器 + 动作驱动 + 受击/死亡触发
  src/game/projectileRenderer.ts             # 追加残影
  src/game/BattleScene.ts                    # 引入 EffectManager + 排干事件队列
```

**为什么把 events 放 effects/types.ts 而不是 game/types.ts？**
事件只服务于特效层，不属于核心数据模型；隔离避免污染核心类型文件。`CombatSystem` 只依赖 `effects/types`，没有反向耦合。

---

## Task 1: CombatEvent 类型 + GameState 事件队列

**目的：** 让伤害/死亡/摧毁信号能从模拟层流到渲染层，但保持模拟确定性。

**Files:**
- Create: `src/game/effects/types.ts`
- Modify: `src/game/GameState.ts`

- [ ] **Step 1: 新建 `src/game/effects/types.ts`**

```ts
import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
```

- [ ] **Step 2: 修改 `src/game/GameState.ts` — 追加 events 字段**

顶部 import 改为：
```ts
import type { Camp, Unit, Projectile, SideStats } from './types';
import type { CombatEvent } from './effects/types';
```

类体内 `projectiles` 字段下方追加：
```ts
events: CombatEvent[] = [];
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 提交**

```bash
git add src/game/effects/types.ts src/game/GameState.ts
git commit -m "feat(visual): add CombatEvent type + GameState.events queue"
```

---

## Task 2: CombatSystem 发射事件（TDD）

**目的：** 让 `applyDamage` 在关键时刻向 events 队列写入事件并附带测试。远程命中也复用 `meleeHit`（命中爆星共用），命中事件由 `CombatSystem.step` 中弹道命中时 `applyDamage(..., { source: 'ranged' })` 发出。

**Files:**
- Modify: `src/game/managers/CombatSystem.ts`
- Modify: `src/game/managers/UnitManager.ts`
- Create: `tests/CombatSystem.events.test.ts`
- Modify: `tests/CombatSystem.test.ts`
- Modify: `tests/UnitManager.test.ts`

- [ ] **Step 1: 写失败测试 `tests/CombatSystem.events.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit } from '../src/game/types';
import type { CombatEvent } from '../src/game/effects/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 10, y: 20, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0.3, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem events', () => {
  it('近战攻击单位时发射 meleeHit 事件（带目标坐标）', () => {
    const u = mkUnit({ x: 50, y: 60, hp: 100 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'meleeHit') as Extract<CombatEvent, { kind: 'meleeHit' }>;
    expect(e).toBeDefined();
    expect(e.x).toBe(50);
    expect(e.y).toBe(60);
    expect(e.faction).toBe('red');
  });

  it('远程命中目标也发射 meleeHit（视为命中爆星共用）', () => {
    const u = mkUnit({ x: 50, y: 60 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged' });
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(true);
  });

  it('单位死亡时发射 unitDeath 事件', () => {
    const u = mkUnit({ x: 7, y: 8, hp: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 100, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'unitDeath') as Extract<CombatEvent, { kind: 'unitDeath' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('u1');
    expect(e.x).toBe(7);
    expect(e.y).toBe(8);
  });

  it('军营受击时发射 campHit 事件（未摧毁）', () => {
    const c = mkCamp({ x: 100, y: 200, hp: 500 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyDamage(c, 50, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'campHit') as Extract<CombatEvent, { kind: 'campHit' }>;
    expect(e).toBeDefined();
    expect(e.campId).toBe('c1');
  });

  it('军营摧毁时发射 campDestroyed 事件（不再发 campHit）', () => {
    const c = mkCamp({ x: 100, y: 200, hp: 30 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyDamage(c, 100, gs, { source: 'melee' });
    expect(gs.events.some(ev => ev.kind === 'campDestroyed')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'campHit')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run tests/CombatSystem.events.test.ts`
Expected: FAIL（applyDamage 签名不匹配 / events 不存在）

- [ ] **Step 3: 修改 `src/game/managers/CombatSystem.ts` — 引入事件**

完整文件替换为：
```ts
import type { Camp, Unit, Projectile, SideStats } from '../types';
import type { CombatEvent } from '../effects/types';

export interface CombatGSView {
  units: Map<string, Unit>;
  camps: Map<string, Camp>;
  projectiles: Projectile[];
  events: CombatEvent[];
  stats: { red: SideStats; blue: SideStats };
}

export interface DamageOpts {
  source: 'melee' | 'ranged';
}

export class CombatSystem {
  static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView, opts: DamageOpts): void {
    target.hp -= dmg;

    if ('alive' in target) {
      // 单位被打：发命中事件（无论是否致死）
      gs.events.push({ kind: 'meleeHit', x: target.x, y: target.y, faction: target.faction });
      if (target.hp <= 0) {
        target.alive = false;
        target.state = 'idle';
        target.deathTimer = 0.3;
        const camp = gs.camps.get(target.campId);
        if (camp) camp.aliveUnits = Math.max(0, camp.aliveUnits - 1);
        const killerFaction = target.faction === 'red' ? 'blue' : 'red';
        gs.stats[killerFaction].kills++;
        gs.events.push({ kind: 'unitDeath', unitId: target.id, x: target.x, y: target.y, faction: target.faction });
      }
    } else {
      // 军营被打
      if (target.hp <= 0) {
        target.destroyed = true;
        const killerFaction = target.faction === 'red' ? 'blue' : 'red';
        gs.stats[killerFaction].campsDestroyed++;
        gs.events.push({ kind: 'campDestroyed', campId: target.id, x: target.x, y: target.y, faction: target.faction });
      } else {
        gs.events.push({ kind: 'campHit', campId: target.id, x: target.x, y: target.y });
      }
    }
  }

  static step(gs: CombatGSView, dt: number): void {
    // 弹道推进/命中
    const survived: Projectile[] = [];
    for (const p of gs.projectiles) {
      p.elapsed += dt;
      if (p.elapsed >= p.maxTime) continue;

      const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
      if (!target) continue;

      const tgt = target as { x: number; y: number };
      const dx = tgt.x - p.x; const dy = tgt.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 12) {
        CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, { source: 'ranged' });
        continue;
      }

      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      survived.push(p);
    }
    gs.projectiles = survived;

    // 死亡计时（尸体保留）
    for (const u of gs.units.values()) {
      if (u.alive) continue;
      if (u.deathTimer > 0) u.deathTimer = Math.max(0, u.deathTimer - dt);
    }
  }
}
```

- [ ] **Step 4: 修改 `src/game/managers/UnitManager.ts`**

文件顶部 import + 接口改为：
```ts
import type { Camp, Unit, Projectile, SideStats } from '../types';
import type { CombatEvent } from '../effects/types';
import { UNIT_DEFS } from '../../config/units';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { CombatSystem } from './CombatSystem';

export interface UnitGSView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  projectiles: Projectile[];
  events: CombatEvent[];
  stats: { red: SideStats; blue: SideStats };
}
```

把 `act()` 中近战伤害调用：
```ts
CombatSystem.applyDamage(target as Unit | Camp, u.attack, this.gs);
```
改为：
```ts
CombatSystem.applyDamage(target as Unit | Camp, u.attack, this.gs, { source: 'melee' });
```

- [ ] **Step 5: 修复旧测试**

修改 `tests/CombatSystem.test.ts`：
- `mkGS` 中 `projectiles: []` 后追加 `events: [],`
- 所有 `CombatSystem.applyDamage(x, y, gs)` 调用改为 `CombatSystem.applyDamage(x, y, gs, { source: 'melee' })`

修改 `tests/UnitManager.test.ts`：
- `mkState` 中 `projectiles: []` 后追加 `events: [],`

- [ ] **Step 6: 跑全测试确认绿**

Run: `npx vitest run`
Expected: 全绿，新 events 测试 5 条 + 原测试全部通过

- [ ] **Step 7: 提交**

```bash
git add src/game/managers/CombatSystem.ts src/game/managers/UnitManager.ts tests/CombatSystem.events.test.ts tests/CombatSystem.test.ts tests/UnitManager.test.ts
git commit -m "feat(visual): emit combat events for hit/death/campHit/campDestroyed"
```

---

## Task 3: EffectManager 骨架 + 软上限 50（TDD）

**目的：** 实现一个能管理瞬时特效生命周期、强制软上限的容器，先在数据层把上限逻辑测明白，再接 Phaser 实例。

**Files:**
- Create: `src/game/effects/EffectManager.ts`
- Create: `tests/EffectManager.test.ts`

- [ ] **Step 1: 写失败测试 `tests/EffectManager.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run tests/EffectManager.test.ts`
Expected: FAIL（EffectBudget 未导出）

- [ ] **Step 3: 实现 `src/game/effects/EffectManager.ts`**

```ts
import Phaser from 'phaser';
import type { CombatEvent } from './types';

/**
 * 软上限计数器。EffectManager 在每次添加特效前调用 tryAdd()，
 * 特效自然结束时由 release() 回收名额。弹道残影不计入预算。
 */
export class EffectBudget {
  private count = 0;
  constructor(private readonly max: number) {}
  tryAdd(): boolean {
    if (this.count >= this.max) return false;
    this.count++;
    return true;
  }
  release(): void {
    this.count = Math.max(0, this.count - 1);
  }
  active(): number { return this.count; }
}

/**
 * 特效管理器。每帧由 BattleScene 排干 events 调用 dispatch；
 * 内部调用具体的 spawnXxx 方法生成 Phaser 显示对象 + tween，结束自动 release。
 */
export class EffectManager {
  private readonly budget = new EffectBudget(50);

  constructor(private readonly scene: Phaser.Scene) {}

  /** 排干一批事件（由 BattleScene 每帧调用） */
  dispatch(events: CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
    }
  }

  /** 命中爆星：4 颗 ✦ 从命中点向四周弹出（0.7s 生命） */
  private spawnMeleeStars(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    const N = 4;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + (i * 0.37);
      const dist = 18 + (i * 0.21) * 8;
      const star = this.scene.add.text(0, 0, '✦', {
        fontSize: '14px', color: '#fff176', fontStyle: 'bold',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        scale: { from: 0.4, to: 1.4 },
        alpha: { from: 1, to: 0 },
        duration: 600,
        ease: 'Cubic.easeOut',
      });
    }
    this.scene.time.delayedCall(700, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 死亡冒星：5 颗 ★ 向上飞散 + 旋转消失（1.5s 生命） */
  private spawnDeathStars(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    const offsets = [[-15, -50], [15, -50], [-25, -30], [25, -30], [0, -60]];
    offsets.forEach(([dx, dy], i) => {
      const star = this.scene.add.text(0, 0, '★', {
        fontSize: '18px', color: '#ffeb3b',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: dx, y: dy,
        angle: 360,
        scale: { from: 1.5, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 1200,
        delay: i * 60,
        ease: 'Cubic.easeOut',
      });
    });
    this.scene.time.delayedCall(1500, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 军营受击震屏：1.5px 振幅，120ms */
  private shakeCamera(): void {
    if (!this.budget.tryAdd()) return;
    this.scene.cameras.main.shake(120, 0.0015);
    this.scene.time.delayedCall(150, () => this.budget.release());
  }

  /** 军营摧毁：6 块积木散落 + 3 圈烟雾（1.8s 生命） */
  private spawnCampDestroy(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 烟雾圈
    const smokes: [number, number, number][] = [[0, 0, 0], [-15, -10, 100], [18, -5, 200]];
    smokes.forEach(([sx, sy, delay]) => {
      const smoke = this.scene.add.circle(sx, sy, 18, 0xaaaaaa, 0.7);
      root.add(smoke);
      this.scene.tweens.add({
        targets: smoke,
        scale: { from: 0, to: 2 },
        alpha: { from: 0.8, to: 0 },
        duration: 1400,
        delay,
        ease: 'Cubic.easeOut',
      });
    });

    // 积木散落
    const colors = [0xe53935, 0xffd54f, 0x90a4ae, 0xe53935, 0xffd54f, 0x90a4ae];
    for (let i = 0; i < 6; i++) {
      const block = this.scene.add.rectangle(0, -10, 12, 12, colors[i]).setOrigin(0.5);
      root.add(block);
      const dir = i < 3 ? -1 : 1;
      const spread = 20 + (i * 0.19) * 15;
      this.scene.tweens.add({
        targets: block,
        x: dir * spread,
        y: 30 + (i * 0.13) * 10,
        angle: dir * (40 + (i * 0.17) * 30),
        alpha: { from: 1, to: 0 },
        duration: 1500,
        delay: i * 25,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(1800, () => {
      root.destroy();
      this.budget.release();
    });
  }
}
```

> **说明：** 原本用 `Math.random()` 生成散布方向，但 superpowers 工作流脚本里 `Math.random()` 被禁；游戏运行时不受此限制。为稳妥起见，上面的散布值改用基于 `i` 的确定性伪随机（`i * 0.37` 等），避免任何潜在的非确定性。

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run tests/EffectManager.test.ts`
Expected: 4 pass

- [ ] **Step 5: tsc 验证全项目**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: 提交**

```bash
git add src/game/effects/EffectManager.ts tests/EffectManager.test.ts
git commit -m "feat(visual): EffectManager with 50 soft-cap + 4 effect kinds"
```

---

## Task 4: 4 种军营形状差异化

**目的：** 把 `campRenderer` 改为按 `kind` 分支绘制，匹配 mockup 中的剑/盾/弓/投矛 4 种造型。纯渲染改造，无新单测，靠 tsc + 运行时观察验证。

**Files:**
- Modify: `src/game/campRenderer.ts`

- [ ] **Step 1: 完整替换 `src/game/campRenderer.ts`**

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

const KIND_ACCENT: Record<CampKind, number> = {
  sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65,
};

export function drawCamp(scene: Phaser.Scene, camp: Camp): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[camp.faction];
  const accent = KIND_ACCENT[camp.kind];
  const g = scene.add.graphics();

  switch (camp.kind) {
    case 'sword':   drawSwordCamp(g, color, accent);   break;
    case 'shield':  drawShieldCamp(g, color, accent);  break;
    case 'archer':  drawArcherCamp(g, color, accent);  break;
    case 'javelin': drawJavelinCamp(g, color, accent); break;
  }

  return scene.add.container(camp.x, camp.y, [g]);
}

/** 剑营：宽方堡（76x44） + 4 城垛 + 顶部交叉双剑 */
function drawSwordCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 42, 92, 26);

  // 主体（宽）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-38, -14, 76, 44, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-38, -14, 76, 44, 4);

  // 4 城垛
  for (let i = 0; i < 4; i++) {
    const bx = -34 + i * 18;
    g.fillStyle(color, 1);
    g.fillRoundedRect(bx, -32, 12, 18, 2);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(bx, -32, 12, 18, 2);
  }

  // 装饰条
  g.fillStyle(accent, 0.7);
  g.fillRect(-36, 8, 72, 6);

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 2, 18, 28, 3);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 2, 18, 28, 3);

  // 交叉双剑顶饰（堡顶上方 -50）
  g.lineStyle(3, accent, 1);
  g.lineBetween(-12, -58, 12, -42);
  g.lineBetween(-12, -42, 12, -58);
  g.fillStyle(0xfff176, 1);
  g.fillCircle(0, -50, 3);
}

/** 盾营：矮胖弧顶（84x38, 圆角 14） + 4 圆弧城垛 + 正面圆盾徽 */
function drawShieldCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 100, 28);

  // 主体（矮胖大圆角）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-42, -6, 84, 38, 14);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-42, -6, 84, 38, 14);

  // 4 圆弧城垛（三角近似拱形）
  for (let i = 0; i < 4; i++) {
    const cx = -30 + i * 20;
    g.fillStyle(color, 1);
    g.fillTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
  }

  // 装饰条
  g.fillStyle(accent, 0.7);
  g.fillRect(-40, 10, 80, 6);

  // 门洞（拱形）
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 4, 18, 28, 9);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 4, 18, 28, 9);

  // 圆盾徽（正面顶端）
  g.fillStyle(0xb0bec5, 1);
  g.fillCircle(0, -32, 10);
  g.lineStyle(2, 0x78909c, 0.8);
  g.strokeCircle(0, -32, 10);
  g.fillStyle(0xcfd8dc, 0.9);
  g.fillCircle(0, -32, 4);
}

/** 弓营：高瘦尖塔（44x62） + 三角顶 + 窄箭口 + 顶部箭羽饰 */
function drawArcherCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 64, 22);

  // 主体（高瘦）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-22, -30, 44, 62, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-22, -30, 44, 62, 3);

  // 三角尖顶
  g.fillStyle(color, 1);
  g.fillTriangle(-22, -30, 22, -30, 0, -58);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeTriangle(-22, -30, 22, -30, 0, -58);

  // 装饰条
  g.fillStyle(accent, 0.8);
  g.fillRect(-20, 8, 40, 5);

  // 窄箭口
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(-3, -20, 6, 14, 1);

  // 门洞（窄）
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-7, 6, 14, 26, 2);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-7, 6, 14, 26, 2);

  // 顶部箭羽饰
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(0, -72, 0, -58);
  g.fillStyle(accent, 1);
  g.fillTriangle(0, -74, -5, -68, 5, -68);
  g.lineStyle(1, 0xffffff, 1);
  g.lineBetween(-3, -70, 3, -70);
}

/** 投矛营：斜顶塔（60x50 主体 + 梯形顶） + 斜纹装饰 + 三叉戟顶饰 */
function drawJavelinCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 80, 24);

  // 主体
  g.fillStyle(color, 1);
  g.fillRoundedRect(-30, -18, 60, 50, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-30, -18, 60, 50, 3);

  // 斜顶（梯形）
  const roof = [
    { x: -30, y: -18 },
    { x: 30, y: -18 },
    { x: 22, y: -38 },
    { x: -22, y: -38 },
  ];
  g.fillStyle(color, 1);
  g.fillPoints(roof, true);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokePoints(roof, true);

  // 4 道斜纹
  g.lineStyle(3, accent, 0.8);
  for (let i = 0; i < 4; i++) {
    const sx = -26 + i * 14;
    g.lineBetween(sx, 6, sx + 8, 14);
  }

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 4, 18, 28, 3);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 4, 18, 28, 3);

  // 三叉戟顶饰
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(0, -50, 0, -38);
  g.lineStyle(2.5, accent, 1);
  g.lineBetween(-7, -56, -7, -48);
  g.lineBetween(0, -59, 0, -48);
  g.lineBetween(7, -56, 7, -48);
  g.lineStyle(2, accent, 1);
  g.lineBetween(-9, -48, 9, -48);
}
```

- [ ] **Step 2: tsc 验证**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 全测试**

Run: `npx vitest run`
Expected: 全绿

- [ ] **Step 4: 浏览器验证**

```
npm run dev
```
- 在画布上各放置 4 种红/蓝军营，确认 4 种造型清晰可辨：剑营宽 / 盾营矮胖 / 弓营高瘦 / 投矛营斜顶
- 暂停后用滚轮放大确认细节（双剑、盾徽、箭羽、三叉戟）

- [ ] **Step 5: 提交**

```bash
git add src/game/campRenderer.ts
git commit -m "feat(visual): 4 differentiated camp shapes (sword/shield/archer/javelin)"
```

---

## Task 5: 单位渲染重构 — body 子容器 + 走路弹跳

**目的：** 把 `unitRenderer` 的 graphics 抽到独立的 body 子容器，让走路时只动 body（血条不抖）；走路弹跳用程序化偏移（无 tween 实例）。攻击/受击/死亡留待下一任务。

**Files:**
- Modify: `src/game/unitRenderer.ts`

- [ ] **Step 1: 完整替换 `src/game/unitRenderer.ts`**

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit, UnitKind, Faction } from './types';

const SKIN = 0xffcc80;
const BODY_W = 2.5;
const CORPSE_COLOR = 0x777777;

/**
 * View 数据约定（存于 container.data）：
 *   body:  Phaser.GameObjects.Container — 装 graphics + 武器，可独立 tween
 *   anim:  动作状态（相位 / 兵种 / 受击时间 / 上一次 attackTimer）
 */
interface AnimState {
  walkPhaseOffset: number;  // 每个单位独立相位（0..1），防止齐步走
  kind: UnitKind;
  hitFlashUntil: number;    // 受击闪白结束时间（performance.now ms）
  prevAttackTimer: number;  // 检测攻击触发用
}

function drawStickFigure(g: Phaser.GameObjects.Graphics, faction: Faction, kind: UnitKind): void {
  const color = FACTION_COLORS[faction];

  // 落影
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(0, 16, 22, 7);

  // 腿
  g.lineStyle(BODY_W, color, 1);
  g.lineBetween(0, 3, -6, 14);
  g.lineBetween(0, 3, 6, 14);

  // 身体
  g.lineStyle(BODY_W + 0.5, color, 1);
  g.lineBetween(0, -8, 0, 3);

  // 头
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -15, 7);
  g.lineStyle(1.2, 0x000000, 0.2);
  g.strokeCircle(0, -15, 7);

  // 眼睛
  g.fillStyle(0x000000, 0.7);
  g.fillCircle(-2.5, -15, 1.2);
  g.fillCircle(2.5, -15, 1.2);

  // 嘴
  g.lineStyle(1, 0x000000, 0.4);
  g.beginPath();
  g.arc(0, -12, 3, 0.2, Math.PI - 0.2);
  g.strokePath();

  drawWeapon(g, kind, color);
}

function drawWeapon(g: Phaser.GameObjects.Graphics, kind: UnitKind, color: number): void {
  switch (kind) {
    case 'sword': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -9, 1);
      g.lineBetween(0, -5, 10, -2);
      g.lineStyle(3, 0xffd54f, 1);
      g.lineBetween(10, -2, 17, -10);
      g.lineStyle(1.5, 0xfff176, 0.7);
      g.lineBetween(11, -2, 7, 3);
      break;
    }
    case 'shield': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 9, 2);
      g.lineBetween(0, -5, -9, 1);
      g.fillStyle(0xb0bec5, 0.85);
      g.fillCircle(-11, 2, 7);
      g.lineStyle(2, 0x78909c, 0.8);
      g.strokeCircle(-11, 2, 7);
      g.fillStyle(0xcfd8dc, 0.7);
      g.fillCircle(-11, 2, 3.5);
      break;
    }
    case 'archer': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -3, 0);
      g.lineBetween(0, -5, -3, 6);
      g.lineStyle(2.5, 0x66bb6a, 1);
      const bx = -8, by = -4;
      g.beginPath();
      g.moveTo(bx, by);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const px = bx + Math.sin(t * Math.PI) * 5;
        const py = by + t * 16;
        g.lineTo(px, py);
      }
      g.strokePath();
      g.lineStyle(2.5, 0xffd54f, 1);
      g.lineBetween(-8, 6, 9, 6);
      g.fillStyle(0xff7043, 1);
      g.fillTriangle(9, 6, 5, 3, 5, 9);
      break;
    }
    case 'javelin': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -8, 4);
      g.lineBetween(0, -5, 6, -10);
      g.lineStyle(2.8, 0xff8a65, 1);
      g.lineBetween(6, -10, 16, -20);
      g.fillStyle(0xffab91, 1);
      g.fillCircle(16, -20, 3);
      break;
    }
  }
}

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  // body 子容器：装 graphics，承担弹跳/旋转/闪白
  const body = scene.add.container(0, 0);
  const g = scene.add.graphics();
  drawStickFigure(g, unit.faction, unit.kind);
  body.add(g);

  // 血条（不参与 body 变换）
  const hpBg = scene.add.rectangle(0, -26, 22, 3.5, 0x000000, 0.5).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-11, -26, 22 * ratio, 3, hpC).setOrigin(0, 0.5);

  const root = scene.add.container(unit.x, unit.y, [body, hpBg, hpFill]);

  const anim: AnimState = {
    walkPhaseOffset: (simpleHash(unit.id) % 1000) / 1000,
    kind: unit.kind,
    hitFlashUntil: 0,
    prevAttackTimer: unit.attackTimer,
  };
  root.setData('anim', anim);
  root.setData('body', body);
  return root;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);

  // 死亡处理：只在第一帧切换为尸体并锁定
  if (!unit.alive) {
    if (view.getData('corpse') !== true) {
      view.removeAll(true);
      const g = view.scene.add.graphics();
      drawCorpse(g);
      view.add(g);
      view.setData('corpse', true);
    }
    view.setAlpha(Math.max(0.4, unit.deathTimer / 0.3));
    return;
  }

  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body) return;

  // 走路弹跳：仅 state==='moving' 时 body 上下浮动 + 摇摆。
  // 关键：attacking 状态下绝不触碰 body 变换，否则会覆盖 Task 6 的攻击 tween。
  if (unit.state === 'moving') {
    const t = (performance.now() / 400) + anim.walkPhaseOffset;
    const phase = (t % 1) * Math.PI * 2;
    body.y = -Math.abs(Math.sin(phase)) * 4;  // 0..-4 弹跳
    body.rotation = Math.sin(phase) * 0.05;   // ±3° 摇摆
  } else if (unit.state === 'idle') {
    // 仅 idle（无目标）时归零；attacking 时交给攻击 tween
    body.y = 0;
    body.rotation = 0;
  }
  // attacking：不改 body（攻击 tween 拥有控制权，结束后归零）

  // 血条更新（child[1]=bg, child[2]=fill）
  const hpFill = view.getAt(2) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(22 * ratio, 3);
    const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    hpFill.setFillStyle(c);
  }
}

function drawCorpse(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.1);
  g.fillEllipse(0, 4, 28, 9);
  g.lineStyle(BODY_W + 0.5, CORPSE_COLOR, 0.8);
  g.lineBetween(-12, 0, 10, 0);
  g.lineStyle(BODY_W, CORPSE_COLOR, 0.7);
  g.lineBetween(-6, 0, -12, 8);
  g.lineBetween(-6, 0, -2, 9);
  g.fillStyle(CORPSE_COLOR, 0.8);
  g.fillCircle(12, -1, 5.5);
  g.lineStyle(1, 0x555555, 0.5);
  g.strokeCircle(12, -1, 5.5);
  g.lineStyle(1.2, 0x555555, 0.7);
  g.lineBetween(10, -3, 14, 1);
  g.lineBetween(14, -3, 10, 1);
  g.lineStyle(BODY_W - 0.3, CORPSE_COLOR, 0.6);
  g.lineBetween(4, 0, 10, 8);
  g.lineBetween(2, 0, -4, 7);
}
```

- [ ] **Step 2: tsc + 全测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors + 全绿

- [ ] **Step 3: 浏览器验证走路弹跳**

```
npm run dev
```
- 放置红蓝两军营，开启战斗
- 观察小兵移动时上下浮动 + 轻微摇摆，停下攻击时不浮动
- 不同小兵相位错开（不齐步走）

- [ ] **Step 4: 提交**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(visual): refactor unitRenderer with body subcontainer + walk bounce"
```

---

## Task 6: 攻击动作（剑兵挥砍 / 弓兵射箭 / 投矛 / 盾兵猛击）+ 受击闪白 + 接入 BattleScene

**目的：** 检测 `unit.attackTimer` 在 sim 步进里被重置（从 ≤0.05 跳回 ≥interval*0.9），即触发一次攻击动作 tween；监听 `meleeHit` 事件触发受击闪白；把 EffectManager 接入 `BattleScene`。

**Files:**
- Modify: `src/game/unitRenderer.ts`
- Modify: `src/game/BattleScene.ts`

- [ ] **Step 1: 在 `src/game/unitRenderer.ts` 末尾追加攻击 + 受击函数**

```ts
/**
 * 检测 attackTimer 从低被重置为高（即刚开火）→ 触发对应动作。
 * 由 BattleScene 在 sync 时调用。
 */
export function maybeTriggerAttackAnim(
  view: Phaser.GameObjects.Container,
  unit: Unit
): void {
  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body || !unit.alive) return;

  // attackTimer 刚从 ≤0.05 跳回到 ≥interval*0.9 → 视为开火
  const justFired = anim.prevAttackTimer <= 0.05 && unit.attackTimer >= unit.attackInterval * 0.9;
  anim.prevAttackTimer = unit.attackTimer;
  if (!justFired) return;

  switch (anim.kind) {
    case 'sword':   playSlashAnim(body); break;
    case 'shield':  playBashAnim(body); break;
    case 'archer':  playBowAnim(body); break;
    case 'javelin': playJavelinAnim(body); break;
  }
}

/** 剑兵挥砍：body 旋转挥砍（yoyo 回到 0，不与 walk 冲突） */
function playSlashAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    rotation: { from: 0, to: 0.5 },
    y: 0,           // 顺手把竖直位置归零（可能停在 walk 半程）
    duration: 120,
    yoyo: true,
    ease: 'Cubic.easeOut',
  });
}

/** 盾兵猛击：body 前推 + 回弹 */
function playBashAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    x: { from: 0, to: 4 },
    y: 0,
    duration: 180,
    yoyo: true,
    ease: 'Sine.easeInOut',
  });
}

/** 弓兵射箭：body 短促后缩（模拟拉弦回收） */
function playBowAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    x: { from: 0, to: -3 },
    y: 0,
    duration: 100,
    yoyo: true,
    ease: 'Quad.easeOut',
  });
}

/** 投矛：body 上扬旋转 */
function playJavelinAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    rotation: { from: 0, to: 0.2 },
    y: { from: 0, to: -2 },
    duration: 200,
    yoyo: true,
    ease: 'Cubic.easeOut',
  });
}

/**
 * 受击闪白：覆盖一层白色 graphics 0.15s 淡出 + body 抖动。
 */
export function triggerHitFlash(view: Phaser.GameObjects.Container): void {
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!body) return;

  const flash = body.scene.add.graphics();
  flash.fillStyle(0xffffff, 0.7);
  flash.fillCircle(0, -10, 14);  // 覆盖头+身体范围
  body.add(flash);

  body.scene.tweens.add({
    targets: flash,
    alpha: { from: 0.7, to: 0 },
    duration: 150,
    onComplete: () => flash.destroy(),
  });

  body.scene.tweens.add({
    targets: body,
    x: { from: -2, to: 2 },
    duration: 60,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });
}
```

- [ ] **Step 2: 修改 `src/game/BattleScene.ts`**

文件顶部 import 区，把：
```ts
import { drawUnit, updateUnitView } from './unitRenderer';
```
改为：
```ts
import { drawUnit, updateUnitView, maybeTriggerAttackAnim, triggerHitFlash } from './unitRenderer';
import { EffectManager } from './effects/EffectManager';
```

类字段区（在 `private unitManager!: UnitManager;` 附近）追加：
```ts
private effects!: EffectManager;
```

`create()` 末尾（`this.unitManager = new UnitManager(this.gameState);` 之后）追加：
```ts
this.effects = new EffectManager(this);
```

`update()` 中模拟循环结束后追加事件排干。把：
```ts
const steps = this.clock.consume(deltaMs, this.gameState.sim.running, this.gameState.sim.speed);
const dt = this.clock.fixedDt();
for (let i = 0; i < steps; i++) {
  this.campManager.step(dt);
  this.unitManager.step(dt);
  CombatSystem.step(this.gameState, dt);
  this.gameState.sim.timeMs += dt * 1000;
}

this.syncUnitViews();
this.syncProjectileViews();
this.bridge.emit('statsChanged');
```
改为：
```ts
const steps = this.clock.consume(deltaMs, this.gameState.sim.running, this.gameState.sim.speed);
const dt = this.clock.fixedDt();
for (let i = 0; i < steps; i++) {
  this.campManager.step(dt);
  this.unitManager.step(dt);
  CombatSystem.step(this.gameState, dt);
  this.gameState.sim.timeMs += dt * 1000;
}

// 排干事件队列 → 派发到特效层 + 受击闪白
if (this.gameState.events.length > 0) {
  for (const ev of this.gameState.events) {
    if (ev.kind === 'meleeHit') {
      for (const u of this.gameState.allUnits()) {
        if (u.alive && Math.abs(u.x - ev.x) < 1 && Math.abs(u.y - ev.y) < 1) {
          const v = this.unitViews.get(u.id);
          if (v) triggerHitFlash(v);
          break;
        }
      }
    }
  }
  this.effects.dispatch(this.gameState.events);
  this.gameState.events.length = 0;
}

this.syncUnitViews();
this.syncProjectileViews();
this.bridge.emit('statsChanged');
```

`syncUnitViews()` 中，把：
```ts
updateUnitView(view, u);
```
改为：
```ts
updateUnitView(view, u);
maybeTriggerAttackAnim(view, u);
```

- [ ] **Step 3: tsc + 全测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors + 全绿

- [ ] **Step 4: 浏览器验证**

```
npm run dev
```
- 战斗时观察：
  - 剑兵在攻击范围内有可见旋转挥砍
  - 弓/投矛兵开火时身体微缩/上扬
  - 盾兵前推
  - 受伤瞬间小兵闪白且短暂抖动
  - 命中爆星 ✦ 在受击点弹出
- 用 Space 反复暂停/恢复可看清单次动作

- [ ] **Step 5: 提交**

```bash
git add src/game/unitRenderer.ts src/game/BattleScene.ts
git commit -m "feat(visual): unit attack tweens + hit flash + dispatch combat events"
```

---

## Task 7: 弹道残影 + 死亡倒下动画

**目的：** `projectileRenderer` 添加尾巴残影 + 朝向；`unitRenderer` 死亡分支改为先旋转倒下再切尸体。军营震屏 / 摧毁特效已由 EffectManager 在 Task 3 接通，无需再改。

**Files:**
- Modify: `src/game/projectileRenderer.ts`
- Modify: `src/game/unitRenderer.ts`

- [ ] **Step 1: 完整替换 `src/game/projectileRenderer.ts`**

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[p.faction];
  const trail = scene.add.graphics();
  trail.fillStyle(color, 0.4);
  trail.fillRect(-12, -1.5, 12, 3);

  const head = scene.add.graphics();
  head.fillStyle(color, 0.95);
  head.fillCircle(0, 0, 3);
  head.fillStyle(0xffffff, 0.6);
  head.fillCircle(0, 0, 1.5);

  const root = scene.add.container(p.x, p.y, [trail, head]);
  root.setData('prevX', p.x);
  root.setData('prevY', p.y);
  return root;
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  const prevX = view.getData('prevX') as number;
  const prevY = view.getData('prevY') as number;
  const dx = p.x - prevX;
  const dy = p.y - prevY;
  view.setPosition(p.x, p.y);
  if (dx !== 0 || dy !== 0) {
    view.setRotation(Math.atan2(dy, dx));
  }
  view.setData('prevX', p.x);
  view.setData('prevY', p.y);
}
```

- [ ] **Step 2: 修改 `src/game/unitRenderer.ts` 的死亡分支**

在 `updateUnitView` 中，把：
```ts
if (!unit.alive) {
  if (view.getData('corpse') !== true) {
    view.removeAll(true);
    const g = view.scene.add.graphics();
    drawCorpse(g);
    view.add(g);
    view.setData('corpse', true);
  }
  view.setAlpha(Math.max(0.4, unit.deathTimer / 0.3));
  return;
}
```
改为：
```ts
if (!unit.alive) {
  if (view.getData('corpse') !== true) {
    // 第一次进入死亡：先播倒下旋转 → 再切尸体
    const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
    if (body) {
      view.scene.tweens.add({
        targets: body,
        rotation: Math.PI / 2,
        duration: 250,
        ease: 'Cubic.easeIn',
      });
    }
    view.setData('corpse', true);
    view.scene.time.delayedCall(280, () => {
      if (!view.scene) return;
      view.removeAll(true);
      const g = view.scene.add.graphics();
      drawCorpse(g);
      view.add(g);
    });
  }
  view.setAlpha(Math.max(0.4, unit.deathTimer / 0.3));
  return;
}
```

- [ ] **Step 3: tsc + 全测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors + 全绿

- [ ] **Step 4: 浏览器验证完整效果**

```
npm run dev
```
确认：
- 弓箭/投矛飞行时拖尾巴 + 朝向运动方向
- 小兵死亡瞬间：旋转倒下 → ★ 星星弹出（EffectManager 接管）→ 切灰色尸体保留
- 军营被攻击：屏幕轻微抖动（仅 1-2px，不晕）
- 军营被摧毁：积木向两侧弹散 + 3 圈灰烟扩散
- 大量战斗（>50 同屏特效）时新触发被丢弃但游戏不卡顿

- [ ] **Step 5: 提交**

```bash
git add src/game/projectileRenderer.ts src/game/unitRenderer.ts
git commit -m "feat(visual): projectile trails + death fall tween"
```

---

## Task 8: 收尾验证

**目的：** 完整跑一遍，确认所有视觉决策都落地、无回归、性能可接受。

- [ ] **Step 1: 全测试 + tsc**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors + 全部测试通过（原 36 + 新 9）

- [ ] **Step 2: 完整功能验证清单（浏览器）**

```
npm run dev
```
依次确认：
- [ ] 4 种军营造型清晰可辨（剑/盾/弓/投矛）
- [ ] 走路时小兵上下弹跳，停止/攻击时静止
- [ ] 4 种攻击动作各异：剑挥砍 / 盾前推 / 弓回缩 / 矛上扬
- [ ] 受击闪白 + 抖动
- [ ] 命中爆星 ✦
- [ ] 弹道残影 + 朝向
- [ ] 死亡倒下旋转 + ★ 星星
- [ ] 军营受击震屏（轻微）
- [ ] 军营摧毁积木 + 烟圈
- [ ] 50 软上限：在 4×4 红蓝大混战下，画面不会持续累积特效到卡顿

- [ ] **Step 3: 所有项通过则输出验证总结（前序任务已 commit）**

---

## 参考：有意省略的事项

按 brainstorm 决策明确**不做**（避免后续误以为漏掉）：
- 不做单位帧动画 sprite sheet（保持程序化 tween）
- 不做军营建造/升级动画（不在本计划范围）
- 不做地形破坏 / 血迹遗留（不在本计划范围）
- 不做音效（PRD 阶段 5 之后再议）
- 不做粒子物理（重力 / 碰撞），统一用线性 tween 近似
