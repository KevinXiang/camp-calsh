import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

const KIND_LABEL: Record<CampKind, string> = {
  sword: 'S', shield: 'Sh', archer: 'A', javelin: 'J',
};

/** 绘制一个军营显示对象（积木块 + 旗帜 + 落影），返回容器。视觉规范见 spec 7.4 */
export function drawCamp(scene: Phaser.Scene, camp: Camp): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[camp.faction];
  const shadow = scene.add.ellipse(0, 38, 72, 20, 0x000000, 0.25).setOrigin(0.5);
  const body = scene.add.rectangle(0, 0, 60, 60, color).setOrigin(0.5);
  body.setStrokeStyle(2, 0x000000, 0.4);
  const flag = scene.add.triangle(0, -42, -8, 8, 8, 8, -8, -8, color).setOrigin(0.5);
  const pole = scene.add.rectangle(0, -42, 2, 16, 0x5d4037).setOrigin(0.5);
  const label = scene.add.text(0, 0, KIND_LABEL[camp.kind], {
    fontSize: '18px', color: '#ffffff',
  }).setOrigin(0.5);
  return scene.add.container(camp.x, camp.y, [shadow, body, flag, pole, label]);
}
