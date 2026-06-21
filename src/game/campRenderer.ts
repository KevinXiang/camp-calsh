import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

const KIND_ACCENT: Record<CampKind, number> = {
  sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65, bomb: 0xc62828, medic: 0xffffff, artillery: 0x8d6e63,
};

export function drawCamp(scene: Phaser.Scene, camp: Camp): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[camp.faction];
  const accent = KIND_ACCENT[camp.kind];
  const g = scene.add.graphics();

  switch (camp.kind) {
    case 'sword':   drawSwordCamp(g, color, accent);   break;
    case 'shield':  drawShieldCamp(g, color, accent);  break;
    case 'archer':  drawArcherCamp(g, color, accent);  break;
    case 'javelin': drawJavelinCamp(g, color, accent); break;
    case 'bomb':    drawBombCamp(g, color, accent);     break;
    case 'medic':      drawMedicCamp(g, color, accent);      break;
    case 'artillery':  drawArtilleryCamp(g, color, accent);  break;
  }

  // 血条（头顶，与单位血条同风格）
  const hpBg = scene.add.rectangle(0, -62, 50, 4.5, 0x000000, 0.55).setOrigin(0.5);
  const ratio = Math.max(0, camp.hp / camp.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-25, -62, 50 * ratio, 3.5, hpC).setOrigin(0, 0.5);

  const root = scene.add.container(camp.x, camp.y, [g, hpBg, hpFill]);
  root.setData('hpFill', hpFill);
  root.setData('ruined', false);
  root.setData('damageOverlay', null);   // 受损阶段叠加层（轻/重裂纹）
  root.setData('kind', camp.kind);
  return root;
}

/**
 * 受损阶段叠加：根据 hp ratio 在营地上覆盖轻/重裂纹。
 * - ratio <= 0.66：浅裂纹 + 轻暗化
 * - ratio <= 0.33：更深裂纹 + 轻烟点
 * 与 syncCampViews() 配合，每次血量跨越阶段时重建。
 */
export function drawDamageOverlay(view: Phaser.GameObjects.Container, kind: CampKind, ratio: number): void {
  const prev = view.getData('damageOverlay') as Phaser.GameObjects.Graphics | null;
  // 重建策略：进入新阶段（>0.66 / 0.33-0.66 / <0.33）才重绘
  const stage = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
  if (view.getData('damageStage') === stage) return;
  view.setData('damageStage', stage);

  if (prev) { prev.destroy(); }
  if (stage === 0) {
    view.setData('damageOverlay', null);
    return;
  }
  const overlay = view.scene.add.graphics();
  // 轻暗化：阶段 2 更深
  overlay.fillStyle(0x000000, stage === 2 ? 0.32 : 0.18);
  overlay.fillRect(-50, -80, 100, 140);

  // 裂纹：阶段 1 用 2 条浅裂纹，阶段 2 用 4 条深裂纹 + 烟点
  const crackColor = 0x3e2723;
  const crackAlpha = stage === 2 ? 0.85 : 0.55;
  const crackCount = stage === 2 ? 4 : 2;
  overlay.lineStyle(stage === 2 ? 2.2 : 1.5, crackColor, crackAlpha);
  // 伪随机但确定性（每个营地不同）：用 kind 字符长度作种子扰动
  const seed = kind.length * 7;
  for (let i = 0; i < crackCount; i++) {
    const ox = -30 + ((i * 17 + seed) % 50);
    const oy = -30 + ((i * 23 + seed) % 60);
    overlay.lineBetween(ox - 8, oy, ox + 8, oy + ((i * 13) % 12) - 6);
  }

  // 阶段 2：加 2 个轻烟点（灰色小圆）
  if (stage === 2) {
    overlay.fillStyle(0x616161, 0.55);
    overlay.fillCircle(-14, -34, 4);
    overlay.fillCircle(18, -28, 5);
    overlay.fillStyle(0x9e9e9e, 0.35);
    overlay.fillCircle(-14, -38, 6);
    overlay.fillCircle(18, -32, 7);
  }

  view.add(overlay);
  view.setData('damageOverlay', overlay);
}

/**
 * 兵营摧毁蒙层：在 container 上追加独立的覆层 graphics（child[N]）。
 * 黑色半透明覆盖 + 深红裂纹 + 按 kind 残留少量身份物件（弓/爆弹/炮弹）。
 */
export function drawRuinedOverlay(view: Phaser.GameObjects.Container): void {
  const kind = (view.getData('kind') as CampKind | null) ?? 'sword';
  const overlay = view.scene.add.graphics();
  // 黑色半透明蒙层（覆盖营地全部可见区域）
  overlay.fillStyle(0x000000, 0.65);
  overlay.fillRect(-50, -80, 100, 140);
  // 3 道深红裂纹
  overlay.lineStyle(3, 0x8b0000, 0.9);
  overlay.lineBetween(-22, -8, -10, 18);
  overlay.lineBetween(8, -22, 20, 10);
  overlay.lineBetween(-14, 10, 10, -14);

  // 身份残骸：弓兵营留断弓、爆破营留熄灭爆弹、火炮营留弯曲炮管
  overlay.lineStyle(2, 0x424242, 0.7);
  switch (kind) {
    case 'archer':
      // 断弓：残弧
      overlay.beginPath();
      overlay.moveTo(-16, -8);
      overlay.lineTo(-10, -4);
      overlay.lineTo(-18, 2);
      overlay.strokePath();
      overlay.lineStyle(1, 0xfff176, 0.4);
      overlay.lineBetween(-16, -8, -10, -4);
      break;
    case 'bomb':
      // 熄灭爆弹：黑灰圆
      overlay.fillStyle(0x2e2e2e, 0.85);
      overlay.fillCircle(12, 0, 8);
      overlay.lineStyle(1.5, 0x616161, 0.7);
      overlay.strokeCircle(12, 0, 8);
      break;
    case 'artillery':
      // 弯曲炮管：斜插的管子
      overlay.fillStyle(0x424242, 0.85);
      overlay.fillRect(-2, -18, 6, 22);
      overlay.lineStyle(1.5, 0x616161, 0.7);
      overlay.strokeRect(-2, -18, 6, 22);
      overlay.fillStyle(0x1a1a1a, 0.9);
      overlay.fillCircle(1, -18, 3);
      break;
    default:
      break;
  }
  view.add(overlay);
}

/** 剑营：宽方堡（76x44） + 4 城垛 + 顶部交叉双剑 */
function drawSwordCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 42, 92, 26);

  // 主体（宽）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-38, -14, 76, 44, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-38, -14, 76, 44, 4);

  // 4 城垛
  for (let i = 0; i < 4; i++) {
    const bx = -34 + i * 18;
    g.fillStyle(color, 1);
    g.fillRoundedRect(bx, -32, 12, 18, 2);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(bx, -32, 12, 18, 2);
  }

  // 装饰条
  g.fillStyle(accent, 0.7);
  g.fillRect(-36, 8, 72, 6);

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 2, 18, 28, 3);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 2, 18, 28, 3);

  // 交叉双剑顶饰（堡顶上方 -50）
  g.lineStyle(3, accent, 1);
  g.lineBetween(-12, -58, 12, -42);
  g.lineBetween(-12, -42, 12, -58);
  g.fillStyle(0xfff176, 1);
  g.fillCircle(0, -50, 3);
}

/** 盾营：矮胖弧顶（84x38, 圆角 14） + 4 圆弧城垛 + 正面圆盾徽 */
function drawShieldCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 100, 28);

  // 主体（矮胖大圆角）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-42, -6, 84, 38, 14);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-42, -6, 84, 38, 14);

  // 4 圆弧城垛（三角近似拱形）
  for (let i = 0; i < 4; i++) {
    const cx = -30 + i * 20;
    g.fillStyle(color, 1);
    g.fillTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
  }

  // 装饰条
  g.fillStyle(accent, 0.7);
  g.fillRect(-40, 10, 80, 6);

  // 门洞（拱形）
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 4, 18, 28, 9);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 4, 18, 28, 9);

  // 圆盾徽（正面顶端）
  g.fillStyle(0xb0bec5, 1);
  g.fillCircle(0, -32, 10);
  g.lineStyle(2, 0x78909c, 0.8);
  g.strokeCircle(0, -32, 10);
  g.fillStyle(0xcfd8dc, 0.9);
  g.fillCircle(0, -32, 4);
}

/** 弓营：木制箭塔（石基座 + 双层木平台 + 张开的大弓标志） */
function drawArcherCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 80, 24);

  // 石基座（阵营色，承接底部稳重感）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-26, 6, 52, 32, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-26, 6, 52, 32, 3);

  // 下层木平台：宽，3 道竖向木纹
  g.fillStyle(0x8d6e63, 1);
  g.fillRoundedRect(-30, -8, 60, 16, 2);
  g.lineStyle(2, 0x000000, 0.3);
  g.strokeRoundedRect(-30, -8, 60, 16, 2);
  g.lineStyle(1.5, 0x5d4037, 0.8);
  g.lineBetween(-20, -8, -20, 8);
  g.lineBetween(0, -8, 0, 8);
  g.lineBetween(20, -8, 20, 8);

  // 上层木平台：略窄，2 道木纹
  g.fillStyle(0x8d6e63, 1);
  g.fillRoundedRect(-26, -30, 52, 16, 2);
  g.lineStyle(2, 0x000000, 0.3);
  g.strokeRoundedRect(-26, -30, 52, 16, 2);
  g.lineStyle(1.5, 0x5d4037, 0.8);
  g.lineBetween(-15, -30, -15, -14);
  g.lineBetween(15, -30, 15, -14);

  // 两层间支柱
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(-22, -14, -22, -8);
  g.lineBetween(22, -14, 22, -8);

  // 门洞
  g.fillStyle(0x000000, 0.4);
  g.fillRoundedRect(-8, 14, 16, 24, 2);

  // 顶部大弓标志（accent 营徽）：反曲线弓身 + 横弦 + 搭箭
  // 弓身（反曲线）
  g.lineStyle(2.5, accent, 1);
  g.beginPath();
  g.moveTo(-14, -48);
  g.lineTo(-10, -56);
  g.lineTo(0, -57);
  g.lineTo(10, -56);
  g.lineTo(14, -48);
  g.strokePath();
  // 横弦
  g.lineStyle(1.2, 0xfff176, 1);
  g.lineBetween(-14, -48, 14, -48);
  // 搭箭
  g.lineStyle(2, accent, 1);
  g.lineBetween(0, -57, 0, -46);
  g.fillStyle(accent, 1);
  g.fillTriangle(0, -46, -2, -51, 2, -51);
}

/** 投矛营：斜顶塔（60x50 主体 + 梯形顶） + 斜纹装饰 + 三叉戟顶饰 */
function drawJavelinCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 80, 24);

  // 主体
  g.fillStyle(color, 1);
  g.fillRoundedRect(-30, -18, 60, 50, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-30, -18, 60, 50, 3);

  // 斜顶（梯形）
  const roof = [
    { x: -30, y: -18 },
    { x: 30, y: -18 },
    { x: 22, y: -38 },
    { x: -22, y: -38 },
  ];
  g.fillStyle(color, 1);
  g.fillPoints(roof, true);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokePoints(roof, true);

  // 4 道斜纹
  g.lineStyle(3, accent, 0.8);
  for (let i = 0; i < 4; i++) {
    const sx = -26 + i * 14;
    g.lineBetween(sx, 6, sx + 8, 14);
  }

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 4, 18, 28, 3);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 4, 18, 28, 3);

  // 三叉戟顶饰
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(0, -50, 0, -38);
  g.lineStyle(2.5, accent, 1);
  g.lineBetween(-7, -56, -7, -48);
  g.lineBetween(0, -59, 0, -48);
  g.lineBetween(7, -56, 7, -48);
  g.lineStyle(2, accent, 1);
  g.lineBetween(-9, -48, 9, -48);
}

/**
 * 爆破营：红色圆形基座 + 中央 TNT 木箱图标 + 引信火光
 */
function drawBombCamp(g: Phaser.GameObjects.Graphics, color: number, _accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 8, 60, 18);

  g.fillStyle(color, 0.9);
  g.fillCircle(0, 0, 24);
  g.lineStyle(3, 0x000000, 0.3);
  g.strokeCircle(0, 0, 24);

  g.fillStyle(0x8e0000, 1);
  g.fillRect(-10, -7, 20, 14);
  g.lineStyle(1.5, 0xffffff, 0.9);
  g.lineBetween(-10, -2, 10, -2);
  g.lineBetween(-10, 3, 10, 3);

  g.fillStyle(0xff7043, 1);
  g.fillCircle(0, -10, 2.5);
  g.fillStyle(0xffeb3b, 0.8);
  g.fillCircle(0, -11, 1.2);
}

/**
 * 医疗营：白色主体 + 阵营色十字 + 旗帜
 */
function drawMedicCamp(g: Phaser.GameObjects.Graphics, color: number, _accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 8, 60, 18);
  g.fillStyle(0xf5f5f5, 1);
  g.fillRoundedRect(-24, -12, 48, 36, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-24, -12, 48, 36, 4);
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-8, 2, 16, 22, 3);
  g.lineStyle(2, 0x4caf50, 0.6);
  g.strokeRoundedRect(-8, 2, 16, 22, 3);
  // 阵营色十字（区分红蓝）
  g.lineStyle(3, color, 1);
  g.lineBetween(0, -26, 0, -8);
  g.lineBetween(-8, -17, 8, -17);
  // 阵营色旗帜
  g.fillStyle(color, 0.9);
  g.fillRect(-20, -30, 4, 18);
  g.fillTriangle(-16, -30, -16, -22, -8, -26);
}

/**
 * 火炮营：深色基座 + 炮管 + 火焰装饰
 */
function drawArtilleryCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 42, 80, 24);

  // 主体（矮宽基座）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-36, -8, 72, 36, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-36, -8, 72, 36, 4);

  // 炮台（圆形底座）
  g.fillStyle(accent, 1);
  g.fillCircle(0, -16, 18);
  g.lineStyle(2, 0x000000, 0.3);
  g.strokeCircle(0, -16, 18);

  // 炮管（斜向上）
  g.fillStyle(0x424242, 1);
  g.fillRect(-4, -40, 8, 24);
  g.lineStyle(1.5, 0x000000, 0.3);
  g.strokeRect(-4, -40, 8, 24);

  // 炮口火焰装饰
  g.fillStyle(0xff6d00, 0.9);
  g.fillCircle(0, -42, 4);
  g.fillStyle(0xffab00, 0.7);
  g.fillCircle(0, -44, 2.5);

  // 装饰条
  g.fillStyle(accent, 0.6);
  g.fillRect(-34, 8, 68, 5);

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 2, 18, 24, 3);
  g.lineStyle(2, accent, 0.5);
  g.strokeRoundedRect(-9, 2, 18, 24, 3);
}
