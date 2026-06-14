# 医疗营 + 医疗兵 — 设计文档

**日期**：2026-06-14
**作者**：brainstorming session
**状态**：待实现

## 目标

新增医疗营（产医疗兵），医疗兵远程发射绿色治疗弹——优先治疗 HP 百分比最低的友军单位/兵营。项目第一个辅助兵种。

不在范围内：复活、状态异常移除、自疗、算术题解锁。

## 核心设计原则

**最小改动**：复用 `attackRange/attackInterval`，`UnitDef.healAmount > 0` 标记医疗兵。`Projectile.damage` 复用为治疗量。

**现有系统不变**：`applyHeal` 独立方法，不与 `applyDamage` 耦合。

## 数据契约

### 类型

[src/game/types.ts](../../../src/game/types.ts)：
```ts
export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb' | 'medic';
export type ProjectileKind = 'arrow' | 'javelin' | 'bomb' | 'heal';
```

`UnitDef` 加 `healAmount?: number`（> 0 表示医疗兵）。

### 配置

```ts
// units.ts
medic: { kind: 'medic', attackType: 'ranged', maxHp: 40, attack: 0, attackRange: 150, attackInterval: 2.0, moveSpeed: 40, healAmount: 12 },
// camps.ts
medic: { kind: 'medic', produces: 'medic', maxHp: 350, spawnInterval: 7, unitCap: 10 },
```

### 事件

```ts
| { kind: 'healHit'; x: number; y: number; faction: Faction }
```

## 战斗逻辑

### UnitManager — 治疗目标选择

`acquireTarget`: 如果 `healAmount > 0`，搜索同阵营 alive unit + 未摧毁 camp 中 HP 百分比 `hp/maxHp` 最低的。无候选时 `targetId = null, state = 'idle'`。

`act`: healer 推 `kind: 'heal'` 弹道，`damage` 填 `healAmount`。开火触发 `playMedicAnim`。

### CombatSystem.applyHeal

```ts
static applyHeal(target: Unit | Camp, amount: number, gs: CombatGSView): void {
  target.hp = Math.min(target.maxHp, target.hp + amount);
  gs.events.push({ kind: 'healHit', x: target.x, y: target.y, faction: target.faction });
}
```

### 弹道分发

`CombatSystem.step` `dist < 12` 加 `if (p.kind === 'heal') { applyHeal(...); }`。目标已死时 `if (!target) continue;` 兜底（治疗弹消失）。

## 视觉

### 医疗兵 sprite

白大褂 + 红十字 + 小药箱。`playMedicAnim` 三段式：举高 0.25s → 投出 0.15s → 归零 0.2s。

### 治疗弹

绿色圆球 + 白色十字。直线飞行（与箭矢同逻辑）。

### 命中特效

`spawnHealHit`: 绿色十字缩放 0.5→1.2 + 小绿星上浮（0.5s）。

### 医疗营建筑

`drawMedicCamp`: 白色主体 + 顶部红十字。颜色映射 `medic: 0xffffff`。

### UI

KINDS 加 `{ key: 'medic', label: '医疗营', icon: '🏥' }`，热键 Y，不加 gated。

## 数据流

```
医疗兵 acquireTarget(healer) → 同阵营 HP%最低目标
  → projectiles.push({ kind:'heal', damage:healAmount })
  → CombatSystem.step 推进 → dist<12: applyHeal → healHit 事件
  → EffectManager.spawnHealHit: 绿十字+绿星
```

## 错误处理

| 情况 | 处理 |
|---|---|
| 无受伤友军 | targetId=null, state='idle' |
| 治疗弹飞行中目标死亡 | `if (!target) continue;` 消失 |
| 医疗兵被攻击 | 正常扣血（不自疗） |
| 目标已满血 | 仍推 healHit 但 `Math.min` 不影响 |

## 测试

| 文件 | 内容 |
|---|---|
| `tests/CombatSystem.heal.test.ts`（新建） | applyHeal 单体 + 不超过 maxHp + 推 healHit |
| `tests/CombatSystem.events.test.ts` | +1 条：治疗弹命中推 healHit |

不写：UnitManager 治疗目标选择（复杂 fixture，目测）、特效/sprite（Phaser，目测）。

95 既有测试应全部保留。

### 目测验收

- [ ] 医疗营白色+红十字、Y键可选、无需答题
- [ ] 医疗兵白大褂+红十字、不追敌人、朝受伤友军走
- [ ] 治疗弹绿色+字直飞、命中绿色十字特效、目标 HP 可见回升
- [ ] 优先治 HP%最低的、也治兵营
- [ ] 无伤友军时 idle

## 风险与权衡

| 选择 | 替代 | 为什么 |
|---|---|---|
| 复用 attackRange/Interval | 新建字段 | 最小改动 |
| Projectile.damage 复用 | 新建 healProjectile | 一套弹道系统 |
| healAmount>0 标记 | 新建 actionType | 现有系统无此概念 |
| 治疗弹直线 | 抛物线 | 魔法弹不需物理感 |
| 不自疗 | 自疗 | 防止无限加血 |
| 不需答题 | 也要答题 | 降低门槛 |
