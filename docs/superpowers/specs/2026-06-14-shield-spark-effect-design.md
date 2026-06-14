# 盾兵专有特效 — 设计文档

**日期**：2026-06-14
**作者**：brainstorming session
**状态**：待实现

## 目标

让盾兵在视觉上拥有"扣盾坚防者"的身份感：
- 任何人攻击盾兵时，盾上迸射**金属火花**（短斜线 + 光点 + 盾边短闪），替代默认的星花命中特效
- 盾兵自己开火时做**三段式盾撞**：后退蓄力 → 急速前冲 → 归位
- 走路姿态保持现状（不做侧身扛盾）

不在范围内：
- 改盾兵的 HP / 攻击 / 攻击间隔 / 移速等数据
- 真实的"挡攻击 → 减伤"机制（仅视觉，伤害仍按现有公式）
- 攻击者被反弹效果
- 盾撞冲击波（前方一圈黄色光环）—— 等三段动作 + 火花上线后看观感再决定

## 核心设计原则

**盾兵身份压过武器身份**：当攻击目标是盾兵时，所有命中都走 `shieldBlock` 火花特效，无视武器是剑/弓/矛。这条优先级在 `applyDamage` 里实现。

理由：盾兵被围攻时是高频被命中场景，其身份特征（扣盾防御）应当压过攻击者的武器特征（弓箭命中星花/投矛命中大星）。如果将来要"投矛打盾兵特殊处理"，再说，YAGNI 不预留。

## 组件分解

### 1. 命中事件分发 — applyDamage 检测盾兵目标

[src/game/effects/types.ts](../../../src/game/effects/types.ts) 加联合类型：

```ts
| { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
```

[src/game/managers/CombatSystem.ts:21-26](../../../src/game/managers/CombatSystem.ts#L21-L26) `applyDamage` 单位分支增加优先判断：

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
    // ...死亡分支不变
  }
}
```

死亡分支完全不动 — 盾兵被打死时仍照常推 `unitDeath` 事件（沿用现有死亡星 + 倒下动画）。

### 2. EffectManager 火花特效

[src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) `dispatch` 加 case：

```ts
case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y); break;
```

新增 `spawnShieldSpark(x, y)` 方法：

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

**关键定位**：3 道斜线和圆环都画在 `(-12, 0)` 附近 = 盾的位置（[unitRenderer.ts:74](../../../src/game/unitRenderer.ts#L74) 中盾画在 `(-11, 2)`，火花用 `(-12, 0)` 近似）。这样视觉上明确"火花从盾上迸出"，而不是从单位中心。

**寿命**：火花总寿命 0.4s，比 meleeHit (0.7s) / javelinHit (0.7s) 短。盾兵被围攻时是高频被命中场景，短寿命避免堆积、更突显"叮当叮当"的高频对撞感。

### 3. BattleScene 受击闪白扩展

[src/game/BattleScene.ts:117](../../../src/game/BattleScene.ts#L117) 触发 `triggerHitFlash` 的事件白名单加 `shieldBlock`：

```ts
if (ev.kind === 'meleeHit' || ev.kind === 'javelinHit' || ev.kind === 'shieldBlock') {
  for (const u of this.gameState.allUnits()) {
    if (u.alive && Math.abs(u.x - ev.x) < 1 && Math.abs(u.y - ev.y) < 1) {
      const v = this.unitViews.get(u.id);
      if (v) triggerHitFlash(v);
      break;
    }
  }
}
```

盾兵被打**也**触发闪白。虽然有火花，但不闪白会让攻击者感到自己的攻击没生效。

### 4. 盾兵攻击动作 — playBashAnim 三段式

[src/game/unitRenderer.ts:261-271](../../../src/game/unitRenderer.ts#L261-L271) 完整重写：

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
  // 段 2：急速前冲（+12px 净位移，相对蓄力位置共 20px）
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

总时长 0.65s < `attackInterval=1.2s`。

**位移取舍**：mockup 演示用 `+30px` 极致冲锋；实际 sprite 半径 ≈ 16，`+12px` 已经能看出明显冲击且不会撞穿目标 sprite。如果上线后觉得不够夸张，再加大到 `+18`。

**和 walk 弹跳的隔离**：现有逻辑通过 `unit.state` 切换隔离 — `attacking` 状态下 [updateUnitView](../../../src/game/unitRenderer.ts) 不触碰 body 变换。三段动画完成后 body 归零，下一帧 walk 弹跳接管。

**已知小限制**（沿用 javelin spec 中的同款现状）：攻击 tween 总时长 0.65s，但 `unit.state` 在敌人被击杀或离开攻击距离的下一个 sim step 就会切回 `'moving'`，此时 walk 弹跳重新接管 body 的 y/rotation，可能在视觉上"打断"还在跑的归位 tween。所有兵种都有这个特性，本次不修。

## 数据流（完整路径）

```
1. 攻击者（任意兵种）→ applyDamage(target=盾兵, ...)
                       │
                       ├─ target.kind === 'shield' → push shieldBlock
                       └─ target.kind !== 'shield' → push meleeHit/javelinHit（不变）
                       │
                       └─ if target.hp <= 0 → push unitDeath（不变）

2. (同帧后段) BattleScene.update events 排空：
   ├─ shieldBlock 命中 → triggerHitFlash + EffectManager.spawnShieldSpark
   │   └─ 3 道斜线（0.25s）+ 4 颗光点（0.35s）+ 盾边圆环（0.13s 短闪）
   │       全部在 0.4s 内 destroy

3. (盾兵自己开火) UnitManager.act → maybeTriggerAttackAnim → playBashAnim
                  └─ 三段 tween 串行（0.65s 总）
```

## 错误处理

| 情况 | 处理 |
|---|---|
| 盾兵在 tween 中途被销毁 | Phaser tween 对已销毁 target 静默忽略 |
| EffectBudget 已满 | `tryAdd()` 返回 false → 跳过特效（沿用现有约定） |
| 盾兵被多人围攻同帧多次命中 | 每次命中独立推 shieldBlock 事件，独立创建特效；EffectBudget 软上限 50 兜底；0.4s 短寿命快速回收 |
| state 切回 moving 中断攻击 tween | 已知小限制，本次不修 |

## 测试策略

**新增的单测**：

| 文件 | 修改 |
|---|---|
| `tests/CombatSystem.events.test.ts` | 新增 2 条："近战攻击盾兵推 shieldBlock 替代 meleeHit"、"javelin 攻击盾兵推 shieldBlock 替代 javelinHit" |

**不写**：
- EffectManager.spawnShieldSpark 视觉测试（涉及 Phaser scene/tween，无 mock）
- unitRenderer.playBashAnim 时序测试（同上）

**目测验收清单**（实施时人工跑一遍）：
- [ ] 摆红方剑营 vs 蓝方盾营。剑兵打盾兵时盾上迸射火花、看不到黄星
- [ ] 摆红方弓营 vs 蓝方盾营。箭命中盾兵时同样是火花、不是黄星
- [ ] 摆红方投矛营 vs 蓝方盾营。投矛命中盾兵时仍是火花（**不是**大星花）
- [ ] 盾兵被命中**仍然闪白**（虽然有火花）
- [ ] 盾兵自己开火时身体清晰可见**后退 → 前冲 → 归位**（0.65s 三段）
- [ ] 盾兵被打死时仍正常死亡（倒下 + 死亡星）— 火花和死亡特效不冲突
- [ ] 盾兵**被多个敌人围攻**时帧率正常（盾兵 vs 多个剑兵的"叮当对撞"高频火花场景）
- [ ] 非盾兵被打仍然原样（剑兵被剑打 = 黄星，弓兵被矛打 = 大星花）

## 风险与权衡

| 选择 | 替代 | 为什么这样 |
|---|---|---|
| 盾兵身份压过武器特效 | 弓打盾兵=星花、矛打盾兵=大星花、各保留各的 | 盾兵身份特征（扣盾）应高频可见；武器特征对应的视觉信号（伤害大小）已通过 HP 条体现 |
| 火花从盾位 (-12,0) 迸出 | 火花从命中点中心 (target.x,y) | 强化"火花来自盾"的因果感；不强求物理精确（命中点是单位中心 (x,y)，与盾位相差 12px，0.4s 内观察不出错位） |
| 火花寿命 0.4s（短） | 0.7s 与其它命中特效一致 | 盾兵被围攻是高频场景，短寿命避免堆积；视觉上更接近"叮当叮当"快节奏 |
| 攻击三段位移 +12px | mockup 演示 +30px | 避免 sprite 撞穿目标；上线后观感不够再加大 |
| 不做盾撞冲击波 | 加一圈黄色冲击波（mockup 演示有） | YAGNI；先看三段动作 + 火花是否足够，不行再加 |
| 走路姿态保持现状 | 走路时侧身扛盾 | 性价比低，扣盾身份在被打/出手时已充分体现 |

## 实施顺序建议

1. 类型层：effects/types.ts 加 `shieldBlock`
2. CombatSystem.ts applyDamage 加盾兵分支（+ TDD：先写失败测试）
3. EffectManager.ts dispatch + spawnShieldSpark
4. BattleScene.ts 闪白扩展
5. unitRenderer.ts playBashAnim 三段式
6. `npm test && npm run build && npm run dev` 目测验收
