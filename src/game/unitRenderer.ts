import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit, UnitKind, Faction } from './types';

const SKIN = 0xffcc80;
const BODY_W = 2.5;
const CORPSE_COLOR = 0x777777;

/**
 * View 数据约定（存于 container.data）：
 *   body:  Phaser.GameObjects.Container — 装 graphics + 武器，可独立 tween
 *   anim:  动作状态（相位 / 兵种 / 受击时间 / 上一次 attackTimer）
 */
interface AnimState {
  walkPhaseOffset: number;  // 每个单位独立相位（0..1），防止齐步走
  kind: UnitKind;
  hitFlashUntil: number;    // 受击闪白结束时间（performance.now ms）
  prevAttackTimer: number;  // 检测攻击触发用
}

function drawStickFigure(g: Phaser.GameObjects.Graphics, faction: Faction, kind: UnitKind): void {
  const color = FACTION_COLORS[faction];

  // 落影
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(0, 16, 22, 7);

  // 腿
  g.lineStyle(BODY_W, color, 1);
  g.lineBetween(0, 3, -6, 14);
  g.lineBetween(0, 3, 6, 14);

  // 身体
  g.lineStyle(BODY_W + 0.5, color, 1);
  g.lineBetween(0, -8, 0, 3);

  // 头
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -15, 7);
  g.lineStyle(1.2, 0x000000, 0.2);
  g.strokeCircle(0, -15, 7);

  // 眼睛
  g.fillStyle(0x000000, 0.7);
  g.fillCircle(-2.5, -15, 1.2);
  g.fillCircle(2.5, -15, 1.2);

  // 嘴
  g.lineStyle(1, 0x000000, 0.4);
  g.beginPath();
  g.arc(0, -12, 3, 0.2, Math.PI - 0.2);
  g.strokePath();

  drawWeapon(g, kind, color);
}

function drawWeapon(g: Phaser.GameObjects.Graphics, kind: UnitKind, color: number): void {
  switch (kind) {
    case 'sword': {
      // 剑兵：更宽的剑刃 + 明显剑柄 + 利落挥砍姿态
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -9, 1);                       // 左臂
      g.lineBetween(0, -5, 10, -2);                      // 右臂持剑
      // 剑刃（更宽 + 双色金属感）
      g.fillStyle(0xffd54f, 1);
      g.fillTriangle(10, -2, 20, -12, 16, -6);          // 上刃
      g.fillTriangle(10, -2, 16, -6, 14, 0);            // 下刃
      g.lineStyle(1.2, 0xbf360c, 0.9);
      g.strokeTriangle(10, -2, 20, -12, 16, -6);
      // 剑柄护手 + 高光
      g.lineStyle(2, 0xfff176, 0.9);
      g.lineBetween(7, 1, 13, -5);
      g.fillStyle(0x5d4037, 1);
      g.fillCircle(8, 1, 1.6);                            // 柄末圆头
      break;
    }
    case 'shield': {
      // 盾兵更宽：加大盾牌直径 + 双层盾框
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 9, 2);
      g.lineBetween(0, -5, -9, 1);
      // 主盾：更宽的椭圆大盾
      g.fillStyle(0xb0bec5, 0.92);
      g.fillEllipse(-13, 2, 18, 16);
      g.lineStyle(2.2, 0x546e7a, 0.95);
      g.strokeEllipse(-13, 2, 18, 16);
      // 盾内圆心（双圈金属感）
      g.fillStyle(0xcfd8dc, 0.85);
      g.fillCircle(-13, 2, 5);
      g.lineStyle(1.2, 0x78909c, 0.7);
      g.strokeCircle(-13, 2, 5);
      g.fillStyle(0x78909c, 0.9);
      g.fillCircle(-13, 2, 1.8);
      break;
    }
    case 'archer': {
      // 左手前伸持弓、右手拉弦到脸（形成拉弓蓄势姿态）
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -10, -3);   // 左臂前伸
      g.lineBetween(0, -5, 4, -10);    // 右臂拉弦到脸

      // 反曲弓身（带反曲线：上下端各一个反向小弯）
      g.lineStyle(2.8, 0x8d6e63, 1);
      g.beginPath();
      g.moveTo(-12, -6);
      g.lineTo(-18, -3);
      g.lineTo(-13, 2);
      g.lineTo(-8, 6);
      g.lineTo(-14, 12);
      g.strokePath();
      // 弓把
      g.fillStyle(0x5d4037, 1);
      g.fillRect(-15, 0, 3, 5);

      // 弦：两条线从弓两端汇聚到右脸拉弦点 (4,-10)
      g.lineStyle(1.2, 0xfff176, 1);
      g.lineBetween(-13, -6, 4, -10);
      g.lineBetween(-14, 12, 4, -10);

      // 蓄势搭箭：黄色箭杆沿弦方向 + 小箭头
      g.lineStyle(2, 0xffd54f, 1);
      g.lineBetween(-14, 3, 6, -8);
      g.fillStyle(0xffd54f, 1);
      g.fillTriangle(6, -8, 2, -10, 2, -5);
      break;
    }
    case 'javelin': {
      // 投矛：矛更长、高举过头，尖端更尖
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -8, 4);                       // 左臂
      g.lineBetween(0, -5, 6, -12);                      // 右臂上举
      // 长矛杆（更长 + 木质感）
      g.lineStyle(3.2, 0xa1887f, 1);
      g.lineBetween(6, -12, 18, -26);
      // 矛尾缠绕
      g.lineStyle(1.5, 0x5d4037, 1);
      g.lineBetween(7, -11, 9, -13);
      // 金属矛头（更明显三角）
      g.fillStyle(0xff8a65, 1);
      g.fillTriangle(18, -26, 14, -22, 22, -22);
      g.lineStyle(1, 0xbf360c, 0.8);
      g.strokeTriangle(18, -26, 14, -22, 22, -22);
      // 矛头高光
      g.fillStyle(0xffccbc, 0.85);
      g.fillTriangle(18, -26, 16, -23, 19, -23);
      break;
    }
    case 'bomb': {
      // 爆破兵明显抱持爆弹：双手抱更大的 TNT 箱
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 10, -7);                      // 右臂抱箱
      g.lineBetween(0, -5, -10, -3);                     // 左臂托箱
      // 更大的 TNT 木箱
      g.fillStyle(0xc62828, 1);
      g.fillRect(7, -14, 12, 11);
      g.lineStyle(1.2, 0x000000, 0.4);
      g.strokeRect(7, -14, 12, 11);
      // TNT 字 + 横条
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(9, -12, 8, 2);
      g.fillRect(9, -7, 8, 2);
      // 引信 + 火星
      g.lineStyle(1.3, 0x5d4037, 1);
      g.lineBetween(13, -14, 14, -19);
      g.fillStyle(0xff7043, 1);
      g.fillCircle(14, -19, 1.8);
      g.fillStyle(0xffeb3b, 0.85);
      g.fillCircle(14, -20, 1);
      break;
    }
    case 'medic': {
      // 医疗兵：更大的医疗包 + 阵营色十字 + 胸前十字徽章
      // 大医疗包（白色加粗）
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(-7, -9, 14, 18);
      g.lineStyle(0.7, 0xbdbdbd, 1);
      g.strokeRect(-7, -9, 14, 18);
      // 包侧拉链
      g.lineStyle(0.5, 0x9e9e9e, 0.8);
      g.lineBetween(-7, 0, 7, 0);
      // 大阵营色十字（更突出）
      g.lineStyle(3.2, color, 1);
      g.lineBetween(0, -13, 0, 5);
      g.lineBetween(-7, -4, 7, -4);
      // 右侧药瓶
      g.fillStyle(0xe0f2f1, 0.95);
      g.fillRect(9, -7, 7, 6);
      g.lineStyle(0.5, 0x4caf50, 0.8);
      g.strokeRect(9, -7, 7, 6);
      g.lineStyle(1.8, color, 0.9);
      g.lineBetween(11, -6, 14, -2);
      g.lineBetween(12.5, -5, 12.5, -2);
      break;
    }
    case 'artillery': {
      // 火炮兵：更重的重武器感（大炮筒 + 火焰口 + 弹壳）
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 8, -6);                       // 右臂扶炮
      g.lineBetween(0, -5, -10, -3);                     // 左臂托弹
      // 大炮筒（更长更粗）
      g.fillStyle(0x424242, 1);
      g.fillRect(7, -13, 14, 8);
      g.lineStyle(1.5, 0x000000, 0.4);
      g.strokeRect(7, -13, 14, 8);
      // 炮口圆环
      g.fillStyle(0x212121, 1);
      g.fillCircle(21, -9, 3);
      g.lineStyle(1.2, 0x616161, 0.9);
      g.strokeCircle(21, -9, 3);
      // 火焰口余烬
      g.fillStyle(0xff6d00, 0.95);
      g.fillCircle(21, -9, 1.8);
      g.fillStyle(0xffeb3b, 0.7);
      g.fillCircle(21, -9, 0.9);
      // 左臂托的弹壳
      g.fillStyle(0xffab00, 0.95);
      g.fillRect(-13, -5, 4, 8);
      g.lineStyle(0.7, 0xbf360c, 0.8);
      g.strokeRect(-13, -5, 4, 8);
      g.fillStyle(0xff6f00, 1);
      g.fillRect(-13, -5, 4, 2);
      break;
    }
  }
}

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  // body 子容器：装 graphics，承担弹跳/旋转/闪白
  const body = scene.add.container(0, 0);
  const g = scene.add.graphics();
  drawStickFigure(g, unit.faction, unit.kind);
  body.add(g);

  // 血条（不参与 body 变换）
  const hpBg = scene.add.rectangle(0, -26, 22, 3.5, 0x000000, 0.5).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-11, -26, 22 * ratio, 3, hpC).setOrigin(0, 0.5);

  const root = scene.add.container(unit.x, unit.y, [body, hpBg, hpFill]);

  const anim: AnimState = {
    walkPhaseOffset: (simpleHash(unit.id) % 1000) / 1000,
    kind: unit.kind,
    hitFlashUntil: 0,
    prevAttackTimer: unit.attackTimer,
  };
  root.setData('anim', anim);
  root.setData('body', body);
  return root;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);

  // 死亡处理：只在第一帧切换为尸体并锁定
  if (!unit.alive) {
    if (view.getData('corpse') !== true) {
      // 第一次进入死亡：先播倒下旋转 → 再切尸体
      const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
      if (body) {
        view.scene.tweens.add({
          targets: body,
          rotation: Math.PI / 2,
          duration: 250,
          ease: 'Cubic.easeIn',
        });
      }
      view.setData('corpse', true);
      view.scene.time.delayedCall(280, () => {
        if (!view.scene) return;
        view.removeAll(true);
        const g = view.scene.add.graphics();
        drawCorpse(g);
        view.add(g);
      });
    }
    view.setAlpha(Math.max(0.4, unit.deathTimer / 1.0));
    return;
  }

  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body) return;

  // 走路弹跳：仅 state==='moving' 时 body 上下浮动 + 摇摆。
  // 关键：attacking 状态下绝不触碰 body 变换，否则会覆盖 Task 6 的攻击 tween。
  if (unit.state === 'moving') {
    const t = (performance.now() / 400) + anim.walkPhaseOffset;
    const phase = (t % 1) * Math.PI * 2;
    body.y = -Math.abs(Math.sin(phase)) * 4;  // 0..-4 弹跳
    body.rotation = Math.sin(phase) * 0.05;   // ±3° 摇摆
  } else if (unit.state === 'idle') {
    // 仅 idle（无目标）时归零；attacking 时交给攻击 tween
    body.y = 0;
    body.rotation = 0;
  }
  // attacking：不改 body（攻击 tween 拥有控制权，结束后归零）

  // 血条更新（child[1]=bg, child[2]=fill）
  const hpFill = view.getAt(2) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(22 * ratio, 3);
    const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    hpFill.setFillStyle(c);
  }
}

function drawCorpse(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.1);
  g.fillEllipse(0, 4, 28, 9);
  g.lineStyle(BODY_W + 0.5, CORPSE_COLOR, 0.8);
  g.lineBetween(-12, 0, 10, 0);
  g.lineStyle(BODY_W, CORPSE_COLOR, 0.7);
  g.lineBetween(-6, 0, -12, 8);
  g.lineBetween(-6, 0, -2, 9);
  g.fillStyle(CORPSE_COLOR, 0.8);
  g.fillCircle(12, -1, 5.5);
  g.lineStyle(1, 0x555555, 0.5);
  g.strokeCircle(12, -1, 5.5);
  g.lineStyle(1.2, 0x555555, 0.7);
  g.lineBetween(10, -3, 14, 1);
  g.lineBetween(14, -3, 10, 1);
  g.lineStyle(BODY_W - 0.3, CORPSE_COLOR, 0.6);
  g.lineBetween(4, 0, 10, 8);
  g.lineBetween(2, 0, -4, 7);
}

/**
 * 检测 attackTimer 从低被重置为高（即刚开火）→ 触发对应动作。
 * 由 BattleScene 在 sync 时调用。
 */
export function maybeTriggerAttackAnim(
  view: Phaser.GameObjects.Container,
  unit: Unit
): void {
  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body || !unit.alive) return;

  // attackTimer 刚从 ≤0.05 跳回到 ≥interval*0.9 → 视为开火
  const justFired = anim.prevAttackTimer <= 0.05 && unit.attackTimer >= unit.attackInterval * 0.9;
  anim.prevAttackTimer = unit.attackTimer;
  if (!justFired) return;

  switch (anim.kind) {
    case 'sword':      playSlashAnim(body); break;
    case 'shield':     playBashAnim(body); break;
    case 'archer':     playBowAnim(body); break;
    case 'javelin':    playJavelinAnim(body); break;
    case 'bomb':       playBombThrowAnim(body); break;
    case 'medic':      playMedicAnim(body);      break;
    case 'artillery':  playArtilleryAnim(body);  break;
  }
}

/** 剑兵挥砍：更快出手、更利落收势（缩短总时长，强化快攻节奏） */
function playSlashAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    rotation: { from: -0.2, to: 0.6 },
    y: 0,
    duration: 90,
    yoyo: true,
    ease: 'Cubic.easeOut',
  });
}

/** 盾兵盾撞：后退蓄力 0.2s → 急速前冲 0.2s → 归位 0.25s。总 0.65s。 */
function playBashAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：后退蓄力（-8px）
  body.scene.tweens.add({
    targets: body,
    x: -8,
    y: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
  });
  // 段 2：急速前冲（绝对位置 +12px，相对蓄力位置共 20px 急冲）
  body.scene.tweens.add({
    targets: body,
    x: 12,
    y: 0,
    duration: 200,
    ease: 'Cubic.easeIn',
    delay: 200,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    x: 0,
    y: 0,
    duration: 250,
    ease: 'Sine.easeOut',
    delay: 400,
  });
}

/** 弓兵射箭：蓄势 150ms（后仰）→ 出手 150ms（前甩 + 出手爆闪）→ 回正 150ms */
function playBowAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄势（后仰 ≈14°、轻微下压）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.25,
    y: -2,
    duration: 150,
    ease: 'Cubic.easeOut',
  });
  // 段 2：出手（快速前甩到 ≈-9°），同步触发出手爆闪
  body.scene.tweens.add({
    targets: body,
    rotation: -0.15,
    y: 0,
    duration: 150,
    ease: 'Cubic.easeIn',
    delay: 150,
    onStart: () => {
      // 出手爆闪：黄色光点叠层，150ms 淡出（不作为独立 CombatEvent，不占 EffectBudget）
      const flash = body.scene.add.graphics();
      flash.fillStyle(0xfff176, 0.6);
      flash.fillCircle(0, -10, 8);
      body.add(flash);
      body.scene.tweens.add({
        targets: flash,
        alpha: { from: 0.6, to: 0 },
        duration: 150,
        onComplete: () => flash.destroy(),
      });
    },
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 150,
    ease: 'Sine.easeOut',
    delay: 300,
  });
}

/** 投矛三段式：蓄力 0.3s（后仰）→ 出手 0.15s（前甩）→ 归零 0.2s */
function playJavelinAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄力（身体后仰 ≈23°、轻微下压）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.4,
    y: -2,
    duration: 300,
    ease: 'Cubic.easeOut',
  });
  // 段 2：出手（快速前甩到 -14°）
  body.scene.tweens.add({
    targets: body,
    rotation: -0.25,
    y: 0,
    duration: 150,
    ease: 'Cubic.easeIn',
    delay: 300,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 200,
    ease: 'Sine.easeOut',
    delay: 450,
  });
}

/** 炸弹投掷：举高蓄力 0.25s → 投出 0.18s → 归零 0.2s */
function playBombThrowAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({ targets: body, rotation: 0.3, y: -3, duration: 250, ease: 'Cubic.easeOut' });
  body.scene.tweens.add({ targets: body, rotation: -0.2, y: 0, duration: 180, ease: 'Cubic.easeIn', delay: 250 });
  body.scene.tweens.add({ targets: body, rotation: 0, y: 0, duration: 200, ease: 'Sine.easeOut', delay: 430 });
}

/** 医疗投掷：举高 0.25s → 投出 0.15s → 归零 0.2s */
function playMedicAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({ targets: body, rotation: 0.2, y: -2, duration: 250, ease: 'Cubic.easeOut' });
  body.scene.tweens.add({ targets: body, rotation: -0.15, y: 0, duration: 150, ease: 'Cubic.easeIn', delay: 250 });
  body.scene.tweens.add({ targets: body, rotation: 0, y: 0, duration: 200, ease: 'Sine.easeOut', delay: 400 });
}

/**
 * 受击闪白：覆盖一层白色 graphics 0.15s 淡出 + body 抖动。
 */
export function triggerHitFlash(view: Phaser.GameObjects.Container): void {
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!body) return;

  const flash = body.scene.add.graphics();
  flash.fillStyle(0xffffff, 0.7);
  flash.fillCircle(0, -10, 14);  // 覆盖头+身体范围
  body.add(flash);

  body.scene.tweens.add({
    targets: flash,
    alpha: { from: 0.7, to: 0 },
    duration: 150,
    onComplete: () => flash.destroy(),
  });

  body.scene.tweens.add({
    targets: body,
    x: { from: -2, to: 2 },
    duration: 60,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });
}

/** 火炮后坐力：更重的后坐 + 更明显回弹（强化重炮重量感） */
function playArtilleryAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：重后坐（更深 + 轻微下沉）
  body.scene.tweens.add({ targets: body, x: -9, y: 2, duration: 130, ease: 'Cubic.easeOut' });
  // 段 2：缓慢前倾回弹
  body.scene.tweens.add({ targets: body, x: 5, y: -1, duration: 240, ease: 'Cubic.easeIn', delay: 130 });
  // 段 3：归零
  body.scene.tweens.add({ targets: body, x: 0, y: 0, duration: 200, ease: 'Sine.easeOut', delay: 370 });
}
