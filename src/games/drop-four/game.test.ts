import { describe, expect, it } from 'vitest';
import {
  Board,
  GameState,
  Player,
  PLAYER_ONE,
  PLAYER_TWO,
  checkWinner,
  cloneBoard,
  createEmptyBoard,
  createGameState,
  getWinningLine,
  playColumn,
} from './game';

describe('Drop Four rules', () => {
  it('creates a 9x9 empty board', () => {
    const state = createGameState();

    expect(state.board).toHaveLength(9);
    expect(state.board.every((row) => row.length === 9)).toBe(true);
    expect(state.board.flat().every((cell) => cell === null)).toBe(true);
    expect(state.currentPlayer).toBe(PLAYER_ONE);
  });

  it('drops a piece to the lowest open row and switches turns', () => {
    const result = playColumn(createGameState(), 3);

    expect(result.accepted).toBe(true);
    expect(result.move).toEqual({ row: 8, column: 3, player: PLAYER_ONE });
    expect(result.state.board[8][3]).toBe(PLAYER_ONE);
    expect(result.state.currentPlayer).toBe(PLAYER_TWO);
  });

  it('rejects a full column without changing the board or current player', () => {
    const board = createEmptyBoard();
    for (let row = 0; row < 9; row += 1) {
      board[row][0] = row % 2 === 0 ? PLAYER_ONE : PLAYER_TWO;
    }
    const state = stateWithBoard(board, PLAYER_TWO);
    const originalBoard = cloneBoard(board);

    const result = playColumn(state, 0);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('column-full');
    expect(result.state.board).toEqual(originalBoard);
    expect(result.state.currentPlayer).toBe(PLAYER_TWO);
    expect(result.state.message).toContain('Column 1 is full');
  });

  it('detects a horizontal four after the last move', () => {
    const board = createEmptyBoard();
    for (let column = 0; column < 3; column += 1) {
      board[8][column] = PLAYER_ONE;
    }

    const result = playColumn(stateWithBoard(board, PLAYER_ONE), 3);

    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(PLAYER_ONE);
    expect(result.state.winningLine).toEqual([
      { row: 8, column: 0 },
      { row: 8, column: 1 },
      { row: 8, column: 2 },
      { row: 8, column: 3 },
    ]);
  });

  it('detects a vertical four after the last move', () => {
    const board = createEmptyBoard();
    for (let row = 6; row < 9; row += 1) {
      board[row][0] = PLAYER_ONE;
    }

    const result = playColumn(stateWithBoard(board, PLAYER_ONE), 0);

    expect(result.move?.row).toBe(5);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(PLAYER_ONE);
    expect(result.state.winningLine).toHaveLength(4);
  });

  it('detects a left-top to right-bottom diagonal four', () => {
    const board = createEmptyBoard();
    board[8][0] = PLAYER_ONE;
    board[7][1] = PLAYER_ONE;
    board[6][2] = PLAYER_ONE;
    fillColumnSupport(board, 3);

    const result = playColumn(stateWithBoard(board, PLAYER_ONE), 3);

    expect(result.move?.row).toBe(5);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(PLAYER_ONE);
  });

  it('detects a right-top to left-bottom diagonal four', () => {
    const board = createEmptyBoard();
    board[8][8] = PLAYER_ONE;
    board[7][7] = PLAYER_ONE;
    board[6][6] = PLAYER_ONE;
    fillColumnSupport(board, 5);

    const result = playColumn(stateWithBoard(board, PLAYER_ONE), 5);

    expect(result.move?.row).toBe(5);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(PLAYER_ONE);
  });

  it('detects a pure draw when the full board has no four in a row', () => {
    const board = makeNoFourFullBoard();
    const finalPlayer = board[0][8]!;
    board[0][8] = null;

    const result = playColumn(stateWithBoard(board, finalPlayer), 8);

    expect(result.accepted).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.winner).toBeNull();
    expect(result.state.winningLine).toEqual([]);
    expect(result.state.board.flat().every(Boolean)).toBe(true);
  });

  it('prioritizes victory over draw on the final move', () => {
    const board = makeNoFourFullBoard();
    for (let column = 0; column < 3; column += 1) {
      board[0][column] = PLAYER_ONE;
    }
    board[0][3] = null;

    const result = playColumn(stateWithBoard(board, PLAYER_ONE), 3);

    expect(result.accepted).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.winner).toBe(PLAYER_ONE);
  });

  it('only checks wins around the last move', () => {
    const board = createEmptyBoard();
    board[3][2] = PLAYER_TWO;
    board[4][3] = PLAYER_TWO;
    board[5][4] = PLAYER_TWO;
    board[6][5] = PLAYER_TWO;

    expect(checkWinner(board, 8, 8)).toBeNull();
    expect(checkWinner(board, 5, 4)).toBe(PLAYER_TWO);
    expect(getWinningLine(board, 5, 4)).toEqual([
      { row: 3, column: 2 },
      { row: 4, column: 3 },
      { row: 5, column: 4 },
      { row: 6, column: 5 },
    ]);
  });
});

function stateWithBoard(board: Board, currentPlayer: Player = PLAYER_ONE): GameState {
  return {
    board,
    currentPlayer,
    status: 'playing',
    winner: null,
    winningLine: [],
    lastMove: null,
    message: null,
  };
}

function fillColumnSupport(board: Board, column: number) {
  for (let row = 6; row < 9; row += 1) {
    board[row][column] = PLAYER_TWO;
  }
}

function makeNoFourFullBoard(): Board {
  return Array.from({ length: 9 }, (_, row) =>
    Array.from({ length: 9 }, (_, column) =>
      ((row + Math.floor(column / 2)) % 2 === 0
        ? PLAYER_ONE
        : PLAYER_TWO) satisfies Player,
    ),
  );
}
