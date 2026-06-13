import type { UiBridge } from './UiBridge';
import type { GameState } from '../game/GameState';

export class ControlBar {
  private root: HTMLDivElement;

  constructor(private bridge: UiBridge, private gs: () => GameState) {
    this.root = document.createElement('div');
    this.root.id = 'control-bar';
    this.root.className = 'ui';
    this.root.innerHTML = `
      <button data-action="toggle-run" title="暂停/播放 (Space)">▶</button>
      <button data-action="speed-1" class="active">1x</button>
      <button data-action="speed-2">2x</button>
      <button data-action="speed-4">4x</button>
      <span class="control-sep"></span>
      <button data-action="clear-units" title="清除小兵">清兵</button>
      <button data-action="clear-all" title="清空战场">清场</button>
      <button data-action="reset-stats" title="重置统计">重置</button>
    `;
    document.body.append(this.root);

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action!;
      const gs = this.gs();
      switch (action) {
        case 'toggle-run':
          this.bridge.setRunning(!gs.sim.running, gs);
          break;
        case 'speed-1': this.bridge.setSpeed(1, gs); break;
        case 'speed-2': this.bridge.setSpeed(2, gs); break;
        case 'speed-4': this.bridge.setSpeed(4, gs); break;
        case 'clear-units': this.bridge.clearUnits(gs); break;
        case 'clear-all': this.bridge.clearAll(gs); break;
        case 'reset-stats': this.bridge.resetStats(gs); break;
      }
    });

    bridge.on('simChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const gs = this.gs();
    const runBtn = this.root.querySelector('[data-action="toggle-run"]')!;
    runBtn.textContent = gs.sim.running ? '⏸' : '▶';

    for (const s of [1, 2, 4] as const) {
      const btn = this.root.querySelector(`[data-action="speed-${s}"]`)!;
      btn.classList.toggle('active', gs.sim.speed === s);
    }
  }
}
