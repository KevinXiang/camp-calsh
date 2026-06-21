import Phaser from 'phaser';
import type { CombatEvent } from './types';

/**
 * 特效优先级：高优先级在预算紧张时优先保留。
 * - high：营地摧毁 / 火炮爆炸 / 胜负相关
 * - mid：盾挡 / 治疗 / 投矛命中
 * - low：普通近战 / 弓箭命中
 *
 * 当剩余预算较低（<= lowCutoff）时，low 优先级会被直接丢弃；
 * 处于 (lowCutoff, midCutoff] 之间时，mid 也可能被丢弃。
 */
export type EffectPriority = 'low' | 'mid' | 'high';

const LOW_CUTOFF = 12;   // 预算剩余 <= 12 时不再放 low
const MID_CUTOFF = 4;    // 预算剩余 <= 4 时不再放 mid

/**
 * 软上限计数器。EffectManager 在每次添加特效前调用 tryAdd()，
 * 特效自然结束时由 release() 回收名额。弹道残影不计入预算。
 */
export class EffectBudget {
  private count = 0;
  constructor(private readonly max: number) {}

  /** 按优先级申请名额；预算紧张时低优先级会被拒绝。 */
  tryAdd(priority: EffectPriority = 'low'): boolean {
    if (this.count >= this.max) return false;
    // cutoff 以 max 的比例与绝对值取较小，避免小 max 下完全锁死
    const lowCut = Math.min(LOW_CUTOFF, Math.floor(this.max * 0.24));
    const midCut = Math.min(MID_CUTOFF, Math.floor(this.max * 0.08));
    if (priority === 'low' && this.count >= this.max - lowCut) return false;
    if (priority === 'mid' && this.count >= this.max - midCut) return false;
    this.count++;
    return true;
  }
  release(): void {
    this.count = Math.max(0, this.count - 1);
  }
  active(): number { return this.count; }
}

/** CombatEvent 到特效优先级的映射（用于统一调度分层） */
export function eventPriority(kind: CombatEvent['kind']): EffectPriority {
  switch (kind) {
    case 'campDestroyed':
    case 'artilleryExplosion':
      return 'high';
    case 'shieldBlock':
    case 'healHit':
    case 'javelinHit':
    case 'bombExplosion':
      return 'mid';
    case 'meleeHit':
    case 'arrowHit':
    case 'bombHit':
    case 'unitDeath':
    case 'campHit':
    default:
      return 'low';
  }
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
      const prio = eventPriority(ev.kind);
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeSpark(ev.x, ev.y, prio); break;
        case 'arrowHit':      this.spawnArrowHit(ev.x, ev.y, prio); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y, prio); break;
        case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y, prio); break;
        case 'healHit':       this.spawnHealHit(ev.x, ev.y, prio); break;
        case 'bombHit':       break;   // 仅触发受击闪白，无独立特效
        case 'bombExplosion': this.spawnBombExplosion(ev.x, ev.y, prio); break;
        case 'artilleryExplosion': this.spawnArtilleryExplosion(ev.x, ev.y, prio); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y, prio); break;
        case 'campHit':       this.shakeCamera(prio); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y, prio); break;
      }
    }
  }

  /**
   * 轻反馈（low 层）：近战火花。
   * 用 graphics 短线代替 emoji，更短更弱（0.35s），不与关键事件抢视线。
   */
  private spawnMeleeSpark(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);
    // 2 道短线火花（比原 4 颗星更克制）
    const specs: [number, number][] = [[10, -8], [-9, 6]];
    for (const [dx, dy] of specs) {
      const g = this.scene.add.graphics();
      g.lineStyle(1.6, 0xfff176, 1);
      g.lineBetween(0, 0, dx, dy);
      root.add(g);
      this.scene.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0 },
        duration: 300,
        ease: 'Cubic.easeOut',
      });
    }
    this.scene.time.delayedCall(350, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 中反馈（mid 层）：投矛命中 — 中心闪 + 短火花（0.5s） */
  private spawnJavelinHit(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);

    // 中心十字闪（graphics 菱形，取代 emoji ✦）
    const flash = this.scene.add.graphics();
    flash.fillStyle(0xfff176, 1);
    flash.fillTriangle(0, -8, -5, 0, 5, 0);
    flash.fillTriangle(0, 8, -5, 0, 5, 0);
    flash.fillTriangle(-8, 0, 0, -5, 0, 5);
    flash.fillTriangle(8, 0, 0, -5, 0, 5);
    root.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: { from: 0.4, to: 1.6 },
      alpha: { from: 1, to: 0 },
      duration: 450,
      ease: 'Cubic.easeOut',
    });

    // 4 颗小光点向四角弹散（保留识别度）
    const offsets: [number, number][] = [[22, -14], [-22, -14], [22, 14], [-22, 14]];
    for (const [dx, dy] of offsets) {
      const c = this.scene.add.circle(0, 0, 2, 0xfff176, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: dx, y: dy,
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(550, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 轻反馈（low 层）：弓箭命中 — 扎入箭头 + 2 道短弹散（0.4s） */
  private spawnArrowHit(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);

    // 扎入箭头（保留原造型）
    const arrow = this.scene.add.graphics();
    arrow.rotation = 0.26;
    arrow.lineStyle(2, 0x8d6e63, 1);
    arrow.lineBetween(-12, 0, 4, 0);
    arrow.fillStyle(0xff7043, 1);
    arrow.fillTriangle(4, 0, 1, -1.5, 1, 1.5);
    arrow.fillStyle(0xfff176, 1);
    arrow.fillTriangle(-12, 0, -16, -2.5, -12, -1);
    arrow.fillTriangle(-12, 0, -16, 2.5, -12, 1);
    root.add(arrow);
    this.scene.tweens.add({
      targets: arrow,
      alpha: { from: 1, to: 0 },
      duration: 150,
      ease: 'Cubic.easeOut',
    });

    // 2 颗小光点（比原 4 颗更轻）
    const offsets: [number, number][] = [[12, -8], [-10, 6]];
    for (const [dx, dy] of offsets) {
      const c = this.scene.add.circle(0, 0, 1.6, 0xfff176, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: dx, y: dy,
        alpha: { from: 1, to: 0 },
        duration: 350,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(400, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 中反馈（mid 层）：盾击火花（0.4s） */
  private spawnShieldSpark(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);

    // 3 道斜线火花：从命中点向后向上散
    const lineSpecs = [
      { x1:  0, y1:  0, x2: -12, y2: -10, color: 0xfff176 },
      { x1:  0, y1:  0, x2: -14, y2:   2, color: 0xff8a65 },
      { x1:  0, y1:  0, x2: -10, y2:  14, color: 0xfff176 },
    ];
    for (const s of lineSpecs) {
      const g = this.scene.add.graphics();
      g.lineStyle(2, s.color, 1);
      g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      root.add(g);
      this.scene.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0 },
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    }

    // 4 颗光点：从中心向外飞散并淡出
    const pts: [number, number][] = [[-25, -8], [-22, 12], [-18, -20], [-28, 4]];
    for (const [tx, ty] of pts) {
      const c = this.scene.add.circle(0, 0, 1.8, 0xffeb3b, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        duration: 350,
        ease: 'Cubic.easeOut',
      });
    }

    // 盾边圆环短闪一下（仅 0.13s，强调"挡了一下"）
    const ring = this.scene.add.circle(-12, 0, 9, 0x000000, 0).setStrokeStyle(1.5, 0xfff176, 0.9);
    root.add(ring);
    this.scene.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0 },
      duration: 130,
      ease: 'Cubic.easeOut',
    });

    this.scene.time.delayedCall(400, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 死亡：5 块小方块向上飞散 + 旋转消失（1.5s 生命） */
  private spawnDeathStars(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);
    // 用小方块取代 emoji ★，统一 graphics 风格
    const colors = [0xffeb3b, 0xffc107, 0xff8a65, 0xfff176, 0xffd54f];
    const offsets: [number, number][] = [[-15, -50], [15, -50], [-25, -30], [25, -30], [0, -60]];
    offsets.forEach(([dx, dy], i) => {
      const sq = this.scene.add.rectangle(0, 0, 5, 5, colors[i]).setOrigin(0.5);
      root.add(sq);
      this.scene.tweens.add({
        targets: sq,
        x: dx, y: dy,
        angle: 360,
        scale: { from: 1.5, to: 0.4 },
        alpha: { from: 1, to: 0 },
        duration: 1100,
        delay: i * 60,
        ease: 'Cubic.easeOut',
      });
    });
    this.scene.time.delayedCall(1300, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 军营受击震屏：1.5px 振幅，120ms */
  private shakeCamera(prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    this.scene.cameras.main.shake(120, 0.0015);
    this.scene.time.delayedCall(150, () => this.budget.release());
  }

  /** 高反馈（high 层）：军营摧毁 — 6 块积木散落 + 3 圈烟雾 + 屏幕震动（1.8s 生命） */
  private spawnCampDestroy(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    // 高优先级事件附加强震屏，凸显事件分量
    this.scene.cameras.main.shake(200, 0.004);
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

  /**
   * 中反馈（mid 层）：炸弹爆炸 — 快、散、碎、偏圆形，火星短暂留场（0.55s）。
   * 与火炮对比：更扁更亮的圆形闪光 + 短命火星，不带冲击波/焦痕。
   */
  private spawnBombExplosion(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);

    // 圆形闪光：黄白亮闪快速放大消失（强调"砰"）
    const flash = this.scene.add.circle(0, 0, 8, 0xfff176, 1);
    root.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: { from: 0.4, to: 3.2 },
      alpha: { from: 1, to: 0 },
      duration: 250,
      ease: 'Cubic.easeOut',
    });

    // 8 角黄星几何（保留原有标志感，但缩短留场）
    const star = this.scene.add.graphics();
    star.fillStyle(0xffeb3b, 1);
    star.lineStyle(2, 0xff6f00, 1);
    star.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 25 : 10;
      const a = (i / 16) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) star.moveTo(px, py); else star.lineTo(px, py);
    }
    star.closePath();
    star.fillPath();
    star.strokePath();
    star.setScale(0.3);
    root.add(star);
    this.scene.tweens.add({
      targets: star,
      scale: { from: 0.3, to: 1.3 },
      alpha: { from: 1, to: 0 },
      duration: 400,
      ease: 'Cubic.easeOut',
    });

    // 短命火星：5 颗向四周散裂，比火炮碎片更快消失
    const sparkOff: [number, number][] = [[28, -8], [22, 18], [-26, 4], [-12, -22], [10, 26]];
    for (const [tx, ty] of sparkOff) {
      const c = this.scene.add.circle(0, 0, 2, 0xff7043, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        duration: 420,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(550, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 中反馈（mid 层）：治疗命中 — 绿色十字（graphics）+ 小绿点上浮（0.55s） */
  private spawnHealHit(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    const root = this.scene.add.container(x, y);
    // graphics 十字（取代 emoji +）
    const cross = this.scene.add.graphics();
    cross.fillStyle(0x4caf50, 1);
    cross.fillRect(-2, -8, 4, 16);
    cross.fillRect(-8, -2, 16, 4);
    cross.setScale(0.5);
    root.add(cross);
    this.scene.tweens.add({ targets: cross, scale: { from: 0.5, to: 1.3 }, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Cubic.easeOut' });
    // 柔和绿色光点（取代 emoji +）
    const dot = this.scene.add.circle(0, -5, 2.5, 0x81c784, 0.9);
    root.add(dot);
    this.scene.tweens.add({ targets: dot, y: -22, alpha: { from: 0.9, to: 0 }, scale: { from: 1, to: 0.3 }, duration: 500, ease: 'Cubic.easeOut' });
    this.scene.time.delayedCall(550, () => { root.destroy(); this.budget.release(); });
  }

  /**
   * 高反馈（high 层）：火炮爆炸 — 重、钝、冲击波、焦痕、更强震屏（1.3s 生命）。
   * 与炸弹对比：更深的核心火焰 + 冲击波环 + 持久焦痕 + 余烟。
   */
  private spawnArtilleryExplosion(x: number, y: number, prio: EffectPriority): void {
    if (!this.budget.tryAdd(prio)) return;
    // 火炮爆炸附加强震屏（比 campHit 更重）
    this.scene.cameras.main.shake(180, 0.003);
    const root = this.scene.add.container(x, y);

    // 火焰核心：更深红橙（与炸弹的黄白闪区分）
    const fire = this.scene.add.circle(0, 0, 18, 0xd84315, 1);
    root.add(fire);
    this.scene.tweens.add({
      targets: fire,
      scale: { from: 0.3, to: 2.8 },
      alpha: { from: 1, to: 0 },
      duration: 350,
      ease: 'Cubic.easeOut',
    });
    // 内核黄焰
    const fireCore = this.scene.add.circle(0, 0, 10, 0xffab00, 0.95);
    root.add(fireCore);
    this.scene.tweens.add({
      targets: fireCore,
      scale: { from: 0.3, to: 2.0 },
      alpha: { from: 0.95, to: 0 },
      duration: 280,
      ease: 'Cubic.easeOut',
    });

    // 烟圈：灰色圆环向外扩散（双层）
    const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(3, 0x424242, 0.85);
    root.add(smoke);
    this.scene.tweens.add({
      targets: smoke,
      scale: { from: 0.5, to: 3.4 },
      alpha: { from: 0.85, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });

    // 冲击波：白色半透明圆环快速扩散（火炮专属，炸弹没有）
    const wave = this.scene.add.circle(0, 0, 10, 0, 0).setStrokeStyle(2.5, 0xffffff, 0.7);
    root.add(wave);
    this.scene.tweens.add({
      targets: wave,
      scale: { from: 1, to: 5 },
      alpha: { from: 0.7, to: 0 },
      duration: 280,
      ease: 'Cubic.easeOut',
    });

    // 碎片飞溅：4 个重碎片（比炸弹火星更重）
    const fragColors = [0xff6d00, 0xffab00, 0x424242, 0x795548];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 45 + Math.random() * 30;
      const frag = this.scene.add.rectangle(0, 0, 7, 5, fragColors[i]).setOrigin(0.5);
      root.add(frag);
      this.scene.tweens.add({
        targets: frag,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        angle: Math.random() * 360,
        alpha: { from: 1, to: 0 },
        duration: 700,
        ease: 'Cubic.easeOut',
      });
    }

    // 焦痕：命中点留下持久焦黑痕迹（火炮专属）
    const scorch = this.scene.add.circle(0, 0, 14, 0x1a1a1a, 0.55);
    root.add(scorch);
    this.scene.tweens.add({
      targets: scorch,
      alpha: { from: 0.55, to: 0 },
      duration: 1100,
      delay: 250,
    });

    this.scene.time.delayedCall(1300, () => {
      root.destroy();
      this.budget.release();
    });
  }
}
