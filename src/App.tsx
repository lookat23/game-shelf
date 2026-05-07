import { useEffect, useState } from 'react';
import DropFourGame from './games/drop-four/DropFourGame';
import TankBattleGame from './games/tank-battle/TankBattleGame';
import { games, getGameByPath } from './games/registry';

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const game = getGameByPath(pathname);

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (game?.slug === 'drop-four') {
    return <DropFourGame onBackHome={() => navigateTo('/')} />;
  }

  if (game?.slug === 'tank-battle') {
    return <TankBattleGame onBackHome={() => navigateTo('/')} />;
  }

  if (pathname !== '/') {
    return <NotFound />;
  }

  return <Home />;
}

function Home() {
  return (
    <main className="shelf-shell">
      <section className="shelf-hero" aria-labelledby="shelf-title">
        <p className="shelf-eyebrow">Game Shelf</p>
        <h1 id="shelf-title">小游戏架</h1>
        <p className="shelf-intro">
          这里会持续放入我做的小游戏。先从一局清爽的四子棋开始。
        </p>
      </section>

      <section className="game-grid" aria-label="小游戏列表">
        {games.map((game) => (
          <article className="game-card" key={game.slug}>
            <span className="game-card-status">Playable</span>
            <h2>{game.title}</h2>
            <p className="game-card-title">{game.englishTitle}</p>
            <p>{game.description}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => navigateTo(game.path)}
            >
              开始游戏
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main className="not-found-shell">
      <section className="not-found-card" aria-labelledby="not-found-title">
        <p className="shelf-eyebrow">404</p>
        <h1 id="not-found-title">这里还没有小游戏</h1>
        <p>当前路径没有对应的游戏。回到首页，从游戏列表进入。</p>
        <button className="primary-button" type="button" onClick={() => navigateTo('/')}>
          返回首页
        </button>
      </section>
    </main>
  );
}

function navigateTo(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
