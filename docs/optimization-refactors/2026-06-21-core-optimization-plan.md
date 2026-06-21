# Camp Clash 核心优化与重构实施文档

## 文档目的

本文档用于记录 `Camp Clash` 当前最值得推进的几项代码优化与小范围重构工作，目标是：

- 在不改变现有玩法的前提下，降低主循环和战斗结算的无效开销
- 收口重复逻辑，减少后续新增兵种/特效时的回归风险
- 为更大规模战斗场景预留性能空间
- 补齐一层更贴近真实玩法的回归测试

本文档只覆盖当前已经识别出的 4 个高优先级方向，不扩展到 ECS、大规模架构替换、UI 重写或配置系统重构。

## 背景判断

当前项目的整体架构是健康的：

- 游戏主循环清晰，固定步长模拟已经建立
- `GameState` 黑盒模式简单直接，适合当前规模
- `UiBridge`、`CampManager`、`UnitManager`、`CombatSystem` 的职责大致明确
- 单元测试基础已经不错

当前更大的问题不是“架构太简单”，而是以下几类隐患开始出现：

- 某些热点路径仍然存在按帧全量扫描
- 战斗伤害和死亡结算逻辑分散在多个分支中
- 已经存在 `SpatialGrid`，但范围伤害并未真正复用
- 测试多数是点状测试，缺少长步进和回归型保护

因此，本轮优化策略应当是“精准修改、优先热点、避免过度设计”。

## 范围与原则

### 范围内

- 事件结构微调
- `BattleScene` 更新流程的热点开销优化
- `CombatSystem` 伤害/死亡结算收口
- 范围查询接入 `SpatialGrid`
- 补充回归型测试

### 范围外

- 改造成 ECS
- 改成 reducer / immutable state 架构
- 大规模重写 UI 层
- 引入新状态管理库
- 做不影响当前问题的样式、命名或格式清理

### 实施原则

- 只改必要文件和必要逻辑
- 每一阶段都必须可单独验证
- 每一步优先保持行为不变，再考虑性能
- 任何重构都必须由测试覆盖或补充验证兜底

## 优化目标总览

### 目标 1：去掉受击事件到视图层的全量坐标扫描

当前 `[BattleScene.ts](/E:/0-projects/ai-games/camp-clash/src/game/BattleScene.ts:120)` 在处理受击事件时，会再次遍历全部单位，通过坐标匹配找到目标 view 并触发闪白。该逻辑的复杂度约为 `事件数 × 单位数`，在战斗规模扩大后会明显放大。

目标结果：

- 受击类事件直接带 `unitId`
- 视图层通过 `unitViews.get(unitId)` 直接命中目标 view
- 删除坐标匹配式的闪白查找

### 目标 2：收口 `CombatSystem` 中重复的伤害/死亡结算

当前单位、营地、毒伤、毒云、AOE、炮击等路径中，存在多处重复的扣血、死亡、统计和事件派发逻辑。后续一旦增加新兵种、新投射物、新状态效果，很容易出现：

- 某个路径漏发 `unitDeath`
- 某个路径漏更新 `kills`
- 某个路径漏减 `aliveUnits`
- 某个路径对营地死亡与普通命中处理不一致

目标结果：

- 单位伤害与死亡处理走统一入口
- 营地伤害与摧毁处理走统一入口
- 事件种类保留原有语义，但底层结算流程统一

### 目标 3：让范围技能真正使用 `SpatialGrid`

当前项目已经有 `[SpatialGrid.ts](/E:/0-projects/ai-games/camp-clash/src/game/spatial/SpatialGrid.ts)`，但 `bomb`、`artillery`、`poison` 这类范围伤害仍然是全量扫描所有单位和营地。

目标结果：

- 单位范围查询改为基于空间网格的候选检索
- 行为结果与当前实现保持一致
- 在大规模战斗时降低每次爆炸/毒云/炮击的查询成本

### 目标 4：补一层回归测试，保护后续继续迭代

当前测试对单点功能覆盖不错，但缺少：

- 多步模拟下的回归保护
- 大规模单位情况下的 smoke 验证
- “行为不变但实现重构”的稳定性验证

目标结果：

- 增加固定场景长步进测试
- 增加范围查询结果一致性测试
- 增加基础性能 smoke test 或至少大规模 step 正常性测试

## 实施阶段拆解

---

## 阶段 1：事件结构优化，移除受击闪白的全量扫描

### 目标

将“受击事件定位单位 view”的方式从“按坐标扫全部单位”改为“事件直接带 `unitId`”。

### 涉及文件

- 修改：`src/game/effects/types.ts`
- 修改：`src/game/managers/CombatSystem.ts`
- 修改：`src/game/BattleScene.ts`
- 修改：`tests/CombatSystem.events.test.ts`

### 当前问题

`[BattleScene.ts](/E:/0-projects/ai-games/camp-clash/src/game/BattleScene.ts:121)` 到 `:129` 的逻辑，会对每个受击事件再扫一遍全部单位，通过 `x/y` 找目标 unit。这个实现的问题有三点：

- 性能不必要地依赖单位总数
- 坐标匹配是间接定位，语义不如 `unitId` 清晰
- 后续如果出现同坐标叠加单位或视觉偏移，可能引入错误命中

### 方案

#### Step 1：调整受击类事件定义

在 `[src/game/effects/types.ts](/E:/0-projects/ai-games/camp-clash/src/game/effects/types.ts)` 中，为以下事件补充 `unitId`：

- `meleeHit`
- `arrowHit`
- `javelinHit`
- `shieldBlock`
- `bombHit`
- 可选：`healHit` 是否需要 `unitId`，本轮可暂不加，避免扩大改动面

推荐形式：

```ts
| { kind: 'meleeHit'; unitId: string; x: number; y: number; faction: Faction }
```

说明：

- 保留 `x/y`，因为特效系统仍然需要坐标
- 增加 `unitId`，用于视图层定向命中

#### Step 2：在 `CombatSystem.applyDamage` 中派发带 `unitId` 的事件

修改 `[src/game/managers/CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:19)` 附近逻辑。

处理原则：

- 单位受击时，如果要派发 hit 事件，统一带 `target.id`
- 护盾单位的 `shieldBlock` 也同样带 `unitId`
- `unitDeath` 保持现有 `unitId` 结构不变

#### Step 3：简化 `BattleScene` 中的闪白逻辑

修改 `[src/game/BattleScene.ts](/E:/0-projects/ai-games/camp-clash/src/game/BattleScene.ts:120)` 到 `:133`。

重构后逻辑：

- 如果事件属于受击类事件，直接读取 `ev.unitId`
- `const view = this.unitViews.get(ev.unitId)`
- 命中则直接 `triggerHitFlash(view)`
- 不再循环 `this.gameState.allUnits()`

#### Step 4：控制 `statsChanged` 的广播频率

当前 `[BattleScene.ts](/E:/0-projects/ai-games/camp-clash/src/game/BattleScene.ts:145)` 每帧都会 `emit('statsChanged')`。这本身也是一种额外 UI 更新压力。

本阶段建议顺手一并优化：

- 在 `BattleScene` 缓存上一帧统计快照
- 仅当 `stats`、`alive camp count`、`alive unit count` 有变化时再发事件

如果希望压缩风险，也可以把这一步放到阶段 1.5 单独提交。

### 验证

- 运行：`npx vitest run tests/CombatSystem.events.test.ts`
- 补充测试：
  - 受击类事件包含 `unitId`
  - `shieldBlock` 事件包含正确 `unitId`
  - `bombHit` 事件包含正确 `unitId`

### 预期收益

- 直接去掉一次事件处理期间的全量单位扫描
- 视图层命中关系更稳定、更直接
- 后续如果扩展更多命中特效，也不需要重复做坐标查找

### 风险

- 事件类型变更会影响所有读取 `CombatEvent` 的位置
- 需要注意 `EffectManager` 只依赖 `x/y`，不要被迫修改不必要逻辑

### 建议提交粒度

建议拆成 1 个 commit：

- `refactor(events): add unitId to hit events and remove BattleScene unit scan`

---

## 阶段 2：统一单位/营地伤害与死亡结算入口

### 目标

把 `CombatSystem` 中分散的扣血、死亡、统计更新逻辑收口，降低分支重复。

### 涉及文件

- 修改：`src/game/managers/CombatSystem.ts`
- 修改：相关 `CombatSystem.*.test.ts`

### 当前问题

以下逻辑存在明显重复：

- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:19)` `applyDamage`
- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:121)` `tickPoison`
- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:172)` `poison` 投射物命中营地分支

重复内容包括：

- `hp` 扣减
- 死亡判定
- `alive`/`destroyed` 更新
- `aliveUnits` 扣减
- `kills`、`campsDestroyed` 统计
- `unitDeath` / `campDestroyed` 事件派发

### 方案

#### Step 1：引入内部统一结算方法

在 `CombatSystem` 内新增两个私有静态方法：

- `private static damageUnit(...)`
- `private static damageCamp(...)`

建议职责：

- `damageUnit`：
  - 扣血
  - 派发命中事件
  - 处理单位死亡
  - 处理阵营击杀数
- `damageCamp`：
  - 扣血
  - 处理 `campHit`
  - 处理 `campDestroyed`
  - 处理阵营摧毁数

#### Step 2：`applyDamage` 只做分流，不做完整结算

让 `applyDamage` 主要负责：

- 判断目标是 `Unit` 还是 `Camp`
- 决定命中事件类型
- 调用统一内部方法

这样可以保留当前公共 API，不影响其他调用方。

#### Step 3：`tickPoison` 改走 `damageUnit`

目前 `tickPoison` 自己实现了一套单位死亡逻辑。重构后应改成：

- 计算本帧毒伤
- 调用统一单位伤害结算
- 再处理 `poisonTimer` / `poisonDps`

注意点：

- 如果毒伤不应该派发普通 `meleeHit` / `arrowHit`，则需要让统一入口支持“不派发命中事件”的模式
- 可以新增一个很轻量的参数，比如 `hitEvent: 'none' | 'meleeHit' | 'arrowHit' | ...`

#### Step 4：毒云打营地改走 `damageCamp`

当前 `poison` 投射物对营地的处理仍然是内联写法，需统一改为 `damageCamp`

这样能保证：

- 营地被毒死时统计一致
- `campDestroyed` 只由统一入口派发
- 不会遗漏未来新增的附加逻辑

### 验证

重点运行：

- `npx vitest run tests/CombatSystem.events.test.ts`
- `npx vitest run tests/CombatSystem.cleanup.test.ts`
- `npx vitest run tests/CombatSystem.aoe.test.ts`
- `npx vitest run tests/CombatSystem.artillery.test.ts`
- `npx vitest run tests/CombatSystem.heal.test.ts`
- `npx vitest run tests/medic-poison.test.ts`

补充建议测试：

- 毒伤击杀单位时，正确增加 `kills`
- 毒云摧毁营地时，正确增加 `campsDestroyed`
- `campDestroyed` 与 `campHit` 不会在同一次致命命中里同时出现

### 预期收益

- 明显减少重复代码
- 后续加新伤害类型时更难漏逻辑
- 更容易做回归测试和定位问题

### 风险

- 如果统一入口设计过度，会反而让调用点更难读
- 因此只建议收口到“单位伤害 / 营地伤害”两个层级，不扩展成复杂策略模式

### 建议提交粒度

建议拆成 1 个 commit：

- `refactor(combat): unify unit and camp damage resolution paths`

---

## 阶段 3：把范围伤害和范围状态接到 `SpatialGrid`

### 目标

让 `bomb`、`artillery`、`poison` 的候选目标查询从全量遍历改为网格查询。

### 涉及文件

- 修改：`src/game/managers/CombatSystem.ts`
- 修改：`src/game/managers/UnitManager.ts` 或合适的 step 调度位置
- 修改：`src/game/GameState.ts` 或新增轻量缓存结构
- 可能修改：`src/game/spatial/SpatialGrid.ts`
- 新增或修改：`tests/SpatialGrid.test.ts`
- 新增：建议增加 `tests/CombatSystem.spatial.test.ts`

### 当前问题

以下方法仍在全量遍历：

- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:67)` `applyAOE`
- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:88)` `applyArtillerySplash`
- `[CombatSystem.ts](/E:/0-projects/ai-games/camp-clash/src/game/managers/CombatSystem.ts:175)` `poison` 命中分支

这意味着每次爆炸都会扫一遍所有单位，单位数上来后成本明显。

### 方案

#### Step 1：明确网格接入边界

本轮只建议对“单位查询”接入 `SpatialGrid`，营地仍保留全量遍历。原因：

- 营地数量通常远少于单位数量
- 单位才是性能主要来源
- 这样可以缩小改动面

#### Step 2：为当前 step 维护一个单位空间索引

可选方案有两种。

方案 A：放在 `GameState`

- 新增一个非持久化字段，如 `unitGrid`
- 每个 sim step 或每帧战斗阶段重建一次

方案 B：放在 `CombatSystem.step` 的临时上下文

- 在进入碰撞/投射物结算前，先基于当前 `alive unit` rebuild grid
- 后续 `applyAOE` 等方法通过参数拿到 grid

本项目当前更适合方案 B：

- 改动局部
- 不污染 `GameState`
- 更符合“只改必要部分”

#### Step 3：改造范围查询方法签名

建议为以下方法增加可选 grid 参数：

- `applyAOE(..., unitGrid?: SpatialGrid<Unit>)`
- `applyArtillerySplash(..., unitGrid?: SpatialGrid<Unit>)`

`poison` 命中分支也改为用 grid 查询。

处理方式：

- 如果传入 grid，则使用 `queryCircle`
- 如果未传入，则保留原有全量扫描 fallback

这样可以降低重构风险，并让单元测试更容易分步迁移。

#### Step 4：结果一致性优先于进一步优化

本阶段首要目标不是把所有查询都压到最低，而是先确保：

- 同一场景下，grid 查询命中的单位集合与原始实现一致
- 边界半径不会因 cell 切分而漏掉单位

### 验证

必跑：

- `npx vitest run tests/SpatialGrid.test.ts`
- `npx vitest run tests/CombatSystem.aoe.test.ts`
- `npx vitest run tests/CombatSystem.artillery.test.ts`
- `npx vitest run tests/medic-poison.test.ts`

建议补充：

- 同一组单位，原始扫描和 `queryCircle` 的命中 ids 相同
- 圆边界上的单位不会被遗漏
- 单位死亡后下一次 rebuild 不会继续被查询到

### 预期收益

- 范围技能结算成本随全图单位数增长的速度显著降低
- 大规模混战时爆炸/毒云等效果的性能波动会更小

### 风险

- 如果 grid rebuild 的时机不对，可能查询到旧位置
- 如果把 camp 也硬接进 grid，会增加不必要复杂度

### 建议提交粒度

建议拆成 2 个 commit：

- `refactor(spatial): route aoe target queries through unit spatial grid`
- `test(spatial): add query parity coverage for aoe and poison`

---

## 阶段 4：补回归型测试

### 目标

增加覆盖“长期模拟”和“重构后行为不变”的测试，而不仅是单个函数点状断言。

### 涉及文件

- 新增：`tests/simulation-regression.test.ts`
- 新增：`tests/CombatSystem.regression.test.ts`
- 可能新增：`tests/perf-smoke.test.ts`

### 方案

#### Step 1：固定场景长步进回归测试

构造一个固定场景，例如：

- 双方各 2-3 个 camp
- 包含近战、远程、爆破、医疗
- 固定模拟 10 秒或 20 秒

断言内容不要过于脆弱，避免写死每一步细节。建议断言：

- 至少发生过命中事件
- 单位数有增有减
- 某一方 `kills` 大于 0
- 营地状态与事件链一致

#### Step 2：重构保护测试

为关键重构点新增“行为一致性”测试，例如：

- `applyAOE` 在接入 grid 前后的命中集合一致
- 毒伤击杀与普通伤害击杀都能正确计数
- `campDestroyed` 只在致命伤害时发出

#### Step 3：性能 smoke test

不建议做严格 benchmark，但可以做基础 smoke 验证：

- 例如 200 个单位、若干投射物
- 跑若干 step
- 断言不会异常、不产生明显错误状态

如果担心 CI 稳定性，可以先不写时间阈值，只做功能型 smoke。

### 验证

- `npm test`
- `npm run build`

### 预期收益

- 后续做性能优化和逻辑收口时更有信心
- 兵种继续增加时，不容易把旧链路悄悄改坏

### 风险

- 测试如果写得太死，会导致稍微调平衡就频繁改测试
- 因此应优先断言结构性结果，而不是脆弱的精确数值

### 建议提交粒度

建议拆成 1 个 commit：

- `test(regression): add long-step simulation and combat parity coverage`

---

## 推荐实施顺序

按性价比和风险排序，建议这样推进：

1. 阶段 1：事件加 `unitId`，移除 `BattleScene` 全量扫描
2. 阶段 2：收口 `CombatSystem` 重复伤害/死亡逻辑
3. 阶段 3：范围技能接入 `SpatialGrid`
4. 阶段 4：补回归型测试

原因：

- 阶段 1 立刻见效，改动小，收益明确
- 阶段 2 先收口逻辑，再做性能优化更稳
- 阶段 3 依赖前两步之后的结构更容易落地
- 阶段 4 最适合作为整轮优化的收尾保障

## 每阶段完成标准

### 阶段 1 完成标准

- 受击类事件已带 `unitId`
- `BattleScene` 不再按坐标扫全体单位找闪白目标
- 相关事件测试通过

### 阶段 2 完成标准

- 单位/营地伤害路径已走统一结算入口
- 重复死亡逻辑已消除
- 毒伤、毒云、AOE、普通伤害测试全部通过

### 阶段 3 完成标准

- `bomb`、`artillery`、`poison` 的单位候选查询已使用 `SpatialGrid`
- 查询结果与原始行为一致
- 范围相关测试通过

### 阶段 4 完成标准

- 已有至少 1 个长步进回归测试
- 已有至少 1 组重构行为一致性测试
- 全量测试和构建通过

## 建议验证命令

```bash
npx vitest run tests/CombatSystem.events.test.ts
npx vitest run tests/CombatSystem.aoe.test.ts
npx vitest run tests/CombatSystem.artillery.test.ts
npx vitest run tests/medic-poison.test.ts
npx vitest run tests/SpatialGrid.test.ts
npm test
npm run build
```

## 建议提交策略

遵循当前仓库“一个独立功能点一个 commit”的约束，建议最少拆成以下 5 个 commit：

1. `refactor(events): add unitId to hit events and remove BattleScene unit scan`
2. `refactor(combat): unify unit and camp damage resolution paths`
3. `refactor(spatial): route aoe target queries through unit spatial grid`
4. `test(spatial): add query parity coverage for aoe and poison`
5. `test(regression): add long-step simulation and combat parity coverage`

## 后续可选项

如果这 4 个阶段完成后效果稳定，下一轮才值得考虑下面这些方向：

- `UiBridge` 只保留事件桥职责，逐步减少直接改 `GameState`
- 把高频 UI 刷新也改成更细粒度的状态触发
- 增加一个开发态性能面板，观察单位数、投射物数、事件数和每帧 step 数

这些不建议和本轮一起做，以免扩大变更面。
