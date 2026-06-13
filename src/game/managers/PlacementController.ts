import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import { canPlaceCamp } from '../placement';
import { CAMP_DEFS, CAMP_MIN_DISTANCE } from '../../config/camps';
import { PREVIEW_OK_COLOR, PREVIEW_BAD_COLOR } from '../../config/colors';
import type { Camp, CampKind, Faction } from '../types';
import type { UiBridge } from '../../ui/UiBridge';

export class PlacementController {
  private preview: Phaser.GameObjects.Arc;
  private faction: Faction = 'red';
  private kind: CampKind | null = null;
  private dragStart: Phaser.Math.Vector2 | null = null;

  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    this.preview = scene.add.circle(0, 0, 32, PREVIEW_OK_COLOR, 0.4)
      .setStrokeStyle(2, PREVIEW_OK_COLOR)
      .setVisible(false);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));

    bridge.on('placementChanged', () => this.refreshFromBridge());
    this.refreshFromBridge();
  }

  private refreshFromBridge(): void {
    const sel = this.bridge.getSelection();
    this.faction = sel.faction;
    this.kind = sel.kind;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!p.leftButtonDown() || this.kind === null) return;
    this.dragStart = new Phaser.Math.Vector2(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.kind === null) {
      this.preview.setVisible(false);
      return;
    }
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const gs = this.scene.exposeGameState();
    const ok = canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE);
    this.preview.setPosition(wp.x, wp.y);
    this.preview.setFillStyle(ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR, 0.4);
    this.preview.setStrokeStyle(2, ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR);
    this.preview.setVisible(true);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const start = this.dragStart;
    this.dragStart = null;
    if (!start || this.kind === null) return;

    const moved = Phaser.Math.Distance.Between(start.x, start.y, p.x, p.y);
    if (moved > 6) return;

    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const gs = this.scene.exposeGameState();
    if (!canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE)) return;

    const def = CAMP_DEFS[this.kind];
    const camp: Camp = {
      id: crypto.randomUUID(),
      faction: this.faction,
      kind: this.kind,
      x: wp.x,
      y: wp.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnTimer: 0,
      upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0,
      destroyed: false,
    };
    gs.addCamp(camp);
    this.scene.refreshViews();
    this.preview.setVisible(false);
  }
}
