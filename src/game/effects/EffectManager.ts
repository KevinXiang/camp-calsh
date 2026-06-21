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
        case 'arrowHit':      this.spawnArrowHit(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y); break;
        case 'healHit':       this.spawnHealHit(ev.x, ev.y); break;
        case 'bombHit':       break;   // 仅触发受击闪白，无独立特效
        case 'bombExplosion': this.spawnBombExplosion(ev.x, ev.y); break;
        case 'artilleryExplosion': this.spawnArtilleryExplosion(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'poisonApplied': this.spawnPoisonApplied(ev.x, ev.y); break;
        case 'poisonCloud':   this.spawnPoisonCloud(ev.x, ev.y);   break;
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

  /** 弓箭命中：扎入箭头（旋转扎入姿态）+ 4 颗 ✦ 向四周弹散（0.7s 生命） */
  private spawnArrowHit(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 扎入箭头：木杆 + 箭羽，旋转约 15° 扎入姿态，150ms 淡出
    const arrow = this.scene.add.graphics();
    arrow.rotation = 0.26;  // ≈15°
    arrow.lineStyle(2, 0x8d6e63, 1);             // 木杆
    arrow.lineBetween(-12, 0, 4, 0);
    arrow.fillStyle(0xff7043, 1);                // 箭头（已没入，露小段）
    arrow.fillTriangle(4, 0, 1, -1.5, 1, 1.5);
    arrow.fillStyle(0xfff176, 1);                // 箭羽两片
    arrow.fillTriangle(-12, 0, -16, -2.5, -12, -1);
    arrow.fillTriangle(-12, 0, -16, 2.5, -12, 1);
    root.add(arrow);
    this.scene.tweens.add({
      targets: arrow,
      alpha: { from: 1, to: 0 },
      duration: 150,
      ease: 'Cubic.easeOut',
    });

    // 4 颗 ✦ 向四周弹散（复用 spawnMeleeStars 风格）
    const N = 4;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + (i * 0.37);
      const dist = 16 + (i * 0.21) * 8;
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

  /** 盾击火花：3 道短斜线（黄/橙）+ 4 颗光点向外飞 + 盾边圆环短闪（0.4s 生命） */
  private spawnShieldSpark(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
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

  /** 炸弹爆炸：8 角黄星几何形 + 烟雾环扩散 + 5 颗火星（0.65s 生命） */
  private spawnBombExplosion(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

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
      scale: { from: 0.3, to: 1.5 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.easeOut',
    });

    const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(2, 0x666666, 0.8);
    root.add(smoke);
    this.scene.tweens.add({
      targets: smoke,
      scale: { from: 1, to: 2.5 },
      alpha: { from: 0.8, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });

    const sparkOff: [number, number][] = [[28, -8], [22, 18], [-26, 4], [-12, -22], [10, 26]];
    for (const [tx, ty] of sparkOff) {
      const c = this.scene.add.circle(0, 0, 2, 0xff7043, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(650, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 治疗命中：绿色十字缩放 + 小绿星上浮（0.55s 生命） */
  private spawnHealHit(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    const cross = this.scene.add.text(0, 0, '+', { fontSize: '20px', color: '#4caf50', fontStyle: 'bold' }).setOrigin(0.5).setScale(0.5);
    root.add(cross);
    this.scene.tweens.add({ targets: cross, scale: { from: 0.5, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Cubic.easeOut' });
    const star = this.scene.add.text(0, -5, '+', { fontSize: '10px', color: '#81c784' }).setOrigin(0.5);
    root.add(star);
    this.scene.tweens.add({ targets: star, y: -20, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Cubic.easeOut' });
    this.scene.time.delayedCall(550, () => { root.destroy(); this.budget.release(); });
  }

  /** 火炮爆炸：火焰核心 + 烟圈 + 冲击波 + 碎片飞溅 + 焦痕（1.2s 生命） */
  private spawnArtilleryExplosion(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 火焰核心：橙红色圆形扩散
    const fire = this.scene.add.circle(0, 0, 15, 0xff6d00, 1);
    root.add(fire);
    this.scene.tweens.add({
      targets: fire,
      scale: { from: 0.3, to: 2.5 },
      alpha: { from: 1, to: 0 },
      duration: 300,
      ease: 'Cubic.easeOut',
    });

    // 烟圈：灰色圆环向外扩散
    const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(3, 0x666666, 0.8);
    root.add(smoke);
    this.scene.tweens.add({
      targets: smoke,
      scale: { from: 0.5, to: 3 },
      alpha: { from: 0.8, to: 0 },
      duration: 500,
      ease: 'Cubic.easeOut',
    });

    // 冲击波：白色半透明圆环快速扩散
    const wave = this.scene.add.circle(0, 0, 10, 0, 0).setStrokeStyle(2, 0xffffff, 0.6);
    root.add(wave);
    this.scene.tweens.add({
      targets: wave,
      scale: { from: 1, to: 4 },
      alpha: { from: 0.6, to: 0 },
      duration: 200,
      ease: 'Cubic.easeOut',
    });

    // 碎片飞溅：4 个小碎片向四周弹射
    const fragColors = [0xff6d00, 0xffab00, 0x424242, 0x795548];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 30;
      const frag = this.scene.add.rectangle(0, 0, 6, 4, fragColors[i]).setOrigin(0.5);
      root.add(frag);
      this.scene.tweens.add({
        targets: frag,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        angle: Math.random() * 360,
        alpha: { from: 1, to: 0 },
        duration: 600,
        ease: 'Cubic.easeOut',
      });
    }

    // 焦痕：命中点留下短暂焦黑痕迹
    const scorch = this.scene.add.circle(0, 0, 12, 0x1a1a1a, 0.5);
    root.add(scorch);
    this.scene.tweens.add({
      targets: scorch,
      alpha: { from: 0.5, to: 0 },
      duration: 1000,
      delay: 200,
    });

    this.scene.time.delayedCall(1200, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 中毒标记：紫色泡泡漂浮 */
  private spawnPoisonApplied(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    for (let i = 0; i < 3; i++) {
      const bubble = this.scene.add.circle(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 10,
        4 + Math.random() * 4,
        0x9c27b0, 0.85
      );
      root.add(bubble);
      this.scene.tweens.add({
        targets: bubble,
        y: bubble.y - 25 - Math.random() * 15,
        alpha: { from: 0.85, to: 0 },
        scale: { from: 1.2, to: 0.4 },
        duration: 700 + Math.random() * 200,
        delay: i * 80,
        ease: 'Cubic.easeOut',
      });
    }
    this.scene.time.delayedCall(900, () => {
      root.destroy();
      this.budget.release();
    });
  }

  /** 毒雾释放：紫色泡泡向外扩散 */
  private spawnPoisonCloud(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);
    // 紫色毒雾圆环
    const ring = this.scene.add.circle(0, 0, 15, 0, 0).setStrokeStyle(3, 0x9c27b0, 0.7);
    root.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.5, to: 3 },
      alpha: { from: 0.7, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });
    // 紫色泡泡向外扩散
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 40 + Math.random() * 50;
      const bubble = this.scene.add.circle(0, 0, 5 + Math.random() * 5, 0x9c27b0, 0.8);
      root.add(bubble);
      this.scene.tweens.add({
        targets: bubble,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 15,
        alpha: { from: 0.8, to: 0 },
        scale: { from: 1.2, to: 0.2 },
        duration: 600 + Math.random() * 200,
        ease: 'Cubic.easeOut',
      });
    }
    this.scene.time.delayedCall(800, () => {
      root.destroy();
      this.budget.release();
    });
  }
}
