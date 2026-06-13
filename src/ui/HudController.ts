import type { GameState } from '../game/GameState';
import type { UiBridge } from './UiBridge';

export class HudController {
  private el: HTMLDivElement;

  constructor(private bridge: UiBridge, private gs: () => GameState) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.className = 'ui';
    document.body.append(this.el);

    bridge.on('statsChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const s = this.gs();
    let redTotal = 0, blueTotal = 0, redAlive = 0, blueAlive = 0;
    for (const u of s.units.values()) {
      if (u.faction === 'red') { redTotal++; if (u.alive) redAlive++; }
      else { blueTotal++; if (u.alive) blueAlive++; }
    }
    const total = redTotal + blueTotal;
    let winner = '';
    if (total > 0 && redAlive === 0 && blueAlive > 0) winner = '🔵 蓝方胜';
    else if (total > 0 && blueAlive === 0 && redAlive > 0) winner = '🔴 红方胜';
    else if (total > 0) winner = '⚔️ 战斗中';
    const speedLabel = s.sim.running ? `${s.sim.speed}x` : '⏸';

    this.el.innerHTML = `
      <span class="hud-section">
        <span class="hud-icon">🔴</span>
        <span class="hud-num">${redTotal}</span>
        <span class="hud-sublabel">总</span>
        <span class="hud-num hud-alive">${redAlive}</span>
        <span class="hud-sublabel">活</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section">
        <span class="hud-icon">🔵</span>
        <span class="hud-num">${blueTotal}</span>
        <span class="hud-sublabel">总</span>
        <span class="hud-num hud-alive">${blueAlive}</span>
        <span class="hud-sublabel">活</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section">
        <span class="hud-icon">👥</span>
        <span class="hud-num">${total}</span>
        <span class="hud-sublabel">总计</span>
      </span>
      <span class="hud-winner">${winner}</span>
      <span class="hud-speed">${speedLabel}</span>
    `;
  }
}
