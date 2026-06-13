import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

const KIND_ACCENT: Record<CampKind, number> = {
  sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65,
};

const KIND_CHAR: Record<CampKind, string> = {
  sword: 'S', shield: 'Sh', archer: 'A', javelin: 'J',
};

export function drawCamp(scene: Phaser.Scene, camp: Camp): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[camp.faction];
  const accent = KIND_ACCENT[camp.kind];
  const g = scene.add.graphics();

  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 42, 82, 26);

  // 城堡主体
  g.fillStyle(color, 1);
  g.fillRoundedRect(-30, -14, 60, 44, 4);
  g.lineStyle(2, 0x000000, 0.25);
  g.strokeRoundedRect(-30, -14, 60, 44, 4);

  // 城垛
  for (let i = 0; i < 4; i++) {
    const bx = -26 + i * 16;
    g.fillStyle(color, 1);
    g.fillRoundedRect(bx, -30, 10, 16, 2);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(bx, -30, 10, 16, 2);
  }

  // 装饰条
  g.fillStyle(accent, 0.7);
  g.fillRect(-28, 8, 56, 5);

  // 门洞
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-9, 2, 18, 28, 3);
  g.lineStyle(2, accent, 0.6);
  g.strokeRoundedRect(-9, 2, 18, 28, 3);

  // 旗杆
  g.lineStyle(2.5, 0x5d4037, 1);
  g.lineBetween(0, -30, 0, -54);
  // 三角旗
  g.fillStyle(color, 1);
  g.fillTriangle(0, -54, 20, -47, 0, -40);
  g.lineStyle(1.5, 0x000000, 0.2);
  g.strokeTriangle(0, -54, 20, -47, 0, -40);

  // 兵种标识小字
  const label = scene.add.text(3, -53, KIND_CHAR[camp.kind], {
    fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0, 0.5);

  return scene.add.container(camp.x, camp.y, [g, label]);
}
