import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

const KIND_ACCENT: Record<CampKind, number> = {
  sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65, bomb: 0xc62828,
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
  }

  // 血条（头顶，与单位血条同风格）
  const hpBg = scene.add.rectangle(0, -62, 50, 4.5, 0x000000, 0.55).setOrigin(0.5);
  const ratio = Math.max(0, camp.hp / camp.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-25, -62, 50 * ratio, 3.5, hpC).setOrigin(0, 0.5);

  const root = scene.add.container(camp.x, camp.y, [g, hpBg, hpFill]);
  root.setData('hpFill', hpFill);
  root.setData('ruined', false);
  return root;
}

/**
 * 兵营摧毁蒙层：半透明灰覆盖 + 3 道黑色裂纹。
 * 直接画在营地 graphics 上（child[0]），不影响血条子对象。
 */
export function drawRuinedOverlay(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x555555, 0.55);
  g.fillRect(-42, -70, 84, 120);
  g.lineStyle(2.5, 0x111111, 0.8);
  g.lineBetween(-20, -5, -10, 15);
  g.lineBetween(5, -20, 18, 8);
  g.lineBetween(-12, 8, 8, -10);
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

/** 弓营：高瘦尖塔（44x62） + 三角顶 + 窄箭口 + 顶部箭羽饰 */
function drawArcherCamp(g: Phaser.GameObjects.Graphics, color: number, accent: number): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 44, 64, 22);

  // 主体（高瘦）
  g.fillStyle(color, 1);
  g.fillRoundedRect(-22, -30, 44, 62, 3);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-22, -30, 44, 62, 3);

  // 三角尖顶
  g.fillStyle(color, 1);
  g.fillTriangle(-22, -30, 22, -30, 0, -58);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeTriangle(-22, -30, 22, -30, 0, -58);

  // 装饰条
  g.fillStyle(accent, 0.8);
  g.fillRect(-20, 8, 40, 5);

  // 窄箭口
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(-3, -20, 6, 14, 1);

  // 门洞（窄）
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-7, 6, 14, 26, 2);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-7, 6, 14, 26, 2);

  // 顶部箭羽饰
  g.lineStyle(2, 0x5d4037, 1);
  g.lineBetween(0, -72, 0, -58);
  g.fillStyle(accent, 1);
  g.fillTriangle(0, -74, -5, -68, 5, -68);
  g.lineStyle(1, 0xffffff, 1);
  g.lineBetween(-3, -70, 3, -70);
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
