import type { CampKind, CampRoleDef } from '../game/types';

/**
 * 军营角色元数据。bestAgainst/weakAgainst 也供规则型 AI 决策使用；
 * 其余角色文案主要用于 UI/设计表达，不进入战斗模拟。
 * 每个军营定义一句话定位、战场职责、克制关系、层级标签。
 */
export const CAMP_ROLE_DEFS: Record<CampKind, CampRoleDef> = {
  sword: {
    slogan: '基础推进线，数量压境冲散后排',
    role: 'frontline',
    strengths: ['成型快', '数量压力高', '适合铺线推进'],
    weaknesses: ['怕爆破清团', '怕重装拖线'],
    bestAgainst: ['archer', 'javelin', 'bomb', 'artillery'],
    weakAgainst: ['shield', 'bomb'],
    tier: 1,
  },
  shield: {
    slogan: '前排肉盾，承伤推进',
    role: 'tank',
    strengths: ['生命高', '稳定承伤', '抗压推进'],
    weaknesses: ['怕爆破 AOE', '怕火炮攻城'],
    bestAgainst: ['archer', 'sword'],
    weakAgainst: ['bomb', 'artillery'],
    tier: 1,
  },
  archer: {
    slogan: '通用后排，持续输出',
    role: 'sustain-ranged',
    strengths: ['泛用性高', '持续伤害稳定', '输出距离适中'],
    weaknesses: ['怕贴身', '怕投矛点杀'],
    bestAgainst: ['sword', 'shield'],
    weakAgainst: ['javelin', 'sword'],
    tier: 1,
  },
  javelin: {
    slogan: '斩首投矛，高单发点杀后排',
    role: 'assassin-ranged',
    strengths: ['单发伤害高', '优先点杀高价值目标', '克制医疗/火炮'],
    weaknesses: ['攻速慢', '怕剑兵冲脸'],
    bestAgainst: ['medic', 'artillery', 'shield'],
    weakAgainst: ['sword', 'archer'],
    tier: 2,
  },
  bomb: {
    slogan: '反密集爆破，专治人堆',
    role: 'aoe-ranged',
    strengths: ['AOE 范围伤害', '克制密集阵型', '克制盾兵集团'],
    weaknesses: ['攻速慢', '数量上限低', '怕分散队形'],
    bestAgainst: ['shield', 'sword'],
    weakAgainst: ['javelin', 'sword'],
    tier: 2,
  },
  medic: {
    slogan: '纯治疗支援，延长前线续航',
    role: 'support',
    strengths: ['治疗友军', '延长前线寿命', '适合消耗战'],
    weaknesses: ['自身无攻击', '怕投矛点杀', '怕火炮炸团'],
    bestAgainst: [],
    weakAgainst: ['javelin', 'artillery'],
    tier: 3,
  },
  artillery: {
    slogan: '远射程火炮，专攻营地和集群',
    role: 'siege',
    strengths: ['射程最远', '对营地加倍伤害', '溅射打击后排'],
    weaknesses: ['攻速最慢', '数量上限最低', '近身脆弱'],
    bestAgainst: ['archer', 'medic', 'bomb'],
    weakAgainst: ['sword', 'javelin'],
    tier: 3,
  },
};

export const ROLE_LABEL: Record<CampRoleDef['role'], string> = {
  'frontline': '前排推进',
  'tank': '前排坦克',
  'sustain-ranged': '持续远程',
  'assassin-ranged': '点杀远程',
  'aoe-ranged': '范围远程',
  'support': '治疗支援',
  'siege': '攻城远程',
};

export const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: '基础营',
  2: '战术营',
  3: '特殊营',
};
