export const ROW_COUNT = 9;
export const COLUMN_COUNT = 9;
export const CONNECT_LENGTH = 4;

export const PLAYER_ONE = 'player-one';
export const PLAYER_TWO = 'player-two';

export type Player = typeof PLAYER_ONE | typeof PLAYER_TWO;
export type Cell = Player | null;
export type Board = Cell[][];
export type GameStatus = 'playing' | 'won' | 'draw';
export type MoveRejectReason = 'column-full' | 'game-over' | 'invalid-column';

export interface CellPosition {
  row: number;
  column: number;
}

export interface Move {
  row: number;
  column: number;
  player: Player;
}

export interface GameState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningLine: CellPosition[];
  lastMove: Move | null;
  message: string | null;
}

export interface MoveResult {
  accepted: boolean;
  state: GameState;
  move: Move | null;
  reason?: MoveRejectReason;
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

export function createEmptyBoard(): Board {
  return Array.from({ length: ROW_COUNT }, () =>
    Array.from({ length: COLUMN_COUNT }, () => null),
  );
}

export function createGameState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPlayer: PLAYER_ONE,
    status: 'playing',
    winner: null,
    winningLine: [],
    lastMove: null,
    message: null,
  };
}

export function getPlayerLabel(player: Player): string {
  return player === PLAYER_ONE ? 'Player 1' : 'Player 2';
}

export function getNextPlayer(player: Player): Player {
  return player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function getAvailableRow(board: Board, column: number): number | null {
  if (!Number.isInteger(column) || column < 0 || column >= COLUMN_COUNT) {
    return null;
  }

  for (let row = ROW_COUNT - 1; row >= 0; row -= 1) {
    if (board[row][column] === null) {
      return row;
    }
  }

  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

export function checkWinner(
  board: Board,
  lastRow: number,
  lastColumn: number,
): Player | null {
  const winningLine = getWinningLine(board, lastRow, lastColumn);

  return winningLine.length > 0 ? board[lastRow][lastColumn] : null;
}

export function getWinningLine(
  board: Board,
  lastRow: number,
  lastColumn: number,
): CellPosition[] {
  const player = board[lastRow]?.[lastColumn];

  if (!player) {
    return [];
  }

  for (const [rowDelta, columnDelta] of DIRECTIONS) {
    const line = [
      ...collectDirection(
        board,
        player,
        lastRow,
        lastColumn,
        -rowDelta,
        -columnDelta,
      ).reverse(),
      { row: lastRow, column: lastColumn },
      ...collectDirection(board, player, lastRow, lastColumn, rowDelta, columnDelta),
    ];

    if (line.length >= CONNECT_LENGTH) {
      return line;
    }
  }

  return [];
}

export function playColumn(state: GameState, column: number): MoveResult {
  if (state.status !== 'playing') {
    return {
      accepted: false,
      state: {
        ...state,
        message: 'This game is over. Start a new game to keep playing.',
      },
      move: null,
      reason: 'game-over',
    };
  }

  if (!Number.isInteger(column) || column < 0 || column >= COLUMN_COUNT) {
    return {
      accepted: false,
      state: {
        ...state,
        message: 'Choose a column on the board.',
      },
      move: null,
      reason: 'invalid-column',
    };
  }

  const row = getAvailableRow(state.board, column);

  if (row === null) {
    return {
      accepted: false,
      state: {
        ...state,
        message: `Column ${column + 1} is full. Choose another column.`,
      },
      move: null,
      reason: 'column-full',
    };
  }

  const board = cloneBoard(state.board);
  const player = state.currentPlayer;
  board[row][column] = player;

  const winningLine = getWinningLine(board, row, column);
  const winner = winningLine.length > 0 ? player : null;
  const draw = winner === null && isBoardFull(board);
  const move = { row, column, player };

  return {
    accepted: true,
    state: {
      board,
      currentPlayer: winner || draw ? player : getNextPlayer(player),
      status: winner ? 'won' : draw ? 'draw' : 'playing',
      winner,
      winningLine,
      lastMove: move,
      message: null,
    },
    move,
  };
}

function collectDirection(
  board: Board,
  player: Player,
  startRow: number,
  startColumn: number,
  rowDelta: number,
  columnDelta: number,
): CellPosition[] {
  const positions: CellPosition[] = [];
  let row = startRow + rowDelta;
  let column = startColumn + columnDelta;

  while (
    row >= 0 &&
    row < ROW_COUNT &&
    column >= 0 &&
    column < COLUMN_COUNT &&
    board[row][column] === player
  ) {
    positions.push({ row, column });
    row += rowDelta;
    column += columnDelta;
  }

  return positions;
}
