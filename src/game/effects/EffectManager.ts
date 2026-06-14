import Phaser from 'phaser';
import type { CombatEvent } from './types';

/**
 * 软上限计数器。EffectManager 在每次添加特效前调用 tryAdd()，
 * 特效自然结束时由 release() 回收名额。弹道残影不计入预算。
 */
export class EffectBudget {
  private count = 0;
  constructor(private readonly max: number) {}
  tryAdd(): boolean {
    if (this.count >= this.max) return false;
    this.count++;
    return true;
  }
  release(): void {
    this.count = Math.max(0, this.count - 1);
  }
  active(): number { return this.count; }
}

/**
 * 特效管理器。每帧由 BattleScene 排干 events 调用 dispatch；
 * 内部调用具体的 spawnXxx 方法生成 Phaser 显示对象 + tween，结束自动 release。
 */
export class EffectManager {
  private readonly budget = new EffectBudget(50);

  constructor(private readonly scene: Phaser.Scene) {}

  /** 排干一批事件（由 BattleScene 每帧调用） */
  dispatch(events: CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
    }
  }

  /** 命中爆星：4 颗 ✦ 从命中点向四周弹出（0.7s 生命） */
  private spawnMeleeStars(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    const N = 4;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + (i * 0.37);
      const dist = 18 + (i * 0.21) * 8;
      const star = this.scene.add.text(0, 0, '✦', {
        fontSize: '14px', color: '#fff176', fontStyle: 'bold',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        scale: { from: 0.4, to: 1.4 },
        alpha: { from: 1, to: 0 },
        duration: 600,
        ease: 'Cubic.easeOut',
      });
    }
    this.scene.time.delayedCall(700, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 投矛命中：中心大 ✦（缩放放大）+ 4 颗小 ✦ 散向四角（0.7s 生命） */
  private spawnJavelinHit(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 中心大星：缩放 0.4 → 1.8 + 淡出
    const center = this.scene.add.text(0, 0, '✦', {
      fontSize: '24px', color: '#fff176', fontStyle: 'bold',
    }).setOrigin(0.5).setScale(0.4);
    root.add(center);
    this.scene.tweens.add({
      targets: center,
      scale: { from: 0.4, to: 1.8 },
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });

    // 四角小星：分别飞向 (+25,-15) (-25,-15) (+25,+15) (-25,+15)
    const offsets: [number, number][] = [[25, -15], [-25, -15], [25, 15], [-25, 15]];
    for (const [dx, dy] of offsets) {
      const star = this.scene.add.text(0, 0, '✦', {
        fontSize: '14px', color: '#fff176', fontStyle: 'bold',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: dx, y: dy,
        alpha: { from: 1, to: 0 },
        duration: 700,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(750, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 死亡冒星：5 颗 ★ 向上飞散 + 旋转消失（1.5s 生命） */
  private spawnDeathStars(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    const offsets = [[-15, -50], [15, -50], [-25, -30], [25, -30], [0, -60]];
    offsets.forEach(([dx, dy], i) => {
      const star = this.scene.add.text(0, 0, '★', {
        fontSize: '18px', color: '#ffeb3b',
      }).setOrigin(0.5);
      root.add(star);
      this.scene.tweens.add({
        targets: star,
        x: dx, y: dy,
        angle: 360,
        scale: { from: 1.5, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 1200,
        delay: i * 60,
        ease: 'Cubic.easeOut',
      });
    });
    this.scene.time.delayedCall(1500, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 军营受击震屏：1.5px 振幅，120ms */
  private shakeCamera(): void {
    if (!this.budget.tryAdd()) return;
    this.scene.cameras.main.shake(120, 0.0015);
    this.scene.time.delayedCall(150, () => this.budget.release());
  }

  /** 军营摧毁：6 块积木散落 + 3 圈烟雾（1.8s 生命） */
  private spawnCampDestroy(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 烟雾圈
    const smokes: [number, number, number][] = [[0, 0, 0], [-15, -10, 100], [18, -5, 200]];
    smokes.forEach(([sx, sy, delay]) => {
      const smoke = this.scene.add.circle(sx, sy, 18, 0xaaaaaa, 0.7);
      root.add(smoke);
      this.scene.tweens.add({
        targets: smoke,
        scale: { from: 0, to: 2 },
        alpha: { from: 0.8, to: 0 },
        duration: 1400,
        delay,
        ease: 'Cubic.easeOut',
      });
    });

    // 积木散落
    const colors = [0xe53935, 0xffd54f, 0x90a4ae, 0xe53935, 0xffd54f, 0x90a4ae];
    for (let i = 0; i < 6; i++) {
      const block = this.scene.add.rectangle(0, -10, 12, 12, colors[i]).setOrigin(0.5);
      root.add(block);
      const dir = i < 3 ? -1 : 1;
      const spread = 20 + (i * 0.19) * 15;
      this.scene.tweens.add({
        targets: block,
        x: dir * spread,
        y: 30 + (i * 0.13) * 10,
        angle: dir * (40 + (i * 0.17) * 30),
        alpha: { from: 1, to: 0 },
        duration: 1500,
        delay: i * 25,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(1800, () => {
      root.destroy();
      this.budget.release();
    });
  }
}
