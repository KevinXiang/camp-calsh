# CLAUDE.md


## AI Agent 编码行为约束

**权衡:** 这些准则偏向谨慎而非速度。对于简单任务，可自行判断。

### 1. 思考先行

实施之前:
- 明确陈述你的假设。如果不确定，主动询问。
- 如果存在更简单的方法，说出来。必要时提出反对意见。

### 2. 简洁至上

- 不实现超出需求的功能。
- 不为单次使用的代码创建抽象。
- 不为不可能发生的场景做错误处理。

### 3. 精准修改

- 只动必须动的。不要"改进"相邻的代码、注释或格式。
- 匹配现有风格，即使你更倾向不同的写法。
- 变更导致的孤立 import/变量/函数必须清理。

### 4. 目标驱动执行

将任务转化为可验证的目标，"修复 Bug" → "先复现，再修复，最后验证"。

## Git 提交规范

每实现一个独立功能点做一次 commit，保持粒度细、可独立回滚。

## 构建 / 测试 / 开发

```bash
npm run dev          # Vite dev server（热更新）
npm run build        # tsc 类型检查 + vite 生产构建
npm test             # vitest 全量单测
npx vitest run tests/CombatSystem.test.ts  # 跑单个测试文件
```

`tsc -b` 开 `noEmit: true`，只做类型检查不做产出。Vite 负责实际编译。项目零 lint/formatter 配置。

## 架构概览

```
Phaser Game (main.ts)
  ├─ BootScene → BattleScene
  ├─ UiBridge: 游戏层 ↔ UI 层唯一条通（事件驱动）
  └─ UI 组件: BuildPanel / InfoPanel / HudController / ControlBar / VictoryOverlay / MathQuizModal

BattleScene.update (每帧):
  1. SimulationClock.consume(deltaMs) → 产出 N 个固定步长 dt=1/60s 的 step（受 speed 倍率影响，上限 10）
  2. for each step: CampManager.step → UnitManager.step → CombatSystem.step
  3. 排干 events 队列 → EffectManager 播放特效 + BattleScene 触发受击闪白
  4. 胜负判定 → VictoryOverlay
  5. syncCampViews / syncUnitViews / syncProjectileViews
```

### 核心模式

**GameState 黑盒**: 所有 game logic（CampManager / UnitManager / CombatSystem）共享一个 `GameState` 实例，直接读写 `camps/units/projectiles/events` Map/数组。无 reducer、无不可变更新。

**固定步长模拟**: `SimulationClock` 把变帧率 `deltaMs` 切为固定 `1/60s` 的 steps，防止逻辑不一致。`speed` 倍率只影响每帧产出的 step 数。

**事件队列**: 每个 sim step 内产生的 `CombatEvent`（meleeHit / javelinHit / shieldBlock / bombHit / bombExplosion / healHit / unitDeath / campHit / campDestroyed）放入 `gs.events[]`，update 末尾一次性排干派发给 EffectManager + 受击闪白。

**Projectile 系统**: `CombatSystem.step` 每 step 推进所有 projectile 的 `x,y` 直线移动，当 `dist < 12` 命中时分发 — 箭/矛/bomb/heal 走各自分支。炸弹走 `applyAOE`（50px 圆范围伤害），治疗弹走 `applyHeal`。

**兵种种类 / CampKind**: 6 种 — `sword`(melee) / `shield`(melee 坦克) / `archer`(ranged) / `javelin`(ranged 抛物线) / `bomb`(ranged AOE) / `medic`(ranged heal)。每种 `UnitDef` 含可选 `healAmount`（>0 标记医疗兵）。Camp 数据通过 `CAMP_DEFS` 配置（maxHp/spawnInterval/unitCap）。

**工厂军制造**: `CampManager.step` 每 step 为每个未摧毁营地累加 `spawnTimer -= dt * spawnMultiplier`，归零时产出单位（`unitCap` 限制上限 12-20）。

**UI 桥**: `UiBridge` 用事件发射器模式（`.on('event', cb)` / `.emit('event')`），游戏层和 UI 层通过它通知状态变化（placementChanged / selectionChanged / simChanged / statsChanged / gameOver）。

**算术题门控**: `MathQuizModal` 全屏遮罩 + 数字键盘。投矛/爆破按钮被 `gated` 标记，未解锁时 `BuildPanel` 走 `ensureUnlocked` → `modal.open()`（Promise 等答对）。解锁后 120s 内不弹题（`unlockTimer` 自然时间每秒递减）。

**特效预算**: `EffectManager` 持有 `EffectBudget(50)` 软上限。每个特效占一个 slot，结束时 `release()`。满了跳过新特效。
