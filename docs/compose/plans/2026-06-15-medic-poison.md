# 医疗兵毒攻击实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为医疗兵添加范围毒雾攻击，对敌方造成持续伤害（DOT）。

**Architecture:** 在 UnitDef 中新增毒属性，UnitManager 添加毒雾释放逻辑，CombatSystem 添加 DOT 伤害计算，EffectManager 添加毒雾特效。

**Tech Stack:** Phaser 3, TypeScript, Vite, Vitest

---

### Task 1: 类型定义

**Covers:** [S1, S4]

**Files:**
- Modify: `src/game/types.ts`

- [ ] **Step 1: 添加毒属性到 UnitDef**

在 `src/game/types.ts` 的 `UnitDef` 接口中添加：

```typescript
/** 毒伤（每秒伤害，> 0 表示有毒攻击） */
poisonDamage?: number;
/** 中毒持续秒数 */
poisonDuration?: number;
/** 毒雾范围（px） */
poisonRange?: number;
/** 毒雾冷却秒数 */
poisonCooldown?: number;
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/game/types.ts
git commit -m "feat(medic-poison): 添加毒属性类型定义"
```

---

### Task 2: 数值配置

**Covers:** [S2, S4]

**Files:**
- Modify: `src/config/units.ts`

- [ ] **Step 1: 添加医疗兵毒数值**

在 `src/config/units.ts` 的 medic 条目中添加：

```typescript
medic: {
  kind: 'medic',
  attackType: 'ranged',
  maxHp: 120,
  attack: 0,
  attackRange: 150,
  attackInterval: 2.0,
  moveSpeed: 50,
  healAmount: 12,
  healSearchRange: 300,
  poisonDamage: 8,
  poisonDuration: 2,
  poisonRange: 120,
  poisonCooldown: 3,
},
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/config/units.ts
git commit -m "feat(medic-poison): 添加医疗兵毒数值配置"
```

---

### Task 3: DOT 伤害系统

**Covers:** [S3]

**Files:**
- Modify: `src/game/types.ts` — Unit 接口
- Create: `tests/medic-poison.test.ts`

- [ ] **Step 1: 添加中毒状态到 Unit**

在 `src/game/types.ts` 的 `Unit` 接口中添加：

```typescript
/** 中毒剩余时间（秒），> 0 表示中毒中 */
poisonTimer: number;
/** 中毒每秒伤害 */
poisonDps: number;
```

- [ ] **Step 2: 写测试**

```typescript
// tests/medic-poison.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CombatSystem } from '../src/game/managers/CombatSystem';
import type { CombatGSView } from '../src/game/managers/CombatSystem';
import type { Unit, Camp } from '../src/game/types';

function makeGs(): CombatGSView {
  return {
    units: new Map<string, Unit>(),
    camps: new Map<string, Camp>(),
    projectiles: [],
    events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 }, blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', faction: 'blue', kind: 'sword', campId: 'c1',
    x: 100, y: 100, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'idle',
    alive: true, deathTimer: 0,
    poisonTimer: 0, poisonDps: 0,
    ...overrides,
  };
}

describe('Poison DOT', () => {
  it('applyPoison 设置中毒状态', () => {
    const gs = makeGs();
    const target = makeUnit();
    gs.units.set('u1', target);

    CombatSystem.applyPoison(target, 8, 2, gs);

    expect(target.poisonTimer).toBe(2);
    expect(target.poisonDps).toBe(8);
    expect(gs.events).toContainEqual(expect.objectContaining({ kind: 'poisonApplied' }));
  });

  it('tickPoison 造成持续伤害', () => {
    const gs = makeGs();
    const target = makeUnit({ poisonTimer: 2, poisonDps: 8 });
    gs.units.set('u1', target);

    CombatSystem.tickPoison(target, 1, gs); // 1 秒

    expect(target.hp).toBe(92); // 100 - 8
    expect(target.poisonTimer).toBe(1);
  });

  it('中毒结束后清除状态', () => {
    const gs = makeGs();
    const target = makeUnit({ poisonTimer: 0.5, poisonDps: 8 });
    gs.units.set('u1', target);

    CombatSystem.tickPoison(target, 1, gs); // 超过剩余时间

    expect(target.poisonTimer).toBe(0);
    expect(target.poisonDps).toBe(0);
    expect(target.hp).toBe(96); // 100 - 8*0.5
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/medic-poison.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 applyPoison 和 tickPoison**

在 `src/game/managers/CombatSystem.ts` 中添加：

```typescript
/** 施加中毒状态 */
static applyPoison(target: Unit, dps: number, duration: number, gs: CombatGSView): void {
  target.poisonTimer = duration;
  target.poisonDps = dps;
  gs.events.push({ kind: 'poisonApplied', x: target.x, y: target.y, faction: target.faction });
}

/** 毒素 tick：每帧调用，扣除中毒伤害 */
static tickPoison(target: Unit, dt: number, gs: CombatGSView): void {
  if (target.poisonTimer <= 0) return;
  const tickDamage = target.poisonDps * dt;
  target.hp -= tickDamage;
  target.poisonTimer = Math.max(0, target.poisonTimer - dt);
  if (target.poisonTimer <= 0) {
    target.poisonDps = 0;
  }
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
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/medic-poison.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/managers/CombatSystem.ts tests/medic-poison.test.ts
git commit -m "feat(medic-poison): 实现 DOT 伤害系统"
```

---

### Task 4: 毒雾释放逻辑

**Covers:** [S3]

**Files:**
- Modify: `src/game/managers/UnitManager.ts`
- Modify: `src/game/GameState.ts`

- [ ] **Step 1: 添加毒冷却到 Unit**

在 `src/game/types.ts` 的 `Unit` 接口中添加：

```typescript
/** 毒雾冷却剩余秒数 */
poisonCooldownTimer: number;
```

- [ ] **Step 2: 修改 UnitManager 添加毒雾释放**

在 `src/game/managers/UnitManager.ts` 的 `act` 方法中，医疗兵分支后添加毒雾逻辑：

```typescript
// 医疗兵：发治疗弹 + 毒雾
if (UNIT_DEFS[u.kind]?.healAmount) {
  // 现有治疗逻辑...
  
  // 毒雾释放（独立于治疗）
  if (UNIT_DEFS[u.kind]?.poisonDamage && u.poisonCooldownTimer <= 0) {
    const poisonRange = UNIT_DEFS[u.kind]!.poisonRange!;
    // 搜索范围内敌方
    for (const e of this.gs.units.values()) {
      if (!e.alive || e.faction === u.faction) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d <= poisonRange) {
        CombatSystem.applyPoison(e, UNIT_DEFS[u.kind]!.poisonDamage!, UNIT_DEFS[u.kind]!.poisonDuration!, this.gs);
      }
    }
    for (const c of this.gs.camps.values()) {
      if (c.destroyed || c.faction === u.faction) continue;
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d <= poisonRange) {
        // 军营中毒：直接扣血（简单实现）
        c.hp -= UNIT_DEFS[u.kind]!.poisonDamage! * UNIT_DEFS[u.kind]!.poisonDuration!;
        if (c.hp <= 0) {
          c.destroyed = true;
          const killerFaction = c.faction === 'red' ? 'blue' : 'red';
          this.gs.stats[killerFaction].campsDestroyed++;
          this.gs.events.push({ kind: 'campDestroyed', campId: c.id, x: c.x, y: c.y, faction: c.faction });
        }
      }
    }
    u.poisonCooldownTimer = UNIT_DEFS[u.kind]!.poisonCooldown!;
    this.gs.events.push({ kind: 'poisonCloud', x: u.x, y: u.y, faction: u.faction });
  }
}
```

- [ ] **Step 3: 在 UnitManager.step 中递减毒冷却**

```typescript
// 在 step 方法中，为每个医疗兵递减毒冷却
for (const u of this.gs.units.values()) {
  if (!u.alive) continue;
  if (u.poisonCooldownTimer > 0) u.poisonCooldownTimer = Math.max(0, u.poisonCooldownTimer - dt);
  // ... 现有逻辑
}
```

- [ ] **Step 4: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/types.ts src/game/managers/UnitManager.ts
git commit -m "feat(medic-poison): 实现毒雾释放逻辑"
```

---

### Task 5: 毒雾特效

**Covers:** [S5]

**Files:**
- Modify: `src/game/effects/types.ts`
- Modify: `src/game/effects/EffectManager.ts`

- [ ] **Step 1: 添加事件类型**

在 `src/game/effects/types.ts` 中添加：

```typescript
| { kind: 'poisonApplied'; x: number; y: number; faction: Faction }
| { kind: 'poisonCloud'; x: number; y: number; faction: Faction }
```

- [ ] **Step 2: 添加特效分发**

在 `src/game/effects/EffectManager.ts` 的 `dispatch` 方法中添加：

```typescript
case 'poisonApplied': this.spawnPoisonApplied(ev.x, ev.y); break;
case 'poisonCloud':   this.spawnPoisonCloud(ev.x, ev.y);   break;
```

- [ ] **Step 3: 实现毒雾特效**

```typescript
// src/game/effects/EffectManager.ts 文件末尾

/** 中毒标记：绿色泡泡漂浮 */
private spawnPoisonApplied(x: number, y: number): void {
  if (!this.budget.tryAdd()) return;
  const root = this.scene.add.container(x, y);
  for (let i = 0; i < 3; i++) {
    const bubble = this.scene.add.circle(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 10,
      3 + Math.random() * 3,
      0x4caf50, 0.7
    );
    root.add(bubble);
    this.scene.tweens.add({
      targets: bubble,
      y: bubble.y - 20 - Math.random() * 15,
      alpha: { from: 0.7, to: 0 },
      scale: { from: 1, to: 0.5 },
      duration: 600 + Math.random() * 200,
      delay: i * 80,
      ease: 'Cubic.easeOut',
    });
  }
  this.scene.time.delayedCall(800, () => {
    root.destroy();
    this.budget.release();
  });
}

/** 毒雾释放：绿色泡泡向外扩散 */
private spawnPoisonCloud(x: number, y: number): void {
  if (!this.budget.tryAdd()) return;
  const root = this.scene.add.container(x, y);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    const bubble = this.scene.add.circle(0, 0, 5 + Math.random() * 4, 0x66bb6a, 0.6);
    root.add(bubble);
    this.scene.tweens.add({
      targets: bubble,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 10,
      alpha: { from: 0.6, to: 0 },
      scale: { from: 1, to: 0.3 },
      duration: 500 + Math.random() * 200,
      ease: 'Cubic.easeOut',
    });
  }
  this.scene.time.delayedCall(700, () => {
    root.destroy();
    this.budget.release();
  });
}
```

- [ ] **Step 4: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/effects/types.ts src/game/effects/EffectManager.ts
git commit -m "feat(medic-poison): 毒雾特效"
```

---

### Task 6: 最终验证

**Covers:** [S1-S7]

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat(medic-poison): 完成医疗兵毒攻击 — 范围毒雾、DOT伤害、绿色泡泡特效"
```
