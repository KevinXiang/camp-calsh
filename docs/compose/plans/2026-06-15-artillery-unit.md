# 火炮兵实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加第 7 种兵种"火炮兵"，具有抛物线弹道、大范围溅射、对军营 2x 伤害。

**Architecture:** 复用现有 Projectile 系统，新增 `artillery` 类型。溅射复用 `applyAOE` 逻辑（改半径为 80px）。抛物线渲染复用 javelin/bomb 的弧线算法。火焰爆炸特效新增 `spawnArtilleryExplosion`。

**Tech Stack:** Phaser 3, TypeScript, Vite, Vitest

---

### Task 1: 类型定义

**Covers:** [S1]

**Files:**
- Modify: `src/game/types.ts:3,7,65`

- [ ] **Step 1: 修改 CampKind**

```typescript
// src/game/types.ts line 3
export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb' | 'medic' | 'artillery';
```

- [ ] **Step 2: 修改 ProjectileKind**

```typescript
// src/game/types.ts line 65
export type ProjectileKind = 'arrow' | 'javelin' | 'bomb' | 'heal' | 'artillery';
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS (无类型错误)

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts
git commit -m "feat(artillery): 添加 artillery 类型定义"
```

---

### Task 2: 数值配置

**Covers:** [S2]

**Files:**
- Modify: `src/config/units.ts:9`
- Modify: `src/config/camps.ts:9`

- [ ] **Step 1: 添加火炮兵数值**

```typescript
// src/config/units.ts - 在 medic 后添加
artillery: { kind: 'artillery', attackType: 'ranged', maxHp: 70, attack: 12, attackRange: 250, attackInterval: 2.8, moveSpeed: 35 },
```

- [ ] **Step 2: 添加火炮营配置**

```typescript
// src/config/camps.ts - 在 medic 后添加
artillery: { kind: 'artillery', produces: 'artillery', maxHp: 400, spawnInterval: 8, unitCap: 8 },
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/config/units.ts src/config/camps.ts
git commit -m "feat(artillery): 添加火炮兵和火炮营数值配置"
```

---

### Task 3: 溅射伤害 + 攻城倍率

**Covers:** [S4]

**Files:**
- Modify: `src/game/managers/CombatSystem.ts:65-83`
- Create: `tests/CombatSystem.artillery.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/CombatSystem.artillery.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CombatSystem } from '../src/game/managers/CombatSystem';
import type { CombatGSView } from '../src/game/managers/CombatSystem';
import type { Unit, Camp, Projectile } from '../src/game/types';

function makeGs(): CombatGSView {
  return {
    units: new Map<string, Unit>(),
    camps: new Map<string, Camp>(),
    projectiles: [],
    events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 }, blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
  };
}

describe('Artillery splash damage', () => {
  it('溅射范围内多个目标同时受伤', () => {
    const gs = makeGs();
    const target: Unit = { id: 't1', faction: 'blue', kind: 'sword', campId: 'c1', x: 100, y: 100, hp: 100, maxHp: 100, attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60, attackTimer: 0, targetId: null, state: 'idle', alive: true, deathTimer: 0 };
    const nearby: Unit = { id: 't2', faction: 'blue', kind: 'shield', campId: 'c1', x: 140, y: 100, hp: 160, maxHp: 160, attack: 7, attackRange: 35, attackInterval: 1.2, moveSpeed: 45, attackTimer: 0, targetId: null, state: 'idle', alive: true, deathTimer: 0 };
    gs.units.set('t1', target);
    gs.units.set('t2', nearby);

    CombatSystem.applyArtillerySplash(100, 100, 12, 'red', gs, 80, 1);

    expect(target.hp).toBe(88);   // 100 - 12
    expect(nearby.hp).toBe(148);  // 160 - 12
  });

  it('对军营 2x 伤害', () => {
    const gs = makeGs();
    const camp: Camp = { id: 'c1', faction: 'blue', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500, spawnTimer: 0, upgrades: { production: 0, health: 0, weapon: 0 }, aliveUnits: 0, destroyed: false };
    gs.camps.set('c1', camp);

    CombatSystem.applyArtillerySplash(100, 100, 12, 'red', gs, 80, 2);

    expect(camp.hp).toBe(476); // 500 - 12*2
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/CombatSystem.artillery.test.ts`
Expected: FAIL (applyArtillerySplash 不存在)

- [ ] **Step 3: 实现 applyArtillerySplash**

```typescript
// src/game/managers/CombatSystem.ts - 在 applyAOE 方法后添加
static applyArtillerySplash(
  x: number, y: number, dmg: number,
  attackerFaction: Faction, gs: CombatGSView, radius: number, campMultiplier: number,
): void {
  const r2 = radius * radius;
  for (const u of gs.units.values()) {
    if (!u.alive || u.faction === attackerFaction) continue;
    const dx = u.x - x; const dy = u.y - y;
    if (dx * dx + dy * dy > r2) continue;
    CombatSystem.applyDamage(u, dmg, gs, { source: 'ranged', weaponKind: 'javelin' });
  }
  for (const c of gs.camps.values()) {
    if (c.destroyed || c.faction === attackerFaction) continue;
    const dx = c.x - x; const dy = c.y - y;
    if (dx * dx + dy * dy > r2) continue;
    CombatSystem.applyDamage(c, dmg * campMultiplier, gs, { source: 'ranged' });
  }
  gs.events.push({ kind: 'artilleryExplosion', x, y, faction: attackerFaction });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/CombatSystem.artillery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/managers/CombatSystem.ts tests/CombatSystem.artillery.test.ts
git commit -m "feat(artillery): 实现溅射伤害 + 攻城倍率"
```

---

### Task 4: 炮弹命中分发

**Covers:** [S3, S4]

**Files:**
- Modify: `src/game/managers/CombatSystem.ts:91-132`

- [ ] **Step 1: 修改 step 方法中的命中分发**

在 `CombatSystem.step` 中，炮弹命中时调用 `applyArtillerySplash` 而非 `applyDamage`：

```typescript
// src/game/managers/CombatSystem.ts - step 方法中 dist < 12 分支
if (p.kind === 'artillery') {
  CombatSystem.applyArtillerySplash(p.x, p.y, p.damage, p.faction, gs, 80, 2);
  continue;
}
```

- [ ] **Step 2: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/game/managers/CombatSystem.ts
git commit -m "feat(artillery): 炮弹命中分发到溅射逻辑"
```

---

### Task 5: 火炮兵射击逻辑

**Covers:** [S3]

**Files:**
- Modify: `src/game/managers/UnitManager.ts:94-102`

- [ ] **Step 1: 添加炮弹生成逻辑**

在 `UnitManager.act` 方法中，医疗兵分支后添加火炮兵分支：

```typescript
// src/game/managers/UnitManager.ts - act 方法中
} else if (u.kind === 'artillery') {
  // 火炮兵：抛物线炮弹
  this.gs.projectiles.push({
    id: crypto.randomUUID(), kind: 'artillery',
    x: u.x, y: u.y, targetId: u.targetId!,
    speed: 180, damage: UNIT_DEFS[u.kind]!.attack,
    faction: u.faction, elapsed: 0, maxTime: 2.5,
  });
}
```

- [ ] **Step 2: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/game/managers/UnitManager.ts
git commit -m "feat(artillery): 火炮兵射击生成炮弹"
```

---

### Task 6: 炮弹抛物线渲染

**Covers:** [S3]

**Files:**
- Modify: `src/game/projectileRenderer.ts:21-31`

- [ ] **Step 1: 添加炮弹绘制和更新函数**

```typescript
// src/game/projectileRenderer.ts - 文件末尾

/* ───── 炮弹：抛物线 + 烟雾尾迹 + 影子 ───── */

const ARTILLERY_MAX_H = 60;
const ARTILLERY_EXPECTED_DIST = 250;

function drawArtillery(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 0, 16, 6, 0x000000, 0.4);

  const shaft = scene.add.graphics();
  // 炮弹本体：深灰色圆球
  shaft.fillStyle(0x424242, 1);
  shaft.fillCircle(0, 0, 6);
  // 橙色火焰尾部
  shaft.fillStyle(0xff6d00, 0.9);
  shaft.fillCircle(-5, 0, 3);
  shaft.fillStyle(0xffab00, 0.7);
  shaft.fillCircle(-7, 0, 2);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}

function updateArtillery(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    view.setPosition(p.x, p.y);
    return;
  }

  view.setPosition(p.x, p.y);

  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / ARTILLERY_EXPECTED_DIST);
  const visualHeight = 4 * ARTILLERY_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / ARTILLERY_MAX_H;

  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.3);

  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}
```

- [ ] **Step 2: 修改 drawProjectile 和 updateProjectileView**

```typescript
// src/game/projectileRenderer.ts - drawProjectile 函数
export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  if (p.kind === 'javelin')    return drawJavelin(scene, p);
  if (p.kind === 'bomb')       return drawBomb(scene, p);
  if (p.kind === 'heal')       return drawHeal(scene, p);
  if (p.kind === 'artillery')  return drawArtillery(scene, p);
  return drawArrow(scene, p);
}

// src/game/projectileRenderer.ts - updateProjectileView 函数
export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  if (p.kind === 'javelin')    return updateJavelin(view, p);
  if (p.kind === 'bomb')       return updateBomb(view, p);
  if (p.kind === 'heal')       return updateHeal(view, p);
  if (p.kind === 'artillery')  return updateArtillery(view, p);
  return updateArrow(view, p);
}
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/game/projectileRenderer.ts
git commit -m "feat(artillery): 炮弹抛物线渲染"
```

---

### Task 7: 火焰爆炸特效

**Covers:** [S5]

**Files:**
- Modify: `src/game/effects/types.ts:8`
- Modify: `src/game/effects/EffectManager.ts:40`

- [ ] **Step 1: 添加事件类型**

```typescript
// src/game/effects/types.ts - 在 bombExplosion 后添加
| { kind: 'artilleryExplosion'; x: number; y: number; faction: Faction }
```

- [ ] **Step 2: 添加特效分发**

```typescript
// src/game/effects/EffectManager.ts - dispatch 方法中
case 'artilleryExplosion': this.spawnArtilleryExplosion(ev.x, ev.y); break;
```

- [ ] **Step 3: 实现火焰爆炸特效**

```typescript
// src/game/effects/EffectManager.ts - 文件末尾

/** 火炮爆炸：火焰核心 + 烟圈 + 冲击波 + 碎片飞溅 + 焦痕（1.2s 生命） */
private spawnArtilleryExplosion(x: number, y: number): void {
  if (!this.budget.tryAdd()) return;
  const root = this.scene.add.container(x, y);

  // 火焰核心：橙红色圆形扩散
  const fire = this.scene.add.circle(0, 0, 15, 0xff6d00, 1);
  root.add(fire);
  this.scene.tweens.add({
    targets: fire,
    scale: { from: 0.3, to: 2.5 },
    alpha: { from: 1, to: 0 },
    duration: 300,
    ease: 'Cubic.easeOut',
  });

  // 烟圈：灰色圆环向外扩散
  const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(3, 0x666666, 0.8);
  root.add(smoke);
  this.scene.tweens.add({
    targets: smoke,
    scale: { from: 0.5, to: 3 },
    alpha: { from: 0.8, to: 0 },
    duration: 500,
    ease: 'Cubic.easeOut',
  });

  // 冲击波：白色半透明圆环快速扩散
  const wave = this.scene.add.circle(0, 0, 10, 0, 0).setStrokeStyle(2, 0xffffff, 0.6);
  root.add(wave);
  this.scene.tweens.add({
    targets: wave,
    scale: { from: 1, to: 4 },
    alpha: { from: 0.6, to: 0 },
    duration: 200,
    ease: 'Cubic.easeOut',
  });

  // 碎片飞溅：4 个小碎片向四周弹射
  const碎片颜色 = [0xff6d00, 0xffab00, 0x424242, 0x795548];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 40 + Math.random() * 30;
    const frag = this.scene.add.rectangle(0, 0, 6, 4, 碎片颜色[i]).setOrigin(0.5);
    root.add(frag);
    this.scene.tweens.add({
      targets: frag,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      angle: Math.random() * 360,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });
  }

  // 焦痕：命中点留下短暂焦黑痕迹
  const scorch = this.scene.add.circle(0, 0, 12, 0x1a1a1a, 0.5);
  root.add(scorch);
  this.scene.tweens.add({
    targets: scorch,
    alpha: { from: 0.5, to: 0 },
    duration: 1000,
    delay: 200,
  });

  this.scene.time.delayedCall(1200, () => {
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
git commit -m "feat(artillery): 火焰爆炸特效"
```

---

### Task 8: 建造面板 + 快捷键

**Covers:** [S6]

**Files:**
- Modify: `src/ui/BuildPanel.ts:6,16`

- [ ] **Step 1: 添加火炮营按钮**

```typescript
// src/ui/BuildPanel.ts - KINDS 数组，在 medic 后添加
{ key: 'artillery', label: '火炮营', icon: '💥' },
```

- [ ] **Step 2: 添加快捷键映射**

```typescript
// src/ui/BuildPanel.ts - HOTKEY_MAP
const HOTKEY_MAP: Record<string, CampKind> = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin', t: 'bomb', y: 'medic', u: 'artillery' };
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/BuildPanel.ts
git commit -m "feat(artillery): 建造面板 + U键快捷键"
```

---

### Task 9: 更新单元测试

**Covers:** [S7]

**Files:**
- Modify: `tests/units.test.ts:7,27`
- Modify: `tests/camps.test.ts`

- [ ] **Step 1: 更新 units.test.ts**

```typescript
// tests/units.test.ts - 添加火炮兵测试
it('火炮兵数值', () => {
  expect(UNIT_DEFS.artillery).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 12, attackRange: 250, attackInterval: 2.8, moveSpeed: 35 });
});
```

- [ ] **Step 2: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/units.test.ts tests/camps.test.ts
git commit -m "test(artillery): 更新单元测试"
```

---

### Task 10: 最终验证

**Covers:** [S1-S7]

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: PASS (所有测试通过)

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc -b`
Expected: PASS

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat(artillery): 完成火炮兵实现 — 抛物线弹道、溅射伤害、攻城倍率、火焰爆炸特效"
```
