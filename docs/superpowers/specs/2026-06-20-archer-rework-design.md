# 重做弓兵营与弓兵（视觉与特效）设计

**日期**：2026-06-20
**状态**：已批准，待实现

## 1. 背景与目标

当前弓兵相关的视觉表现是全兵种中最简陋的：
- **弓兵营**：高瘦尖塔 + 三角顶 + 单根箭羽饰，与其他军营区分度低。
- **弓兵单位**：弓身曲线 + 水平弦 + 一支三角箭头，画得简陋；攻击动画只有 body 后缩 3px，毫无"拉弓射箭"的张力。
- **弓箭弹道**：一根色块拖尾 + 圆点，**无抛物线、无影子**。
- **弓箭命中**：走 `meleeHit` 事件（爆星），**无独立的扎箭特效**，且与近战/其他命中混用。

对比投矛/炸弹/炮弹都有完整的抛物线 + 影子 + 独立命中爆裂特效，弓兵明显单薄。

**目标**：重做弓兵营外观、弓兵单位造型与攻击动画、弓箭弹道与命中特效，使弓兵成为视觉完整、辨识度高的远程兵种。

## 2. 范围

- **包含**：
  - 弓兵营绘制函数 `drawArcherCamp` 重写（木制箭塔造型）
  - 弓兵武器绘制 `drawWeapon` 的 archer 分支重写（大反曲弓 + 蓄势姿态）
  - 弓兵攻击动画 `playBowAnim` 重写（3 帧拉弓动画 + 出手爆闪）
  - 弓箭弹道 `drawArrow`/`updateArrow` 重写（低弧抛物线 + 箭羽 + 影子 + 光点残影）
  - 新增 `arrowHit` 命中事件与 `spawnArrowHit` 特效（扎入箭头 + 4✦溅射）
- **不包含**：弓兵的战斗数值（HP/攻击/射程等 `config` 不变）、AI 行为、其他兵种。

## 3. 视觉决策（已通过视觉伙伴确认）

| 部分 | 选定方案 | 关键特征 |
|------|---------|---------|
| 弓兵营 | **A — 木制箭塔** | 石基座 + 双层木平台（弓手站位感）+ 张开的大弓标志 |
| 弓兵单位 | **A — 大反曲弓** | 反曲线弓身 + 弓把 + 拉弦到脸蓄势 + 3 帧动画 |
| 弓箭弹道+命中 | **A — 低弧抛物线 + 扎入溅射** | 低弧（比投矛低）+ 箭羽拖尾 + 影子；命中扎入箭头 + 4✦溅射 |

## 4. 详细设计

### 4.1 弓兵营（`campRenderer.ts` 的 `drawArcherCamp` 重写）

替换现有"高瘦尖塔 + 三角顶"为"木制箭塔"。沿用现有的落影 + 阵营色 + accent 调色约定。

- **落影**：地面椭圆（沿用现有 `fillEllipse`）
- **石基座**：阵营色圆角矩形（宽 52、高 32），承接底部稳重感
- **下层木平台**：`#8d6e63` 棕色矩形（宽 60、高 16），3 道竖向木纹线（`#5d4037`）
- **上层木平台**：`#8d6e63`（宽 52、高 16），2 道木纹，两侧各 1 根 `#5d4037` 支柱连到下层
- **门洞**：基座中央暗色圆角矩形
- **顶部大弓标志**（accent 橙黄色）：张开的反曲线弓身 + 横弦 + 搭箭，作为营徽（位于塔顶上方）

### 4.2 弓兵单位武器（`unitRenderer.ts` 的 `drawWeapon` archer 分支重写）

替换"小弓 + 水平弦 + 三角箭头"为"大反曲弓 + 蓄势姿态"。火柴人身体（腿/身/头/眼/嘴）不变，仅重画武器部分。

- **左手前伸持弓**：阵营色手臂线从躯干延伸到左前方
- **右手拉弦到脸**：阵营色手臂线从躯干延伸到右脸位置（形成拉弓姿态）
- **反曲弓身**：`#8d6e63` 棕色，带反曲线的弧形（上下端各一个反向小弯，体现"反曲"），中间 `#5d4037` 短弓把
- **弦**：`#fff176` 浅黄，两条线从弓两端汇聚到右脸拉弦点（呈 V 形）
- **蓄势搭箭**：`#ffd54f` 黄色箭杆沿弦方向搭好，前端带小三角箭头

### 4.3 攻击动画（`unitRenderer.ts` 的 `playBowAnim` 重写）

从"body 后缩 3px"升级为 3 段拉弓动画。复用现有 tween 三段式模式（参考 `playJavelinAnim`），`body` 容器承担变换，与走路动画互不冲突（`attacking` 状态下走路动画不触碰 body，已有约定）。

| 帧 | 时长 | body 变换 | 附带 |
|----|------|----------|------|
| 1 蓄势 | 150ms | `rotation: 0.25, y: -2`（后仰 + 轻微下压） | — |
| 2 出手 | 150ms（delay 150） | `rotation: -0.15, y: 0`（快速前甩） | **出手爆闪**：在 body 上叠一层黄色圆形 graphics，150ms 淡出（参考 `triggerHitFlash` 的叠层 graphics 写法） |
| 3 回正 | 150ms（delay 300） | `rotation: 0, y: 0`（归零） | — |

出手爆闪作为动画的一部分（叠层 graphics 在 `playBowAnim` 内创建并 tween 销毁），不作为独立 CombatEvent，避免占用 EffectBudget。

### 4.4 弓箭弹道（`projectileRenderer.ts` 的 `drawArrow`/`updateArrow` 重写）

从"直线拖尾+圆点"升级为"低弧抛物线"。复用 `updateJavelin` 的抛物线算法（traveled/EXPECTED_DIST → 视觉高度），降低峰值以保持弓箭的直线感。

- **新增常量**：
  - `ARROW_MAX_H = 20`（投矛 `JAVELIN_MAX_H=40` 的一半，弧度更低）
  - `ARROW_EXPECTED_DIST = 180`（同步 `config/units.ts` 的 `archer.attackRange=180`）
- **箭体 sprite**（子 graphics，承担高度偏移 + 旋转）：
  - 木杆：`#8d6e63` 棕色线段
  - 箭头：`#ff7043` 橙色三角
  - 箭羽：尾部两片 `#fff176` 浅黄三角
- **地面影子**：贴地椭圆（container 内 y=0），按高度缩放淡化（复用 javelin 的 `1 - 0.6*heightRatio` / `0.4 - 0.25*heightRatio`）
- **光点残影**：飞行轨迹上叠加淡黄光点拖尾（由弹道视图自行维护，**不计入 EffectBudget**，参考现有注释"弹道残影不计入预算"）
- **朝向**：沿运动方向旋转（保留现有 `updateArrow` 用 prevX/prevY 算 `atan2` 的逻辑）
- **container 结构**：与 javelin 一致 `[shadow, shaft]`，data 存 `startX/startY/shadow/shaft/prevX/prevY`

### 4.5 命中特效（新增 `arrowHit` 事件 + `spawnArrowHit`）

**关键现状**：当前弓箭命中走 `meleeHit` 分支（`CombatSystem.applyDamage` 第 30-35 行：仅 javelin 区分，arrow fallback 到 `meleeHit`）。设计将其独立出来。

- **`CombatEvent` 类型**（`effects/types.ts`）：新增
  ```
  | { kind: 'arrowHit'; x: number; y: number; faction: Faction }
  ```
- **`CombatSystem.applyDamage`**：在 `opts.weaponKind === 'arrow'` 时推 `arrowHit` 事件（取代当前 fallback 到 `meleeHit`）。注意维持优先级：盾兵仍走 `shieldBlock`，炸弹仍走 `bombHit`，仅普通单位被弓箭命中时走新分支。
- **`EffectManager.spawnArrowHit(x, y)`**（新增，dispatch 加 `arrowHit` case）：
  - **扎入箭头**：一根带箭羽的小箭（`#8d6e63` 杆 + `#fff176` 羽），旋转扎入姿态（约 15°），150ms 内淡出
  - **4 颗 ✦ 溅射**：黄星向四周弹散（复用 `spawnMeleeStars` 的 text+✦ 风格，0.6s）
  - 生命 0.7s，计入 EffectBudget（tryAdd/release）
- **BattleScene 受击闪白**：`update` 中命中事件分发循环（`src/game/BattleScene.ts:120` 附近）需把 `arrowHit` 加入触发 `triggerHitFlash` 的 kind 列表（与 `meleeHit`/`javelinHit` 等并列）。

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/game/campRenderer.ts` | 修改 | 重写 `drawArcherCamp`（木制箭塔） |
| `src/game/unitRenderer.ts` | 修改 | 重写 `drawWeapon` archer 分支 + `playBowAnim`（3 帧动画 + 出手爆闪叠层） |
| `src/game/projectileRenderer.ts` | 修改 | 重写 `drawArrow`/`updateArrow`（低弧抛物线 + 箭羽 + 影子 + 光点残影） |
| `src/game/effects/types.ts` | 修改 | `CombatEvent` 新增 `arrowHit` |
| `src/game/managers/CombatSystem.ts` | 修改 | `applyDamage` 在 `weaponKind==='arrow'` 时推 `arrowHit`（取代 fallback meleeHit） |
| `src/game/effects/EffectManager.ts` | 修改 | 新增 `spawnArrowHit` + dispatch 分发 `arrowHit` |
| `src/game/BattleScene.ts` | 修改 | 受击闪白事件列表加入 `arrowHit` |

## 6. 测试策略

项目测试环境为 `environment: 'node'`，渲染/特效依赖 Phaser 显示对象，无法单测。**按现有惯例（与投矛/炸弹/炮弹特效一致）以手动验证为主。**

需检查的既有测试：
- `tests/CombatSystem.test.ts`、`tests/CombatSystem.events.test.ts`：若有断言弓箭命中事件为 `meleeHit`，需同步改为 `arrowHit`。实现时先运行全量测试，根据失败断言更新。

**手动验证场景**（`npm run dev`）：
1. 弓兵营外观为木制箭塔（双层木平台 + 大弓标志），红蓝阵营色正确。
2. 弓兵单位持大反曲弓，呈拉弦蓄势姿态。
3. 弓兵攻击时有明显拉弓-松弦-回正动画 + 出手黄色爆闪。
4. 弓箭飞行呈低弧抛物线，带箭羽拖尾与地面影子，比投矛弧度低。
5. 弓箭命中目标：箭头扎入 + 4 颗✦溅射；受击单位有闪白。
6. 盾兵被弓箭命中仍走盾击火花（shieldBlock），不受新逻辑影响。
7. 多个弓兵攻击时特效不卡顿（EffectBudget 上限 50）。

## 7. 依赖与风险

- **无新依赖**：全部复用 Phaser graphics/container/tween + 现有特效框架。
- **风险 1**：`arrowHit` 替换 `meleeHit` fallback 可能影响既有测试断言 → 通过先跑全量测试定位。
- **风险 2**：弓兵聚集时反曲弓 + 动画可能显得拥挤 → 木制箭塔/反曲弓体积均经过视觉伙伴按火柴人比例评估，预计可接受；手动验证时关注。
- **风险 3**：出手爆闪叠层若与受击闪白叠加可能过亮 → 爆闪 alpha 设较低（约 0.6），手动验证时观察。
