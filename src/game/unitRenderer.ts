import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit } from './types';

const KIND_CHAR: Record<string, string> = {
  sword: 'S', shield: 'Sh', archer: 'A', javelin: 'J',
};

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[unit.faction];
  const shadow = scene.add.ellipse(0, 7, 20, 10, 0x000000, 0.2).setOrigin(0.5);
  const body = scene.add.circle(0, 0, 10, color).setOrigin(0.5);
  body.setStrokeStyle(1, 0x000000, 0.3);
  const label = scene.add.text(0, 0, KIND_CHAR[unit.kind] ?? '?', {
    fontSize: '9px', color: '#ffffff',
  }).setOrigin(0.5);
  const hpBg = scene.add.rectangle(0, -16, 20, 3, 0x000000, 0.6).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpColor = ratio > 0.5 ? 0x43a047 : ratio > 0.25 ? 0xfdd835 : 0xe53935;
  const hpFill = scene.add.rectangle(-10, -16, 20 * ratio, 3, hpColor).setOrigin(0, 0.5);

  return scene.add.container(unit.x, unit.y, [shadow, body, label, hpBg, hpFill]);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);
  const hpFill = view.getAt(4) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(20 * ratio, 3);
    const c = ratio > 0.5 ? 0x43a047 : ratio > 0.25 ? 0xfdd835 : 0xe53935;
    hpFill.setFillStyle(c);
  }
}
