import { FACTION_COLORS } from '../config/colors';
const KIND_ACCENT = {
    sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65,
};
export function drawCamp(scene, camp) {
    const color = FACTION_COLORS[camp.faction];
    const accent = KIND_ACCENT[camp.kind];
    const g = scene.add.graphics();
    switch (camp.kind) {
        case 'sword':
            drawSwordCamp(g, color, accent);
            break;
        case 'shield':
            drawShieldCamp(g, color, accent);
            break;
        case 'archer':
            drawArcherCamp(g, color, accent);
            break;
        case 'javelin':
            drawJavelinCamp(g, color, accent);
            break;
    }
    return scene.add.container(camp.x, camp.y, [g]);
}
/** 剑营：宽方堡（76x44） + 4 城垛 + 顶部交叉双剑 */
function drawSwordCamp(g, color, accent) {
    // 落影
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 42, 92, 26);
    // 主体（宽）
    g.fillStyle(color, 1);
    g.fillRoundedRect(-38, -14, 76, 44, 4);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(-38, -14, 76, 44, 4);
    // 4 城垛
    for (let i = 0; i < 4; i++) {
        const bx = -34 + i * 18;
        g.fillStyle(color, 1);
        g.fillRoundedRect(bx, -32, 12, 18, 2);
        g.lineStyle(2, 0x000000, 0.25);
        g.strokeRoundedRect(bx, -32, 12, 18, 2);
    }
    // 装饰条
    g.fillStyle(accent, 0.7);
    g.fillRect(-36, 8, 72, 6);
    // 门洞
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-9, 2, 18, 28, 3);
    g.lineStyle(2, accent, 0.6);
    g.strokeRoundedRect(-9, 2, 18, 28, 3);
    // 交叉双剑顶饰（堡顶上方 -50）
    g.lineStyle(3, accent, 1);
    g.lineBetween(-12, -58, 12, -42);
    g.lineBetween(-12, -42, 12, -58);
    g.fillStyle(0xfff176, 1);
    g.fillCircle(0, -50, 3);
}
/** 盾营：矮胖弧顶（84x38, 圆角 14） + 4 圆弧城垛 + 正面圆盾徽 */
function drawShieldCamp(g, color, accent) {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 44, 100, 28);
    // 主体（矮胖大圆角）
    g.fillStyle(color, 1);
    g.fillRoundedRect(-42, -6, 84, 38, 14);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(-42, -6, 84, 38, 14);
    // 4 圆弧城垛（三角近似拱形）
    for (let i = 0; i < 4; i++) {
        const cx = -30 + i * 20;
        g.fillStyle(color, 1);
        g.fillTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
        g.lineStyle(2, 0x000000, 0.25);
        g.strokeTriangle(cx - 8, -6, cx + 8, -6, cx, -22);
    }
    // 装饰条
    g.fillStyle(accent, 0.7);
    g.fillRect(-40, 10, 80, 6);
    // 门洞（拱形）
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-9, 4, 18, 28, 9);
    g.lineStyle(2, accent, 0.6);
    g.strokeRoundedRect(-9, 4, 18, 28, 9);
    // 圆盾徽（正面顶端）
    g.fillStyle(0xb0bec5, 1);
    g.fillCircle(0, -32, 10);
    g.lineStyle(2, 0x78909c, 0.8);
    g.strokeCircle(0, -32, 10);
    g.fillStyle(0xcfd8dc, 0.9);
    g.fillCircle(0, -32, 4);
}
/** 弓营：高瘦尖塔（44x62） + 三角顶 + 窄箭口 + 顶部箭羽饰 */
function drawArcherCamp(g, color, accent) {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 44, 64, 22);
    // 主体（高瘦）
    g.fillStyle(color, 1);
    g.fillRoundedRect(-22, -30, 44, 62, 3);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(-22, -30, 44, 62, 3);
    // 三角尖顶
    g.fillStyle(color, 1);
    g.fillTriangle(-22, -30, 22, -30, 0, -58);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeTriangle(-22, -30, 22, -30, 0, -58);
    // 装饰条
    g.fillStyle(accent, 0.8);
    g.fillRect(-20, 8, 40, 5);
    // 窄箭口
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(-3, -20, 6, 14, 1);
    // 门洞（窄）
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-7, 6, 14, 26, 2);
    g.lineStyle(2, accent, 0.6);
    g.strokeRoundedRect(-7, 6, 14, 26, 2);
    // 顶部箭羽饰
    g.lineStyle(2, 0x5d4037, 1);
    g.lineBetween(0, -72, 0, -58);
    g.fillStyle(accent, 1);
    g.fillTriangle(0, -74, -5, -68, 5, -68);
    g.lineStyle(1, 0xffffff, 1);
    g.lineBetween(-3, -70, 3, -70);
}
/** 投矛营：斜顶塔（60x50 主体 + 梯形顶） + 斜纹装饰 + 三叉戟顶饰 */
function drawJavelinCamp(g, color, accent) {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 44, 80, 24);
    // 主体
    g.fillStyle(color, 1);
    g.fillRoundedRect(-30, -18, 60, 50, 3);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokeRoundedRect(-30, -18, 60, 50, 3);
    // 斜顶（梯形）
    const roof = [
        { x: -30, y: -18 },
        { x: 30, y: -18 },
        { x: 22, y: -38 },
        { x: -22, y: -38 },
    ];
    g.fillStyle(color, 1);
    g.fillPoints(roof, true);
    g.lineStyle(2, 0x000000, 0.25);
    g.strokePoints(roof, true);
    // 4 道斜纹
    g.lineStyle(3, accent, 0.8);
    for (let i = 0; i < 4; i++) {
        const sx = -26 + i * 14;
        g.lineBetween(sx, 6, sx + 8, 14);
    }
    // 门洞
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-9, 4, 18, 28, 3);
    g.lineStyle(2, accent, 0.6);
    g.strokeRoundedRect(-9, 4, 18, 28, 3);
    // 三叉戟顶饰
    g.lineStyle(2, 0x5d4037, 1);
    g.lineBetween(0, -50, 0, -38);
    g.lineStyle(2.5, accent, 1);
    g.lineBetween(-7, -56, -7, -48);
    g.lineBetween(0, -59, 0, -48);
    g.lineBetween(7, -56, 7, -48);
    g.lineStyle(2, accent, 1);
    g.lineBetween(-9, -48, 9, -48);
}
