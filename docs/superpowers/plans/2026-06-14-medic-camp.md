# 医疗营 + 医疗兵 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增医疗营产医疗兵，远程发绿色治疗弹，优先治 HP 百分比最低的友军/兵营。第一个辅助兵种。

**Architecture:** healAmount>0 标记医疗兵，复用 attackRange/attackInterval 字段和 Projectile 系统。CombatSystem 加 applyHeal 独立方法。UnitManager acquireTarget 加 healer 分支搜索同阵营 HP% 最低目标。

**Tech Stack:** TypeScript + Phaser 3 + vitest。

**Spec:** [docs/superpowers/specs/2026-06-14-medic-camp-design.md](../specs/2026-06-14-medic-camp-design.md)

---

## File Structure

| File | 改动类型 | 责任 |
|---|---|---|
| `src/game/types.ts` | 修改 | CampKind/ProjectileKind 加 medic/heal；UnitDef 加 healAmount |
| `src/config/units.ts` | 修改 | medic 兵种数值 |
| `src/config/camps.ts` | 修改 | medic 营数值 |
| `src/game/effects/types.ts` | 修改 | CombatEvent 加 healHit |
| `src/game/managers/CombatSystem.ts` | 修改 | applyHeal 新方法；step 弹道分发 heal |
| `src/game/managers/UnitManager.ts` | 修改 | acquireTarget healer 分支；act healer 推 heal 弹道 |
| `src/game/effects/EffectManager.ts` | 修改 | dispatch case + spawnHealHit |
| `src/game/projectileRenderer.ts` | 修改 | drawHeal/updateHeal |
| `src/game/unitRenderer.ts` | 修改 | drawWeapon medic case；playMedicAnim；maybeTriggerAttackAnim case |
| `src/game/campRenderer.ts` | 修改 | 颜色映射 + switch case + drawMedicCamp |
| `src/ui/BuildPanel.ts` | 修改 | KINDS 加 medic(Y) — 不加 gated |
| `tests/CombatSystem.heal.test.ts` | **新建** | applyHeal 测试 |
| `tests/CombatSystem.events.test.ts` | 修改 | healHit 事件测试 |
| `tests/camps.test.ts` | 修改 | 4→6 种军营（+medic） |
| `tests/units.test.ts` | 修改 | 4→6 种小兵（+medic） |

---

## Task 1: 数据契约层

**Files:** `src/game/types.ts`, `src/game/effects/types.ts`, `src/config/units.ts`, `src/config/camps.ts`, `tests/camps.test.ts`, `tests/units.test.ts`

- [ ] **Step 1: types.ts — CampKind / ProjectileKind 加 medic/heal + UnitDef 加 healAmount**

```ts
// src/game/types.ts
export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb' | 'medic';
export type ProjectileKind = 'arrow' | 'javelin' | 'bomb' | 'heal';

export interface UnitDef {
  kind: UnitKind;
  attackType: AttackType;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  /** 治疗量（> 0 表示医疗兵） */
  healAmount?: number;
}
```

- [ ] **Step 2: effects/types.ts — 加 healHit**

```ts
| { kind: 'healHit'; x: number; y: number; faction: Faction }
```

- [ ] **Step 3: units.ts / camps.ts — 加 medic 配置**

```ts
// units.ts
medic: { kind: 'medic', attackType: 'ranged', maxHp: 40, attack: 0, attackRange: 150, attackInterval: 2.0, moveSpeed: 40, healAmount: 12 },

// camps.ts
medic: { kind: 'medic', produces: 'medic', maxHp: 350, spawnInterval: 7, unitCap: 10 },
```

- [ ] **Step 4: 修测试 fixture — 4→6 种**

camps.test.ts："包含 5 种军营" → "包含 6 种"。units.test.ts 同理。加 medic 数值断言。

- [ ] **Step 5: 验证 + 提交**

```bash
npm test -- --run tests/camps.test.ts tests/units.test.ts && npm run build 2>&1 | tail -3
git add src/game/types.ts src/game/effects/types.ts src/config/units.ts src/config/camps.ts tests/camps.test.ts tests/units.test.ts
git commit -m "feat(types): 医疗营数据契约 — medic/heal + healAmount 字段"
```

---

## Task 2: CombatSystem.applyHeal + step 分发 (TDD)

**Files:** `tests/CombatSystem.heal.test.ts`（新建）, `tests/CombatSystem.events.test.ts`, `src/game/managers/CombatSystem.ts`

- [ ] **Step 1: 写失败测试 — applyHeal**

创建 [tests/CombatSystem.heal.test.ts](../../../tests/CombatSystem.heal.test.ts)：

```ts
import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit, Projectile } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 200, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 40, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem.applyHeal', () => {
  it('恢复目标 HP', () => {
    const u = mkUnit({ hp: 30, maxHp: 100 });
    CombatSystem.applyHeal(u, 20, mkGS());
    expect(u.hp).toBe(50);
  });

  it('不超过 maxHp', () => {
    const u = mkUnit({ hp: 95, maxHp: 100 });
    CombatSystem.applyHeal(u, 20, mkGS());
    expect(u.hp).toBe(100);
  });

  it('推 healHit 事件', () => {
    const u = mkUnit({ x: 10, y: 20, hp: 30 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyHeal(u, 20, gs);
    expect(gs.events.some(ev => ev.kind === 'healHit')).toBe(true);
  });

  it('也能治兵营', () => {
    const c = mkCamp({ hp: 100, maxHp: 500 });
    CombatSystem.applyHeal(c, 50, mkGS());
    expect(c.hp).toBe(150);
  });

  it('弹道 kind=heal 命中调用 applyHeal', () => {
    const u = mkUnit({ hp: 30, x: 200, y: 0, maxHp: 100 });
    const p: Projectile = { id: 'p1', kind: 'heal', x: 195, y: 0, targetId: 'u1', speed: 200, damage: 20, faction: 'red', elapsed: 0, maxTime: 2 };
    const gs = mkGS({ units: new Map([[u.id, u]]), projectiles: [p] });
    CombatSystem.step(gs, 1);
    expect(u.hp).toBe(50);
    expect(gs.events.some(ev => ev.kind === 'healHit')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试，5 条全 FAIL**

```bash
npx vitest run tests/CombatSystem.heal.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: 实现 applyHeal + step 分发**

在 CombatSystem.ts 加 import `Faction`（如没有），在 `applyAOE` 之后加：

```ts
static applyHeal(target: Unit | Camp, amount: number, gs: CombatGSView): void {
  target.hp = Math.min(target.maxHp, target.hp + amount);
  gs.events.push({ kind: 'healHit', x: target.x, y: target.y, faction: target.faction });
}
```

在 step 的 `dist < 12` 分支加：

```ts
if (p.kind === 'heal') {
  CombatSystem.applyHeal(target as Unit | Camp, p.damage, gs);
  continue;
}
```

- [ ] **Step 4: 验证 5/5 pass + 加 events 测试**

在 CombatSystem.events.test.ts 加 healHit 事件测试。全场 `npm test` 验证。

- [ ] **Step 5: 提交**

```bash
git add src/game/managers/CombatSystem.ts tests/CombatSystem.heal.test.ts tests/CombatSystem.events.test.ts
git commit -m "feat(combat): CombatSystem.applyHeal + step heal 弹道分发"
```

---

## Task 3: UnitManager 治疗目标选择

**Files:** `src/game/managers/UnitManager.ts`

- [ ] **Step 1: acquireTarget 加 healer 分支**

`acquireTarget` 加判断 `UNIT_DEFS[u.kind]?.healAmount`：

```ts
const isHealer = !!UNIT_DEFS[u.kind]?.healAmount;
if (isHealer) {
  // 医疗兵：搜索同阵营 alive unit + 未摧毁 camp，按 hp/maxHp 升序
  const friendlies: { id: string; x: number; y: number; hp: number; maxHp: number }[] = [];
  for (const f of this.gs.units.values()) {
    if (!f.alive || f.faction !== u.faction) continue;
    if (f.hp >= f.maxHp) continue;
    const d = Math.hypot(f.x - u.x, f.y - u.y);
    if (d > (UNIT_DEFS[u.kind]?.attackRange ?? 150)) continue;
    friendlies.push({ id: f.id, x: f.x, y: f.y, hp: f.hp, maxHp: f.maxHp });
  }
  for (const c of this.gs.camps.values()) {
    if (c.destroyed || c.faction !== u.faction) continue;
    if (c.hp >= c.maxHp) continue;
    const d = Math.hypot(c.x - u.x, c.y - u.y);
    if (d > (UNIT_DEFS[u.kind]?.attackRange ?? 150)) continue;
    friendlies.push({ id: c.id, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp });
  }
  friendlies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
  u.targetId = friendlies[0]?.id ?? null;
  return;
}
```

- [ ] **Step 2: act 加 healer 弹道推送**

在 `act` 的 `if (u.attackTimer <= 0)` 分支加：

```ts
if (UNIT_DEFS[u.kind]?.healAmount) {
  this.gs.projectiles.push({
    id: crypto.randomUUID(), kind: 'heal', x: u.x, y: u.y, targetId: u.targetId!,
    speed: 200, damage: UNIT_DEFS[u.kind]!.healAmount!,
    faction: u.faction, elapsed: 0, maxTime: 2,
  });
} else {
  // 既有 ranged/melee 逻辑
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
npm test && npm run build && git add src/game/managers/UnitManager.ts && git commit -m "feat(combat): UnitManager 医疗兵治疗目标选择 + heal 弹道"
```

---

## Task 4: 视觉 — unitRenderer medic

**Files:** `src/game/unitRenderer.ts`

- [ ] **Step 1: drawWeapon 加 medic case**

在 drawWeapon switch 加：

```ts
case 'medic': {
  g.fillStyle(0xffffff, 0.95);
  g.fillRect(-6, -8, 12, 16);
  g.lineStyle(0.5, 0xcccccc, 1);
  g.strokeRect(-6, -8, 12, 16);
  g.lineStyle(2.5, 0xe53935, 1);
  g.lineBetween(0, -12, 0, 4);
  g.lineBetween(-6, -4, 6, -4);
  g.fillStyle(0xffffff, 1);
  g.fillRect(8, -6, 7, 5);
  g.lineStyle(0.5, 0x4caf50, 0.7);
  g.strokeRect(8, -6, 7, 5);
  g.lineStyle(1.5, 0xe53935, 0.8);
  g.lineBetween(10, -5, 13, -2);
  g.lineBetween(11.5, -4, 11.5, -2);
  break;
}
```

- [ ] **Step 2: maybeTriggerAttackAnim  + playMedicAnim**

switch 加 `case 'medic': playMedicAnim(body); break;`

```ts
function playMedicAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({ targets: body, rotation: 0.2, y: -2, duration: 250, ease: 'Cubic.easeOut' });
  body.scene.tweens.add({ targets: body, rotation: -0.15, y: 0, duration: 150, ease: 'Cubic.easeIn', delay: 250 });
  body.scene.tweens.add({ targets: body, rotation: 0, y: 0, duration: 200, ease: 'Sine.easeOut', delay: 400 });
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
npm run build && git add src/game/unitRenderer.ts && git commit -m "feat(visual): 医疗兵 sprite 白大褂+红十字+小药箱+投掷动作"
```

---

## Task 5: 视觉 — projectileRenderer + EffectManager + campRenderer

**Files:** `src/game/projectileRenderer.ts`, `src/game/effects/EffectManager.ts`, `src/game/campRenderer.ts`

- [ ] **Step 1: projectileRenderer — drawHeal/updateHeal**

路由加 `if (p.kind === 'heal') return drawHeal(scene, p);`

```ts
function drawHeal(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x4caf50, 0.9);
  g.fillCircle(0, 0, 5);
  g.fillStyle(0xffffff, 1);
  g.fillRect(-2, -5, 4, 10);
  g.fillRect(-5, -2, 10, 4);
  return scene.add.container(p.x, p.y, [g]);
}
function updateHeal(view: Phaser.GameObjects.Container, p: Projectile): void {
  view.setPosition(p.x, p.y);
}
```

- [ ] **Step 2: EffectManager — spawnHealHit + dispatch case**

dispatch 加 `case 'healHit': this.spawnHealHit(ev.x, ev.y); break;`

```ts
private spawnHealHit(x: number, y: number): void {
  if (!this.budget.tryAdd()) return;
  const root = this.scene.add.container(x, y);
  const cross = this.scene.add.text(0, 0, '+', { fontSize: '20px', color: '#4caf50', fontStyle: 'bold' }).setOrigin(0.5).setScale(0.5);
  root.add(cross);
  this.scene.tweens.add({ targets: cross, scale: { from: 0.5, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Cubic.easeOut' });
  const star = this.scene.add.text(0, -5, '+', { fontSize: '10px', color: '#81c784' }).setOrigin(0.5);
  root.add(star);
  this.scene.tweens.add({ targets: star, y: -20, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Cubic.easeOut' });
  this.scene.time.delayedCall(550, () => { root.destroy(); this.budget.release(); });
}
```

- [ ] **Step 3: campRenderer — 颜色 + switch + drawMedicCamp**

颜色映射加 `medic: 0xffffff`；switch 加 `case 'medic': drawMedicCamp(g, color, accent); break;`

```ts
function drawMedicCamp(g: Phaser.GameObjects.Graphics, _color: number, _accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 8, 60, 18);
  g.fillStyle(0xf5f5f5, 1);
  g.fillRoundedRect(-24, -12, 48, 36, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-24, -12, 48, 36, 4);
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-8, 2, 16, 22, 3);
  g.lineStyle(2, 0x4caf50, 0.6);
  g.strokeRoundedRect(-8, 2, 16, 22, 3);
  g.lineStyle(3, 0xe53935, 1);
  g.lineBetween(0, -26, 0, -8);
  g.lineBetween(-8, -17, 8, -17);
}
```

- [ ] **Step 4: 验证 + 提交**

```bash
npm run build && git add src/game/projectileRenderer.ts src/game/effects/EffectManager.ts src/game/campRenderer.ts && git commit -m "feat(visual): 治疗弹+healHit特效+医疗营建筑"
```

---

## Task 6: UI — BuildPanel 加 medic

**Files:** `src/ui/BuildPanel.ts`

- [ ] **Step 1: KINDS 加 medic(Y)**

```ts
{ key: 'medic', label: '医疗营', icon: '🏥' },
```

`HOTKEY_MAP` 加 `y: 'medic'`。**不加 gated**。

- [ ] **Step 2: 验证 + 提交**

```bash
npm run build && git add src/ui/BuildPanel.ts && git commit -m "feat(ui): BuildPanel 加医疗营(Y键，无需答题)"
```

---

## Task 7: 端到端验证

- [ ] **Step 1: 全套测试 + 构建**

```bash
npm test && npm run build
```

- [ ] **Step 2: 目测验收清单**

- [ ] 医疗营白色+红十字、Y键可选、无需答题
- [ ] 医疗兵白大褂+红十字、不追敌人
- [ ] 治疗弹绿色+字直飞、命中绿色十字特效
- [ ] 目标 HP 回升、优先治 HP%最低的
- [ ] 也治受伤兵营
- [ ] 无伤友军时 idle
- [ ] 剑/盾/弓/投矛/炸弹仍正常（不回归）

- [ ] **Step 3: push**

```bash
git push origin main
```

---

## Out-of-Scope

| 项目 | 原因 |
|---|---|
| 复活的或重塑 | 不在 spec |
| 医疗兵自疗 | spec 明确不做 |
| 算术题门控 | 用户决定 medic 不加锁 |
| 兵营治权重调整 | YAGNI |
