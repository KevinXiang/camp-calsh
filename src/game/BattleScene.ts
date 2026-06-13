import Phaser from 'phaser';
import { GameState } from './GameState';
import { drawCamp } from './campRenderer';
import { drawUnit, updateUnitView } from './unitRenderer';
import { PlacementController } from './managers/PlacementController';
import { SelectionInput } from './managers/SelectionInput';
import { CampManager } from './managers/CampManager';
import { UnitManager } from './managers/UnitManager';
import { SELECTION_COLOR } from '../config/colors';
import type { UiBridge } from '../ui/UiBridge';

export class BattleScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.TileSprite;
  private isPanning = false;
  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.5;

  private gameState = new GameState();
  private campViews = new Map<string, Phaser.GameObjects.Container>();
  private unitViews = new Map<string, Phaser.GameObjects.Container>();
  private placement!: PlacementController;
  private selectionInput!: SelectionInput;
  private selectionRing!: Phaser.GameObjects.Arc;
  private campManager!: CampManager;
  private unitManager!: UnitManager;
  private bridge!: UiBridge;

  constructor() { super('BattleScene'); }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillGradientStyle(0x7cb342, 0x7cb342, 0x689f38, 0x689f38, 1);
    g.fillRect(0, 0, 64, 64);
    g.generateTexture('ground', 64, 64);
    g.destroy();

    this.ground = this.add.tileSprite(0, 0, width, height, 'ground').setOrigin(0, 0);
    this.cameras.main.setZoom(1);

    this.setupInput();
    this.scale.on('resize', this.onResize, this);
    this.syncCampViews();

    this.bridge = this.game.registry.get('bridge') as UiBridge;
    this.selectionRing = this.add.circle(0, 0, 40)
      .setStrokeStyle(3, SELECTION_COLOR)
      .setVisible(false);
    this.placement = new PlacementController(this, this.bridge);
    this.selectionInput = new SelectionInput(this, this.bridge);
    this.bridge.on('selectionChanged', () => this.updateSelectionRing());
    this.updateSelectionRing();

    this.campManager = new CampManager(this.gameState);
    this.unitManager = new UnitManager(this.gameState);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.isPanning = true;
    });
    this.input.on('pointerup', () => { this.isPanning = false; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isPanning) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom - dy * 0.001, this.MIN_ZOOM, this.MAX_ZOOM);
      cam.setZoom(next);
    });
    this.input.mouse?.disableContextMenu();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.ground.setSize(gameSize.width, gameSize.height);
  }

  update(_time: number, deltaMs: number): void {
    const cam = this.cameras.main;
    this.ground.tilePositionX = cam.scrollX;
    this.ground.tilePositionY = cam.scrollY;

    const dt = deltaMs / 1000;
    this.campManager.step(dt);
    this.unitManager.step(dt);

    this.syncUnitViews();
  }

  private syncCampViews(): void {
    const seen = new Set<string>();
    for (const camp of this.gameState.allCamps()) {
      seen.add(camp.id);
      let view = this.campViews.get(camp.id);
      if (!view) { view = drawCamp(this, camp); this.campViews.set(camp.id, view); }
      else { view.setPosition(camp.x, camp.y); }
    }
    for (const [id, view] of this.campViews) {
      if (!seen.has(id)) { view.destroy(); this.campViews.delete(id); }
    }
  }

  private syncUnitViews(): void {
    const seen = new Set<string>();
    for (const u of this.gameState.allUnits()) {
      seen.add(u.id);
      let view = this.unitViews.get(u.id);
      if (!view) { view = drawUnit(this, u); this.unitViews.set(u.id, view); }
      updateUnitView(view, u);
    }
    for (const [id, view] of this.unitViews) {
      if (!seen.has(id)) { view.destroy(); this.unitViews.delete(id); }
    }
  }

  exposeGameState(): GameState { return this.gameState; }
  refreshViews(): void { this.syncCampViews(); }

  private updateSelectionRing(): void {
    const id = this.bridge.getSelectedCampId();
    if (id === null) { this.selectionRing.setVisible(false); return; }
    const camp = this.gameState.getCamp(id);
    if (!camp) { this.selectionRing.setVisible(false); return; }
    this.selectionRing.setPosition(camp.x, camp.y).setVisible(true);
  }
}
