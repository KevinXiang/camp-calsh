# 盾兵专有特效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让盾兵在视觉上拥有"扣盾坚防者"的身份感：被打时盾上迸射金属火花（替代默认星花），盾兵自己开火做三段式盾撞冲锋。

**Architecture:** 完全沿用 javelin 特效那次确立的事件分发模式 —— `applyDamage` 检测目标是盾兵就推 `shieldBlock` 事件代替 `meleeHit`/`javelinHit`，EffectManager.dispatch 加 case 路由到新 `spawnShieldSpark` 方法，BattleScene 闪白白名单加进去。盾兵自己的 `playBashAnim` 替换为三段式 tween。

**Tech Stack:** TypeScript + Phaser 3 + vitest（沿用现有测试模式：事件层 TDD，渲染层目测）。

**Spec：** [docs/superpowers/specs/2026-06-14-shield-spark-effect-design.md](../specs/2026-06-14-shield-spark-effect-design.md)

---

## File Structure

| File | 改动类型 | 责任 |
|---|---|---|
| `src/game/effects/types.ts` | 修改 | 加 `shieldBlock` 联合类型 |
| `src/game/managers/CombatSystem.ts` | 修改 | applyDamage 单位分支检测盾兵优先级（先于武器分发） |
| `src/game/effects/EffectManager.ts` | 修改 | dispatch 加 `shieldBlock` case + 新 `spawnShieldSpark` 方法 |
| `src/game/BattleScene.ts` | 修改 | 受击闪白事件白名单加 `shieldBlock` |
| `src/game/unitRenderer.ts` | 修改 | `playBashAnim` 替换为三段式（后退 → 前冲 → 归位） |
| `tests/CombatSystem.events.test.ts` | 修改 | 加 2 条 shieldBlock 事件分发测试 |

---

## Task 1: CombatEvent 加 shieldBlock 类型

**Files:**
- Modify: `src/game/effects/types.ts`

- [ ] **Step 1: 在 CombatEvent 联合类型加 shieldBlock**

修改 [src/game/effects/types.ts](../../../src/game/effects/types.ts)：

```ts
import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
```

- [ ] **Step 2: 验证构建（仅类型变更，无消费方应该通过）**

```bash
cd e:/0-projects/ai-games/camp-clash && npm run build 2>&1 | tail -5
```

期望：构建成功（CombatEvent 是 union，未匹配的 case 在 dispatch switch 里会被忽略，TS 不报错）。

---

## Task 2: applyDamage 检测盾兵目标 (TDD)

**Files:**
- Modify: `tests/CombatSystem.events.test.ts`
- Modify: `src/game/managers/CombatSystem.ts:20-30`

- [ ] **Step 1: 写失败测试 — 攻击盾兵推 shieldBlock**

在 [tests/CombatSystem.events.test.ts](../../../tests/CombatSystem.events.test.ts) 末尾、`describe` 闭合 `})` 前加：

```ts
  it('近战攻击盾兵时推 shieldBlock 替代 meleeHit', () => {
    const u = mkUnit({ kind: 'shield', x: 33, y: 44 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 5, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'shieldBlock') as Extract<CombatEvent, { kind: 'shieldBlock' }>;
    expect(e).toBeDefined();
    expect(e.x).toBe(33);
    expect(e.y).toBe(44);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('javelin 攻击盾兵时推 shieldBlock 替代 javelinHit（盾兵身份压过武器）', () => {
    const u = mkUnit({ kind: 'shield', x: 50, y: 60 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 5, gs, { source: 'ranged', weaponKind: 'javelin' });
    expect(gs.events.some(ev => ev.kind === 'shieldBlock')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });
```

> 注：`mkUnit` 默认 `kind: 'sword'`（[tests/CombatSystem.events.test.ts:11](../../../tests/CombatSystem.events.test.ts#L11)），用 partial override 把 kind 改成 shield 即可。

- [ ] **Step 2: 运行测试验证两条都失败**

```bash
npx vitest run tests/CombatSystem.events.test.ts 2>&1 | tail -15
```

期望：两条新用例 FAIL（事件数组里只有 meleeHit / javelinHit，没有 shieldBlock）。其他既有用例 PASS。

- [ ] **Step 3: 改 applyDamage — 加盾兵优先分支**

修改 [src/game/managers/CombatSystem.ts:20-30](../../../src/game/managers/CombatSystem.ts#L20-L30) 的 unit 分支：

```ts
    if ('alive' in target) {
      // 盾兵被打：所有命中（近战/弓/矛）走 shieldBlock 火花。
      // 优先级高于 weaponKind 分发 — 盾兵的身份特效压过武器特效。
      if (target.kind === 'shield') {
        gs.events.push({ kind: 'shieldBlock', x: target.x, y: target.y, faction: target.faction });
      } else {
        const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
        gs.events.push(isJavelin
          ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
          : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
        );
      }
      if (target.hp <= 0) {
```

> 关键：保持死亡分支完全不动（`if (target.hp <= 0) {...}` 之后整段不变），只在受击事件 push 处加盾兵优先分支。这样既有"melee kills"等测试不会回归。

- [ ] **Step 4: 验证测试通过**

```bash
npx vitest run tests/CombatSystem.events.test.ts 2>&1 | tail -8
```

期望：9 tests passed（原 7 + 新 2）。

- [ ] **Step 5: 跑全部测试 + 构建**

```bash
npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3
```

期望：81 tests passed（原 79 + 新 2），构建成功。

- [ ] **Step 6: Commit**

```bash
git add src/game/effects/types.ts src/game/managers/CombatSystem.ts tests/CombatSystem.events.test.ts
git commit -m "feat(combat): 攻击盾兵推 shieldBlock 事件替代 meleeHit/javelinHit

applyDamage 单位分支增加盾兵优先级判断（target.kind==='shield'）。
盾兵身份压过武器特效；命中判定逻辑零改动。"
```

---

## Task 3: EffectManager 火花特效 + dispatch case

**Files:**
- Modify: `src/game/effects/EffectManager.ts`

- [ ] **Step 1: dispatch 加 shieldBlock case**

修改 [src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) 的 `dispatch` switch（紧接 `javelinHit` 之后插入）：

```ts
  /** 排干一批事件（由 BattleScene 每帧调用） */
  dispatch(events: CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
    }
  }
```

- [ ] **Step 2: 加 spawnShieldSpark 方法**

在 [src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) 中 `spawnJavelinHit` 方法之后插入：

```ts
  /** 盾击火花：3 道短斜线（黄/橙）+ 4 颗光点向外飞 + 盾边圆环短闪（0.4s 生命） */
  private spawnShieldSpark(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 3 道斜线火花：从命中点向后向上散
    const lineSpecs = [
      { x1:  0, y1:  0, x2: -12, y2: -10, color: 0xfff176 },
      { x1:  0, y1:  0, x2: -14, y2:   2, color: 0xff8a65 },
      { x1:  0, y1:  0, x2: -10, y2:  14, color: 0xfff176 },
    ];
    for (const s of lineSpecs) {
      const g = this.scene.add.graphics();
      g.lineStyle(2, s.color, 1);
      g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      root.add(g);
      this.scene.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0 },
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    }

    // 4 颗光点：从中心向外飞散并淡出
    const pts: [number, number][] = [[-25, -8], [-22, 12], [-18, -20], [-28, 4]];
    for (const [tx, ty] of pts) {
      const c = this.scene.add.circle(0, 0, 1.8, 0xffeb3b, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        duration: 350,
        ease: 'Cubic.easeOut',
      });
    }

    // 盾边圆环短闪一下（仅 0.13s，强调"挡了一下"）
    const ring = this.scene.add.circle(-12, 0, 9, 0x000000, 0).setStrokeStyle(1.5, 0xfff176, 0.9);
    root.add(ring);
    this.scene.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0 },
      duration: 130,
      ease: 'Cubic.easeOut',
    });

    this.scene.time.delayedCall(400, () => {
      root.destroy();
      this.budget.release();
    });
  }
```

> **关键定位说明**：3 道斜线和圆环的 x 偏移都是 `-12` —— 对齐 [unitRenderer.ts:74](../../../src/game/unitRenderer.ts#L74) 中盾画在 `(-11, 2)` 的位置。火花视觉上从盾上迸出，不是单位中心。

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/game/effects/EffectManager.ts
git commit -m "feat(effects): 盾兵金属火花特效

dispatch 新增 shieldBlock case；spawnShieldSpark 画 3 道斜线
（黄/橙、0.25s）+ 4 颗光点散开（0.35s）+ 盾边黄色圆环短闪
（0.13s）。火花从盾位 (-12,0) 迸出，总寿命 0.4s 适配高频对撞。"
```

---

## Task 4: BattleScene 闪白扩展到 shieldBlock

**Files:**
- Modify: `src/game/BattleScene.ts:117`

- [ ] **Step 1: 加 shieldBlock 到闪白触发条件**

修改 [src/game/BattleScene.ts:117](../../../src/game/BattleScene.ts#L117)：

```ts
        if (ev.kind === 'meleeHit' || ev.kind === 'javelinHit' || ev.kind === 'shieldBlock') {
```

> 上下文：这是 [BattleScene.ts:115-125](../../../src/game/BattleScene.ts#L115-L125) 排干 events 时筛选触发受击闪白的事件类型。前一次 javelin 实施已加了 `javelinHit`，现在再加 `shieldBlock`。

- [ ] **Step 2: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/game/BattleScene.ts
git commit -m "feat(scene): 盾兵被打也触发受击闪白

将 shieldBlock 加入 triggerHitFlash 的事件白名单。
火花和闪白同时出现，攻击者能感到自己的攻击生效。"
```

---

## Task 5: 盾兵三段式盾撞动作

**Files:**
- Modify: `src/game/unitRenderer.ts:261-271`

- [ ] **Step 1: 替换 playBashAnim 为三段式**

完整替换 [src/game/unitRenderer.ts:261-271](../../../src/game/unitRenderer.ts#L261-L271)（整个 `playBashAnim` 函数 11 行）：

```ts
/** 盾兵盾撞：后退蓄力 0.2s → 急速前冲 0.2s → 归位 0.25s。总 0.65s。 */
function playBashAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：后退蓄力（-8px）
  body.scene.tweens.add({
    targets: body,
    x: -8,
    y: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
  });
  // 段 2：急速前冲（绝对位置 +12px，相对蓄力位置共 20px 急冲）
  body.scene.tweens.add({
    targets: body,
    x: 12,
    y: 0,
    duration: 200,
    ease: 'Cubic.easeIn',
    delay: 200,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    x: 0,
    y: 0,
    duration: 250,
    ease: 'Sine.easeOut',
    delay: 400,
  });
}
```

- [ ] **Step 2: 验证构建 + 测试**

```bash
npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -5
```

期望：构建成功、81 tests passed。

- [ ] **Step 3: Commit**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(visual): 盾兵三段式盾撞冲锋

playBashAnim 改为后退 0.2s（-8px 蓄力）→ 前冲 0.2s（+12px 急冲，
相对蓄力共 20px）→ 归零 0.25s。总 0.65s 远小于 attackInterval=1.2s。
明显区分于剑兵的旋转挥砍。"
```

---

## Task 6: 端到端目测验收

**Files:** （仅运行）

- [ ] **Step 1: 启动 dev 服务器或等 Pages 部署**

本地：

```bash
cd e:/0-projects/ai-games/camp-clash && npm run dev
```

打开 http://localhost:5173；或 push 后等 Pages 自动部署到 https://kevinxiang.github.io/camp-calsh/。

- [ ] **Step 2: 摆开战场（盾兵 vs 多种攻击源）**

按以下顺序摆放：

- 红方左侧：**剑营**（数字键 1 或拖拽 ⚔️）
- 蓝方右侧：**盾营**（数字键 2 或 拖拽 🛡️）
- 战斗自动开始
- 把右下"产兵速度"调到 2× 加快观察

- [ ] **Step 3: 按 spec 验收清单逐条核对**

打开 F12 控制台辅助观察。逐条勾掉：

- [ ] 剑兵打盾兵时盾上**迸射火花**（黄+橙短斜线 + 光点）、看不到黄星 ✦
- [ ] 盾兵被命中**仍然闪白**（盾的位置变白一下）
- [ ] 盾兵自己开火时身体清晰可见**后退 → 前冲 → 归位**（0.65s 三段）

继续在战场加蓝方弓营（数字键 3）和投矛营（数字键 4）：

- [ ] 弓兵的箭命中盾兵时同样是火花、不是黄星
- [ ] 投矛命中盾兵时仍是火花（**不是大星花**）
- [ ] 非盾兵被打仍然原样（剑打剑 = 黄星，矛打弓 = 大星花）
- [ ] 盾兵被打死时仍正常死亡（倒下 + 死亡星）— 火花和死亡特效不冲突
- [ ] 盾兵被多个敌人围攻时帧率正常（速度调到 8x 看高频对撞）
- [ ] 控制台无新报错

- [ ] **Step 4: 如果有问题，定位到对应任务**

| 现象 | 可能任务 |
|---|---|
| 打盾兵看到的还是黄星 / 大星 | Task 2（applyDamage 分支）/ Task 3（dispatch case） |
| 火花位置不对（飘到单位中心而非盾上） | Task 3（spawnShieldSpark 的 -12 偏移） |
| 盾兵不闪白 | Task 4（白名单） |
| 盾兵攻击动作还是 yoyo 4px | Task 5 |
| 盾兵被打到时火花和闪白不同时出现 | Task 4 + Task 3：检查 BattleScene events drain 顺序 |

修完回到 Step 2 重测。

- [ ] **Step 5: 验收通过后 push**

```bash
git push origin main
```

GitHub Actions 触发 Pages 部署。

---

## Out-of-Scope（不做）

| 项目 | 原因 |
|---|---|
| 盾撞冲击波（前方一圈黄色光环） | YAGNI；先看三段动作 + 火花是否够，不行再加 |
| 走路时侧身扛盾姿态 | spec 明确不做 |
| 盾兵抗伤减伤的真实游戏逻辑 | spec 明确不做（仅视觉，伤害仍按现有公式） |
| 攻击者被反弹效果 | spec 明确不做 |
| EffectManager.dispatch 的 shieldBlock 路由测试 | 需 mock Phaser scene，沿用 javelin spec 同款理由不写 |
| unitRenderer.playBashAnim 时序测试 | 同上 |
