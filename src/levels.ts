export type LevelId = 'training' | 'spire';

export interface LevelDefinition {
  id: LevelId;
  name: string;
  subtitle: string;
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'training',
    name: '热身靶场',
    subtitle: '移动与射击训练',
  },
  {
    id: 'spire',
    name: '守护尖塔',
    subtitle: '抵御来袭敌人',
  },
];
