# 投矛兵抛物线特效 — 设计文档

**日期**：2026-06-14
**作者**：brainstorming session
**状态**：待实现

## 目标

让投矛兵（javelin）的远程攻击在视觉上明显区别于弓兵（archer）：
- 投手有清晰的"蓄力 → 出手 → 归位"三段式身体动作
- 矛体沿**高拱抛物线**飞向目标，自身随飞行斜率倾转，地面投下随高度变化的影子（伪 3D）
- 命中产生**强化版黄星**特效（中心大星 + 四角小星）

不在范围内：
- 改变投矛的伤害、射程、命中判定逻辑
- 改变弓兵箭矢的飞行风格（保持现状的直线 + 朝向旋转）
- 投矛兵 sprite 重绘
- 真 3D / Z 轴系统

## 核心设计原则

**game state 保持 2D 平面（黑盒不动）**：`Projectile.x, y` 始终是地面坐标，唯一用于命中判定（距离 < 12px）。"高度"只在渲染层用 `t = elapsed/maxTime` 推导出来作为视觉 y 偏移，不进 game state。

这样的好处：
- CombatSystem 完全不需要懂"抛物线" — 命中判定逻辑零改动
- 所有现有测试沿用同一套碰撞断言
- 视觉效果出问题不会影响游戏平衡

## 组件分解

### 1. 数据层 — Projectile 加 `kind` 区分

[src/game/types.ts](../../../src/game/types.ts)

```ts
export type ProjectileKind = 'arrow' | 'javelin';

export interface Projectile {
  // ...现有字段
  kind: ProjectileKind;
}
```

[src/game/managers/UnitManager.ts](../../../src/game/managers/UnitManager.ts) 创建 projectile 时填 kind：

```ts
this.gs.projectiles.push({
  ...,
  kind: u.kind === 'javelin' ? 'javelin' : 'arrow',
});
```

当前 ranged 兵种只有 `archer` / `javelin` 两种，所以三元表达式覆盖完全。未来加新远程兵种时此处需扩展（YAGNI 不预留）。

### 2. 渲染层 — projectileRenderer 分支

[src/game/projectileRenderer.ts](../../../src/game/projectileRenderer.ts)

`drawProjectile(scene, p)` 按 `p.kind` 分两条路径：

**arrow 分支**：保持现状不变（trail 矩形 + head 圆点 + 朝向旋转）。

**javelin 分支**：构造一个 container，包含两个独立子对象：

- **shadow**（`Phaser.GameObjects.Ellipse`）：椭圆，位置始终跟随 `(p.x, p.y)`，按"虚拟高度"缩放和淡化。
- **shaft**（`Phaser.GameObjects.Graphics`）：矛杆 + 矛头，会做视觉 y 偏移产生"飞起来"的效果，并带自身旋转。

`drawProjectile` 创建 javelin view 时把起点 `(p.x, p.y)` 记入 view-data：
```ts
view.setData('startX', p.x);
view.setData('startY', p.y);
```

`updateProjectileView(view, p)` 对 javelin：

```ts
const startX = view.getData('startX') as number;
const startY = view.getData('startY') as number;
const traveled = Math.hypot(p.x - startX, p.y - startY);
const t = Math.min(1, traveled / EXPECTED_FLIGHT_DIST);  // EXPECTED_FLIGHT_DIST = 150 (javelin attackRange)

const visualHeight = 4 * MAX_H * t * (1 - t);   // 抛物线峰值在 t=0.5
const heightRatio = visualHeight / MAX_H;        // 0..1

shaft.setPosition(p.x, p.y - visualHeight);
// 旋转：t=0 矛朝下飞（-45°），t=0.5 水平（0），t=1 朝下扎（+45°）
shaft.rotation = (t - 0.5) * Math.PI * 0.5;     // -π/4 → +π/4

shadow.setPosition(p.x, p.y);
shadow.setScale(1 - 0.6 * heightRatio);          // 高时影子小到 0.4
shadow.alpha = 0.4 - 0.25 * heightRatio;         // 高时影子淡到 0.15
```

**为什么用 `traveled / EXPECTED_FLIGHT_DIST` 而非 `elapsed / maxTime`**：
- `maxTime=2.0s` 是超时上限，远大于实际飞行时长（≈0.75s）。用比例会让 t 始终 < 0.5，矛永远到不了抛物线峰值。
- `EXPECTED_FLIGHT_DIST = 150`（投矛 attackRange，常量）。打满射程时 t 自然到 1；近射时 t 偏小、矛还在"上升段"就命中，视觉上能接受（命中扎进去的语义由命中特效负责，不靠 t）。

**关键常量**：
- `MAX_H = 40`（峰值高度，世界坐标 px）
- `EXPECTED_FLIGHT_DIST = 150`（与 [config/units.ts](../../../src/config/units.ts) 中 javelin.attackRange 同值）
- 旋转范围：±45° = ±π/4

**异常防御**：
- 起点若未记录（不该发生），`Number(undefined)` → `NaN`，需在 update 入口判 `Number.isFinite` 兜底
- `p.elapsed > 飞行时间` 仍合法 — `traveled` 自然封顶在 attackRange 附近，clamp 到 1 即可

### 3. 投手身体动作 — 三段式

[src/game/unitRenderer.ts](../../../src/game/unitRenderer.ts) `playJavelinAnim`

替换现有的单 yoyo tween 为三个串行 tween：

```ts
function playJavelinAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄力 0.3s（身体后仰、轻微下压）
  body.scene.tweens.add({
    targets: body, rotation: 0.4, y: -2,
    duration: 300, ease: 'Cubic.easeOut',
  });
  // 段 2：出手 0.15s（快速前甩）
  body.scene.tweens.add({
    targets: body, rotation: -0.25, y: 0,
    duration: 150, ease: 'Cubic.easeIn', delay: 300,
  });
  // 段 3：归零 0.2s
  body.scene.tweens.add({
    targets: body, rotation: 0, y: 0,
    duration: 200, ease: 'Sine.easeOut', delay: 450,
  });
}
```

总时长 0.65s，远小于 `attackInterval=2.0s`。

**和 walk 弹跳的隔离**：现有逻辑已通过 `unit.state` 切换隔离 — `attacking` 状态下 [updateUnitView](../../../src/game/unitRenderer.ts) 不触碰 body 变换。三段动画完成后 body 归零，下一帧 walk 弹跳接管。

**已知小限制**（沿用现状，不在本次范围解决）：攻击 tween 总时长 0.65s，但 `unit.state` 在敌人被击杀或离开攻击距离的下一个 sim step 就会切回 `'moving'`。此时 [updateUnitView](../../../src/game/unitRenderer.ts) 会重新接管 body 的 y/rotation，可能在视觉上"打断"还在跑的归位 tween。所有兵种都有这个特性，本次不修。

**安全性**：unit 死亡时 view 被销毁，Phaser tween 对已销毁 target 静默忽略，无需手动清理。

### 4. 命中特效 — 强化版黄星

[src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts)

新增方法 `spawnJavelinHit(x, y)`：

- **中心大星**：`✦` 24px，0.4 → 1.8 缩放，alpha 1 → 0，0.6s `Cubic.easeOut`
- **四角小星**：4 颗 `✦` 14px，分别飞向左上/右上/左下/右下各 25px，alpha 1 → 0，0.7s

合计 5 个文本对象 + 1 次 EffectBudget 占用，0.7s 后统一 `release()`。

### 5. 命中事件分发 — 区分武器源

[src/game/effects/types.ts](../../../src/game/effects/types.ts) 加新事件：

```ts
| { kind: 'javelinHit'; x: number; y: number; faction: Faction }
```

[src/game/managers/CombatSystem.ts](../../../src/game/managers/CombatSystem.ts) `DamageOpts` 加可选字段 `weaponKind`：

```ts
export interface DamageOpts {
  source: 'melee' | 'ranged';
  weaponKind?: 'arrow' | 'javelin';  // 仅 ranged 时填
}
```

`applyDamage` 单位被打的命中事件分支按 `weaponKind` 分发：

```ts
if (target.hp > 0) {
  // 受击事件（不致死）
  if (opts.source === 'ranged' && opts.weaponKind === 'javelin') {
    gs.events.push({ kind: 'javelinHit', x, y, faction: target.faction });
  } else {
    gs.events.push({ kind: 'meleeHit', x, y, faction: target.faction });
  }
}
```

注意：当前 `meleeHit` 事件**无论是否致死都推送**，包括致死时也推一份。新逻辑保持完全一致 — javelin 致死时也推 `javelinHit` + `unitDeath`。

`CombatSystem.step` 的弹道命中处传入 `weaponKind`：

```ts
CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, {
  source: 'ranged',
  weaponKind: p.kind,
});
```

[src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) `dispatch` switch 加分支：

```ts
case 'javelinHit': this.spawnJavelinHit(ev.x, ev.y); break;
```

### 6. BattleScene 受击闪白

[src/game/BattleScene.ts:114-128](../../../src/game/BattleScene.ts#L114-L128) 现在按 `meleeHit` 事件触发受击闪白。新增 `javelinHit` 也应触发同样的闪白：

```ts
if (ev.kind === 'meleeHit' || ev.kind === 'javelinHit') {
  for (const u of this.gameState.allUnits()) {
    if (u.alive && Math.abs(u.x - ev.x) < 1 && Math.abs(u.y - ev.y) < 1) {
      const v = this.unitViews.get(u.id);
      if (v) triggerHitFlash(v);
      break;
    }
  }
}
```

## 数据流（完整路径）

```
1. UnitManager.act()  ── 投矛兵开火 ──→  projectiles.push({kind:'javelin', ...})
                       ├─ 同帧触发：unitRenderer.maybeTriggerAttackAnim
                       │             └─ playJavelinAnim 三段式（0.65s）
                       └─ 同帧标记单位 state='attacking'

2. (后续帧) CombatSystem.step ── projectile.x,y 沿直线推进 ──→
                                 距离 < 12 时调用 applyDamage(weaponKind:'javelin')
                                 └─ events.push({kind:'javelinHit', ...})
                                 └─ aliveUnits-- 或 unit.alive=false

3. (同帧后段) BattleScene.update
   ├─ syncProjectileViews() → projectileRenderer.update
   │                          └─ javelin: 视觉 y = -抛物线高度
   │                                     shaft 旋转 ±45°
   │                                     shadow 缩放 + 淡化
   ├─ events 排空：
   │  └─ javelinHit → triggerHitFlash + EffectManager.spawnJavelinHit
   └─ events.length = 0
```

## 错误处理

| 情况 | 处理 |
|---|---|
| javelin view 缺失 startX/startY | `Number.isFinite` 兜底；不显示高度（视觉退化为直线） |
| `traveled` 超过 EXPECTED_FLIGHT_DIST | `Math.min(1, ...)` clamp，矛进入下落段 |
| projectile 命中后 unit 已死 | 现有逻辑：`gs.units.get(p.targetId)` 返回 undefined → continue（不渲染） |
| body 在 tween 中途被销毁 | Phaser tween 对已销毁 target 静默忽略 |
| EffectBudget 已满 | `tryAdd()` 返回 false → 跳过特效（沿用现有约定） |
| state 切回 moving 中断攻击 tween | 已知小限制（见上节"已知小限制"），本次不修 |

## 测试策略

**新增 / 修改的单测**：

| 文件 | 修改 |
|---|---|
| `tests/CombatSystem.test.ts` | 既有创建 Projectile 处加 `kind: 'arrow'` 适配新类型 |
| `tests/CombatSystem.events.test.ts` | 新增："javelin projectile 命中推 javelinHit 事件而非 meleeHit" |
| `tests/EffectManager.test.ts` | 新增："dispatch javelinHit 触发 spawnJavelinHit"（用 spy） |

**不写**：
- projectileRenderer / unitRenderer 的视觉测试 — 涉及 Phaser scene/tween，单测代价高、收益低，依赖目测验收
- "三段动画时序"测试 — 同上

**目测验收清单**（实施时人工跑一遍）：
- [ ] 放下双方一对兵营，其中一方为投矛营
- [ ] 投矛兵开火时身体清晰可见后仰 → 前甩 → 归位
- [ ] 矛飞向目标过程中明显高于地面，中段最高
- [ ] 矛随飞行倾转：起手低头 → 中段水平 → 落地俯冲
- [ ] 影子始终在地面，且在矛最高点最小最淡
- [ ] 命中目标时能看到中心大 ✦ + 四角散开小 ✦
- [ ] 弓箭仍是直线（不变）
- [ ] 同时多个投矛兵齐射不卡顿（EffectBudget 软上限 50 兜底）

## 风险与权衡

| 选择 | 替代 | 为什么这样 |
|---|---|---|
| 高度只在 renderer 算 | 进 game state 加 visualHeight | 保持 game state 纯 2D，命中判定不变；视觉调参不污染状态 |
| Projectile 加 kind 字段 | 渲染时反查 unit | unit 可能已死，反查不可靠；kind 是创建时确定的常量 |
| 命中特效复用现有星花 | 新画矛插入 + 土花 | 用户选 C：辨识度让位于实现成本 |
| 三段 tween 串行 | 单 yoyo tween | 三段才有"蓄力 - 出手 - 归位"的节奏感 |
| 受击闪白扩展到 javelinHit | 改 meleeHit 事件名兼容 | 改名要动既有事件订阅，扩展更小创伤 |

## 实施顺序建议

1. 类型层：types.ts + effects/types.ts + DamageOpts（编译会立刻指出所有要改的点）
2. UnitManager.ts 创建 projectile 处补 kind
3. CombatSystem.ts 命中分支 + 事件分发
4. EffectManager.ts 加 spawnJavelinHit + dispatch case
5. BattleScene.ts 闪白扩展
6. projectileRenderer.ts 抛物线 + 影子（最复杂，最后改）
7. unitRenderer.ts playJavelinAnim 三段式
8. 既有测试用例 fixture 修复（编译错误指引）
9. 新增两条事件 / 特效测试
10. `npm test && npm run build && npm run dev` 目测验收
