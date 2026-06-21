import { describe, it, expect } from 'vitest';
import { updateProjectileView } from '../src/game/projectileRenderer';
import type { Projectile } from '../src/game/types';
import type Phaser from 'phaser';

/**
 * 投射物尾迹性能回归测试：
 * 验证 updateProjectileView 在多帧推进时不再创建新的 scene-level graphics 对象
 * （历史 Bug：maybeEmitTrail 每 45-110ms 用 scene.add.graphics() 分配一个独立图形，
 *  在高密度战斗下产生数百~数千对象/秒的 GC 压力，最终导致画面卡死）。
 *
 * 修复后：尾迹复用投射物自身的持久子 graphics，update 阶段 0 次 scene 分配。
 */
function makeMockScene(): { scene: Partial<Phaser.Scene>; addGraphicsCalls: number } {
  let addGraphicsCalls = 0;
  // 单个 graphics mock：所有绘制方法 chain 返回 self
  const graphicsMock = () => {
    const g: any = {
      fillStyle() { return g; }, fillCircle() { return g; }, fillRect() { return g; },
      fillTriangle() { return g; }, fillEllipse() { return g; }, fillPoints() { return g; },
      lineStyle() { return g; }, lineBetween() { return g; }, strokePath() { return g; },
      strokeCircle() { return g; }, strokeRect() { return g; }, strokeRoundedRect() { return g; },
      strokeTriangle() { return g; }, strokePoints() { return g; }, beginPath() { return g; },
      moveTo() { return g; }, lineTo() { return g; }, closePath() { return g; },
      fillPath() { return g; }, strokePath2() { return g; },
      setPosition() { return g; }, setDepth() { return g; }, setRotation() { return g; },
      setScale() { return g; }, setAlpha() { return g; }, clear() { return g; }, destroy() {},
    };
    return g;
  };
  const scene: Partial<Phaser.Scene> = {
    add: {
      graphics: () => { addGraphicsCalls++; return graphicsMock(); },
      container: (_x: number, _y: number, _children?: unknown) => {
        const c: any = {
          _d: new Map<string, unknown>(),
          getData(k: string) { return c._d.get(k); },
          setData(k: string, v: unknown) { c._d.set(k, v); return c; },
          setPosition() { return c; }, add() {}, setDepth() { return c; },
        };
        return c;
      },
      ellipse: () => ({ setSize() { return this; }, setScale() { return this; }, setAlpha() { return this; }, setPosition() { return this; } }),
      text: () => ({ setOrigin() { return this; }, setScale() { return this; } }),
      circle: () => ({ setStrokeStyle() { return this; }, setOrigin() { return this; } }),
      rectangle: () => ({ setOrigin() { return this; } }),
    } as any,
    tweens: { add: (_cfg: unknown) => {} } as any,
  };
  return { scene, addGraphicsCalls };
}

describe('projectileRenderer trail allocation', () => {
  it('单投射物 update 阶段推进 200 帧：scene.add.graphics 调用 0 次（持久子 graphics）', () => {
    const { scene, addGraphicsCalls } = makeMockScene();
    const view: any = {
      scene: scene as Phaser.Scene,
      _d: new Map<string, unknown>(),
      getData(k: string) { return this._d.get(k); },
      setData(k: string, v: unknown) { this._d.set(k, v); return this; },
      setPosition() { return this; }, add() {},
    };
    // 模拟 trail 子 graphics 已存在（drawProjectile 阶段已分配一次）
    const trail = (scene.add as any).graphics();
    view.setData('trail', trail);
    view.setData('trailHistory', []);
    view.setData('trailKind', 'arrow');

    const p: Projectile = {
      id: 'p1', kind: 'arrow', x: 0, y: 0, targetId: 't', speed: 200,
      damage: 8, faction: 'red', elapsed: 0, maxTime: 2,
    };
    const initial = addGraphicsCalls;  // 应为 1（trail 那一次）
    for (let i = 0; i < 200; i++) {
      p.x += 1;
      updateProjectileView(view as any, p);
    }
    // update 阶段不应再分配任何 scene-level graphics
    expect(addGraphicsCalls - initial).toBe(0);
  });

  it('多帧推进下 trailHistory 被裁剪到 maxPoints，不会无界增长', () => {
    const { scene } = makeMockScene();
    const view: any = {
      scene: scene as Phaser.Scene,
      _d: new Map<string, unknown>(),
      getData(k: string) { return this._d.get(k); },
      setData(k: string, v: unknown) { this._d.set(k, v); return this; },
      setPosition() { return this; }, add() {},
    };
    view.setData('trail', (scene.add as any).graphics());
    view.setData('trailHistory', []);
    view.setData('trailKind', 'arrow');

    const p: Projectile = {
      id: 'p1', kind: 'arrow', x: 0, y: 0, targetId: 't', speed: 200,
      damage: 8, faction: 'red', elapsed: 0, maxTime: 2,
    };
    for (let i = 0; i < 1000; i++) {
      p.x += 1;
      updateProjectileView(view as any, p);
    }
    const hist = view.getData('trailHistory') as unknown[];
    // arrow maxPoints=5，1000 帧后历史长度不超 5
    expect(hist.length).toBeLessThanOrEqual(5);
  });
});
