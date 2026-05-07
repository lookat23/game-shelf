import { useEffect, useRef } from 'react';
import { startTankBattle } from './tankBattleEngine';

interface TankBattleGameProps {
  onBackHome: () => void;
}

export default function TankBattleGame({ onBackHome }: TankBattleGameProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const muteButtonRef = useRef<HTMLButtonElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const canvas = canvasRef.current;
    const statusText = statusRef.current;
    const muteButton = muteButtonRef.current;
    const controls = controlsRef.current;

    if (!panel || !canvas || !statusText || !muteButton || !controls) {
      return undefined;
    }

    return startTankBattle({
      panel,
      canvas,
      statusText,
      muteButton,
      touchButtons: Array.from(controls.querySelectorAll<HTMLButtonElement>('[data-action]')),
    });
  }, []);

  return (
    <main className="tank-battle-shell">
      <section className="tank-game-hero" aria-labelledby="tank-game-title">
        <button className="ghost-button" type="button" onClick={onBackHome}>
          返回游戏架
        </button>
        <p className="shelf-eyebrow">坦克大战</p>
        <h1 id="tank-game-title">Tank Battle</h1>
        <p className="game-intro">
          10 关 Canvas 坦克战。守住总部，清掉每关敌人，随机砖墙会改变每局路线。
        </p>
      </section>

      <section className="tank-game-panel" aria-label="Tank Battle game" ref={panelRef}>
        <div className="tank-hud">
          <div>
            <strong>Tank Battle</strong>
            <span id="statusText" ref={statusRef} role="status" aria-live="polite">
              Loading...
            </span>
          </div>
          <div className="tank-hud-actions">
            <button
              className="tank-mute-button"
              id="muteButton"
              type="button"
              aria-pressed="false"
              ref={muteButtonRef}
            >
              Sound On
            </button>
            <span>Keyboard: arrows/WASD, Space, R</span>
          </div>
        </div>

        <canvas
          className="tank-canvas"
          id="game"
          width="640"
          height="576"
          aria-label="Tank Battle playfield"
          data-testid="tank-canvas"
          ref={canvasRef}
        />

        <div className="tank-touch-controls" data-testid="tank-controls" ref={controlsRef}>
          <div className="tank-dpad" aria-label="Movement controls">
            <button
              className="tank-touch-button tank-dpad-up"
              type="button"
              data-action="up"
              aria-label="Move up"
            >
              UP
            </button>
            <button
              className="tank-touch-button tank-dpad-left"
              type="button"
              data-action="left"
              aria-label="Move left"
            >
              LEFT
            </button>
            <button
              className="tank-touch-button tank-dpad-right"
              type="button"
              data-action="right"
              aria-label="Move right"
            >
              RIGHT
            </button>
            <button
              className="tank-touch-button tank-dpad-down"
              type="button"
              data-action="down"
              aria-label="Move down"
            >
              DOWN
            </button>
          </div>

          <div className="tank-action-pad" aria-label="Action controls">
            <button
              className="tank-touch-button tank-fire-button"
              type="button"
              data-action="fire"
              aria-label="Fire"
            >
              FIRE
            </button>
            <button
              className="tank-touch-button tank-reset-button"
              type="button"
              data-action="restart"
              aria-label="Restart current level"
            >
              RST
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
