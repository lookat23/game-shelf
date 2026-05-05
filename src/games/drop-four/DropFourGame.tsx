import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import {
  COLUMN_COUNT,
  CONNECT_LENGTH,
  GameState,
  Move,
  Player,
  ROW_COUNT,
  createGameState,
  getPlayerLabel,
  playColumn,
} from './game';

const DROP_ANIMATION_MS = 260;
const FINISH_EFFECT_MS = 1400;

const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index);

interface DropFourGameProps {
  onBackHome: () => void;
}

export default function DropFourGame({ onBackHome }: DropFourGameProps) {
  const [game, setGame] = useState<GameState>(() => createGameState());
  const [animatedMove, setAnimatedMove] = useState<Move | null>(null);
  const [finishEffect, setFinishEffect] = useState<GameState['status'] | null>(null);
  const [inputLocked, setInputLocked] = useState(false);
  const timerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  function handleColumnClick(column: number) {
    if (lockRef.current) {
      return;
    }

    const result = playColumn(game, column);
    setGame(result.state);

    if (!result.accepted || result.move === null) {
      return;
    }

    lockRef.current = true;
    setInputLocked(true);
    setAnimatedMove(result.move);
    setFinishEffect(null);
    playDropSound(audioContextRef);

    timerRef.current = window.setTimeout(() => {
      lockRef.current = false;
      setInputLocked(false);
      setAnimatedMove(null);
      timerRef.current = null;

      if (result.state.status !== 'playing') {
        setFinishEffect(result.state.status);
        playFinishSound(audioContextRef, result.state.status, result.move?.player);
        finishTimerRef.current = window.setTimeout(() => {
          setFinishEffect(null);
          finishTimerRef.current = null;
        }, FINISH_EFFECT_MS);
      }
    }, DROP_ANIMATION_MS);
  }

  function handleRestart() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    lockRef.current = false;
    setInputLocked(false);
    setAnimatedMove(null);
    setFinishEffect(null);
    setGame(createGameState());
  }

  const statusText = getStatusText(game, inputLocked);
  const boardLocked = inputLocked || game.status !== 'playing';
  const winningCells = new Set(
    game.winningLine.map(({ row, column }) => `${row}-${column}`),
  );
  const hasFinalBanner = game.status === 'won' || game.status === 'draw';

  return (
    <main className="drop-four-shell">
      <section className="game-hero" aria-labelledby="game-title">
        <button className="ghost-button" type="button" onClick={onBackHome}>
          返回游戏架
        </button>
        <p className="shelf-eyebrow">四子棋</p>
        <h1 id="game-title">Drop Four</h1>
        <p className="game-intro">
          选择一列落子。棋子会落到该列最低空位。先连成 {CONNECT_LENGTH}{' '}
          枚的一方获胜。
        </p>
      </section>

      <section className="game-panel" aria-label="Drop Four game">
        <div className="score-strip">
          <div className="player-card player-one-card">
            <span className="disc-sample" aria-hidden="true" />
            <span>Player 1</span>
          </div>
          <div className="turn-card">
            <span className="turn-label">Status</span>
            <strong role="status">{statusText}</strong>
          </div>
          <div className="player-card player-two-card">
            <span className="disc-sample" aria-hidden="true" />
            <span>Player 2</span>
          </div>
        </div>

        <p className="feedback" data-testid="feedback" aria-live="polite">
          {game.message ?? 'Pick any open column to make the next move.'}
        </p>

        <div
          className={`board-frame ${boardLocked ? 'is-locked' : ''} ${
            animatedMove ? 'is-settling' : ''
          } ${game.status === 'won' ? 'is-winning' : ''} ${
            finishEffect ? `finish-${finishEffect}` : ''
          }`}
          role="grid"
          aria-label="Drop Four board"
          data-testid="board"
          style={{ '--column-count': COLUMN_COUNT } as CSSProperties}
        >
          {columns.map((column) => (
            <button
              className="board-column"
              type="button"
              aria-label={`Drop in column ${column + 1}`}
              aria-disabled={boardLocked}
              key={column}
              onClick={() => handleColumnClick(column)}
            >
              {Array.from({ length: ROW_COUNT }, (_, row) => {
                const cell = game.board[row][column];
                const isAnimated =
                  animatedMove?.row === row && animatedMove.column === column;
                const isLastMove =
                  game.lastMove?.row === row && game.lastMove.column === column;
                const isWinningCell = winningCells.has(`${row}-${column}`);

                return (
                  <span
                    className={`cell ${cell ? `has-${cell}` : ''} ${
                      isLastMove ? 'is-last-move' : ''
                    } ${isWinningCell ? 'is-winning-cell' : ''}`}
                    data-testid={`cell-${row}-${column}`}
                    data-state={cell ?? 'empty'}
                    data-winning={isWinningCell ? 'true' : 'false'}
                    role="gridcell"
                    aria-label={`Row ${row + 1}, column ${column + 1}: ${
                      cell ? getPlayerLabel(cell) : 'empty'
                    }`}
                    key={`${row}-${column}`}
                  >
                    {cell ? (
                      <span
                        className={`piece ${cell} ${
                          isAnimated ? 'is-dropping' : ''
                        }`}
                        style={
                          isAnimated
                            ? ({
                                '--drop-depth': row + 1,
                              } as CSSProperties)
                            : undefined
                        }
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                );
              })}
            </button>
          ))}
        </div>

        {hasFinalBanner ? (
          <div
            className={`final-banner ${game.status}`}
            aria-live="assertive"
            data-testid="final-banner"
          >
            <span className="final-kicker">
              {game.status === 'won' ? 'Match point' : 'Board sealed'}
            </span>
            <strong>
              {game.status === 'won' && game.winner
                ? `${getPlayerLabel(game.winner)} wins`
                : 'Draw game'}
            </strong>
            <span>
              {game.status === 'won'
                ? `The winning ${CONNECT_LENGTH} are lit on the board.`
                : `No ${CONNECT_LENGTH}-in-a-row remained after the final drop.`}
            </span>
          </div>
        ) : null}

        <div className="actions">
          <button className="restart-button" type="button" onClick={handleRestart}>
            Restart game
          </button>
        </div>
      </section>
    </main>
  );
}

function getStatusText(game: GameState, inputLocked: boolean): string {
  if (game.status === 'won' && game.winner) {
    return `${getPlayerLabel(game.winner)} wins!`;
  }

  if (game.status === 'draw') {
    return 'Draw game';
  }

  if (inputLocked && game.lastMove) {
    return `Dropping ${getPlayerLabel(game.lastMove.player)} piece...`;
  }

  return `${getPlayerLabel(game.currentPlayer)}'s turn`;
}

function getAudioContext(audioContextRef: MutableRefObject<AudioContext | null>) {
  if (audioContextRef.current) {
    void audioContextRef.current.resume();
    return audioContextRef.current;
  }

  audioContextRef.current = new AudioContext();
  void audioContextRef.current.resume();
  return audioContextRef.current;
}

function playDropSound(audioContextRef: MutableRefObject<AudioContext | null>) {
  const audioContext = getAudioContext(audioContextRef);
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(180, now);
  oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function playFinishSound(
  audioContextRef: MutableRefObject<AudioContext | null>,
  status: GameState['status'],
  player?: Player,
) {
  const audioContext = getAudioContext(audioContextRef);
  const isWin = status === 'won';
  const base = player === 'player-two' ? 392 : 330;
  const notes = isWin ? [base, base * 1.25, base * 1.5, base * 2] : [180, 150, 120];

  notes.forEach((frequency, index) => {
    const start = audioContext.currentTime + index * 0.075;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = isWin ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(isWin ? 0.075 : 0.045, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.28);
  });
}
