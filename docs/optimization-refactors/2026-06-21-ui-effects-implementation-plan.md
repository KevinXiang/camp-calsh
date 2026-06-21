# UI 与战斗特效优化实施文档

## 文档目标

本文档用于将 [UI 与特效优化 PRD](/E:/0-projects/ai-games/camp-clash/docs/PRD/2026-06-21-UI与特效优化PRD.md) 拆解为可执行的技术实施方案，重点覆盖：

- 视觉语言统一的落地方式
- UI 信息层级调整的代码切入点
- 军营 / 士兵 / 武器 / 投射物辨识度的具体实现路径
- 命中 / 受击 / 爆炸特效的分层改造
- 缩放 LOD 与特效预算策略的接入方式
- 验证方法、风险点和提交粒度

本文档是工程实施文档，不重复 PRD 的体验目标讨论。

## 实施假设

为避免一次性改动过大，本文档基于以下假设：

1. 本轮不引入外部美术资源，继续使用 Phaser Graphics + DOM/CSS。
2. 本轮不替换 UI 技术栈，继续使用原生 DOM + CSS。
3. 本轮不引入 shader、骨骼动画或复杂粒子系统。
4. 本轮优先优化“看懂”和“区分”，其次才是“更华丽”。
5. 本轮不直接修改核心战斗数值平衡，除非视觉身份需要极小配合项。

## 当前代码基线

### UI 层

- `src/ui/ui.css`
- `src/ui/BuildPanel.ts`
- `src/ui/CampTooltip.ts`
- `src/ui/InfoPanel.ts`
- `src/ui/HudController.ts`
- `src/ui/ControlBar.ts`
- `src/ui/VictoryOverlay.ts`

### 战斗可视化层

- `src/game/campRenderer.ts`
- `src/game/unitRenderer.ts`
- `src/game/projectileRenderer.ts`
- `src/game/effects/EffectManager.ts`
- `src/game/BattleScene.ts`

### 数据与文案层

- `src/ui/campTooltipData.ts`
- `src/config/camps.ts`
- `src/config/units.ts`

### 现有问题与实现映射

从当前代码看，PRD 中提出的问题分别落在这些点上：

- UI 风格偏通用：主要集中在 `src/ui/ui.css`
- 建造面板与 tooltip 表达不够角色化：`BuildPanel.ts`、`CampTooltip.ts`、`campTooltipData.ts`
- HUD 层级较平：`HudController.ts`
- 单位辨识度不足：`unitRenderer.ts`
- 投射物身份不够强：`projectileRenderer.ts`
- 特效层级不够清晰：`EffectManager.ts`
- 高密度时缺少 LOD 策略：`BattleScene.ts`、`unitRenderer.ts`、`campRenderer.ts`、`EffectManager.ts`

## 范围与非目标

### 范围内

- CSS 风格重构
- DOM 信息层级增强
- Phaser Graphics 造型增强
- 轻量动画调整
- 特效调度分层
- 缩放与密度下的显示降级策略

### 范围外

- 引入新 UI 框架
- 使用图片贴图资源替换 Graphics
- 大规模音效系统设计
- 全地图环境装饰系统
- 自定义 shader 或后处理管线

## 总体实施顺序

推荐按以下顺序推进：

1. 阶段 1：统一视觉基线和 UI 样式 token
2. 阶段 2：重做 UI 信息层级与军营表达
3. 阶段 3：强化军营、士兵与武器辨识度
4. 阶段 4：强化投射物身份与攻击节奏
5. 阶段 5：重构命中 / 爆炸 / 摧毁特效层级
6. 阶段 6：补充缩放 LOD 与预算优先级策略

这个顺序的原因是：

- 先统一视觉语言，后续改特效和造型才不会越改越散
- 先让玩家“从 UI 看懂”，再让玩家“从战场看懂”
- 最后再做 LOD 和预算控制，避免前面改完又整体返工

---

## 阶段 1：统一视觉基线与 UI token

### 目标

建立全局统一的 UI 视觉基线，避免每个面板、按钮、弹窗、tooltip 各自使用不同语气。

### 涉及文件

- 修改：`src/ui/ui.css`

### 当前问题

当前 `ui.css` 已有完整结构，但存在这些问题：

- 字体还是默认 `system-ui`
- 面板背景基本都是通用半透明黑或阵营色透明块
- 按钮、HUD、tooltip、控制栏之间缺少同一套设计 token
- 胜利弹窗风格较华丽，但普通面板偏朴素，层级跳跃明显

### 实施方案

#### Step 1：建立 CSS 变量层

在 `ui.css` 顶部新增一组全局变量，例如：

```css
:root {
  --ui-font-display: "Trebuchet MS", "Verdana", sans-serif;
  --ui-font-body: "Segoe UI", sans-serif;
  --ui-panel-bg: rgba(18, 22, 28, 0.78);
  --ui-panel-border: rgba(255, 255, 255, 0.16);
  --ui-panel-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  --ui-red: #e44b43;
  --ui-blue: #3b82d9;
  --ui-gold: #f6d34d;
  --ui-wood: #8d6e63;
  --ui-paper: #f4ecd8;
}
```

目标：

- 后续所有 UI 样式都从这组 token 出发
- 避免“这里随手一个颜色、那里再来一套阴影”

#### Step 2：建立统一的 panel 语言

统一以下元素的基础样式语气：

- `#build-panel-left`
- `#build-panel-right`
- `#info-panel`
- `#camp-tooltip`
- `#control-bar`
- `#hud`

建议风格：

- 暗底控制台
- 少量木头 / 黄铜 / 积木气质点缀
- 分层边框与更明显的块面感

#### Step 3：统一按钮状态

当前按钮只有：

- 默认
- hover
- active
- locked

建议细化为：

- idle
- hover
- pressed
- selected
- disabled / locked

并统一动效语言：

- 不用复杂动画
- 用轻微抬升、发光、内阴影变化就够

### 验证

- 手动检查所有 UI 面板是否仍正常显示
- 检查移动端粗指针模式下按钮大小未退化

### 完成标准

- UI 样式不再像一组独立叠加的工具块
- HUD、按钮、tooltip、控制栏在气质上统一

### 建议提交

- `refactor(ui): establish shared visual tokens and panel language`

---

## 阶段 2：重做 UI 信息层级与军营表达

### 目标

让玩家不打开文档，只看 UI 就能大致理解军营定位和当前战局重点。

### 涉及文件

- 修改：`src/ui/BuildPanel.ts`
- 修改：`src/ui/CampTooltip.ts`
- 修改：`src/ui/campTooltipData.ts`
- 修改：`src/ui/InfoPanel.ts`
- 修改：`src/ui/HudController.ts`
- 可选新增：`src/config/campRoles.ts`

### 当前问题

#### BuildPanel

当前 `BuildPanel.ts` 的按钮已经足够用，但仍主要是“图标 + 名字”，没有把军营的战场身份表达出来。

#### CampTooltip

当前 `CampTooltip.ts` 主要显示：

- 军营数值
- 士兵数值
- 医疗兵特殊属性

这更像参数面板，不像“战术说明卡”。

#### InfoPanel

当前 `InfoPanel.ts` 只显示：

- 阵营
- 军营名字
- 血量
- 坐标

信息过少。

#### HUD

当前 `HudController.ts` 展示了总数和存活数，但：

- 哪边占优不够显眼
- 统计结构偏平
- 与“战场观察器”定位不完全匹配

### 实施方案

#### Step 1：新增军营角色描述数据源

建议新增 `src/config/campRoles.ts`，内容包括：

- 一句话定位
- 优势标签
- 弱点标签
- 层级标签：基础 / 战术 / 特殊

这样后续：

- `BuildPanel`
- `CampTooltip`
- `InfoPanel`

都能共享同一份角色描述，而不是各自拼文案。

#### Step 2：BuildPanel 增加角色感信息

不建议大改布局，但应让按钮本身更像“卡片”。

每个军营按钮至少显示：

- 图标
- 名称
- 一句话定位

例如：

- 剑兵营：基础推进线
- 盾兵营：承伤前排
- 弓兵营：稳定火力
- 火炮营：远程攻城

同时增加层级标识：

- 基础
- 战术
- 特殊

#### Step 3：CampTooltip 从数值面板升级为战术卡

保留现有数值，但新增：

- 角色定位
- 适合用途
- 克制对象
- 主要短板

结构建议：

1. 标题区：图标 + 名称 + 层级
2. 角色区：一句话定位
3. 战术区：优势 / 弱点
4. 数值区：营地和单位核心指标

#### Step 4：InfoPanel 增加上下文信息

当前选中军营时，建议增加：

- 军营定位
- 当前存活单位数
- 产兵节奏
- 主要用途

这样它不再只是“选中对象坐标显示框”。

#### Step 5：HUD 强化优势方表达

建议：

- 将当前优势方更明显高亮
- 把重要数字与次要数字分层
- 可加入阵营条或更明显的色带感

如果不想引入进度条，可先做：

- 优势方统计加亮
- 劣势方弱化
- 中央区域显示当前战局状态

### 测试与验证

- 手动验证：
  - 构建面板布局
  - tooltip 不溢出
  - info panel 在选中/取消选中时显示正常
  - HUD 在不同战况下无错位

- 建议新增纯函数测试：
  - `tests/campRoleData.test.ts`
  - `tests/campTooltipData.test.ts` 扩展

### 完成标准

- 玩家可以从 UI 理解军营身份
- tooltip 不再只是参数表
- HUD 能更快表达战局

### 建议提交

- `feat(ui): add role-driven camp descriptions across panels and tooltip`

---

## 阶段 3：强化军营、士兵与武器辨识度

### 目标

在中高密度战斗下，玩家仍能快速看出各类单位和军营的作用。

### 涉及文件

- 修改：`src/game/campRenderer.ts`
- 修改：`src/game/unitRenderer.ts`
- 可能修改：`src/config/colors.ts`

### 当前问题

#### 军营

当前军营外形已经有差异，但还缺：

- 低血量阶段感
- 摧毁后身份残留
- 受击时更明显的局部反馈

#### 单位

当前单位主要靠武器差异区分，但在远景和混战中仍容易糊成一团。

### 实施方案

#### Step 1：军营增加受损阶段表现

建议在 `campRenderer.ts` 基础上扩展营地状态表现，但不改变当前整体结构。

推荐做法：

- 仍然保留现有基础造型
- 在 `BattleScene.syncCampViews()` 中根据血量阶段切换额外装饰

可选的轻量方案：

- `ratio <= 0.66`：显示轻裂纹 / 轻暗化
- `ratio <= 0.33`：显示更强裂纹 / 轻烟点 / 结构偏斜视觉

#### Step 2：营地摧毁 overlay 改为“军营身份残骸”

当前 `drawRuinedOverlay()` 比较统一。

建议：

- 继续保留统一的灰化和破坏感
- 但在各营地绘制时埋少量身份物件
- 摧毁时叠加对应残骸层

这一步不要一口气做太复杂，优先做 2-3 类最明显的军营：

- 弓兵营
- 爆破营
- 火炮营

#### Step 3：单位轮廓再夸张一级

在 `unitRenderer.ts` 的 `drawWeapon()` 和人体姿态中加强：

- 盾兵更宽
- 弓兵更弯弓
- 投矛兵矛更长更高举
- 爆破兵明显抱持爆弹
- 医疗兵更突出十字和箱包
- 火炮兵更突出炮弹 / 重武器感

关键要求：

- 区别要通过大轮廓完成
- 不依赖近距离小细节

#### Step 4：远景识别辅助

这是本阶段可选项，不一定首轮必须做。

建议方式：

- 在 zoom 较远时给单位增加极轻量背旗或头顶识别块
- 只给特殊兵种加，不给全部加

原因：

- 避免画面过吵
- 重点突出特殊威胁和关键后排

### 测试与验证

- 手动验证为主：
  - 近景看武器区分是否更明显
  - 中景是否还看得出投矛 / 爆破 / 火炮 / 医疗
  - 低血军营是否更容易被识别

### 完成标准

- 军营和单位在高密度战斗下辨识度明显提升
- 关键兵种不必依赖 tooltip 才能分辨

### 建议提交

- `feat(visual): strengthen camp damage states and unit silhouettes`

---

## 阶段 4：强化投射物身份与攻击节奏

### 目标

让玩家仅通过动作和飞行物就能判断攻击类型和威胁级别。

### 涉及文件

- 修改：`src/game/unitRenderer.ts`
- 修改：`src/game/projectileRenderer.ts`

### 当前问题

投射物已经有基础弧线和影子，但：

- 身份还不够强
- 飞行中的尾迹和重量感有限
- 部分攻击动作仍然偏“身体动一下”

### 实施方案

#### Step 1：强化近战与远程出手节奏

调整 `unitRenderer.ts` 中的攻击 tween：

- 剑兵：缩短收势，增强利落感
- 盾兵：更明显前压和撞击重量
- 投矛：拉长蓄力，突出重投
- 爆破：更明显抛投抬臂动作
- 火炮：更重的后坐和回弹
- 医疗：更柔和、更非攻击性的抛投节奏

要求：

- 不引入复杂时间轴系统
- 继续使用当前 tween 模式

#### Step 2：为投射物加身份尾迹

在 `projectileRenderer.ts` 中逐类增强：

- `arrow`：轻风痕 / 更锐利方向感
- `javelin`：更明显翻转与长尾动势
- `bomb`：短火星尾迹
- `heal`：柔和脉冲或微光环
- `artillery`：烟尾和火焰残光

注意：

- 尾迹不要做成持久对象池级复杂系统
- 可优先通过短暂附属 graphics 模拟

#### Step 3：避免与整体风格冲突

投射物增强必须保持“玩具战场”气质：

- 弓箭像木箭
- 投矛像软矛 / 训练矛
- 炸弹像玩具爆弹
- 火炮像积木炮弹

而不是写实军武风格。

### 测试与验证

- 手动验证：
  - 五类主要投射物是否容易分辨
  - 不同兵种攻击动作是否一眼能区分

### 完成标准

- 玩家看飞行物就能大致判断攻击来源
- 攻击节奏更有层次和身份感

### 建议提交

- `feat(combat-visual): improve attack timing and projectile identity`

---

## 阶段 5：重构命中、受击、爆炸、摧毁特效层级

### 目标

让战斗反馈从“什么都有一点”变成“重要事件很明确”。

### 涉及文件

- 修改：`src/game/effects/EffectManager.ts`
- 修改：`src/game/BattleScene.ts`
- 可选修改：`src/game/effects/types.ts`

### 当前问题

当前特效很多，但层级不够清楚：

- 普通命中与重命中都比较热闹
- 爆破与火炮的爆炸虽然已经不同，但还不够拉开
- 普通小 hit 在高密度场景容易和关键事件抢视线

### 实施方案

#### Step 1：先定义三层特效

在实现上先人为分三组，不一定非要新增 enum，但需要统一调度观念。

第一层，轻反馈：

- meleeHit
- arrowHit
- 普通受击闪白

第二层，中反馈：

- shieldBlock
- healHit
- javelinHit

第三层，重反馈：

- bombExplosion
- artilleryExplosion
- campDestroyed

#### Step 2：压轻反馈，保中重反馈

对第一层特效的处理原则：

- 更短
- 更少遮挡
- 更弱粒子量

当前 `spawnMeleeStars()`、`spawnArrowHit()` 可以缩短生命周期、减少存在感。

#### Step 3：拉开 bomb 和 artillery 的差异

这是本阶段最重要的工作。

建议明确：

- `bombExplosion`：快、散、碎、偏圆形
- `artilleryExplosion`：重、钝、冲击波、焦痕、震屏更强

实现层建议：

- `bombExplosion` 保持火星与散裂，但缩短留场
- `artilleryExplosion` 加强地面冲击和余波感
- `BattleScene` 中可对火炮爆炸附加更重的轻微镜头反馈

#### Step 4：营地摧毁作为高优先级事件处理

营地摧毁不应与普通爆炸共享同一层级处理思路。

建议：

- 摧毁特效尽量保留
- 即使预算吃紧，也优先于普通命中特效

#### Step 5：清理与整体视觉不一致的 text/emoji 倾向

当前大量使用 `text('✦')`、`text('★')`、`text('+')`。

建议逐步替换为 graphics 方案：

- 小火花
- 小十字图形
- 纸屑 / 碎块
- 简化几何图案

本阶段不要求一口气全替换，但至少要开始统一。

### 测试与验证

- 手动验证：
  - 轻中重三档反馈能否明显感觉不同
  - 爆破和火炮是否一眼区分
  - 营地摧毁是否足够醒目

### 完成标准

- 重要事件明显比普通命中更突出
- 爆破与火炮反馈不再同质
- 特效整体更统一，不再像不同来源拼接

### 建议提交

- `refactor(effects): tier hit and explosion feedback by combat weight`

---

## 阶段 6：补充缩放 LOD 与预算优先级策略

### 目标

让画面在远景和高密度下仍然保留重点，不因所有信息同时出现而变乱。

### 涉及文件

- 修改：`src/game/BattleScene.ts`
- 修改：`src/game/unitRenderer.ts`
- 修改：`src/game/campRenderer.ts`
- 修改：`src/game/effects/EffectManager.ts`

### 当前问题

项目已经有特效预算 `EffectBudget(50)`，但预算仍偏全局统一，没有体现“重要效果优先保留”的策略。

同时，UI 和单位渲染在缩放层级上的处理仍可进一步细化。

### 实施方案

#### Step 1：建立缩放级别分层

建议在 `BattleScene` 中定义简单缩放区间：

- 近景：`zoom >= 1.2`
- 中景：`0.7 <= zoom < 1.2`
- 远景：`zoom < 0.7`

根据区间影响：

- 是否显示普通单位血条
- 是否播放轻量 hit 特效
- 是否启用细节武器动作

#### Step 2：轻反馈特效按缩放降级

在中远景下：

- 轻命中特效减少触发
- 普通受击闪白可以抽样
- 中重特效照常保留

#### Step 3：预算优先级分层

建议将预算逻辑从“统一 50 个”改成“软优先级”。

实现可采用最小改法：

- `tryAdd(priority: 'low' | 'mid' | 'high')`
- 低优先级在预算紧张时更早放弃
- 高优先级尽量保留

优先级建议：

- `campDestroyed` / `artilleryExplosion` / 胜负相关：high
- `shieldBlock` / `healHit` / `javelinHit`：mid
- `meleeHit` / `arrowHit`：low

#### Step 4：HUD 与远景信息策略配合

当画面拉远时，HUD 更应该承担“解释战局”的任务。

因此本阶段验证应关注：

- 远景时战局是否仍看得懂
- 即使小单位动作弱化，玩家是否还能通过 HUD 和大特效判断局势

### 测试与验证

- 手动验证：
  - 近景、中景、远景下单位和特效是否有明显差异
  - 大混战时画面是否更稳

- 如需补测试，可新增纯逻辑测试：
  - `tests/effectBudget.test.ts`
  - `tests/zoomLodPolicy.test.ts`

### 完成标准

- 画面拉远时不会“全都在闪”
- 高价值特效始终更稳定出现
- 远景更偏结构阅读，近景更偏动作阅读

### 建议提交

- `feat(lod): add zoom-based visual reduction and prioritized effect budget`

---

## 推荐验证顺序

每个阶段建议都执行以下验证中的适用部分：

```bash
npm test
npm run build
```

此外本轮大量内容偏视觉，必须补手动验证。建议固定检查这几类场景：

1. 低单位密度近景对战
2. 多军营中密度混战
3. 高密度爆炸与火炮共存
4. 远景缩放观察整体推进
5. 移动端粗指针布局

## 建议提交策略

建议最少拆成以下 6 个 commit：

1. `refactor(ui): establish shared visual tokens and panel language`
2. `feat(ui): add role-driven camp descriptions across panels and tooltip`
3. `feat(visual): strengthen camp damage states and unit silhouettes`
4. `feat(combat-visual): improve attack timing and projectile identity`
5. `refactor(effects): tier hit and explosion feedback by combat weight`
6. `feat(lod): add zoom-based visual reduction and prioritized effect budget`

## 完成标准

当以下条件同时满足时，可认为本轮 PRD 已完成工程落地：

1. UI 风格统一，面板层级明确
2. 玩家能从 UI 与战场直接理解主要军营和兵种职责
3. 单位、武器、投射物的辨识度明显提升
4. 爆破与火炮特效层级明显分离
5. 营地受损与摧毁反馈更明确
6. 在中远景和高密度战斗下，画面仍保有重点

## 后续可选扩展

如果本轮落地稳定，下一轮才建议考虑：

- 用正式 sprite 替换部分 Graphics
- 为关键兵种增加短暂拖尾或对象池级尾迹系统
- 将战局优势通过更完整的趋势条表达
- 补充音效与视觉同步设计

这些都不应与本轮一起推进。
