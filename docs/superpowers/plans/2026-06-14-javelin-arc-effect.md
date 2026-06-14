# 投矛兵抛物线特效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让投矛兵的远程攻击有清晰的"蓄力 → 出手 → 归位"身体动作、矛沿高拱抛物线飞行（含影子缩放伪 3D），命中产生强化版黄星特效。

**Architecture:** game state 保持 2D 平面不动，命中判定逻辑零改动。"高度"完全在 renderer 层用 `traveled / EXPECTED_FLIGHT_DIST` 计算视觉 y 偏移。Projectile 加 `kind: 'arrow' | 'javelin'` 字段区分两类弹道。命中事件分发上 `DamageOpts` 加可选 `weaponKind`，让 javelin 命中推 `javelinHit` 事件而非 `meleeHit`。

**Tech Stack:** TypeScript + Phaser 3 + vitest（Node 环境，无 Phaser scene mock）。

**Spec：** [docs/superpowers/specs/2026-06-14-javelin-arc-effect-design.md](../specs/2026-06-14-javelin-arc-effect-design.md)

---

## File Structure

| File | 改动类型 | 责任 |
|---|---|---|
| `src/game/types.ts` | 修改 | 加 `ProjectileKind` 类型 + `Projectile.kind` 字段 |
| `src/game/effects/types.ts` | 修改 | 加 `javelinHit` 联合类型 |
| `src/game/managers/CombatSystem.ts` | 修改 | `DamageOpts.weaponKind` + 命中事件按 weaponKind 分发；step 中弹道命中处传 `weaponKind: p.kind` |
| `src/game/managers/UnitManager.ts` | 修改 | 创建 projectile 时填 `kind` |
| `src/game/effects/EffectManager.ts` | 修改 | 加 `spawnJavelinHit` + dispatch case |
| `src/game/BattleScene.ts` | 修改 | 受击闪白扩展到 `javelinHit` |
| `src/game/projectileRenderer.ts` | 修改 | drawProjectile / updateProjectileView 按 kind 分支；javelin 走抛物线 + 影子 |
| `src/game/unitRenderer.ts` | 修改 | `playJavelinAnim` 替换为三段式 |
| `tests/CombatSystem.test.ts` | 修改 | 既有 Projectile fixture 加 `kind: 'arrow'` |
| `tests/CombatSystem.events.test.ts` | 修改 | 加 javelin 命中推 `javelinHit` 测试 |

---

## Task 1: Projectile 加 kind 字段（数据契约）

**Files:**
- Modify: `src/game/types.ts:63-73`

- [ ] **Step 1: 给 types.ts 加 ProjectileKind 类型 + Projectile.kind 字段**

修改 [src/game/types.ts:63-73](../../../src/game/types.ts#L63-L73)，把 `Projectile` 接口替换为：

```ts
export type ProjectileKind = 'arrow' | 'javelin';

export interface Projectile {
  id: string;
  kind: ProjectileKind;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  faction: Faction;
  elapsed: number;
  maxTime: number;
}
```

- [ ] **Step 2: 跑构建验证 TS 报错指出所有要改的位置**

```bash
cd e:/0-projects/ai-games/camp-clash && npm run build 2>&1 | head -30
```

期望：构建失败，TS 报告以下文件缺少 `kind` 字段：
- `src/game/managers/UnitManager.ts`（创建 projectile）
- `tests/CombatSystem.test.ts`（mock projectile）

这是预期 — Task 2 / Task 8 会修。本步**不要 commit**，留给后续任务一并提交。

---

## Task 2: UnitManager 创建 projectile 时填 kind

**Files:**
- Modify: `src/game/managers/UnitManager.ts:75-78`

- [ ] **Step 1: 在 push projectile 处加 kind**

修改 [src/game/managers/UnitManager.ts:75-78](../../../src/game/managers/UnitManager.ts#L75-L78)：

```ts
this.gs.projectiles.push({
  id: crypto.randomUUID(),
  kind: u.kind === 'javelin' ? 'javelin' : 'arrow',
  x: u.x, y: u.y, targetId: u.targetId!,
  speed: 200, damage: u.attack, faction: u.faction, elapsed: 0, maxTime: 2,
});
```

> 注意：现有代码这里是多行扁平 push；保持原有缩进与风格，只在合适位置插 `kind`。

- [ ] **Step 2: 验证构建**

```bash
npm run build 2>&1 | tail -10
```

期望：UnitManager 不再报 `kind` 缺失。其他文件（CombatSystem.test.ts）仍报错 — Task 8 修。

---

## Task 3: CombatEvent 加 javelinHit + DamageOpts 加 weaponKind

**Files:**
- Modify: `src/game/effects/types.ts`
- Modify: `src/game/managers/CombatSystem.ts:12-14`

- [ ] **Step 1: 给 CombatEvent 联合类型加 javelinHit**

修改 [src/game/effects/types.ts](../../../src/game/effects/types.ts)：

```ts
import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
```

- [ ] **Step 2: 给 DamageOpts 加 weaponKind 字段**

修改 [src/game/managers/CombatSystem.ts:12-14](../../../src/game/managers/CombatSystem.ts#L12-L14)：

```ts
export interface DamageOpts {
  source: 'melee' | 'ranged';
  /** 仅 source==='ranged' 时有意义；用于命中特效分发。 */
  weaponKind?: 'arrow' | 'javelin';
}
```

- [ ] **Step 3: 验证构建（仅类型变更，应该通过 — 没有调用方传 weaponKind）**

```bash
npm run build 2>&1 | tail -10
```

期望：构建错误数量不增加（Task 1 / Task 8 的错误仍存在，但 Task 3 的改动不引入新错误）。

---

## Task 4: applyDamage 按 weaponKind 分发命中事件 (TDD)

**Files:**
- Modify: `tests/CombatSystem.events.test.ts`
- Modify: `src/game/managers/CombatSystem.ts:20-32`

- [ ] **Step 1: 写失败测试 — javelin 命中推 javelinHit**

在 [tests/CombatSystem.events.test.ts](../../../tests/CombatSystem.events.test.ts) 末尾、`describe` 闭合 `})` 前加：

```ts
  it('远程命中且 weaponKind=javelin 时发射 javelinHit 事件而非 meleeHit', () => {
    const u = mkUnit({ x: 11, y: 22 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'javelin' });
    const e = gs.events.find(ev => ev.kind === 'javelinHit') as Extract<CombatEvent, { kind: 'javelinHit' }>;
    expect(e).toBeDefined();
    expect(e.x).toBe(11);
    expect(e.y).toBe(22);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('远程命中且 weaponKind=arrow 仍发射 meleeHit（沿用现状）', () => {
    const u = mkUnit({ x: 5, y: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'arrow' });
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
  });
```

- [ ] **Step 2: 运行测试验证 javelin 用例失败、arrow 用例通过**

```bash
npm test -- --run tests/CombatSystem.events.test.ts 2>&1 | tail -25
```

期望：javelin 用例 FAIL（事件数组里只有 meleeHit，没有 javelinHit），arrow 用例 PASS（既有逻辑就推 meleeHit）。如果都通过/都失败则停下检查。

- [ ] **Step 3: 改 applyDamage — 按 weaponKind 分发**

修改 [src/game/managers/CombatSystem.ts:20-32](../../../src/game/managers/CombatSystem.ts#L20-L32) 的 unit 分支：

```ts
    if ('alive' in target) {
      // 单位被打：发命中事件（无论是否致死）。weaponKind=javelin 走独立 javelinHit。
      const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
      gs.events.push(isJavelin
        ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
        : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
      );
      if (target.hp <= 0) {
        target.alive = false;
        target.state = 'idle';
        target.deathTimer = 1.0;
        const camp = gs.camps.get(target.campId);
        if (camp) camp.aliveUnits = Math.max(0, camp.aliveUnits - 1);
        const killerFaction = target.faction === 'red' ? 'blue' : 'red';
        gs.stats[killerFaction].kills++;
        gs.events.push({ kind: 'unitDeath', unitId: target.id, x: target.x, y: target.y, faction: target.faction });
      }
    } else {
```

> 关键：保持死亡分支完全不动；只把单步 `gs.events.push({kind:'meleeHit',...})` 改为三元 push。这样 [tests/CombatSystem.test.ts:24-30](../../../tests/CombatSystem.test.ts#L24-L30) 的"melee kills"等测试不会回归。

- [ ] **Step 4: 验证测试通过**

```bash
npm test -- --run tests/CombatSystem.events.test.ts 2>&1 | tail -15
```

期望：javelin + arrow 用例均 PASS。其它测试保持通过。

---

## Task 5: CombatSystem.step 在弹道命中处传 weaponKind

**Files:**
- Modify: `src/game/managers/CombatSystem.ts:60-62`

- [ ] **Step 1: 修改弹道命中调用**

修改 [src/game/managers/CombatSystem.ts:60-62](../../../src/game/managers/CombatSystem.ts#L60-L62)：

```ts
      if (dist < 12) {
        CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, {
          source: 'ranged',
          weaponKind: p.kind,
        });
        continue;
      }
```

- [ ] **Step 2: 跑全部测试（CombatSystem 现在依赖 p.kind，CombatSystem.test.ts 的 fixture 缺 kind 会失败）**

```bash
npm test 2>&1 | tail -20
```

期望：[tests/CombatSystem.test.ts](../../../tests/CombatSystem.test.ts) 的 "弹道命中目标扣血" / "弹道超时落空" 这两条因 Projectile 缺 kind 而 TS 编译失败。下一步修。

---

## Task 6: 修测试 fixture — Projectile 必填 kind

**Files:**
- Modify: `tests/CombatSystem.test.ts:42`
- Modify: `tests/CombatSystem.test.ts:49`

- [ ] **Step 1: 给两条 mock projectile 加 kind: 'arrow'**

修改 [tests/CombatSystem.test.ts:42](../../../tests/CombatSystem.test.ts#L42)：

```ts
    const p: Projectile = { id: 'p1', kind: 'arrow', x: 195, y: 0, targetId: 'target', speed: 200, damage: 20, faction: 'blue', elapsed: 0, maxTime: 2 };
```

修改 [tests/CombatSystem.test.ts:49](../../../tests/CombatSystem.test.ts#L49)：

```ts
    const p: Projectile = { id: 'p1', kind: 'arrow', x: 0, y: 0, targetId: 'nobody', speed: 200, damage: 20, faction: 'blue', elapsed: 1.9, maxTime: 2 };
```

- [ ] **Step 2: 跑测试 + 构建**

```bash
npm test 2>&1 | tail -10 && npm run build 2>&1 | tail -5
```

期望：77+ 全 pass、构建成功。

- [ ] **Step 3: Commit Task 1-6 一起（数据 + 事件契约层）**

```bash
git add src/game/types.ts src/game/managers/UnitManager.ts \
        src/game/effects/types.ts src/game/managers/CombatSystem.ts \
        tests/CombatSystem.events.test.ts tests/CombatSystem.test.ts
git commit -m "feat(combat): Projectile 加 kind + 命中事件按 weaponKind 分发

- Projectile.kind: 'arrow' | 'javelin'，UnitManager 创建时按兵种填
- DamageOpts.weaponKind 可选，仅 ranged 命中时使用
- javelin 命中推 javelinHit 事件、arrow 沿用 meleeHit
- CombatSystem.step 弹道命中处把 p.kind 传给 applyDamage

为投矛抛物线特效铺数据基础；命中判定逻辑零改动。"
```

---

## Task 7: EffectManager 加 spawnJavelinHit + dispatch case

**Files:**
- Modify: `src/game/effects/EffectManager.ts`

- [ ] **Step 1: dispatch 加 javelinHit case**

修改 [src/game/effects/EffectManager.ts:32-41](../../../src/game/effects/EffectManager.ts#L32-L41)：

```ts
  /** 排干一批事件（由 BattleScene 每帧调用） */
  dispatch(events: CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
    }
  }
```

- [ ] **Step 2: 加 spawnJavelinHit 方法（中心大星 + 四角小星）**

在 [src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) 内 `spawnMeleeStars` 之后插入：

```ts
  /** 投矛命中：中心大 ✦（缩放放大）+ 4 颗小 ✦ 散向四角（0.7s 生命） */
  private spawnJavelinHit(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 中心大星：缩放 0.4 → 1.8 + 淡出
    const center = this.scene.add.text(0, 0, '✦', {
      fontSize: '24px', color: '#fff176', fontStyle: 'bold',
    }).setOrigin(0.5).setScale(0.4);
    root.add(center);
    this.scene.tweens.add({
      targets: center,
      scale: { from: 0.4, to: 1.8 },
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });

    // 四角小星：分别飞向 (+25,-15) (-25,-15) (+25,+15) (-25,+15)
    const offsets: [number, number][] = [[25, -15], [-25, -15], [25, 15], [-25, 15]];
    for (const [dx, dy] of offsets) {
      const star = this.scene.add.text(0, 0, '✦', {
        fontSize: '14px', color: '#fff176', fontStyle: 'bold',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: dx, y: dy,
        alpha: { from: 1, to: 0 },
        duration: 700,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(750, () => {
      root.destroy();
      this.budget.release();
    });
  }
```

- [ ] **Step 3: 验证构建（无新单测，靠目测）**

```bash
npm run build 2>&1 | tail -5
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/game/effects/EffectManager.ts
git commit -m "feat(effects): 投矛命中强化版黄星特效

dispatch 新增 javelinHit case；spawnJavelinHit 画中心大 ✦（24px
缩放 0.4→1.8，0.6s）+ 四角小 ✦（14px 散开 25px，0.7s）。
EffectBudget 软上限沿用。"
```

---

## Task 8: BattleScene 受击闪白扩展到 javelinHit

**Files:**
- Modify: `src/game/BattleScene.ts:114-128`

- [ ] **Step 1: 加 javelinHit 到闪白触发条件**

修改 [src/game/BattleScene.ts:115-125](../../../src/game/BattleScene.ts#L115-L125)：

```ts
    if (this.gameState.events.length > 0) {
      for (const ev of this.gameState.events) {
        if (ev.kind === 'meleeHit' || ev.kind === 'javelinHit') {
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
```

- [ ] **Step 2: 验证构建**

```bash
npm run build 2>&1 | tail -5
```

期望：构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/game/BattleScene.ts
git commit -m "feat(scene): 投矛命中也触发受击闪白

将 javelinHit 加入触发 triggerHitFlash 的事件白名单。"
```

---

## Task 9: projectileRenderer 抛物线 + 影子（核心视觉）

**Files:**
- Modify: `src/game/projectileRenderer.ts`

- [ ] **Step 1: 完整重写 projectileRenderer.ts**

完整替换 [src/game/projectileRenderer.ts](../../../src/game/projectileRenderer.ts)：

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

/** 投矛抛物线峰值高度（世界坐标 px） */
const JAVELIN_MAX_H = 40;

/**
 * 投矛预期飞行距离（世界坐标 px）。与 config/units.ts 中 javelin.attackRange=150 同步。
 * 用 traveled / EXPECTED_DIST 而非 elapsed / maxTime 算 t —— maxTime=2.0s 是超时上限，
 * 远大于实际飞行时长（≈0.75s），用 elapsed/maxTime 会让 t 始终 < 0.5、矛永远到不了峰值。
 */
const JAVELIN_EXPECTED_DIST = 150;

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  if (p.kind === 'javelin') return drawJavelin(scene, p);
  return drawArrow(scene, p);
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  if (p.kind === 'javelin') return updateJavelin(view, p);
  return updateArrow(view, p);
}

/* ───── 箭矢（沿用现状） ───── */

function drawArrow(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
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

function updateArrow(view: Phaser.GameObjects.Container, p: Projectile): void {
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

/* ───── 投矛：抛物线 + 影子 ───── */

function drawJavelin(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[p.faction];

  // 影子：地面椭圆（不参与高度变换；位置和缩放在 update 里调）
  const shadow = scene.add.ellipse(0, 0, 14, 5, 0x000000, 0.4);

  // 矛体（shaft）：杆 + 矛头。承担视觉 y 偏移 + 自身旋转。
  const shaft = scene.add.graphics();
  shaft.lineStyle(3.5, 0xa1887f, 1);            // 木杆
  shaft.lineBetween(-15, 0, 15, 0);
  shaft.lineStyle(1, 0xd7ccc8, 0.5);            // 高光
  shaft.lineBetween(-13, -2, 13, -2);
  shaft.fillStyle(0xff7043, 1);                 // 矛头
  shaft.fillTriangle(15, 0, 9, -4, 9, 4);
  // 用 faction 色给矛尾加一抹（让红蓝可分辨）
  shaft.fillStyle(color, 0.9);
  shaft.fillRect(-15, -2, 4, 4);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}

function updateJavelin(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    // 兜底：起点丢失则退化为直线
    view.setPosition(p.x, p.y);
    return;
  }

  // container 自身定位在 (p.x, p.y)（地面坐标）。子对象 shaft 自带 y 偏移代表"高度"。
  view.setPosition(p.x, p.y);

  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / JAVELIN_EXPECTED_DIST);
  const visualHeight = 4 * JAVELIN_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / JAVELIN_MAX_H;  // 0..1

  // 矛体：往上抬 visualHeight；旋转从 -45° 通过 0° 到 +45°
  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.5);

  // 影子：始终贴地（y=0 在 container 局部坐标）；按高度缩放和淡化
  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}
```

> **关键改动点解读**：
> - 把 `drawProjectile` / `updateProjectileView` 改成**路由器**，按 `p.kind` 分发到 `drawArrow`/`drawJavelin`。
> - 箭矢路径**完全保留现状**（直线 + 朝向旋转），改动只是把代码迁移到了 `drawArrow`/`updateArrow`。
> - 投矛路径中 container 定位在 `(p.x, p.y)`（地面），子对象 `shaft` 自己再往 -visualHeight 偏移 — 这样影子和矛体可以独立动。
> - `traveled / JAVELIN_EXPECTED_DIST` 而非 `elapsed / maxTime` 见 spec 解释。

- [ ] **Step 2: 验证构建（renderer 没单测，靠目测）**

```bash
npm run build 2>&1 | tail -5
```

期望：构建成功。

- [ ] **Step 3: 跑全部测试确保没破坏**

```bash
npm test 2>&1 | tail -8
```

期望：全部通过（renderer 不在测试范围内）。

- [ ] **Step 4: Commit**

```bash
git add src/game/projectileRenderer.ts
git commit -m "feat(visual): 投矛抛物线飞行 + 地面影子缩放

drawProjectile/update 按 p.kind 分发；arrow 沿用直线，javelin
走 traveled/EXPECTED_DIST=150 推导的抛物线（峰值 40px），
shaft 自身旋转 ±45°，影子按高度缩放和淡化（伪 3D）。"
```

---

## Task 10: 投手三段式出手动作

**Files:**
- Modify: `src/game/unitRenderer.ts:286-295`

- [ ] **Step 1: 替换 playJavelinAnim 为三段式**

修改 [src/game/unitRenderer.ts:286-295](../../../src/game/unitRenderer.ts#L286-L295)（整个 `playJavelinAnim` 函数）：

```ts
/** 投矛三段式：蓄力 0.3s（后仰）→ 出手 0.15s（前甩）→ 归零 0.2s */
function playJavelinAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄力（身体后仰 ≈23°、轻微下压）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.4,
    y: -2,
    duration: 300,
    ease: 'Cubic.easeOut',
  });
  // 段 2：出手（快速前甩到 -14°）
  body.scene.tweens.add({
    targets: body,
    rotation: -0.25,
    y: 0,
    duration: 150,
    ease: 'Cubic.easeIn',
    delay: 300,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 200,
    ease: 'Sine.easeOut',
    delay: 450,
  });
}
```

- [ ] **Step 2: 跑构建 + 测试**

```bash
npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

期望：构建成功、测试全 pass。

- [ ] **Step 3: Commit**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(visual): 投矛兵三段式出手动作

playJavelinAnim 改为蓄力 0.3s（后仰 23° + 下压 2px）→
出手 0.15s（前甩 -14°）→ 归零 0.2s。总 0.65s 远小于 attackInterval=2s。"
```

---

## Task 11: 端到端目测验收

**Files:** （仅运行）

- [ ] **Step 1: 启动 dev 服务器**

```bash
cd e:/0-projects/ai-games/camp-clash && npm run dev
```

打开浏览器到 http://localhost:5173（Vite 默认端口）。

- [ ] **Step 2: 摆开战场**

- 红方左侧放一个**投矛营**（数字键 4 或拖拽 🔱 按钮）
- 蓝方右侧放一个**剑营**（让红方有打击目标）
- 战斗自动开始（`d6373e6` 起的逻辑）
- 把右下"产兵速度"调到 2× 加快观察

- [ ] **Step 3: 按 spec 验收清单逐条核对**

打开 F12 控制台辅助观察。逐条勾掉：

- [ ] 投矛兵开火时身体清晰可见**后仰 → 前甩 → 归位**
- [ ] 矛飞向目标过程中明显高于地面，**中段最高**
- [ ] 矛随飞行倾转：起手低头（朝下） → 中段水平 → 落地俯冲
- [ ] 影子始终在地面，且在矛最高点**最小最淡**
- [ ] 命中目标时能看到**中心大 ✦** + 四角散开**小 ✦**
- [ ] 弓箭仍是直线（在战场加蓝方弓兵营对照）
- [ ] 同时多个投矛兵齐射不卡顿（速度调到 4× / 8× 看）
- [ ] 控制台无新报错（既有 [CampManager] 诊断 warn 不算）

- [ ] **Step 4: 如果有问题，定位到对应任务回炉**

| 现象 | 可能任务 |
|---|---|
| 矛是直线，没抛物线 | Task 1（kind 没填）/ Task 9（drawJavelin 路由） |
| 矛弧度太低/太高 | Task 9 调 `JAVELIN_MAX_H` 或 `JAVELIN_EXPECTED_DIST` |
| 命中没有大星 | Task 7（dispatch case）/ Task 4（事件未推 javelinHit） |
| 投手动作还是单段 yoyo | Task 10 |
| 弓箭表现也变了 | Task 9 — drawArrow/updateArrow 没保持现状 |

修完回到 Step 1 重测。

- [ ] **Step 5: 验收通过后 push**

```bash
git push origin main
```

GitHub Actions 触发 Pages 部署，几分钟后 https://kevinxiang.github.io/camp-calsh/ 可看新效果。

---

## Out-of-Scope（不做）

| 项目 | 原因 |
|---|---|
| 真 3D / Z 轴系统 | spec 明确不做 |
| 投矛 sprite 重绘（持矛位置等） | 不在范围 |
| 修复 applyDamage 已死单位被多打一发（CombatSystem 老 bug） | 与本 feature 无关；已在前一个会话中提及 |
| 攻击 tween 被 state 切换打断的小限制 | spec 已声明为已知限制，沿用现状 |
| projectileRenderer / unitRenderer 单测 | 涉及 Phaser scene/tween，单测代价高、靠目测 |
| EffectManager.dispatch 的 javelinHit 路由测试 | 现行测试零 Phaser，加 mock scene 不值得 |
