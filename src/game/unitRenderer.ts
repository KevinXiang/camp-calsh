import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit, UnitKind, Faction } from './types';

const SKIN = 0xffcc80;
const BODY_W = 2.5;

function drawStickFigure(g: Phaser.GameObjects.Graphics, faction: Faction, kind: UnitKind): void {
  const color = FACTION_COLORS[faction];

  // 落影
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(0, 16, 22, 7);

  // 腿
  g.lineStyle(BODY_W, color, 1);
  g.lineBetween(0, 3, -6, 14);
  g.lineBetween(0, 3, 6, 14);

  // 身体
  g.lineStyle(BODY_W + 0.5, color, 1);
  g.lineBetween(0, -8, 0, 3);

  // 头（肤色圆）
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -15, 7);
  g.lineStyle(1.2, 0x000000, 0.2);
  g.strokeCircle(0, -15, 7);

  // 眼睛
  g.fillStyle(0x000000, 0.7);
  g.fillCircle(-2.5, -15, 1.2);
  g.fillCircle(2.5, -15, 1.2);

  // 嘴（微笑弧线）
  g.lineStyle(1, 0x000000, 0.4);
  g.beginPath();
  g.arc(0, -12, 3, 0.2, Math.PI - 0.2);
  g.strokePath();

  // 武器/姿态
  switch (kind) {
    case 'sword': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -9, 1); // 左臂
      g.lineBetween(0, -5, 10, -2); // 右臂
      // 玩具剑
      g.lineStyle(3, 0xffd54f, 1);
      g.lineBetween(10, -2, 17, -10);
      g.lineStyle(1.5, 0xfff176, 0.7);
      g.lineBetween(11, -2, 7, 3); // 护手
      break;
    }
    case 'shield': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 9, 2); // 右臂
      g.lineBetween(0, -5, -9, 1); // 左臂
      // 圆盾
      g.fillStyle(0xb0bec5, 0.85);
      g.fillCircle(-11, 2, 7);
      g.lineStyle(2, 0x78909c, 0.8);
      g.strokeCircle(-11, 2, 7);
      g.fillStyle(0xcfd8dc, 0.7);
      g.fillCircle(-11, 2, 3.5); // 盾心
      break;
    }
    case 'archer': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -3, 0); // 左臂（握弓）
      g.lineBetween(0, -5, -3, 6); // 右臂（拉弦）
      // 弓
      g.lineStyle(2.5, 0x66bb6a, 1);
      const bx = -8, by = -4;
      g.beginPath();
      g.moveTo(bx, by);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const px = bx + Math.sin(t * Math.PI) * 5;
        const py = by + t * 16;
        g.lineTo(px, py);
      }
      g.strokePath();
      // 玩具箭
      g.lineStyle(2.5, 0xffd54f, 1);
      g.lineBetween(-8, 6, 9, 6);
      g.fillStyle(0xff7043, 1);
      g.fillTriangle(9, 6, 5, 3, 5, 9); // 箭头（软头）
      break;
    }
    case 'javelin': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -8, 4); // 左臂
      g.lineBetween(0, -5, 6, -10); // 右臂上扬
      // 投矛
      g.lineStyle(2.8, 0xff8a65, 1);
      g.lineBetween(6, -10, 16, -20);
      g.fillStyle(0xffab91, 1);
      g.fillCircle(16, -20, 3); // 软头
      break;
    }
  }
}

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  drawStickFigure(g, unit.faction, unit.kind);

  // 头顶血条
  const hpBg = scene.add.rectangle(0, -26, 22, 3.5, 0x000000, 0.5).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-11, -26, 22 * ratio, 3, hpC).setOrigin(0, 0.5);

  return scene.add.container(unit.x, unit.y, [g, hpBg, hpFill]);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);
  // 血条更新（child[1]=bg, child[2]=fill）
  const hpFill = view.getAt(2) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(22 * ratio, 3);
    const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    hpFill.setFillStyle(c);
  }
  // 死亡淡出
  if (!unit.alive) {
    view.setAlpha(Math.max(0.15, unit.deathTimer / 0.3));
  }
}
