# 重做弓兵营与弓兵（视觉与特效）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做弓兵营外观（木制箭塔）、弓兵单位造型与攻击动画（大反曲弓 + 3 帧拉弓）、弓箭弹道（低弧抛物线 + 箭羽 + 影子）与命中特效（新增 arrowHit：扎入箭头 + 4✦溅射）。

**Architecture:** 三处纯渲染重写（campRenderer / unitRenderer / projectileRenderer）+ 一条事件链改造（CombatSystem 推 arrowHit → EffectManager spawnArrowHit + BattleScene 闪白列表）。事件链用 TDD（测试环境 node 可覆盖），渲染层按项目惯例手动验证。

**Tech Stack:** TypeScript、Phaser 3（graphics/container/tween）、Vitest。

**Spec:** `docs/superpowers/specs/2026-06-20-archer-rework-design.md`

---

## 关键现状（实现前必读）

- **弓箭命中当前走 `meleeHit`**：`CombatSystem.applyDamage`（`src/game/managers/CombatSystem.ts:30-35`）仅区分 javelin，arrow fallback 到 `meleeHit`。
- **有测试明确锁死此现状**：`tests/CombatSystem.events.test.ts:84-90` 断言 `weaponKind==='arrow'` 发 `meleeHit`。改事件后此测试必须同步（Task 1）。
- **弓兵动画当前**：`playBowAnim`（`src/game/unitRenderer.ts:335-344`）只是 body 后缩 3px。
- **弓箭弹道当前**：`drawArrow`/`updateArrow`（`src/game/projectileRenderer.ts:50-79`）直线 + 无影子。投矛 `updateJavelin`（同文件 109-136）是抛物线 + 影子的参考实现。
- **Body 变换约定**：`updateUnitView` 中 `attacking` 状态绝不触碰 body 变换（`src/game/unitRenderer.ts:222-232`），攻击 tween 拥有控制权。新动画必须遵守。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/game/effects/types.ts` | 修改 | `CombatEvent` 加 `arrowHit` |
| `src/game/managers/CombatSystem.ts` | 修改 | `applyDamage` 在 `weaponKind==='arrow'` 时推 `arrowHit` |
| `tests/CombatSystem.events.test.ts` | 修改 | arrow 断言改为 `arrowHit` |
| `src/game/effects/EffectManager.ts` | 修改 | dispatch 加 `arrowHit` + 新增 `spawnArrowHit` |
| `src/game/BattleScene.ts` | 修改 | 受击闪白事件列表加 `arrowHit` |
| `src/game/campRenderer.ts` | 修改 | 重写 `drawArcherCamp` |
| `src/game/unitRenderer.ts` | 修改 | 重写 `drawWeapon` archer 分支 + `playBowAnim` |
| `src/game/projectileRenderer.ts` | 修改 | 重写 `drawArrow`/`updateArrow` |

---

## Task 1: arrowHit 事件链（TDD）

把弓箭命中从 `meleeHit` 独立为 `arrowHit`，打通 types → CombatSystem → 测试。

**Files:**
- Modify: `src/game/effects/types.ts`
- Modify: `src/game/managers/CombatSystem.ts:30-35`
- Test: `tests/CombatSystem.events.test.ts:84-90`

- [ ] **Step 1: 修改测试，断言 arrow 发 `arrowHit`（先红）**

打开 `tests/CombatSystem.events.test.ts`，把第 84-90 行的测试：

```typescript
  it('远程命中且 weaponKind=arrow 仍发射 meleeHit（沿用现状）', () => {
    const u = mkUnit({ x: 5, y: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'arrow' });
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
  });
```

替换为：

```typescript
  it('远程命中且 weaponKind=arrow 发射 arrowHit 事件（带坐标与阵营）', () => {
    const u = mkUnit({ x: 5, y: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'arrow' });
    const e = gs.events.find(ev => ev.kind === 'arrowHit') as Extract<CombatEvent, { kind: 'arrowHit' }>;
    expect(e).toBeDefined();
    expect(e.x).toBe(5);
    expect(e.y).toBe(5);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/CombatSystem.events.test.ts`
Expected: FAIL — `arrowHit` 未定义 / `e` 为 undefined（因为 CombatSystem 仍推 `meleeHit`）。
另外 `Extract<CombatEvent, { kind: 'arrowHit' }>` 此时编译错误（types.ts 还没加该 kind）。

- [ ] **Step 3: 在 `CombatEvent` 加 `arrowHit` 类型**

打开 `src/game/effects/types.ts`，在 `javelinHit` 那一行下方加一行（保持格式）：

```typescript
export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'arrowHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
  | { kind: 'bombHit'; x: number; y: number; faction: Faction }
  | { kind: 'bombExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'artilleryExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'healHit'; x: number; y: number; faction: Faction }
  | { kind: 'poisonCloud'; x: number; y: number; faction: Faction }
  | { kind: 'poisonApplied'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
```

- [ ] **Step 4: 修改 CombatSystem.applyDamage，区分 arrow**

打开 `src/game/managers/CombatSystem.ts`，把第 30-36 行的 `else` 分支：

```typescript
      } else {
        const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
        gs.events.push(isJavelin
          ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
          : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
        );
      }
```

替换为（新增 arrowHit 分支，保持 javelin/其余不变）：

```typescript
      } else if (opts.source === 'ranged' && opts.weaponKind === 'arrow') {
        gs.events.push({ kind: 'arrowHit', x: target.x, y: target.y, faction: target.faction });
      } else {
        const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
        gs.events.push(isJavelin
          ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
          : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
        );
      }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/CombatSystem.events.test.ts`
Expected: PASS（全部，包括新 arrowHit 测试）

- [ ] **Step 6: 提交**

```bash
git add src/game/effects/types.ts src/game/managers/CombatSystem.ts tests/CombatSystem.events.test.ts
git commit -m "feat(archer-rework): 弓箭命中独立为 arrowHit 事件"
```

---

## Task 2: arrowHit 命中特效 `spawnArrowHit`

新增特效：扎入箭头 + 4✦溅射。接入 dispatch + BattleScene 闪白列表。

**Files:**
- Modify: `src/game/effects/EffectManager.ts`（dispatch 加 case + 新增方法）
- Modify: `src/game/BattleScene.ts:122`

- [ ] **Step 1: 在 dispatch 的 switch 加入 `arrowHit` case**

打开 `src/game/effects/EffectManager.ts`，在 `dispatch` 方法的 switch 里（第 34-47 行），在 `javelinHit` 那行下方加一行：

```typescript
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'arrowHit':      this.spawnArrowHit(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y); break;
        case 'healHit':       this.spawnHealHit(ev.x, ev.y); break;
        case 'bombHit':       break;   // 仅触发受击闪白，无独立特效
        case 'bombExplosion': this.spawnBombExplosion(ev.x, ev.y); break;
        case 'artilleryExplosion': this.spawnArtilleryExplosion(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'poisonApplied': this.spawnPoisonApplied(ev.x, ev.y); break;
        case 'poisonCloud':   this.spawnPoisonCloud(ev.x, ev.y);   break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
```

- [ ] **Step 2: 新增 `spawnArrowHit` 方法**

在 `spawnJavelinHit` 方法之后（`src/game/effects/EffectManager.ts` 第 117 行 `}` 之后）插入：

```typescript
  /** 弓箭命中：扎入箭头（旋转扎入姿态）+ 4 颗 ✦ 向四周弹散（0.7s 生命） */
  private spawnArrowHit(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 扎入箭头：木杆 + 箭羽，旋转约 15° 扎入姿态，150ms 淡出
    const arrow = this.scene.add.graphics();
    arrow.rotation = 0.26;  // ≈15°
    arrow.lineStyle(2, 0x8d6e63, 1);             // 木杆
    arrow.lineBetween(-12, 0, 4, 0);
    arrow.fillStyle(0xff7043, 1);                // 箭头（已没入，露小段）
    arrow.fillTriangle(4, 0, 1, -1.5, 1, 1.5);
    arrow.fillStyle(0xfff176, 1);                // 箭羽两片
    arrow.fillTriangle(-12, 0, -16, -2.5, -12, -1);
    arrow.fillTriangle(-12, 0, -16, 2.5, -12, 1);
    root.add(arrow);
    this.scene.tweens.add({
      targets: arrow,
      alpha: { from: 1, to: 0 },
      duration: 150,
      ease: 'Cubic.easeOut',
    });

    // 4 颗 ✦ 向四周弹散（复用 spawnMeleeStars 风格）
    const N = 4;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + (i * 0.37);
      const dist = 16 + (i * 0.21) * 8;
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
```

- [ ] **Step 3: BattleScene 受击闪白列表加入 `arrowHit`**

打开 `src/game/BattleScene.ts`，把第 122 行：

```typescript
        if (ev.kind === 'meleeHit' || ev.kind === 'javelinHit' || ev.kind === 'shieldBlock' || ev.kind === 'bombHit') {
```

改为：

```typescript
        if (ev.kind === 'meleeHit' || ev.kind === 'arrowHit' || ev.kind === 'javelinHit' || ev.kind === 'shieldBlock' || ev.kind === 'bombHit') {
```

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: 无类型错误，全部测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/game/effects/EffectManager.ts src/game/BattleScene.ts
git commit -m "feat(archer-rework): arrowHit 命中特效 spawnArrowHit（扎入箭头+4✦溅射）"
```

---

## Task 3: 弓兵营外观（木制箭塔）

重写 `drawArcherCamp`：石基座 + 双层木平台 + 顶部大弓标志。

**Files:**
- Modify: `src/game/campRenderer.ts:131-169`

- [ ] **Step 1: 重写 `drawArcherCamp`**

打开 `src/game/campRenderer.ts`，把第 131-169 行整个 `drawArcherCamp` 函数替换为：

```typescript
/** 弓营：木制箭塔（石基座 + 双层木平台 + 张开的大弓标志） */
function drawArcherCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 80, 24);

  // 石基座（阵营色，承接底部稳重感）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-26, 6, 52, 32, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-26, 6, 52, 32, 3);

  // 下层木平台：宽，3 道竖向木纹
  g.fillStyle(0x8d6e63, 1);
  g.fillRoundedRect(-30, -8, 60, 16, 2);
  g.lineStyle(2, 0x000000, 0.3);
  g.strokeRoundedRect(-30, -8, 60, 16, 2);
  g.lineStyle(1.5, 0x5d4037, 0.8);
  g.lineBetween(-20, -8, -20, 8);
  g.lineBetween(0, -8, 0, 8);
  g.lineBetween(20, -8, 20, 8);

  // 上层木平台：略窄，2 道木纹
  g.fillStyle(0x8d6e63, 1);
  g.fillRoundedRect(-26, -30, 52, 16, 2);
  g.lineStyle(2, 0x000000, 0.3);
  g.strokeRoundedRect(-26, -30, 52, 16, 2);
  g.lineStyle(1.5, 0x5d4037, 0.8);
  g.lineBetween(-15, -30, -15, -14);
  g.lineBetween(15, -30, 15, -14);

  // 两层间支柱
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(-22, -14, -22, -8);
  g.lineBetween(22, -14, 22, -8);

  // 门洞
  g.fillStyle(0x000000, 0.4);
  g.fillRoundedRect(-8, 14, 16, 24, 2);

  // 顶部大弓标志（accent 营徽）：反曲线弓身 + 横弦 + 搭箭
  // 弓身（反曲线）
  g.lineStyle(2.5, accent, 1);
  g.beginPath();
  g.moveTo(-14, -48);
  g.lineTo(-10, -56);
  g.lineTo(0, -57);
  g.lineTo(10, -56);
  g.lineTo(14, -48);
  g.strokePath();
  // 横弦
  g.lineStyle(1.2, 0xfff176, 1);
  g.lineBetween(-14, -48, 14, -48);
  // 搭箭
  g.lineStyle(2, accent, 1);
  g.lineBetween(0, -57, 0, -46);
  g.fillStyle(accent, 1);
  g.fillTriangle(0, -46, -2, -51, 2, -51);
}
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npx tsc -b --noEmit && npm run build`
Expected: 无类型错误，构建成功

- [ ] **Step 3: 提交**

```bash
git add src/game/campRenderer.ts
git commit -m "feat(archer-rework): 弓兵营重做为木制箭塔"
```

---

## Task 4: 弓兵单位武器（大反曲弓 + 蓄势姿态）

重写 `drawWeapon` 的 archer 分支。

**Files:**
- Modify: `src/game/unitRenderer.ts:81-101`

- [ ] **Step 1: 重写 archer 分支**

打开 `src/game/unitRenderer.ts`，把第 81-101 行整个 `case 'archer'` 块替换为：

```typescript
    case 'archer': {
      // 左手前伸持弓、右手拉弦到脸（形成拉弓蓄势姿态）
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -10, -3);   // 左臂前伸
      g.lineBetween(0, -5, 4, -10);    // 右臂拉弦到脸

      // 反曲弓身（带反曲线：上下端各一个反向小弯）
      g.lineStyle(2.8, 0x8d6e63, 1);
      g.beginPath();
      g.moveTo(-12, -6);
      g.lineTo(-18, -3);
      g.lineTo(-13, 2);
      g.lineTo(-8, 6);
      g.lineTo(-14, 12);
      g.strokePath();
      // 弓把
      g.fillStyle(0x5d4037, 1);
      g.fillRect(-15, 0, 3, 5);

      // 弦：两条线从弓两端汇聚到右脸拉弦点 (4,-10)
      g.lineStyle(1.2, 0xfff176, 1);
      g.lineBetween(-13, -6, 4, -10);
      g.lineBetween(-14, 12, 4, -10);

      // 蓄势搭箭：黄色箭杆沿弦方向 + 小箭头
      g.lineStyle(2, 0xffd54f, 1);
      g.lineBetween(-14, 3, 6, -8);
      g.fillStyle(0xffd54f, 1);
      g.fillTriangle(6, -8, 2, -10, 2, -5);
      break;
    }
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(archer-rework): 弓兵武器重写为大反曲弓+蓄势姿态"
```

---

## Task 5: 弓兵攻击动画（3 帧拉弓 + 出手爆闪）

重写 `playBowAnim`：3 段 tween + 出手爆闪叠层（参考 `triggerHitFlash` 的叠层 graphics 写法）。

**Files:**
- Modify: `src/game/unitRenderer.ts:334-344`

- [ ] **Step 1: 重写 `playBowAnim`**

打开 `src/game/unitRenderer.ts`，把第 334-344 行整个 `playBowAnim` 函数替换为：

```typescript
/** 弓兵射箭：蓄势 150ms（后仰）→ 出手 150ms（前甩 + 出手爆闪）→ 回正 150ms */
function playBowAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄势（后仰 ≈14°、轻微下压）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.25,
    y: -2,
    duration: 150,
    ease: 'Cubic.easeOut',
  });
  // 段 2：出手（快速前甩到 ≈-9°），同步触发出手爆闪
  body.scene.tweens.add({
    targets: body,
    rotation: -0.15,
    y: 0,
    duration: 150,
    ease: 'Cubic.easeIn',
    delay: 150,
    onStart: () => {
      // 出手爆闪：黄色光点叠层，150ms 淡出（不作为独立 CombatEvent，不占 EffectBudget）
      const flash = body.scene.add.graphics();
      flash.fillStyle(0xfff176, 0.6);
      flash.fillCircle(0, -10, 8);
      body.add(flash);
      body.scene.tweens.add({
        targets: flash,
        alpha: { from: 0.6, to: 0 },
        duration: 150,
        onComplete: () => flash.destroy(),
      });
    },
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 150,
    ease: 'Sine.easeOut',
    delay: 300,
  });
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(archer-rework): 弓兵攻击动画重写为3帧拉弓+出手爆闪"
```

---

## Task 6: 弓箭弹道（低弧抛物线 + 箭羽 + 影子）

重写 `drawArrow`/`updateArrow`：复用 `updateJavelin` 抛物线算法，降低峰值。

**Files:**
- Modify: `src/game/projectileRenderer.ts:5-13`（加常量）
- Modify: `src/game/projectileRenderer.ts:48-79`（重写两个函数）

- [ ] **Step 1: 新增弓箭弹道常量**

打开 `src/game/projectileRenderer.ts`，在第 6 行 `const JAVELIN_MAX_H = 40;` 之前插入：

```typescript
/** 弓箭抛物线峰值高度（世界坐标 px）— 低于投矛，保持弓箭的直线感 */
const ARROW_MAX_H = 20;
/** 弓箭预期飞行距离，与 config/units.ts 中 archer.attackRange=180 同步 */
const ARROW_EXPECTED_DIST = 180;

```

- [ ] **Step 2: 重写 `drawArrow` 与 `updateArrow`**

打开 `src/game/projectileRenderer.ts`，把第 48-79 行（注释 `/* ───── 箭矢（沿用现状） ───── */` 到 `updateArrow` 结束）替换为：

```typescript
/* ───── 箭矢：低弧抛物线 + 箭羽 + 影子 ───── */

function drawArrow(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  // 影子：地面椭圆（不参与高度变换）
  const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.4);

  // 箭体（shaft）：木杆 + 箭头 + 箭羽。承担视觉 y 偏移 + 自身旋转。
  const shaft = scene.add.graphics();
  shaft.lineStyle(2.2, 0x8d6e63, 1);              // 木杆
  shaft.lineBetween(-12, 0, 10, 0);
  shaft.fillStyle(0xff7043, 1);                   // 箭头
  shaft.fillTriangle(10, 0, 6, -2.5, 6, 2.5);
  shaft.fillStyle(0xfff176, 1);                   // 箭羽两片
  shaft.fillTriangle(-12, 0, -16, -2.5, -12, -1);
  shaft.fillTriangle(-12, 0, -16, 2.5, -12, 1);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  root.setData('prevX', p.x);
  root.setData('prevY', p.y);
  return root;
}

function updateArrow(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  const prevX = view.getData('prevX') as number;
  const prevY = view.getData('prevY') as number;

  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    view.setPosition(p.x, p.y);
    return;
  }

  // container 自身定位在地面坐标 (p.x, p.y)
  view.setPosition(p.x, p.y);

  // 低弧抛物线高度（复用 javelin 算法，峰值减半）
  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / ARROW_EXPECTED_DIST);
  const visualHeight = 4 * ARROW_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / ARROW_MAX_H;

  shaft.setPosition(0, -visualHeight);

  // 朝向：沿运动方向旋转（保留原有 prevX/prevY 算 atan2 的逻辑）
  const dx = p.x - prevX;
  const dy = p.y - prevY;
  if (dx !== 0 || dy !== 0) {
    shaft.setRotation(Math.atan2(dy, dx));
  }

  // 影子：贴地（container 局部 y=0），按高度缩放淡化
  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);

  view.setData('prevX', p.x);
  view.setData('prevY', p.y);
}
```

> 注意：原 `drawArrow` 把 prevX/prevY 存在 container 顶层，新版同样存顶层（`root.setData('prevX'...)`），并在 update 中读取。朝向旋转现在作用于 `shaft`（随高度偏移的子对象），而非顶层 container。

- [ ] **Step 3: 类型检查 + 全量测试 + 构建**

Run: `npx tsc -b --noEmit && npx vitest run && npm run build`
Expected: 无类型错误，全部测试 PASS，构建成功

- [ ] **Step 4: 提交**

```bash
git add src/game/projectileRenderer.ts
git commit -m "feat(archer-rework): 弓箭弹道重写为低弧抛物线+箭羽+影子"
```

---

## Task 7: 手动验证与收尾

**Files:** 无（验证为主）

- [ ] **Step 1: 启动 dev server 手动验证**

Run: `npm run dev`
打开浏览器，按 spec §6 的 7 个场景逐一验证：
1. 弓兵营外观为木制箭塔（石基座 + 双层木平台 + 顶部大弓标志），红蓝阵营色正确。
2. 弓兵单位持大反曲弓，呈拉弦蓄势姿态（左臂前伸、右臂拉弦到脸）。
3. 弓兵攻击时有明显蓄势-出手-回正动画 + 出手处黄色爆闪。
4. 弓箭飞行呈低弧抛物线（比投矛弧度低），带箭羽与地面影子。
5. 弓箭命中目标：箭头扎入 + 4 颗✦溅射；受击单位有闪白。
6. 盾兵被弓箭命中仍走盾击火花（shieldBlock），不出现扎箭特效。
7. 多个弓兵同时攻击时特效不卡顿（EffectBudget 上限 50）。

- [ ] **Step 2: 修正发现的问题（如有）**

记录并修复手动验证中发现的视觉问题，再次验证。常见调整点：
- 弓兵动画 rotation/y 幅度过大/过小 → 调 `playBowAnim` 的数值。
- 出手爆闪过亮 → 调 `playBowAnim` 里 `fillCircle` 的 alpha（当前 0.6）。
- 弓箭弧度不合适 → 调 `ARROW_MAX_H`（当前 20）。
- 弓兵营大弓标志位置/大小 → 调 `drawArcherCamp` 顶部坐标。

- [ ] **Step 3: 最终全量测试 + 提交（如有改动）**

Run: `npx vitest run`
Expected: 全部 PASS

若有改动：
```bash
git add -A
git commit -m "fix(archer-rework): 手动验证视觉修正"
```

---

## 完成标准

- [ ] `arrowHit` 事件链测试通过（Task 1）
- [ ] `tsc -b --noEmit` 无错误
- [ ] `npx vitest run` 全部通过（含原有测试 + 新 arrowHit 测试）
- [ ] `npm run build` 成功
- [ ] 手动验证 7 个场景全部符合预期
- [ ] 所有改动已分任务提交（7 个 commit）
