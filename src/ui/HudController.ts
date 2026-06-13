import type { GameState } from '../game/GameState';
import type { UiBridge } from './UiBridge';

export class HudController {
  private el: HTMLDivElement;

  constructor(private bridge: UiBridge, private gs: () => GameState) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.className = 'ui';
    document.body.append(this.el);

    bridge.on('simChanged', () => this.render());
    bridge.on('statsChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const s = this.gs();
    const r = s.stats.red;
    const b = s.stats.blue;
    const speedLabel = s.sim.running ? `${s.sim.speed}x` : '||';
    const time = Math.floor(s.sim.timeMs / 1000);
    const m = Math.floor(time / 60);
    const sec = time % 60;
    this.el.innerHTML = `
      <span class="hud-stat hud-red">
        <span class="hud-faction-dot" style="background:#e53935"></span>
        <span class="hud-label">兵</span>${r.unitsAlive}
        <span class="hud-label">营</span>${r.campsAlive}
        <span class="hud-label">杀</span>${r.kills}
      </span>
      <span class="hud-stat hud-blue">
        <span class="hud-faction-dot" style="background:#1e88e5"></span>
        <span class="hud-label">兵</span>${b.unitsAlive}
        <span class="hud-label">营</span>${b.campsAlive}
        <span class="hud-label">杀</span>${b.kills}
      </span>
      <span class="hud-time">${m}:${sec.toString().padStart(2, '0')}</span>
      <span class="hud-speed">${speedLabel}</span>
    `;
  }
}
