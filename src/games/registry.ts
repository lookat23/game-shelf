export interface GameListing {
  slug: string;
  title: string;
  englishTitle: string;
  description: string;
  path: string;
  status: 'playable';
}

export const games: GameListing[] = [
  {
    slug: 'drop-four',
    title: '四子棋',
    englishTitle: 'Drop Four',
    description: '选择一列落子，先横向、纵向或斜向连成四枚棋子的一方获胜。',
    path: '/games/drop-four',
    status: 'playable',
  },
];

export function getGameByPath(pathname: string): GameListing | undefined {
  return games.find((game) => game.path === pathname);
}
