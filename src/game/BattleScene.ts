import Phaser from 'phaser';
import { GameState } from './GameState';
import { SimulationClock } from './SimulationClock';
import { drawCamp, drawRuinedOverlay, drawDamageOverlay } from './campRenderer';
import { drawUnit, updateUnitView, maybeTriggerAttackAnim, triggerHitFlash } from './unitRenderer';
import { EffectManager } from './effects/EffectManager';
import { PlacementController } from './managers/PlacementController';
import { SelectionInput } from './managers/SelectionInput';
import { CampManager } from './managers/CampManager';
import { UnitManager } from './managers/UnitManager';
import { CombatSystem } from './managers/CombatSystem';
import { CampPlacementService } from './managers/CampPlacementService';
import { EconomySystem } from './managers/EconomySystem';
import { AiController } from './ai/AiController';
import { drawProjectile, updateProjectileView } from './projectileRenderer';
import { checkWinner } from './victory';
import { SELECTION_COLOR } from '../config/colors';
import { classifyZoom, shouldDispatchEvent, shouldShowUnitHpBar, type ZoomTier } from './lodPolicy';
import {
  emitEconomyChangedIfNeeded,
  handleAiBattleStartup,
  hasLivingCamp,
  removeCampByPlayer as removeCampByPlayerWith,
  runAiBattleStep,
} from './aiBattleIntegration';
import type { UiBridge } from '../ui/UiBridge';
import type { Camp } from './types';

export class BattleScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.TileSprite;
  private isPanning = false;
  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.5;
  private currentLod: ZoomTier = 'near';
  private lodFrameCounter = 0;

  private gameState = new GameState();
  private clock = new SimulationClock();
  private campViews = new Map<string, Phaser.GameObjects.Container>();
  private unitViews = new Map<string, Phaser.GameObjects.Container>();
  private projectileViews = new Map<string, Phaser.GameObjects.Container>();
  private placement!: PlacementController;
  private selectionInput!: SelectionInput;
  private selectionRing!: Phaser.GameObjects.Arc;
  private campManager!: CampManager;
  private unitManager!: UnitManager;
  private effects!: EffectManager;
  private bridge!: UiBridge;
  private placementService!: CampPlacementService;
  private aiController!: AiController;
  private lastStatsSig = '';
  private lastEconomySig = '';

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
    this.setupKeyboard();
    this.scale.on('resize', this.onResize, this);
    this.syncCampViews();

    this.bridge = this.game.registry.get('bridge') as UiBridge;
    this.selectionRing = this.add.circle(0, 0, 40)
      .setStrokeStyle(3, SELECTION_COLOR)
      .setVisible(false);
    this.placementService = new CampPlacementService(this.gameState);
    this.aiController = new AiController(this.gameState, this.placementService);
    this.placement = new PlacementController(
      this,
      this.bridge,
      this.placementService,
    );
    this.selectionInput = new SelectionInput(this, this.bridge);
    this.bridge.on('selectionChanged', () => this.updateSelectionRing());
    this.bridge.on('modeChanged', () => this.handleModeChanged());
    this.updateSelectionRing();

    this.campManager = new CampManager(this.gameState);
    this.unitManager = new UnitManager(this.gameState);
    this.effects = new EffectManager(this);
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

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown-SPACE', () => {
      this.bridge.setRunning(!this.gameState.sim.running, this.gameState);
    });
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.ground.setSize(gameSize.width, gameSize.height);
  }

  update(_time: number, deltaMs: number): void {
    this.selectionInput.update(deltaMs);
    const cam = this.cameras.main;
    this.ground.tilePositionX = cam.scrollX;
    this.ground.tilePositionY = cam.scrollY;

    // 按缩放刷新 LOD 层级（近/中/远）
    this.currentLod = classifyZoom(cam.zoom);

    // 解锁倒计时：自然时间（不受倍速影响），仅 sim.running 时流逝（暂停冻结）
    if (this.gameState.sim.running && this.gameState.sim.unlockTimer > 0) {
      this.gameState.sim.unlockTimer = Math.max(0, this.gameState.sim.unlockTimer - deltaMs / 1000);
    }

    const steps = this.clock.consume(deltaMs, this.gameState.sim.running, this.gameState.sim.speed);
    const dt = this.clock.fixedDt();
    for (let i = 0; i < steps; i++) {
      const gameOver = this.bridge.getGameOver() !== null;
      runAiBattleStep({
        economy: (stepDt, over) => {
          EconomySystem.step(this.gameState, stepDt, over);
        },
        ai: (stepDt, over) => {
          this.aiController.step(stepDt, over);
        },
        camp: stepDt => this.campManager.step(stepDt),
        unit: stepDt => this.unitManager.step(stepDt),
        combat: stepDt => CombatSystem.step(this.gameState, stepDt),
      }, dt, gameOver);
      this.gameState.sim.timeMs += dt * 1000;
    }

    // 排干事件队列 → 派发到特效层 + 受击闪白
    if (this.gameState.events.length > 0) {
      this.lodFrameCounter++;
      // 受击闪白：同样按 LOD 过滤（远景/中景抽样），避免全部小兵同时闪
      for (const ev of this.gameState.events) {
        if (ev.kind === 'meleeHit' || ev.kind === 'arrowHit' || ev.kind === 'javelinHit' || ev.kind === 'shieldBlock' || ev.kind === 'bombHit') {
          if (!shouldDispatchEvent(ev.kind, this.currentLod, this.lodFrameCounter)) continue;
          const v = this.unitViews.get(ev.unitId);
          if (v) triggerHitFlash(v);
        }
      }
      // 特效 dispatch：按 LOD 过滤轻反馈
      const visible = this.gameState.events.filter(ev => shouldDispatchEvent(ev.kind, this.currentLod, this.lodFrameCounter));
      this.effects.dispatch(visible);
      this.gameState.events.length = 0;
    }

    // 胜负判定：一方彻底覆灭 → 宣布胜方并停止
    if (this.bridge.getGameOver() === null) {
      const winner = checkWinner(this.gameState);
      if (winner) this.bridge.declareGameOver(winner, this.gameState);
    }

    this.syncCampViews();
    this.syncUnitViews();
    this.syncProjectileViews();
    this.maybeEmitStatsChanged();
    this.maybeEmitEconomyChanged();
  }

  /** 仅在统计快照变化时触发 statsChanged，降低 UI 刷新频率 */
  private maybeEmitStatsChanged(): void {
    let redAlive = 0, blueAlive = 0, redCamps = 0, blueCamps = 0;
    for (const u of this.gameState.units.values()) {
      if (!u.alive) continue;
      if (u.faction === 'red') redAlive++; else blueAlive++;
    }
    for (const c of this.gameState.camps.values()) {
      if (c.destroyed) continue;
      if (c.faction === 'red') redCamps++; else blueCamps++;
    }
    const s = this.gameState.stats;
    const sig = `${redAlive}|${blueAlive}|${redCamps}|${blueCamps}|${s.red.kills}|${s.blue.kills}|${s.red.campsDestroyed}|${s.blue.campsDestroyed}`;
    if (sig !== this.lastStatsSig) {
      this.lastStatsSig = sig;
      this.bridge.emit('statsChanged');
    }
  }

  private maybeEmitEconomyChanged(): void {
    this.lastEconomySig = emitEconomyChangedIfNeeded(
      this.gameState,
      this.lastEconomySig,
      () => this.bridge.emit('economyChanged'),
    );
  }

  private syncCampViews(): void {
    const seen = new Set<string>();
    for (const camp of this.gameState.allCamps()) {
      seen.add(camp.id);
      let view = this.campViews.get(camp.id);
      if (!view) { view = drawCamp(this, camp); this.campViews.set(camp.id, view); }
      view.setPosition(camp.x, camp.y);

      // 更新血条
      const hpFill = view.getData('hpFill') as Phaser.GameObjects.Rectangle;
      if (hpFill) {
        const ratio = Math.max(0, camp.hp / camp.maxHp);
        hpFill.setSize(50 * ratio, 3.5);
        const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
        hpFill.setFillStyle(c);
      }

      // 受损阶段叠加（轻裂纹 / 重裂纹 + 烟点），仅未摧毁时刷新
      if (!camp.destroyed) {
        const ratio = Math.max(0, camp.hp / camp.maxHp);
        drawDamageOverlay(view, camp.kind, ratio);
      }

      // 摧毁状态切换（仅第一次触发）
      if (camp.destroyed && view.getData('ruined') !== true) {
        drawRuinedOverlay(view);
        view.setAlpha(0.75);
        view.setData('ruined', true);
      }
    }
    for (const [id, view] of this.campViews) {
      if (!seen.has(id)) { view.destroy(); this.campViews.delete(id); }
    }
  }

  private syncUnitViews(): void {
    const seen = new Set<string>();
    const showHp = shouldShowUnitHpBar(this.currentLod);
    for (const u of this.gameState.allUnits()) {
      seen.add(u.id);
      let view = this.unitViews.get(u.id);
      if (!view) { view = drawUnit(this, u); this.unitViews.set(u.id, view); }
      updateUnitView(view, u);
      maybeTriggerAttackAnim(view, u);
      // 血条 child[1]=bg, child[2]=fill：按 LOD 控制可见
      const hpBg = view.getAt(1) as Phaser.GameObjects.Rectangle | undefined;
      const hpFill = view.getAt(2) as Phaser.GameObjects.Rectangle | undefined;
      if (hpBg) hpBg.setVisible(showHp);
      if (hpFill) hpFill.setVisible(showHp);
    }
    for (const [id, view] of this.unitViews) {
      if (!seen.has(id)) { view.destroy(); this.unitViews.delete(id); }
    }
  }

  private syncProjectileViews(): void {
    const seen = new Set<string>();
    for (const p of this.gameState.projectiles) {
      seen.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) { view = drawProjectile(this, p); this.projectileViews.set(p.id, view); }
      updateProjectileView(view, p);
    }
    for (const [id, view] of this.projectileViews) {
      if (!seen.has(id)) { view.destroy(); this.projectileViews.delete(id); }
    }
  }

  exposeGameState(): GameState { return this.gameState; }
  refreshViews(): void { this.syncCampViews(); }

  onCampPlaced(camp: Camp): void {
    if (this.bridge.getGameOver() !== null) return;

    const startupHandled = camp.faction === 'red'
      && handleAiBattleStartup({
        gs: this.gameState,
        deployInitialCamp: () => this.aiController.deployInitialCamp(),
        setRunning: running => {
          this.gameState.sim.running = running;
          this.bridge.emit('simChanged');
        },
        setNotice: notice => this.bridge.setNotice(notice),
      });
    this.maybeEmitEconomyChanged();
    if (startupHandled) {
      return;
    }

    if (
      !this.gameState.sim.running
      && hasLivingCamp(this.gameState, 'red')
      && hasLivingCamp(this.gameState, 'blue')
    ) {
      this.bridge.setRunning(true, this.gameState);
    }
  }

  removeCampByPlayer(id: string): boolean {
    return removeCampByPlayerWith({
      remove: (actor, campId) => this.placementService.remove(actor, campId),
      refreshViews: () => this.refreshViews(),
      emitEconomyChanged: () => this.maybeEmitEconomyChanged(),
    }, id);
  }

  private handleModeChanged(): void {
    if (this.gameState.mode === 'sandbox') {
      this.bridge.setNotice(null);
      this.maybeEmitEconomyChanged();
      return;
    }

    const startupHandled = handleAiBattleStartup({
      gs: this.gameState,
      deployInitialCamp: () => this.aiController.deployInitialCamp(),
      setRunning: running => {
        this.gameState.sim.running = running;
      },
      setNotice: notice => this.bridge.setNotice(notice),
    });
    this.maybeEmitEconomyChanged();
    if (startupHandled) {
      this.refreshViews();
      return;
    }

    if (
      this.bridge.getGameOver() === null
      && !this.gameState.sim.running
      && hasLivingCamp(this.gameState, 'red')
      && hasLivingCamp(this.gameState, 'blue')
    ) {
      this.bridge.setRunning(true, this.gameState);
    }
  }

  private updateSelectionRing(): void {
    const id = this.bridge.getSelectedCampId();
    if (id === null) { this.selectionRing.setVisible(false); return; }
    const camp = this.gameState.getCamp(id);
    if (!camp) { this.selectionRing.setVisible(false); return; }
    this.selectionRing.setPosition(camp.x, camp.y).setVisible(true);
  }
}
