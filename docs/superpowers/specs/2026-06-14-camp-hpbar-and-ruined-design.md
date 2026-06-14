# 兵营血条 + 摧毁破裂特效 — 设计文档

**日期**：2026-06-14
**作者**：brainstorming session
**状态**：待实现

## 目标

给所有兵营加血条（头顶，与单位同风格），摧毁时视觉切换为灰化+裂纹+HP条归零，让玩家清楚感知兵营的生命状态和死亡反馈。

不在范围内：
- 改兵营 HP 数值或伤害计算
- 改单位血条样式
- 被摧毁兵营的"恢复/复活"机制

## 核心设计

**两个独立改动，都在现有文件内**：
1. `campRenderer.ts` `drawCamp()` 加血条 children + 新增 `drawRuinedOverlay()`
2. `BattleScene.ts` `syncCampViews()` 加血条更新 + 摧毁状态切换

## 组件分解

### 1. campRenderer — 血条 + 摧毁蒙层

[src/game/campRenderer.ts](../../../src/game/campRenderer.ts) `drawCamp()` 返回的 container 加 2 个血条子对象：

```
child[0] = 营地图形 (Phaser.Graphics) — 现有
child[1] = 血条背景 (Phaser.Rectangle, 50×4.5, 黑色 0.55α)
child[2] = 血条填充 (Phaser.Rectangle, 50×3.5, 动态颜色)
```

血条位置在营地图形上方：
- 每个营地绘制函数使用的 y 范围不同（剑营 -58~42，盾营 -6~44，弓营 -74~44，投矛 -59~44，爆破 -11~8）
- 统一放在 `y = -62`（足够高于所有营地图形的最高点）

血条颜色规则与单位血条一致：
- HP > 50% → 绿色 `0x4caf50`
- HP 25%-50% → 黄色 `0xffc107`
- HP < 25% → 红色 `0xf44336`

**新增 `drawRuinedOverlay(g, camp)` 函数**：

```ts
function drawRuinedOverlay(g: Phaser.GameObjects.Graphics, camp: Camp): void {
  // 半透明灰蒙层（覆盖营地全部图形区域）
  g.fillStyle(0x555555, 0.55);
  g.fillRect(-42, -70, 84, 120);
  // 3 道黑色裂纹
  g.lineStyle(2.5, 0x111111, 0.8);
  g.lineBetween(-20, -5, -10, 15);
  g.lineBetween(5, -20, 18, 8);
  g.lineBetween(-12, 8, 8, -10);
}
```

裂纹是通用近似 — 不管营地是哪种形状，3 道大致覆盖中间区域的裂纹就够。不做每种营地独立裂纹（YAGNI）。

### 2. BattleScene.syncCampViews — 更新逻辑

[src/game/BattleScene.ts:146-155](../../../src/game/BattleScene.ts#L146-L155) 在现有位置更新后追加血条更新 + 摧毁切换：

```ts
private syncCampViews(): void {
  const seen = new Set<string>();
  for (const camp of this.gameState.allCamps()) {
    seen.add(camp.id);
    let view = this.campViews.get(camp.id);
    if (!view) {
      view = drawCamp(this, camp);
      this.campViews.set(camp.id, view);
    }
    view.setPosition(camp.x, camp.y);

    // 更新血条
    const hpFill = view.getData('hpFill') as Phaser.GameObjects.Rectangle;
    if (hpFill) {
      const ratio = Math.max(0, camp.hp / camp.maxHp);
      hpFill.setSize(50 * ratio, 3.5);
      const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
      hpFill.setFillStyle(c);
    }

    // 摧毁状态切换（仅第一次触发）
    if (camp.destroyed && view.getData('ruined') !== true) {
      const g = view.getAt(0) as Phaser.GameObjects.Graphics;
      drawRuinedOverlay(g, camp);
      view.setAlpha(0.75);
      view.setData('ruined', true);
    }
  }
  for (const [id, view] of this.campViews) {
    if (!seen.has(id)) { view.destroy(); this.campViews.delete(id); }
  }
}
```

### 3. 数据流

```
CombatSystem.applyDamage(camp, dmg)
  → camp.hp -= dmg
  → if hp <= 0: camp.destroyed = true

BattleScene.update (每帧)
  → syncCampViews()
    → 所有 camp: 更新血条 fill width = 50 * hp/maxHp
    → destroyed camp: drawRuinedOverlay + setAlpha(0.75) + 标记 ruined=true
```

### 4. 兼容性

- `CombatSystem.applyAOE` 打兵营也是走 `applyDamage` → 同样触发 hp 更新 → 血条自动反应
- 炸弹爆炸命中兵营 → `campHit` 事件 → 现有震屏特效 + now 血条扣减
- 兵营被摧毁 → `campDestroyed` 事件 → 现有积木散落 + now 灰化裂纹

## 错误处理

| 情况 | 处理 |
|---|---|
| view.getData('hpFill') 为 undefined | `if (hpFill)` 跳过 |
| view.getAt(0) 不是 Graphics | campRenderer 总是先把 graphics 作为 child[0]，不变量保证 |
| 兵营被删除后 view 仍在 | syncCampViews 末尾 `!seen.has(id)` 清理分支处理 |

## 风险与权衡

| 选择 | 替代 | 为什么 |
|---|---|---|
| 统一裂纹位置 | 每种营地独立裂纹 | YAGNI — 3 道通用裂纹覆盖中间区域，对 5 种营地形状都够用 |
| 血条放头顶 y=-62 | 每种营地计算自己顶部 | 5 种营地顶部在 -58~-74 之间，统一 -62 对视觉可接受 |
| drawRuinedOverlay 加在现有 graphics 上 | 新建蒙层 graphics 子对象 | 加在现有 graphics 上更简、少一个对象 |
| 摧毁后整个 container setAlpha(0.75) | 不设 alpha | 半透明增加"废墟"感 |

## 测试

- 目测验收（无单测 — 纯视觉改动，Phaser Graphics API 无 mock）
- `npm test && npm run build` 验证不破坏现有 95 测试

### 目测验收清单

- [ ] 放下任意兵营 → 可看到绿色 HP 条（满血）
- [ ] 放敌方单位攻打 → HP 条逐个扣减、颜色从绿→黄→红
- [ ] 兵营被炸弹炸 → HP 条实时更新
- [ ] 兵营摧毁 → 营地变灰、出现 3 道裂纹、HP 条归零灰色、整体变半透明
- [ ] 被摧毁的兵营**不再产兵**（现有逻辑，不变）
- [ ] 正常兵营仍可正常选中（InfoPanel 显示 HP/位置）

## 实施顺序

1. campRenderer.ts: drawCamp 加血条 children + drawRuinedOverlay
2. BattleScene.ts: syncCampViews 更新血条 + 摧毁切换
3. `npm test && npm run build`
4. 目测验收
5. push
