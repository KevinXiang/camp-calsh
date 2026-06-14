import Phaser from 'phaser';
import { GameState } from './GameState';
import { SimulationClock } from './SimulationClock';
import { drawCamp } from './campRenderer';
import { drawUnit, updateUnitView, maybeTriggerAttackAnim, triggerHitFlash } from './unitRenderer';
import { EffectManager } from './effects/EffectManager';
import { PlacementController } from './managers/PlacementController';
import { SelectionInput } from './managers/SelectionInput';
import { CampManager } from './managers/CampManager';
import { UnitManager } from './managers/UnitManager';
import { CombatSystem } from './managers/CombatSystem';
import { drawProjectile, updateProjectileView } from './projectileRenderer';
import { checkWinner } from './victory';
import { SELECTION_COLOR } from '../config/colors';
export class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
        this.isPanning = false;
        this.MIN_ZOOM = 0.3;
        this.MAX_ZOOM = 2.5;
        this.gameState = new GameState();
        this.clock = new SimulationClock();
        this.campViews = new Map();
        this.unitViews = new Map();
        this.projectileViews = new Map();
    }
    create() {
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
        this.bridge = this.game.registry.get('bridge');
        this.selectionRing = this.add.circle(0, 0, 40)
            .setStrokeStyle(3, SELECTION_COLOR)
            .setVisible(false);
        this.placement = new PlacementController(this, this.bridge);
        this.selectionInput = new SelectionInput(this, this.bridge);
        this.bridge.on('selectionChanged', () => this.updateSelectionRing());
        this.updateSelectionRing();
        this.campManager = new CampManager(this.gameState);
        this.unitManager = new UnitManager(this.gameState);
        this.effects = new EffectManager(this);
    }
    setupInput() {
        this.input.on('pointerdown', (p) => {
            if (p.rightButtonDown())
                this.isPanning = true;
        });
        this.input.on('pointerup', () => { this.isPanning = false; });
        this.input.on('pointermove', (p) => {
            if (!this.isPanning)
                return;
            const cam = this.cameras.main;
            cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
            cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
        });
        this.input.on('wheel', (_p, _o, _dx, dy) => {
            const cam = this.cameras.main;
            const next = Phaser.Math.Clamp(cam.zoom - dy * 0.001, this.MIN_ZOOM, this.MAX_ZOOM);
            cam.setZoom(next);
        });
        this.input.mouse?.disableContextMenu();
    }
    setupKeyboard() {
        this.input.keyboard?.on('keydown-SPACE', () => {
            this.bridge.setRunning(!this.gameState.sim.running, this.gameState);
        });
    }
    onResize(gameSize) {
        this.ground.setSize(gameSize.width, gameSize.height);
    }
    update(_time, deltaMs) {
        const cam = this.cameras.main;
        this.ground.tilePositionX = cam.scrollX;
        this.ground.tilePositionY = cam.scrollY;
        const steps = this.clock.consume(deltaMs, this.gameState.sim.running, this.gameState.sim.speed);
        const dt = this.clock.fixedDt();
        for (let i = 0; i < steps; i++) {
            this.campManager.step(dt);
            this.unitManager.step(dt);
            CombatSystem.step(this.gameState, dt);
            this.gameState.sim.timeMs += dt * 1000;
        }
        // 排干事件队列 → 派发到特效层 + 受击闪白
        if (this.gameState.events.length > 0) {
            for (const ev of this.gameState.events) {
                if (ev.kind === 'meleeHit') {
                    for (const u of this.gameState.allUnits()) {
                        if (u.alive && Math.abs(u.x - ev.x) < 1 && Math.abs(u.y - ev.y) < 1) {
                            const v = this.unitViews.get(u.id);
                            if (v)
                                triggerHitFlash(v);
                            break;
                        }
                    }
                }
            }
            this.effects.dispatch(this.gameState.events);
            this.gameState.events.length = 0;
        }
        // 胜负判定：一方彻底覆灭 → 宣布胜方并停止
        if (this.bridge.getGameOver() === null) {
            const winner = checkWinner(this.gameState);
            if (winner)
                this.bridge.declareGameOver(winner, this.gameState);
        }
        this.syncUnitViews();
        this.syncProjectileViews();
        this.bridge.emit('statsChanged');
    }
    syncCampViews() {
        const seen = new Set();
        for (const camp of this.gameState.allCamps()) {
            seen.add(camp.id);
            let view = this.campViews.get(camp.id);
            if (!view) {
                view = drawCamp(this, camp);
                this.campViews.set(camp.id, view);
            }
            else {
                view.setPosition(camp.x, camp.y);
            }
        }
        for (const [id, view] of this.campViews) {
            if (!seen.has(id)) {
                view.destroy();
                this.campViews.delete(id);
            }
        }
    }
    syncUnitViews() {
        const seen = new Set();
        for (const u of this.gameState.allUnits()) {
            seen.add(u.id);
            let view = this.unitViews.get(u.id);
            if (!view) {
                view = drawUnit(this, u);
                this.unitViews.set(u.id, view);
            }
            updateUnitView(view, u);
            maybeTriggerAttackAnim(view, u);
        }
        for (const [id, view] of this.unitViews) {
            if (!seen.has(id)) {
                view.destroy();
                this.unitViews.delete(id);
            }
        }
    }
    syncProjectileViews() {
        const seen = new Set();
        for (const p of this.gameState.projectiles) {
            seen.add(p.id);
            let view = this.projectileViews.get(p.id);
            if (!view) {
                view = drawProjectile(this, p);
                this.projectileViews.set(p.id, view);
            }
            updateProjectileView(view, p);
        }
        for (const [id, view] of this.projectileViews) {
            if (!seen.has(id)) {
                view.destroy();
                this.projectileViews.delete(id);
            }
        }
    }
    exposeGameState() { return this.gameState; }
    refreshViews() { this.syncCampViews(); }
    updateSelectionRing() {
        const id = this.bridge.getSelectedCampId();
        if (id === null) {
            this.selectionRing.setVisible(false);
            return;
        }
        const camp = this.gameState.getCamp(id);
        if (!camp) {
            this.selectionRing.setVisible(false);
            return;
        }
        this.selectionRing.setPosition(camp.x, camp.y).setVisible(true);
    }
}
