# 军营定位重设计技术实施文档

## 文档目标

本文档用于将 [军营定位重设计表](/E:/0-projects/ai-games/camp-clash/docs/PRD/2026-06-21-军营定位重设计表.md) 拆解为可执行的工程实施方案，覆盖：

- 设计结论到代码结构的映射
- 分阶段实现顺序
- 具体涉及文件
- 需要新增或替换的测试
- 每阶段完成标准与风险

本文档关注的是“如何落地”，不是再次讨论玩法方向。

## 实施假设

为避免同时推进多条互斥路线，本实施文档采用以下假设：

1. 保留当前 7 种军营，不新增第 8 种军营。
2. 医疗营采用 PRD 中推荐的 `路线 A`：
   - 保留治疗支援身份
   - 移除毒伤、毒云、毒瓶投射物
   - 不改名
3. 爆破营与火炮营明确区分为：
   - 爆破营：反密集、打人堆
   - 火炮营：攻城、打静态营地、最远射程
4. 本轮优先通过“文案表达 + 数值收紧 + 目标选择偏好”实现定位差异，只有在这些不足以拉开身份时，才引入新机制。

如果后续决定改走“医疗营保留毒伤并改名”为另一条路线，应新开补充文档，不建议在本实施文档里混合两套方案。

## 更简单的替代方案

有一个更简单但效果较弱的方案：

- 只改 `units.ts` / `camps.ts` 数值
- 不改目标选择逻辑
- 不改 tooltip 和 UI 文案
- 不移除医疗营毒伤

这个方案实现成本更低，但问题也很明显：

- 玩家仍然主要通过“数值差异”理解军营
- 爆破营与火炮营仍可能重叠
- 医疗营身份仍然不纯
- 很难从根本上改善“后排功能营拥挤”的问题

因此，本轮不采用该简化方案。

## 本轮实施原则

- 先表达，再数值，再行为，最后才考虑机制。
- 每阶段都应保持可独立提交、可独立验证。
- 不同时改动太多兵种机制，避免平衡和 Bug 一起爆炸。
- 设计身份的落地优先顺序高于追求复杂玩法。

## 当前代码基线

当前与军营定位最相关的代码分布如下：

- 配置：
  - `src/config/camps.ts`
  - `src/config/units.ts`
- 类型：
  - `src/game/types.ts`
- 单位行为与目标选择：
  - `src/game/managers/UnitManager.ts`
- 战斗结算：
  - `src/game/managers/CombatSystem.ts`
- UI 表达：
  - `src/ui/BuildPanel.ts`
  - `src/ui/campTooltipData.ts`
  - 可能还会影响 `src/ui/CampTooltip.ts`、`src/ui/InfoPanel.ts`
- 测试：
  - `tests/units.test.ts`
  - `tests/camps.test.ts`
  - `tests/medic-poison.test.ts`
  - `tests/CombatSystem.*.test.ts`

## 总体实施阶段

建议拆为 4 个阶段：

1. 阶段 1：建立军营角色元数据层，统一 UI 表达
2. 阶段 2：按定位调整数值配置，收紧角色边界
3. 阶段 3：通过目标选择和行为逻辑强化战场身份
4. 阶段 4：如有必要，再补少量机制差异

---

## 阶段 1：建立角色元数据层，先让玩家“看懂”

### 目标

在不改战斗规则的前提下，把每个军营的一句话定位、克制关系、阵容职责固化到代码里，并输出到 UI。

这一阶段的目标不是平衡，而是统一表达。

### 为什么先做这一阶段

当前设计文档已经有了定位，但代码里并没有一个统一的“军营角色定义层”。现状是：

- `BuildPanel` 只负责显示按钮
- `campTooltipData.ts` 只提供基础数值指标
- 定位文案、克制关系、战场职责没有统一数据源

这会导致：

- UI 看起来还像“只是 7 个不同数值的营”
- 后面调数值时，玩家感知不到设计意图

### 涉及文件

- 新增：`src/config/campRoles.ts`
- 修改：`src/game/types.ts`
- 修改：`src/ui/campTooltipData.ts`
- 修改：`src/ui/BuildPanel.ts`
- 可选修改：`src/ui/CampTooltip.ts`
- 可选修改：`src/ui/InfoPanel.ts`

### 实施方案

#### Step 1：定义军营角色元数据结构

在 `src/game/types.ts` 中新增一组仅供 UI/设计表达使用的类型，例如：

```ts
export interface CampRoleDef {
  slogan: string;
  role: 'frontline' | 'tank' | 'sustain-ranged' | 'assassin-ranged' | 'aoe-ranged' | 'support' | 'siege';
  strengths: string[];
  weaknesses: string[];
  bestAgainst: CampKind[];
  weakAgainst: CampKind[];
  tier: 1 | 2 | 3;
}
```

说明：

- 这些字段不进入模拟核心逻辑
- 主要用于 tooltip、面板和后续挑战模板文案

#### Step 2：新增 `src/config/campRoles.ts`

集中维护 7 种军营的角色定义。

建议内容：

- 一句话定位
- 战场职责
- 克制谁
- 怕谁
- 学习层级

例如：

```ts
export const CAMP_ROLE_DEFS: Record<CampKind, CampRoleDef> = {
  sword: {
    slogan: '基础推进线，负责冲散后排',
    role: 'frontline',
    strengths: ['成型快', '数量压力高', '适合铺线'],
    weaknesses: ['怕爆破清团', '怕重装拖线'],
    bestAgainst: ['archer', 'javelin', 'bomb', 'artillery'],
    weakAgainst: ['shield', 'bomb'],
    tier: 1,
  },
  ...
}
```

#### Step 3：改造 `campTooltipData.ts`

当前 `campTooltipData.ts` 只计算：

- `dps`
- `rangeClass`

本阶段应扩展为组合输出：

- 基础数值指标
- 角色描述
- 克制关系标签
- 建议用途

推荐不要把这些常量散落在 tooltip 组件里，而是全部从 `CAMP_ROLE_DEFS` 读取。

#### Step 4：在 `BuildPanel` / Tooltip 中显示角色身份

建议最少显示：

- 一句话定位
- 克制标签
- 层级标签，例如“基础营 / 战术营 / 特殊营”

这一阶段不需要改按钮数量、热键和面板结构，只要在信息密度上让军营差异可见。

### 测试与验证

- 运行：`npm test`
- 补充 UI 数据层测试：
  - 新增：`tests/campRoleData.test.ts`

建议断言：

- 每个 `CampKind` 都有对应角色定义
- 角色层级符合设计文档
- `campTooltipData` 能返回定位文案和数值指标

### 完成标准

- 代码中已有统一的军营角色元数据源
- Tooltip 和面板能显示军营定位
- 玩家不看 PRD 也能从界面理解“这个营是干什么的”

### 建议提交

- `feat(ui): add camp role metadata and surface role hints in tooltip`

---

## 阶段 2：调整数值配置，先拉开角色边界

### 目标

通过最小规模数值调整，让 7 种军营的职责边界更清晰。

本阶段不引入复杂机制，主要收紧“谁是泛用、谁是特化”。

### 涉及文件

- 修改：`src/config/units.ts`
- 修改：`src/config/camps.ts`
- 修改：`tests/units.test.ts`
- 修改：`tests/camps.test.ts`
- 可选新增：`tests/camp-balance-baseline.test.ts`

### 数值调整原则

#### 剑兵营

- 保持最快或接近最快的出兵节奏
- 保持高机动
- 不提高单体质量太多

意图：

- 让它继续承担“基础推进线”
- 不去侵蚀盾兵和战术营的功能空间

#### 盾兵营

- 维持最高营地血量之一
- 单位生命继续领先
- 可接受更慢产能，换更稳定的承伤身份

意图：

- 把它从“更肉近战”拉向“明确前排”

#### 弓兵营

- 保持高泛用、持续输出路线
- 不做高爆发化

意图：

- 它应该是最通用远程，不应与投矛争抢爆发位

#### 投矛营

- 进一步强化高单发、低频率
- 不建议加上限

意图：

- 把“点杀关键目标”这个身份压实

#### 爆破营

- 保持低上限
- 不提高泛用单体输出
- AOE 应明显优于单点伤害价值

意图：

- 明确为反密集，不成为万能后排

#### 医疗营

- 以纯支援路线为前提
- `attack` 保持 `0`
- 保留治疗，不保留毒伤

意图：

- 让它成为最纯的续航件

#### 火炮营

- 保持最远射程
- 保持低上限、低频率
- 维持对营地更高价值

意图：

- 锚定为攻城位，而不是后排大杂烩

### 关键实现决定

#### Step 1：从 `UnitDef` 中移除医疗营毒性字段

当前 `src/game/types.ts` 中 `UnitDef` 含有：

- `poisonDamage`
- `poisonDuration`
- `poisonRange`
- `poisonCooldown`

如果医疗营采用纯治疗路线，本阶段建议直接移除这些字段，或至少从配置和行为中不再使用它们。

更推荐直接移除，因为：

- 能减少未来误用
- 能让类型系统体现设计决策

#### Step 2：清理 `UNIT_DEFS.medic`

从 `src/config/units.ts` 移除医疗营的毒伤相关配置，仅保留：

- `healAmount`
- `healSearchRange`

#### Step 3：更新 `tests/units.test.ts`

当前测试仍把医疗营视为带毒支援单位，本阶段应替换为：

- 医疗营纯治疗配置断言
- 不再断言毒伤字段存在

#### Step 4：更新 `tests/camps.test.ts`

当前测试仍是旧版“包含 6 种军营”的遗留表达，还没有完整覆盖 `artillery`。本阶段应顺手校正：

- 覆盖 7 种军营
- 明确火炮营的基础配置断言

### 测试与验证

- `npx vitest run tests/units.test.ts`
- `npx vitest run tests/camps.test.ts`
- `npm test`

### 完成标准

- 配置层已经和角色设计一致
- 医疗营不再包含毒性数值
- 测试基线与当前 7 种军营一致

### 建议提交

- `refactor(balance): align camp and unit configs with redesigned roles`

---

## 阶段 3：用目标选择逻辑强化战场身份

### 目标

在不引入复杂新系统的前提下，通过 `UnitManager` 的目标选择偏好，把军营差异从“数值不同”推进到“行为不同”。

这是本轮最关键的工程阶段。

### 为什么优先改这里

当前 `UnitManager.acquireTarget()` 的逻辑基本是：

- 医疗兵优先找受伤友军
- 其他单位优先找视野内最近敌军
- 没有敌军时找最近敌方营地

这个策略很稳定，但它会让很多远程兵种都表现为：

- 谁近打谁

这正是“后排功能营容易互相像”的根源之一。

### 涉及文件

- 修改：`src/game/managers/UnitManager.ts`
- 修改：`src/game/types.ts`
- 可选新增：`src/config/targeting.ts`
- 新增：`tests/javelin-targeting.test.ts`
- 新增：`tests/bomb-cluster-targeting.test.ts`
- 新增：`tests/artillery-targeting.test.ts`
- 替换：`tests/medic-poison.test.ts` 为 `tests/medic-support.test.ts`

### 实施方案

#### Step 1：为单位定义轻量目标偏好字段

在 `UnitDef` 中增加少量行为字段，而不是在 `UnitManager` 里硬编码所有 if/else。

建议新增：

```ts
preferredTarget?: 'nearest' | 'lowestHpRatio' | 'highestHp' | 'clustered' | 'campFirst';
minimumAttackRange?: number;
```

说明：

- `nearest`：默认行为
- `highestHp`：适合投矛
- `clustered`：适合爆破
- `campFirst`：适合火炮
- `minimumAttackRange`：适合火炮近身弱点

#### Step 2：投矛营加入高价值目标优先

目标行为：

- 视野内有 `medic` / `artillery` 时优先选它们
- 否则优先选高生命值、高血量单位
- 否则退回最近敌人

实现建议：

- 在 `UnitManager.acquireTarget()` 中抽出一个 `scoreEnemyTarget(u, target)` 评分函数
- 投矛营通过评分偏向高价值目标

这样做比单纯“最近敌人”更符合斩首定位。

#### Step 3：爆破营优先锁定密集区目标

目标行为：

- 在视野内候选目标中，优先选择周围邻居最多的敌人
- 如果附近候选密度相近，再按距离选更近的

实现方式建议：

- 复用现有 `SpatialGrid`
- 对候选敌人统计其在 `bomb` 爆炸半径内的邻居数
- 选择“密度分数最高”的目标

这样可以不改投射物系统，就让爆破营自然更像“反人堆单位”。

#### Step 4：火炮营优先打营地，并加入最小射程准备位

目标行为建议分两步：

第一步，本阶段必做：

- 当视野范围内存在敌方营地时，优先锁定营地
- 若无营地，再选高价值后排或密集目标

第二步，本阶段可做或阶段 4 做：

- 若目标进入 `minimumAttackRange`，火炮不立即开火，而是继续移动或重新选目标

这样火炮营会更接近攻城单位，而不是万能炮台。

#### Step 5：医疗营去掉毒云逻辑，保留纯治疗目标选择

在 `UnitManager.step()` 里删除：

- `tryPoisonCloud(u)`

并完全移除：

- `tryPoisonCloud()` 方法
- `poison` 投射物生成

治疗营的职责收缩为：

- 搜索受伤友军
- 发射治疗弹
- 延长前线续航

### 对 `CombatSystem` 的连带影响

如果医疗营去毒，则还需要清理：

- `ProjectileKind` 中的 `poison`
- `CombatSystem.step()` 中 `p.kind === 'poison'` 分支
- `applyPoison()` / `tickPoison()` 等逻辑
- `EffectManager` 里的毒云特效分发

本阶段建议一并删除，而不是把死代码留着。

### 测试与验证

建议新增和替换以下测试：

- `tests/javelin-targeting.test.ts`
  - 投矛兵优先锁定医疗营或火炮营
- `tests/bomb-cluster-targeting.test.ts`
  - 爆破兵优先命中更密集的一团
- `tests/artillery-targeting.test.ts`
  - 火炮兵优先锁定营地
- `tests/medic-support.test.ts`
  - 医疗兵只治疗，不再生成毒云投射物

同时需要更新：

- `tests/CombatSystem.heal.test.ts`
- 删除或替换 `tests/medic-poison.test.ts`

### 完成标准

- 投矛营具备明显斩首偏好
- 爆破营具备明显反密集偏好
- 火炮营具备明显攻城偏好
- 医疗营已彻底纯化为治疗支援营

### 建议提交

建议拆成 2 到 3 个 commit：

1. `refactor(targeting): add per-unit target preference rules`
2. `refactor(medic): remove poison behavior and keep medic as pure support`
3. `test(targeting): add role-specific targeting coverage`

---

## 阶段 4：只在必要时引入少量机制差异

### 目标

如果阶段 1-3 之后，军营仍然不够鲜明，再引入少量机制强化身份。

本阶段不是默认必做，而是“验证后决定是否做”。

### 适合进入本阶段的机制

#### 方案 A：火炮最小射程

目标：

- 防止火炮近身后仍然表现优秀

实现：

- 在 `UnitDef` 中启用 `minimumAttackRange`
- `UnitManager.act()` 中如果目标过近，则不进入攻击分支

优点：

- 机制简单
- 能立刻强化攻城位身份

#### 方案 B：盾兵远程抗性或更强格挡收益

目标：

- 把盾兵从“肉”变成“抗远程前排”

实现方向：

- 在 `CombatSystem.applyDamage()` 中对 `shield` + `ranged` 伤害加入倍率减免
- 或仅对投射物攻击生效

风险：

- 容易牵动全局平衡
- 本轮不建议先做，除非测试发现盾兵仍然没有身份感

#### 方案 C：投矛对高血目标额外收益

目标：

- 强化其对高价值重型目标的威胁

实现方向：

- 不是直接额外增伤，而是可考虑对高血目标优先级更强

建议：

- 本轮优先保持简单，不建议先上额外伤害规则

### 涉及文件

- 修改：`src/game/types.ts`
- 修改：`src/game/managers/UnitManager.ts`
- 可选修改：`src/game/managers/CombatSystem.ts`
- 新增：对应机制测试文件

### 完成标准

- 仅在验证“表达 + 数值 + 目标偏好不足”后再实施
- 每加一个机制都必须有专门测试

### 建议提交

- `feat(role-identity): add minimum mechanics to reinforce camp roles`

---

## UI 和文案落地要求

除了代码逻辑，本轮还需要同步更新所有能直接影响玩家认知的表达层。

### 必改位置

- `src/ui/BuildPanel.ts`
- `src/ui/campTooltipData.ts`

### 建议同步检查的位置

- `src/ui/CampTooltip.ts`
- `src/ui/InfoPanel.ts`
- `README.md`
- 如有静态说明文案，也应同步

### 表达层要求

每种军营在 UI 中至少要有：

- 一句话定位
- 1-2 个主要优势
- 1-2 个主要短板
- 基础/战术/特殊层级标签

如果做不到这些，玩家仍会继续把军营理解成不同数值的按钮。

## 测试迁移计划

### 需要保留并更新的测试

- `tests/units.test.ts`
- `tests/camps.test.ts`
- `tests/CombatSystem.heal.test.ts`

### 需要删除或替换的测试

- `tests/medic-poison.test.ts`

替换为：

- `tests/medic-support.test.ts`

### 需要新增的测试

- `tests/campRoleData.test.ts`
- `tests/javelin-targeting.test.ts`
- `tests/bomb-cluster-targeting.test.ts`
- `tests/artillery-targeting.test.ts`
- 可选：`tests/artillery-min-range.test.ts`

## 推荐实施顺序

1. 先补 `campRoles.ts` 和 UI 表达层
2. 再调整 `units.ts` / `camps.ts`
3. 再修改 `UnitManager` 行为偏好
4. 清理医疗营毒性代码和测试
5. 最后视验证结果决定是否加火炮最小射程等机制

这个顺序的好处是：

- 玩家先能“看懂”
- 然后数值开始“对上设计”
- 最后行为才“真正跑出身份”

## 建议验证命令

```bash
npx vitest run tests/units.test.ts
npx vitest run tests/camps.test.ts
npx vitest run tests/CombatSystem.heal.test.ts
npx vitest run tests/javelin-targeting.test.ts
npx vitest run tests/bomb-cluster-targeting.test.ts
npx vitest run tests/artillery-targeting.test.ts
npm test
npm run build
```

## 建议提交策略

建议最少拆成以下 5 个提交：

1. `feat(ui): add camp role metadata and surface role hints in tooltip`
2. `refactor(balance): align camp and unit configs with redesigned roles`
3. `refactor(targeting): add role-specific target preference rules`
4. `refactor(medic): remove poison behavior and keep medic as pure support`
5. `test(role-redesign): add coverage for role metadata, targeting, and medic support`

## 完成标准

当以下条件同时满足时，可以认为本轮“军营定位重设计”的技术落地完成：

1. UI 层可以清晰表达 7 种军营的定位与层级
2. 医疗营已经完全切换为纯治疗支援
3. 投矛、爆破、火炮在目标选择上体现出明显不同的战场偏好
4. 现有测试已迁移，新行为有新增测试覆盖
5. 全量测试和构建通过

## 后续可选扩展

如果本轮效果稳定，下一轮才值得考虑：

- 按军营角色生成挑战模板
- 在统计面板中加入“军营职责贡献”指标
- 引入更细的 AI 行为标签，如“保线”“切后”“拆营地”

这些不应与本轮一起推进。
