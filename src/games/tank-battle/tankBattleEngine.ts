type Direction = "up" | "down" | "left" | "right";
type TurnSide = "left" | "right";
type Team = "player" | "enemy";
type Phase = "playing" | "level-clear" | "completed" | "lost";
type BlockKind = "brick" | "steel" | "fortified" | "base";

interface Vec2 {
  x: number;
  y: number;
}

interface Rect extends Vec2 {
  w: number;
  h: number;
}

interface Tank extends Rect {
  team: Team;
  direction: Direction;
  speed: number;
  cooldown: number;
  alive: boolean;
  piercingTime: number;
  stuckTime: number;
  lastX: number;
  lastY: number;
  repathTime: number;
  slideDirection: Direction | null;
  slideTime: number;
  watchdogTime: number;
  watchdogX: number;
  watchdogY: number;
  turnRecoverySide: TurnSide | null;
  turnRecoveryDistance: number;
  lastMoveDirection: Direction | null;
  oscillationTurns: number;
  oscillationEscapeSide: TurnSide | null;
  oscillationEscapeDirection: Direction | null;
  oscillationEscapeDistance: number;
  moveCommitDirection: Direction | null;
  moveCommitDistance: number;
}

interface Bullet extends Rect {
  team: Team;
  direction: Direction;
  speed: number;
  piercing: boolean;
  pierceRemaining: number;
}

interface Block extends Rect {
  kind: BlockKind;
  hp: number;
}

interface Pickup extends Rect {
  kind: "piercing";
  active: boolean;
}

interface GameState {
  level: number;
  player: Tank;
  enemies: Tank[];
  bullets: Bullet[];
  blocks: Block[];
  pickups: Pickup[];
  phase: Phase;
  message: string;
}

export interface TankBattleRuntimeOptions {
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  statusText: HTMLElement;
  muteButton: HTMLButtonElement;
  touchButtons: HTMLButtonElement[];
}

const WIDTH = 640;
const HEIGHT = 576;
const TILE = 32;
const COLS = WIDTH / TILE;
const ROWS = HEIGHT / TILE;
const TANK_SIZE = 28;
const BULLET_SIZE = 6;
const MAX_LEVEL = 10;
const PIERCING_PICKUP_COUNT = 5;
const PIERCING_DURATION = 10;
const PICKUP_SIZE = 18;
const CHASE_RADIUS_CELLS = 5;
let ctx: CanvasRenderingContext2D;
let gamePanel: HTMLElement;
let statusText: HTMLElement;
let muteButton: HTMLButtonElement;
let keys = new Set<string>();
let touchDirections = new Set<Direction>();
let touchFire = false;
let audioUnlocked = false;
let muted = false;
let state: GameState;
let lastTime = 0;
let animationFrame = 0;
let disposed = true;
let audioState: AudioState;

type SoundName = "shoot" | "hit" | "break" | "explode" | "levelClear" | "fail";

type AudioContextConstructor = new () => AudioContext;

interface AudioState {
  context: AudioContext | null;
  gain: GainNode | null;
  buffers: Partial<Record<SoundName, AudioBuffer>>;
  bufferFiles: Partial<Record<SoundName, ArrayBuffer>>;
  failed: Set<SoundName>;
  preloadPromise: Promise<void>;
  decodePromise: Promise<void> | null;
}

const soundPaths: Record<SoundName, string> = {
  shoot: "/games/tank-battle/audio/shoot.ogg",
  hit: "/games/tank-battle/audio/hit.ogg",
  break: "/games/tank-battle/audio/break.ogg",
  explode: "/games/tank-battle/audio/explode.ogg",
  levelClear: "/games/tank-battle/audio/level-clear.ogg",
  fail: "/games/tank-battle/audio/fail.ogg",
};

const playerSpawn = { x: 8, y: 15 };
const baseCell = { x: 10, y: 16 };
const enemySpawns = [
  { x: 10, y: 2 },
  { x: 5, y: 2 },
  { x: 14, y: 2 },
  { x: 15, y: 6 },
];

const directionVector: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function requireCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }

  return context;
}

function createTank(team: Team, x: number, y: number, direction: Direction, level = 1): Tank {
  const enemySpeed = 74 + level * 5;

  return {
    team,
    x,
    y,
    w: TANK_SIZE,
    h: TANK_SIZE,
    direction,
    speed: team === "player" ? 150 : enemySpeed,
    cooldown: team === "player" ? 0 : Math.max(0.7, 1.35 - level * 0.05),
    alive: true,
    piercingTime: 0,
    stuckTime: 0,
    lastX: x,
    lastY: y,
    repathTime: 0,
    slideDirection: null,
    slideTime: 0,
    watchdogTime: 0,
    watchdogX: x,
    watchdogY: y,
    turnRecoverySide: null,
    turnRecoveryDistance: 0,
    lastMoveDirection: null,
    oscillationTurns: 0,
    oscillationEscapeSide: null,
    oscillationEscapeDirection: null,
    oscillationEscapeDistance: 0,
    moveCommitDirection: null,
    moveCommitDistance: 0,
  };
}

function createLevelState(level: number): GameState {
  const enemyCount = getEnemyCount(level);
  const blocks = generateLevelBlocks(level);

  return {
    level,
    player: createTank("player", cellToX(playerSpawn.x), cellToY(playerSpawn.y), "up", level),
    enemies: enemySpawns.slice(0, enemyCount).map((spawn, index) => {
      const enemy = createTank("enemy", cellToX(spawn.x), cellToY(spawn.y), "down", level);
      enemy.cooldown += index * 0.25;
      return enemy;
    }),
    bullets: [],
    blocks,
    pickups: generatePiercingPickups(blocks, level),
    phase: "playing",
    message: `Level ${level}/${MAX_LEVEL}: destroy all enemies`,
  };
}

function getEnemyCount(level: number): number {
  if (level <= 3) return 1;
  if (level <= 6) return 2;
  if (level <= 9) return 3;
  return 4;
}

function generateLevelBlocks(level: number): Block[] {
  const blocks: Block[] = [];
  const safeCells = createSafeCellSet();
  const random = seededRandom(Date.now() + level * 1009);
  const brickChance = Math.min(0.26, 0.12 + level * 0.012);
  const steelChance = Math.min(0.07, 0.025 + level * 0.004);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (isBorderCell(x, y)) {
        blocks.push(createBlock("steel", x, y));
        continue;
      }

      if (x === baseCell.x && y === baseCell.y) {
        blocks.push(createBlock("base", x, y));
        continue;
      }

      if (safeCells.has(cellKey(x, y))) {
        continue;
      }

      const roll = random();

      if (roll < steelChance) {
        blocks.push(createBlock("steel", x, y));
        continue;
      }

      if (roll < steelChance + brickChance) {
        blocks.push(createBlock("brick", x, y));
      }
    }
  }

  addTemplateBricks(blocks, safeCells, level);
  return blocks;
}

function generatePiercingPickups(blocks: Block[], level: number): Pickup[] {
  const random = seededRandom(Date.now() + level * 2027);
  const candidates = getPickupCandidates(blocks, []);

  shuffle(candidates, random);
  return candidates.slice(0, PIERCING_PICKUP_COUNT).map(createPickup);
}

function getPickupCandidates(
  blocks: Block[],
  existingPickups: Pickup[],
  excludedCells: Vec2[] = [],
): Vec2[] {
  const reachable = createReachableCells(blocks);
  let candidates: Vec2[] = [];
  const occupied = new Set(
    existingPickups
      .filter((pickup) => pickup.active)
      .map((pickup) => {
        const cell = rectToCell(pickup);
        return cellKey(cell.x, cell.y);
      }),
  );
  excludedCells.forEach((cell) => occupied.add(cellKey(cell.x, cell.y)));

  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (
        occupied.has(cellKey(x, y)) ||
        isReservedCell(x, y) ||
        isPickupProtectedZoneCell(x, y) ||
        hasBlockAt(blocks, x, y)
      ) {
        continue;
      }

      if (reachable.has(cellKey(x, y))) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length < PIERCING_PICKUP_COUNT) {
    candidates = getFallbackPickupCells(blocks).filter((cell) => !occupied.has(cellKey(cell.x, cell.y)));
  }

  return candidates;
}

function createPickup({ x, y }: Vec2): Pickup {
  return {
    kind: "piercing",
    active: true,
    x: x * TILE + (TILE - PICKUP_SIZE) / 2,
    y: y * TILE + (TILE - PICKUP_SIZE) / 2,
    w: PICKUP_SIZE,
    h: PICKUP_SIZE,
  };
}

function getFallbackPickupCells(blocks: Block[]): Vec2[] {
  return [
    { x: 4, y: 8 },
    { x: 7, y: 8 },
    { x: 12, y: 8 },
    { x: 15, y: 8 },
    { x: 10, y: 11 },
  ].filter((cell) => !hasBlockAt(blocks, cell.x, cell.y) && !isReservedCell(cell.x, cell.y));
}

function createReachableCells(blocks: Block[]): Set<string> {
  const startCells = [playerSpawn, ...enemySpawns];
  const visited = new Set<string>();
  const queue: Vec2[] = [];

  startCells.forEach((cell) => {
    if (!isBlockedCellForPath(cell.x, cell.y, blocks)) {
      visited.add(cellKey(cell.x, cell.y));
      queue.push(cell);
    }
  });

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    Object.values(directionVector).forEach((vector) => {
      const next = { x: current.x + vector.x, y: current.y + vector.y };
      const key = cellKey(next.x, next.y);

      if (visited.has(key) || isBlockedCellForPath(next.x, next.y, blocks)) {
        return;
      }

      visited.add(key);
      queue.push(next);
    });
  }

  return visited;
}

function isProtectedZoneCell(x: number, y: number): boolean {
  if (Math.abs(x - playerSpawn.x) <= 1 && Math.abs(y - playerSpawn.y) <= 1) {
    return true;
  }

  if (Math.abs(x - baseCell.x) <= 2 && Math.abs(y - baseCell.y) <= 2) {
    return true;
  }

  return enemySpawns.some((spawn) => Math.abs(x - spawn.x) <= 1 && Math.abs(y - spawn.y) <= 1);
}

function isPickupProtectedZoneCell(x: number, y: number): boolean {
  if (Math.abs(x - playerSpawn.x) <= 1 && Math.abs(y - playerSpawn.y) <= 1) {
    return true;
  }

  if (Math.abs(x - baseCell.x) <= 2 && Math.abs(y - baseCell.y) <= 2) {
    return true;
  }

  return enemySpawns.some((spawn) => Math.abs(x - spawn.x) <= 1 && Math.abs(y - spawn.y) <= 1);
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
}

function createSafeCellSet(): Set<string> {
  const cells = new Set<string>();

  for (let y = 8; y <= 14; y += 1) {
    cells.add(cellKey(7, y));
  }
  cells.add(cellKey(8, 14));

  for (let x = 1; x < COLS - 1; x += 1) {
    cells.add(cellKey(x, 8));
  }

  enemySpawns.forEach((spawn) => {
    for (let y = 1; y <= 8; y += 1) {
      cells.add(cellKey(spawn.x, y));
      cells.add(cellKey(Math.max(1, spawn.x - 1), y));
    }
  });

  addZone(cells, playerSpawn.x, playerSpawn.y, 1);
  addZone(cells, baseCell.x, baseCell.y, 1);
  enemySpawns.forEach((spawn) => addZone(cells, spawn.x, spawn.y, 1));
  getBaseApproachCellsForMap().forEach((cell) => cells.add(cellKey(cell.x, cell.y)));

  return cells;
}

function addTemplateBricks(blocks: Block[], safeCells: Set<string>, level: number): void {
  removeBlocksAt(blocks, getBaseApproachCellsForMap());

  createBaseDefenseCells().forEach(({ x, y }) => {
    if (isBorderCell(x, y) || isReservedCell(x, y) || hasBlockAt(blocks, x, y)) {
      return;
    }

    blocks.push(createBlock("fortified", x, y));
  });

  createBaseOverheadBlockerCells(level).forEach(({ x, y }) => {
    if (isBorderCell(x, y) || isReservedCell(x, y) || hasBlockAt(blocks, x, y)) {
      return;
    }

    blocks.push(createBlock("brick", x, y));
  });

  createMidfieldBufferCells(level).forEach(({ x, y }) => {
    if (isBorderCell(x, y) || safeCells.has(cellKey(x, y)) || hasBlockAt(blocks, x, y)) {
      return;
    }

    blocks.push(createBlock("brick", x, y));
  });
}

function removeBlocksAt(blocks: Block[], cells: Vec2[]): void {
  const keys = new Set(cells.map((cell) => cellKey(cell.x, cell.y)));

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];

    if (keys.has(cellKey(block.x / TILE, block.y / TILE))) {
      blocks.splice(index, 1);
    }
  }
}

function createBaseDefenseCells(): Vec2[] {
  return [
    { x: 9, y: 15 },
    { x: 10, y: 15 },
    { x: 11, y: 15 },
    { x: 9, y: 16 },
    { x: 11, y: 16 },
    { x: 9, y: 17 },
    { x: 10, y: 17 },
    { x: 11, y: 17 },
  ];
}

function createBaseOverheadBlockerCells(level: number): Vec2[] {
  const topRow = 9 + (level % 3);

  return [
    { x: 9, y: topRow },
    { x: 10, y: topRow + 1 },
  ];
}

function createMidfieldBufferCells(level: number): Vec2[] {
  const cells: Vec2[] = [];
  const rows = level > 5 ? [5, 6, 10] : [5, 10];

  rows.forEach((y, rowIndex) => {
    for (let x = 4; x <= 15; x += 1) {
      if (x === 9 || x === 10 || (x + rowIndex + level) % 4 === 0) {
        continue;
      }

      cells.push({ x, y });
    }
  });

  return cells;
}

function getBaseApproachCellsForMap(): Vec2[] {
  return [
    { x: 8, y: 14 },
    { x: 9, y: 14 },
    { x: 10, y: 14 },
    { x: 11, y: 14 },
    { x: 12, y: 14 },
    { x: 8, y: 15 },
    { x: 12, y: 15 },
    { x: 8, y: 16 },
    { x: 12, y: 16 },
  ];
}

function hasBlockAt(blocks: Block[], cellX: number, cellY: number): boolean {
  return blocks.some((block) => block.x === cellX * TILE && block.y === cellY * TILE);
}

function isReservedCell(x: number, y: number): boolean {
  if (x === playerSpawn.x && y === playerSpawn.y) {
    return true;
  }

  if (x === baseCell.x && y === baseCell.y) {
    return true;
  }

  return enemySpawns.some((spawn) => spawn.x === x && spawn.y === y);
}

function addZone(cells: Set<string>, centerX: number, centerY: number, radius: number): void {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1) {
        cells.add(cellKey(x, y));
      }
    }
  }
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createBlock(kind: BlockKind, cellX: number, cellY: number): Block {
  return {
    kind,
    x: cellX * TILE,
    y: cellY * TILE,
    w: TILE,
    h: TILE,
    hp: kind === "steel" ? Number.POSITIVE_INFINITY : 1,
  };
}

function isBorderCell(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function cellToX(cellX: number): number {
  return cellX * TILE + 2;
}

function cellToY(cellY: number): number {
  return cellY * TILE + 2;
}

export function startTankBattle({
  panel,
  canvas,
  statusText: nextStatusText,
  muteButton: nextMuteButton,
  touchButtons,
}: TankBattleRuntimeOptions): () => void {
  ctx = requireCanvasContext(canvas);
  gamePanel = panel;
  statusText = nextStatusText;
  muteButton = nextMuteButton;
  keys = new Set<string>();
  touchDirections = new Set<Direction>();
  touchFire = false;
  audioUnlocked = false;
  muted = false;
  disposed = false;
  lastTime = performance.now();
  state = createLevelState(1);
  audioState = createAudioState();
  updateMuteButton();
  draw(state);

  const cleanups: Array<() => void> = [];
  const handleKeyDown = (event: KeyboardEvent) => {
    unlockAudio();

    if (event.code === "Space") {
      event.preventDefault();
      continueAfterLevelClear();
    }

    if (event.code === "KeyR") {
      restartCurrentLevel();
    }

    keys.add(event.code);
  };
  const handleGlobalPointerDown = () => {
    unlockAudio();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("pointerdown", handleGlobalPointerDown);
  window.addEventListener("keyup", handleKeyUp);
  cleanups.push(() => window.removeEventListener("keydown", handleKeyDown));
  cleanups.push(() => window.removeEventListener("pointerdown", handleGlobalPointerDown));
  cleanups.push(() => window.removeEventListener("keyup", handleKeyUp));

  const preventPanelDefault = (event: Event) => {
    event.preventDefault();
  };
  gamePanel.addEventListener("contextmenu", preventPanelDefault);
  gamePanel.addEventListener("selectstart", preventPanelDefault);
  cleanups.push(() => gamePanel.removeEventListener("contextmenu", preventPanelDefault));
  cleanups.push(() => gamePanel.removeEventListener("selectstart", preventPanelDefault));

  touchButtons.forEach((button) => {
    const action = button.dataset.action;
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault();
    };
    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add("is-active");
      setTouchAction(action, true);
    };
    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault();
      releaseTouchAction(button, action);
    };
    const handlePointerCancel = () => {
      releaseTouchAction(button, action);
    };

    button.addEventListener("contextmenu", handleContextMenu);
    button.addEventListener("touchstart", handleTouchStart, { passive: false });
    button.addEventListener("pointerdown", handlePointerDown);
    button.addEventListener("pointerup", handlePointerUp);
    button.addEventListener("pointercancel", handlePointerCancel);
    button.addEventListener("lostpointercapture", handlePointerCancel);
    cleanups.push(() => button.removeEventListener("contextmenu", handleContextMenu));
    cleanups.push(() => button.removeEventListener("touchstart", handleTouchStart));
    cleanups.push(() => button.removeEventListener("pointerdown", handlePointerDown));
    cleanups.push(() => button.removeEventListener("pointerup", handlePointerUp));
    cleanups.push(() => button.removeEventListener("pointercancel", handlePointerCancel));
    cleanups.push(() => button.removeEventListener("lostpointercapture", handlePointerCancel));
  });

  const handleMuteClick = () => {
    unlockAudio();
    muted = !muted;
    updateMuteButton();
  };
  muteButton.addEventListener("click", handleMuteClick);
  cleanups.push(() => muteButton.removeEventListener("click", handleMuteClick));

  animationFrame = requestAnimationFrame(gameLoop);

  return () => {
    disposed = true;
    cancelAnimationFrame(animationFrame);
    cleanups.forEach((cleanup) => cleanup());
    touchButtons.forEach((button) => button.classList.remove("is-active"));
    void audioState.context?.close().catch(() => undefined);
    keys.clear();
    touchDirections.clear();
    touchFire = false;
  };
}

function createAudioState(): AudioState {
  const audioContext = createAudioContext();
  const gain = audioContext?.createGain() ?? null;

  if (gain && audioContext) {
    gain.gain.value = 0.55;
    gain.connect(audioContext.destination);
  }

  const nextAudioState: AudioState = {
    context: audioContext,
    gain,
    buffers: {},
    bufferFiles: {},
    failed: new Set<SoundName>(),
    preloadPromise: Promise.resolve(),
    decodePromise: null,
  };

  nextAudioState.preloadPromise = preloadSoundFiles(nextAudioState);
  nextAudioState.decodePromise = decodeSounds(nextAudioState);
  return nextAudioState;
}

function createAudioContext(): AudioContext | null {
  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext
  );
}

async function preloadSoundFiles(target: AudioState): Promise<void> {
  await Promise.all(
    Object.entries(soundPaths).map(async ([name, path]) => {
      const soundName = name as SoundName;

      try {
        const response = await fetch(path);

        if (!response.ok) {
          throw new Error(`Audio request failed: ${response.status}`);
        }

        target.bufferFiles[soundName] = await response.arrayBuffer();
      } catch {
        target.failed.add(soundName);
      }
    }),
  );
}

function gameLoop(now: number): void {
  if (disposed) {
    return;
  }

  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(state, dt);
  draw(state);

  animationFrame = requestAnimationFrame(gameLoop);
}

function update(game: GameState, dt: number): void {
  if (game.phase !== "playing") {
    return;
  }

  game.player.cooldown = Math.max(0, game.player.cooldown - dt);
  game.player.piercingTime = Math.max(0, game.player.piercingTime - dt);
  game.enemies.forEach((enemy) => {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.piercingTime = Math.max(0, enemy.piercingTime - dt);
    enemy.repathTime = Math.max(0, enemy.repathTime - dt);
    enemy.slideTime = Math.max(0, enemy.slideTime - dt);
  });

  updatePlayer(game, dt);
  updateEnemies(game, dt);
  updatePickups(game);
  updateBullets(game, dt);
  resolvePhase(game);
}

function updatePlayer(game: GameState, dt: number): void {
  const direction = getPressedDirection();

  if (direction) {
    game.player.direction = direction;
    moveTank(game.player, direction, dt, game);
  }

  if (keys.has("Space") || touchFire) {
    shoot(game, game.player);
  }
}

function updatePickups(game: GameState): void {
  const tanks = [game.player, ...game.enemies.filter((enemy) => enemy.alive)];
  const excludedCells: Vec2[] = tanks.map(rectToCell);

  game.pickups.forEach((pickup) => {
    if (!pickup.active) {
      return;
    }

    const tank = tanks.find((candidate) => intersects(candidate, pickup));

    if (!tank) {
      return;
    }

    pickup.active = false;
    excludedCells.push(rectToCell(pickup));
    tank.piercingTime = PIERCING_DURATION;
    playSound("levelClear");
  });

  if (excludedCells.length > tanks.length) {
    refillPiercingPickups(game, excludedCells);
  }
}

function refillPiercingPickups(game: GameState, excludedCells: Vec2[] = []): void {
  game.pickups = game.pickups.filter((pickup) => pickup.active);

  while (game.pickups.length < PIERCING_PICKUP_COUNT) {
    const candidates = getPickupCandidates(game.blocks, game.pickups, excludedCells);

    if (candidates.length === 0) {
      break;
    }

    const randomIndex = Math.floor(seededRandom(Date.now() + game.level * 4099 + game.pickups.length)() * candidates.length);
    const nextCell = candidates[randomIndex];
    game.pickups.push(createPickup(nextCell));
    excludedCells.push(nextCell);
  }
}

function getPressedDirection(): Direction | null {
  const touchDirection = Array.from(touchDirections).at(-1);

  if (touchDirection) {
    return touchDirection;
  }

  if (keys.has("ArrowUp") || keys.has("KeyW")) return "up";
  if (keys.has("ArrowDown") || keys.has("KeyS")) return "down";
  if (keys.has("ArrowLeft") || keys.has("KeyA")) return "left";
  if (keys.has("ArrowRight") || keys.has("KeyD")) return "right";
  return null;
}

function setTouchAction(action: string | undefined, active: boolean): void {
  if (active) {
    unlockAudio();
  }

  if (isDirection(action)) {
    if (active) {
      touchDirections.add(action);
      return;
    }

    touchDirections.delete(action);
    return;
  }

  if (action === "fire") {
    touchFire = active;

    if (active) {
      continueAfterLevelClear();
    }

    return;
  }

  if (action === "restart" && active) {
    restartCurrentLevel();
  }
}

function releaseTouchAction(button: HTMLButtonElement, action: string | undefined): void {
  button.classList.remove("is-active");
  setTouchAction(action, false);
}

function isDirection(value: string | undefined): value is Direction {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function restartCurrentLevel(): void {
  state = createLevelState(state.level);
}

function continueAfterLevelClear(): void {
  if (state.phase === "level-clear" && state.level < MAX_LEVEL) {
    state = createLevelState(state.level + 1);
  }
}

function updateEnemies(game: GameState, dt: number): void {
  game.enemies.forEach((enemy) => updateEnemy(game, enemy, dt));
}

function updateEnemy(game: GameState, enemy: Tank, dt: number): void {
  if (!enemy.alive) {
    return;
  }

  const previous = { x: enemy.x, y: enemy.y };
  const playerLineOfFire = getLineOfFireDirection(enemy, game.player, game.blocks);

  if (playerLineOfFire) {
    enemy.direction = playerLineOfFire;
    shoot(game, enemy);
  }

  const direction = chooseEnemyMoveDirection(game, enemy);
  const directions = getEnemyMoveOptions(game, enemy, direction);
  const previousDirection = enemy.direction;
  let movedDirection: Direction | null = null;
  let movedDistance = 0;
  let blockedPrimary = false;
  const moved = directions.some((candidate) => {
    if (!moveTank(enemy, candidate, dt, game)) {
      if (candidate === direction) {
        blockedPrimary = true;
      }

      return false;
    }

    enemy.direction = candidate;
    movedDirection = candidate;
    movedDistance = Math.hypot(enemy.x - previous.x, enemy.y - previous.y);
    return true;
  });

  if (!moved) {
    enemy.direction = previousDirection;
    const recovered = forceEnemyRecovery(game, enemy);

    if (recovered) {
      enemy.stuckTime = 0;
      enemy.repathTime = 0.45;
    }
  } else if (blockedPrimary) {
    enemy.repathTime = 0.35;
  }

  updateMoveCommitmentState(enemy, movedDirection, movedDistance);
  updateTurnRecoveryState(enemy, movedDistance);
  updateOscillationState(enemy, movedDirection, movedDistance);

  updateEnemyStuckState(enemy, previous, dt);
  updateEnemyWatchdog(game, enemy, dt);

  if (enemy.stuckTime > 0.7 && escapeEnemyFromStuck(game, enemy)) {
    enemy.stuckTime = 0;
    enemy.repathTime = 0.6;
  }

  const breachDirection = enemy.piercingTime > 0 ? getBreachShotDirection(enemy, game.blocks) : null;

  if (!playerLineOfFire && breachDirection) {
    enemy.direction = breachDirection;
    shoot(game, enemy);
    return;
  }

  const baseLineOfFire = getLineOfFireDirection(enemy, getBaseTarget(game), game.blocks);

  if (!playerLineOfFire && baseLineOfFire) {
    enemy.direction = baseLineOfFire;
    shoot(game, enemy);
  }
}

function chooseEnemyMoveDirection(game: GameState, enemy: Tank): Direction | null {
  if (enemy.stuckTime > 1.5) {
    enemy.stuckTime = 0;
    enemy.repathTime = 0.45;
    return getFallbackDirections(enemy.direction)[Math.floor(Math.random() * 4)] ?? enemy.direction;
  }

  if (isWithinCellRadius(enemy, game.player, CHASE_RADIUS_CELLS)) {
    return findPathDirection(game, enemy, [rectToCell(game.player)]);
  }

  if (enemy.piercingTime > 0) {
    return findPathDirection(game, enemy, getBaseApproachCells(game));
  }

  const pickupTargets = game.pickups
    .filter((pickup) => pickup.active)
    .map((pickup) => rectToCell(pickup));
  const pickupDirection = findPathDirection(game, enemy, pickupTargets);

  if (pickupDirection) {
    return pickupDirection;
  }

  return findPathDirection(game, enemy, getBaseApproachCells(game));
}

function chooseEnemyTarget(game: GameState, enemy: Tank): Rect {
  const base = getBaseTarget(game);
  const playerDistance = distanceBetween(enemy, game.player);
  const baseDistance = distanceBetween(enemy, base);
  return playerDistance <= baseDistance ? game.player : base;
}

function getBaseTarget(game: GameState): Rect {
  const base = game.blocks.find((block) => block.kind === "base");
  return base ?? { x: baseCell.x * TILE, y: baseCell.y * TILE, w: TILE, h: TILE };
}

function chooseEnemyDirections(enemy: Tank, target: Rect): Direction[] {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const horizontal = dx > 0 ? "right" : "left";
  const vertical = dy > 0 ? "down" : "up";

  if (Math.abs(dx) > Math.abs(dy)) {
    return [horizontal, vertical, opposite(horizontal), opposite(vertical)];
  }

  return [vertical, horizontal, opposite(vertical), opposite(horizontal)];
}

function getFallbackDirections(direction: Direction): Direction[] {
  if (direction === "up" || direction === "down") {
    return [direction, "left", "right", opposite(direction)];
  }

  return [direction, "up", "down", opposite(direction)];
}

function getEnemyMoveOptions(game: GameState, enemy: Tank, preferred: Direction | null): Direction[] {
  const tankBlockDirection = preferred ? getTankBlockDirection(game, enemy, preferred) : null;

  if (enemy.oscillationEscapeDirection) {
    return getOscillationEscapeDirections(enemy);
  }

  if (enemy.turnRecoverySide) {
    return getRepeatedTurnDirections(enemy.direction, enemy.turnRecoverySide);
  }

  if (enemy.moveCommitDirection) {
    if (canMoveTank(enemy, enemy.moveCommitDirection, game)) {
      const primary = preferred ?? enemy.direction;
      return [enemy.moveCommitDirection, primary, ...getFallbackDirections(primary)];
    }

    resetEnemyMoveCommitment(enemy);
  }

  if (tankBlockDirection) {
    const slideOptions = getWallSlideDirections(tankBlockDirection).filter((direction) => canMoveTank(enemy, direction, game));

    if (slideOptions.length > 0) {
      return [...slideOptions, opposite(tankBlockDirection), tankBlockDirection];
    }

    return [opposite(tankBlockDirection), ...getFallbackDirections(tankBlockDirection)];
  }

  if (enemy.slideDirection && enemy.slideTime > 0 && canMoveTank(enemy, enemy.slideDirection, game)) {
    const primary = preferred ?? enemy.direction;
    return [enemy.slideDirection, primary, ...getFallbackDirections(primary)];
  }

  if (!preferred) {
    return getFallbackDirections(enemy.direction);
  }

  const antiLoopDirections = getAntiLoopDirections(game, enemy, preferred);

  if (antiLoopDirections.length > 0) {
    return antiLoopDirections;
  }

  if (!canMoveTank(enemy, preferred, game, true)) {
    const turnSide = startEnemyTurnRecovery(enemy);
    return getRepeatedTurnDirections(preferred, turnSide).slice(1);
  }

  if (canMoveTank(enemy, preferred, game)) {
    resetEnemyTurnRecovery(enemy);
    return [preferred, ...getFallbackDirections(preferred)];
  }

  const slideOptions = getWallSlideDirections(preferred).filter((direction) => canMoveTank(enemy, direction, game));

  if (slideOptions.length > 0) {
    return [...slideOptions, preferred, opposite(preferred)];
  }

  return getFallbackDirections(preferred);
}

function startEnemyTurnRecovery(enemy: Tank): TurnSide {
  if (!enemy.turnRecoverySide) {
    enemy.turnRecoverySide = Math.random() < 0.5 ? "left" : "right";
    enemy.turnRecoveryDistance = 0;
  }

  return enemy.turnRecoverySide;
}

function updateTurnRecoveryState(enemy: Tank, movedDistance: number): void {
  if (!enemy.turnRecoverySide || movedDistance <= 0) {
    return;
  }

  enemy.turnRecoveryDistance += movedDistance;

  if (enemy.turnRecoveryDistance >= TILE) {
    resetEnemyTurnRecovery(enemy);
  }
}

function resetEnemyTurnRecovery(enemy: Tank): void {
  enemy.turnRecoverySide = null;
  enemy.turnRecoveryDistance = 0;
}

function updateMoveCommitmentState(enemy: Tank, movedDirection: Direction | null, movedDistance: number): void {
  if (!movedDirection || movedDistance <= 0) {
    return;
  }

  if (enemy.moveCommitDirection !== movedDirection) {
    enemy.moveCommitDirection = movedDirection;
    enemy.moveCommitDistance = 0;
  }

  enemy.moveCommitDistance += movedDistance;

  if (enemy.moveCommitDistance >= TILE) {
    resetEnemyMoveCommitment(enemy);
  }
}

function resetEnemyMoveCommitment(enemy: Tank): void {
  enemy.moveCommitDirection = null;
  enemy.moveCommitDistance = 0;
}

function getAntiLoopDirections(game: GameState, enemy: Tank, preferred: Direction): Direction[] {
  const lastMoveDirection = enemy.lastMoveDirection;

  if (!lastMoveDirection || preferred !== opposite(lastMoveDirection)) {
    return [];
  }

  const sideOptions = getWallSlideDirections(lastMoveDirection).filter((direction) =>
    canMoveTank(enemy, direction, game),
  );

  if (sideOptions.length === 0) {
    return [];
  }

  return [...sideOptions, lastMoveDirection, preferred];
}

function updateOscillationState(enemy: Tank, movedDirection: Direction | null, movedDistance: number): void {
  if (!movedDirection || movedDistance <= 0) {
    return;
  }

  if (enemy.oscillationEscapeDirection) {
    enemy.oscillationEscapeDistance += movedDistance;

    if (enemy.oscillationEscapeDistance >= TILE) {
      resetEnemyOscillationEscape(enemy);
    }

    enemy.lastMoveDirection = movedDirection;
    return;
  }

  const reversed =
    enemy.lastMoveDirection !== null &&
    movedDirection === opposite(enemy.lastMoveDirection) &&
    getDirectionAxis(movedDirection) === getDirectionAxis(enemy.lastMoveDirection);

  enemy.oscillationTurns = reversed ? enemy.oscillationTurns + 1 : 0;
  enemy.lastMoveDirection = movedDirection;

  if (enemy.oscillationTurns < 3) {
    return;
  }

  enemy.oscillationEscapeSide = Math.random() < 0.5 ? "left" : "right";
  enemy.oscillationEscapeDirection = turnDirection(movedDirection, enemy.oscillationEscapeSide);
  enemy.oscillationEscapeDistance = 0;
  enemy.oscillationTurns = 0;
  resetEnemyTurnRecovery(enemy);
}

function getOscillationEscapeDirections(enemy: Tank): Direction[] {
  const escapeDirection = enemy.oscillationEscapeDirection;

  if (!escapeDirection) {
    return getFallbackDirections(enemy.direction);
  }

  const side = enemy.oscillationEscapeSide ?? "left";
  const second = turnDirection(escapeDirection, side);
  const third = turnDirection(second, side);

  return [escapeDirection, second, third, opposite(escapeDirection)];
}

function resetEnemyOscillationEscape(enemy: Tank): void {
  enemy.oscillationEscapeSide = null;
  enemy.oscillationEscapeDirection = null;
  enemy.oscillationEscapeDistance = 0;
  enemy.oscillationTurns = 0;
}

function getDirectionAxis(direction: Direction): "horizontal" | "vertical" {
  return direction === "left" || direction === "right" ? "horizontal" : "vertical";
}

function getRepeatedTurnDirections(direction: Direction, side: TurnSide): Direction[] {
  const first = turnDirection(direction, side);
  const second = turnDirection(first, side);
  const third = turnDirection(second, side);

  return [direction, first, second, third];
}

function turnDirection(direction: Direction, side: TurnSide): Direction {
  if (side === "left") {
    switch (direction) {
      case "up":
        return "left";
      case "left":
        return "down";
      case "down":
        return "right";
      case "right":
        return "up";
    }
  }

  switch (direction) {
    case "up":
      return "right";
    case "right":
      return "down";
    case "down":
      return "left";
    case "left":
      return "up";
  }
}

function getTankBlockDirection(game: GameState, enemy: Tank, preferred: Direction): Direction | null {
  return canMoveTank(enemy, preferred, game, true) && !canMoveTank(enemy, preferred, game)
    ? preferred
    : null;
}

function getWallSlideDirections(direction: Direction): Direction[] {
  if (direction === "up" || direction === "down") {
    return ["left", "right"];
  }

  return ["up", "down"];
}

function updateEnemyStuckState(enemy: Tank, previous: Vec2, dt: number): void {
  const movedDistance = Math.hypot(enemy.x - previous.x, enemy.y - previous.y);

  if (movedDistance < 0.4) {
    enemy.stuckTime += dt;
  } else {
    enemy.stuckTime = 0;
  }

  enemy.lastX = enemy.x;
  enemy.lastY = enemy.y;
}

function updateEnemyWatchdog(game: GameState, enemy: Tank, dt: number): void {
  const movedSinceWatchdog = Math.hypot(enemy.x - enemy.watchdogX, enemy.y - enemy.watchdogY);

  if (movedSinceWatchdog > TILE * 0.35) {
    enemy.watchdogTime = 0;
    enemy.watchdogX = enemy.x;
    enemy.watchdogY = enemy.y;
    return;
  }

  enemy.watchdogTime += dt;

  if (enemy.watchdogTime < 1.05) {
    return;
  }

  const recovered = forceEnemyRecovery(game, enemy);
  enemy.watchdogTime = 0;
  enemy.watchdogX = enemy.x;
  enemy.watchdogY = enemy.y;

  if (recovered) {
    enemy.stuckTime = 0;
    enemy.slideTime = 0;
    enemy.repathTime = 0.65;
  }
}

function forceEnemyRecovery(game: GameState, enemy: Tank): boolean {
  const targetCells = getRecoveryTargets(game, enemy);
  const pathDirection = findPathDirection(game, enemy, targetCells);

  if (pathDirection && tryMoveEnemyRecovery(game, enemy, getEnemyMoveOptions(game, enemy, pathDirection))) {
    return true;
  }

  if (escapeEnemyFromStuck(game, enemy)) {
    return true;
  }

  const reachableTargets = getNearestReachableRecoveryCells(game, enemy);
  const fallbackDirection = findPathDirection(game, enemy, reachableTargets);

  if (fallbackDirection && tryMoveEnemyRecovery(game, enemy, getEnemyMoveOptions(game, enemy, fallbackDirection))) {
    return true;
  }

  return tryMoveEnemyRecovery(game, enemy, [
    ...getFallbackDirections(enemy.direction),
    ...getWallSlideDirections(enemy.direction),
    opposite(enemy.direction),
  ]);
}

function getRecoveryTargets(game: GameState, enemy: Tank): Vec2[] {
  if (isWithinCellRadius(enemy, game.player, CHASE_RADIUS_CELLS)) {
    return [rectToCell(game.player)];
  }

  if (enemy.piercingTime > 0) {
    return getBaseApproachCells(game);
  }

  const pickups = game.pickups.filter((pickup) => pickup.active).map(rectToCell);
  return pickups.length > 0 ? pickups : getBaseApproachCells(game);
}

function escapeEnemyFromStuck(game: GameState, enemy: Tank): boolean {
  const origin = rectToCell(enemy);

  for (let radius = 1; radius <= 4; radius += 1) {
    const cells = getRingCells(origin, radius).filter(
      (cell) =>
        !isBlockedCellForPath(cell.x, cell.y, game.blocks) &&
        !isTankCellOccupied(game, enemy, cell),
    );

    if (cells.length === 0) {
      continue;
    }

    const sortedCells = sortEscapeCells(game, cells);
    const pathDirection = findPathDirection(game, enemy, sortedCells);

    if (pathDirection && tryMoveEnemyRecovery(game, enemy, getEnemyMoveOptions(game, enemy, pathDirection))) {
      return true;
    }

    const target = sortedCells[0];
    const targetRect = { x: cellToX(target.x), y: cellToY(target.y), w: TANK_SIZE, h: TANK_SIZE };
    const directDirections = chooseEnemyDirections(enemy, targetRect);

    if (tryMoveEnemyRecovery(game, enemy, directDirections)) {
      return true;
    }
  }

  return false;
}

function tryMoveEnemyRecovery(game: GameState, enemy: Tank, directions: Direction[], dt = 0.18): boolean {
  const tried = new Set<Direction>();

  for (const direction of directions) {
    if (tried.has(direction)) {
      continue;
    }

    tried.add(direction);

    if (!moveTank(enemy, direction, dt, game) && !moveEnemyOutOfCurrentOverlap(game, enemy, direction, dt)) {
      continue;
    }

    enemy.direction = direction;
    enemy.slideDirection = direction;
    enemy.slideTime = 0.45;
    return true;
  }

  return false;
}

function moveEnemyOutOfCurrentOverlap(game: GameState, enemy: Tank, direction: Direction, dt: number): boolean {
  const vector = directionVector[direction];
  const next: Tank = {
    ...enemy,
    x: enemy.x + vector.x * enemy.speed * dt,
    y: enemy.y + vector.y * enemy.speed * dt,
  };

  if (next.x < 0 || next.y < 0 || next.x + next.w > WIDTH || next.y + next.h > HEIGHT) {
    return false;
  }

  const currentOverlap = getRecoveryOverlapScore(enemy, game, enemy);

  if (currentOverlap <= 0) {
    return false;
  }

  if (getRecoveryOverlapScore(next, game, enemy) >= currentOverlap) {
    return false;
  }

  enemy.x = next.x;
  enemy.y = next.y;
  return true;
}

function getRecoveryOverlapScore(rect: Rect, game: GameState, movingTank: Tank): number {
  const blockOverlap = game.blocks.reduce((score, block) => score + getOverlapArea(rect, block), 0);
  const playerOverlap = game.player.alive ? getOverlapArea(rect, game.player) : 0;
  const enemyOverlap = game.enemies.reduce((score, enemy) => {
    return enemy !== movingTank && enemy.alive ? score + getOverlapArea(rect, enemy) : score;
  }, 0);

  return blockOverlap + playerOverlap + enemyOverlap;
}

function getOverlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height;
}

function getNearestReachableRecoveryCells(game: GameState, enemy: Tank): Vec2[] {
  const origin = rectToCell(enemy);
  const candidates = createReachableCells(game.blocks);

  return [...candidates]
    .map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    })
    .filter((cell) => !isTankCellOccupied(game, enemy, cell) && distanceBetweenCells(cell, origin) > 0)
    .sort((a, b) => distanceBetweenCells(a, origin) - distanceBetweenCells(b, origin))
    .slice(0, 24);
}

function getRingCells(origin: Vec2, radius: number): Vec2[] {
  const cells: Vec2[] = [];

  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) === radius) {
        cells.push({ x, y });
      }
    }
  }

  return cells;
}

function sortEscapeCells(game: GameState, cells: Vec2[]): Vec2[] {
  const target = rectToCell(getBaseTarget(game));
  return [...cells].sort((a, b) => distanceBetweenCells(a, target) - distanceBetweenCells(b, target));
}

function isTankCellOccupied(game: GameState, movingEnemy: Tank, cell: Vec2): boolean {
  const rect = { x: cellToX(cell.x), y: cellToY(cell.y), w: TANK_SIZE, h: TANK_SIZE };

  if (game.player.alive && intersects(rect, game.player)) {
    return true;
  }

  return game.enemies.some((enemy) => enemy !== movingEnemy && enemy.alive && intersects(rect, enemy));
}

function findPathDirection(game: GameState, tank: Tank, targets: Vec2[]): Direction | null {
  if (targets.length === 0) {
    return null;
  }

  const start = rectToCell(tank);
  const targetKeys = new Set(
    targets
      .filter((target) => !isBlockedCellForPath(target.x, target.y, game.blocks) || cellKey(target.x, target.y) === cellKey(start.x, start.y))
      .map((target) => cellKey(target.x, target.y)),
  );

  if (targetKeys.size === 0 || targetKeys.has(cellKey(start.x, start.y))) {
    return null;
  }

  const queue: Vec2[] = [start];
  const visited = new Set<string>([cellKey(start.x, start.y)]);
  const previous = new Map<string, { cell: Vec2; direction: Direction }>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const direction of ["up", "down", "left", "right"] as Direction[]) {
      const vector = directionVector[direction];
      const next = { x: current.x + vector.x, y: current.y + vector.y };
      const key = cellKey(next.x, next.y);

      if (visited.has(key) || isBlockedCellForPath(next.x, next.y, game.blocks)) {
        continue;
      }

      visited.add(key);
      previous.set(key, { cell: current, direction });

      if (targetKeys.has(key)) {
        return getFirstPathDirection(start, next, previous);
      }

      queue.push(next);
    }
  }

  return null;
}

function getFirstPathDirection(
  start: Vec2,
  target: Vec2,
  previous: Map<string, { cell: Vec2; direction: Direction }>,
): Direction | null {
  let current = target;
  let direction: Direction | null = null;

  while (cellKey(current.x, current.y) !== cellKey(start.x, start.y)) {
    const step = previous.get(cellKey(current.x, current.y));

    if (!step) {
      return null;
    }

    direction = step.direction;
    current = step.cell;
  }

  return direction;
}

function getBaseApproachCells(game: GameState): Vec2[] {
  return getBaseApproachCellsForMap().filter((cell) => !isBlockedCellForPath(cell.x, cell.y, game.blocks));
}

function getLineOfFireDirection(source: Rect, target: Rect, blocks: Block[]): Direction | null {
  const sourceCenter = rectCenter(source);
  const targetCenter = rectCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) <= TILE * 0.45 && !hasBlockingLine(sourceCenter, targetCenter, "vertical", blocks)) {
    return dy > 0 ? "down" : "up";
  }

  if (Math.abs(dy) <= TILE * 0.45 && !hasBlockingLine(sourceCenter, targetCenter, "horizontal", blocks)) {
    return dx > 0 ? "right" : "left";
  }

  return null;
}

function getBreachShotDirection(source: Rect, blocks: Block[]): Direction | null {
  const center = rectCenter(source);

  for (const direction of ["up", "down", "left", "right"] as Direction[]) {
    const vector = directionVector[direction];

    for (let distance = TILE; distance < Math.max(WIDTH, HEIGHT); distance += TILE / 2) {
      const point = {
        x: center.x + vector.x * distance,
        y: center.y + vector.y * distance,
      };

      if (point.x < 0 || point.y < 0 || point.x > WIDTH || point.y > HEIGHT) {
        break;
      }

      const firstBlock = blocks.find(
        (block) =>
          point.x >= block.x &&
          point.x <= block.x + block.w &&
          point.y >= block.y &&
          point.y <= block.y + block.h,
      );

      if (!firstBlock) {
        continue;
      }

      if (firstBlock.kind === "fortified" || firstBlock.kind === "base") {
        return direction;
      }

      break;
    }
  }

  return null;
}

function hasBlockingLine(
  source: Vec2,
  target: Vec2,
  axis: "horizontal" | "vertical",
  blocks: Block[],
): boolean {
  const min = axis === "horizontal" ? Math.min(source.x, target.x) : Math.min(source.y, target.y);
  const max = axis === "horizontal" ? Math.max(source.x, target.x) : Math.max(source.y, target.y);
  const fixed = axis === "horizontal" ? source.y : source.x;

  return blocks.some((block) => {
    const blockMin = axis === "horizontal" ? block.x : block.y;
    const blockMax = axis === "horizontal" ? block.x + block.w : block.y + block.h;
    const blockFixedMin = axis === "horizontal" ? block.y : block.x;
    const blockFixedMax = axis === "horizontal" ? block.y + block.h : block.x + block.w;

    return blockMax > min && blockMin < max && fixed >= blockFixedMin && fixed <= blockFixedMax;
  });
}

function isWithinCellRadius(a: Rect, b: Rect, radius: number): boolean {
  const ac = rectToCell(a);
  const bc = rectToCell(b);
  return Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) <= radius;
}

function distanceBetweenCells(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function rectCenter(rect: Rect): Vec2 {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function rectToCell(rect: Rect): Vec2 {
  const center = rectCenter(rect);
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.floor(center.x / TILE))),
    y: Math.max(0, Math.min(ROWS - 1, Math.floor(center.y / TILE))),
  };
}

function isBlockedCellForPath(x: number, y: number, blocks: Block[]): boolean {
  if (x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1) {
    return true;
  }

  return blocks.some((block) => {
    return (
      block.x < (x + 1) * TILE &&
      block.x + block.w > x * TILE &&
      block.y < (y + 1) * TILE &&
      block.y + block.h > y * TILE
    );
  });
}

function opposite(direction: Direction): Direction {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function aimAt(source: Rect, target: Rect): Direction {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }

  return dy > 0 ? "down" : "up";
}

function distanceBetween(a: Rect, b: Rect): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isRoughlyAligned(a: Rect, b: Rect): boolean {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;

  return Math.abs(ax - bx) < TILE * 0.45 || Math.abs(ay - by) < TILE * 0.45;
}

function moveTank(tank: Tank, direction: Direction, dt: number, game: GameState): boolean {
  const vector = directionVector[direction];
  const next: Tank = {
    ...tank,
    x: tank.x + vector.x * tank.speed * dt,
    y: tank.y + vector.y * tank.speed * dt,
  };

  if (isBlocked(next, game, tank)) {
    return false;
  }

  tank.x = next.x;
  tank.y = next.y;
  return true;
}

function canMoveTank(tank: Tank, direction: Direction, game: GameState, ignoreTanks = false): boolean {
  const vector = directionVector[direction];
  const next: Tank = {
    ...tank,
    x: tank.x + vector.x * Math.min(TILE / 2, tank.speed * 0.12),
    y: tank.y + vector.y * Math.min(TILE / 2, tank.speed * 0.12),
  };

  return !isBlocked(next, game, tank, ignoreTanks);
}

function isBlocked(rect: Rect, game: GameState, movingTank: Tank, ignoreTanks = false): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WIDTH || rect.y + rect.h > HEIGHT) {
    return true;
  }

  if (game.blocks.some((block) => intersects(rect, block))) {
    return true;
  }

  if (ignoreTanks) {
    return false;
  }

  if (movingTank.team === "enemy" && game.player.alive && intersects(rect, game.player)) {
    return true;
  }

  return game.enemies.some((enemy) => enemy !== movingTank && enemy.alive && intersects(rect, enemy));
}

function shoot(game: GameState, tank: Tank): void {
  if (!tank.alive || tank.cooldown > 0) {
    return;
  }

  const vector = directionVector[tank.direction];
  const cx = tank.x + tank.w / 2 - BULLET_SIZE / 2;
  const cy = tank.y + tank.h / 2 - BULLET_SIZE / 2;

  game.bullets.push({
    team: tank.team,
    direction: tank.direction,
    speed: 280,
    piercing: tank.piercingTime > 0,
    pierceRemaining: tank.piercingTime > 0 ? 2 : 0,
    w: BULLET_SIZE,
    h: BULLET_SIZE,
    x: cx + vector.x * (tank.w / 2 + 4),
    y: cy + vector.y * (tank.h / 2 + 4),
  });

  playSound("shoot");
  tank.cooldown = tank.team === "player" ? 0.32 : Math.max(0.72, 1.28 - game.level * 0.05);
}

function updateBullets(game: GameState, dt: number): void {
  const activeBullets: Bullet[] = [];

  for (const bullet of game.bullets) {
    const vector = directionVector[bullet.direction];
    bullet.x += vector.x * bullet.speed * dt;
    bullet.y += vector.y * bullet.speed * dt;

    if (isOutOfBounds(bullet)) {
      continue;
    }

    const blockIndex = game.blocks.findIndex((block) => intersects(bullet, block));

    if (blockIndex >= 0) {
      const block = game.blocks[blockIndex];
      const canBreakFortified = block.kind === "fortified" && bullet.piercing;
      const canPierceBrick = block.kind === "brick" && bullet.piercing && bullet.pierceRemaining > 0;

      if (block.kind === "brick" || block.kind === "base" || canBreakFortified) {
        block.hp -= 1;
      }

      if (block.hp <= 0) {
        game.blocks.splice(blockIndex, 1);
        playSound(block.kind === "base" ? "fail" : "break");

        if (block.kind === "base") {
          game.phase = "lost";
          game.message = `Base destroyed on level ${game.level}. R/RST restarts this level.`;
        }

        if (canPierceBrick) {
          bullet.pierceRemaining -= 1;

          if (bullet.pierceRemaining > 0) {
            activeBullets.push(bullet);
          }
        }
      } else {
        playSound("hit");
      }

      continue;
    }

    if (bullet.team === "player") {
      const enemy = game.enemies.find((target) => target.alive && intersects(bullet, target));

      if (enemy) {
        enemy.alive = false;
        playSound("explode");
        continue;
      }
    }

    if (bullet.team === "enemy" && game.player.alive && intersects(bullet, game.player)) {
      game.player.alive = false;
      playSound("fail");
      continue;
    }

    activeBullets.push(bullet);
  }

  game.bullets = activeBullets;
}

function resolvePhase(game: GameState): void {
  if (game.phase !== "playing") {
    return;
  }

  if (!game.player.alive) {
    game.phase = "lost";
    game.message = `Your tank was destroyed on level ${game.level}. R/RST restarts this level.`;
    playSound("fail");
    return;
  }

  if (!game.blocks.some((block) => block.kind === "base")) {
    game.phase = "lost";
    game.message = `Base destroyed on level ${game.level}. R/RST restarts this level.`;
    playSound("fail");
    return;
  }

  if (game.enemies.every((enemy) => !enemy.alive)) {
    if (game.level >= MAX_LEVEL) {
      game.phase = "completed";
      game.message = "All 10 levels cleared. Game complete!";
      playSound("levelClear");
      return;
    }

    game.phase = "level-clear";
    game.message = `Level ${game.level} clear. FIRE/Space starts level ${game.level + 1}.`;
    playSound("levelClear");
    return;
  }

  const piercingText =
    game.player.piercingTime > 0 ? ` | piercing ${Math.ceil(game.player.piercingTime)}s` : "";
  game.message = `Level ${game.level}/${MAX_LEVEL}: ${getRemainingEnemyCount(game)} enemies left, ${getActivePickupCount(game)} AP shells${piercingText}`;
}

function getRemainingEnemyCount(game: GameState): number {
  return game.enemies.filter((enemy) => enemy.alive).length;
}

function getActivePickupCount(game: GameState): number {
  return game.pickups.filter((pickup) => pickup.active).length;
}

function isOutOfBounds(rect: Rect): boolean {
  return rect.x + rect.w < 0 || rect.y + rect.h < 0 || rect.x > WIDTH || rect.y > HEIGHT;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function draw(game: GameState): void {
  statusText.textContent = game.message;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  drawGround();
  game.blocks.forEach(drawBlock);
  game.pickups.forEach(drawPickup);

  if (game.player.alive) {
    drawTank(game.player);
  }

  game.enemies.forEach((enemy) => {
    if (enemy.alive) {
      drawTank(enemy);
    }
  });

  game.bullets.forEach(drawBullet);
  drawLevelBadge(game);

  if (game.phase !== "playing") {
    drawOverlay(game.message);
  }
}

function drawGround(): void {
  ctx.fillStyle = "#252a22";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= WIDTH; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y <= HEIGHT; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
}

function drawBlock(block: Block): void {
  if (block.kind === "brick") {
    ctx.fillStyle = "#a35f3c";
    ctx.fillRect(block.x + 2, block.y + 2, block.w - 4, block.h - 4);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(block.x + 4, block.y + 9, block.w - 8, 3);
    ctx.fillRect(block.x + 4, block.y + 20, block.w - 8, 3);
  }

  if (block.kind === "steel") {
    ctx.fillStyle = "#69726f";
    ctx.fillRect(block.x, block.y, block.w, block.h);
    ctx.strokeStyle = "#a8b0aa";
    ctx.strokeRect(block.x + 5, block.y + 5, block.w - 10, block.h - 10);
  }

  if (block.kind === "fortified") {
    ctx.fillStyle = "#4f6673";
    ctx.fillRect(block.x, block.y, block.w, block.h);
    ctx.strokeStyle = "#c8e6ef";
    ctx.lineWidth = 2;
    ctx.strokeRect(block.x + 4, block.y + 4, block.w - 8, block.h - 8);
    ctx.beginPath();
    ctx.moveTo(block.x + 8, block.y + block.h - 8);
    ctx.lineTo(block.x + block.w - 8, block.y + 8);
    ctx.stroke();
  }

  if (block.kind === "base") {
    ctx.fillStyle = "#e2c76a";
    ctx.fillRect(block.x + 4, block.y + 8, block.w - 8, block.h - 10);
    ctx.fillStyle = "#7f5030";
    ctx.fillRect(block.x + 10, block.y + 2, block.w - 20, 12);
  }
}

function drawPickup(pickup: Pickup): void {
  if (!pickup.active) {
    return;
  }

  const centerX = pickup.x + pickup.w / 2;
  const centerY = pickup.y + pickup.h / 2;

  ctx.fillStyle = "#f4ed83";
  ctx.beginPath();
  ctx.arc(centerX, centerY, pickup.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a2d22";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 5, centerY + 5);
  ctx.lineTo(centerX, centerY - 6);
  ctx.lineTo(centerX + 5, centerY + 5);
  ctx.stroke();
}

function drawTank(tank: Tank): void {
  const centerX = tank.x + tank.w / 2;
  const centerY = tank.y + tank.h / 2;
  const barrel = directionVector[tank.direction];

  ctx.fillStyle = tank.team === "player" ? "#6fb95d" : "#d96a57";
  ctx.fillRect(tank.x, tank.y, tank.w, tank.h);

  if (tank.piercingTime > 0) {
    ctx.strokeStyle = "#f4ed83";
    ctx.lineWidth = 3;
    ctx.strokeRect(tank.x - 2, tank.y - 2, tank.w + 4, tank.h + 4);
  }

  ctx.fillStyle = tank.team === "player" ? "#44763d" : "#9e4239";
  ctx.fillRect(tank.x + 4, tank.y + 4, 5, tank.h - 8);
  ctx.fillRect(tank.x + tank.w - 9, tank.y + 4, 5, tank.h - 8);

  ctx.fillStyle = "#1e241d";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#1e241d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + barrel.x * 17, centerY + barrel.y * 17);
  ctx.stroke();
}

function drawBullet(bullet: Bullet): void {
  ctx.fillStyle = bullet.piercing ? "#ffffff" : bullet.team === "player" ? "#f4ed83" : "#ffb07b";
  ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
}

function drawLevelBadge(game: GameState): void {
  ctx.fillStyle = "rgba(17, 21, 17, 0.74)";
  ctx.fillRect(TILE + 8, TILE + 8, 184, 62);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Level ${game.level}/${MAX_LEVEL}`, TILE + 18, TILE + 13);
  ctx.fillStyle = "#dfe7d5";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(`${getRemainingEnemyCount(game)} enemies left`, TILE + 18, TILE + 31);
  ctx.fillText(
    `AP ${Math.ceil(game.player.piercingTime)}s | ${getActivePickupCount(game)} shells`,
    TILE + 18,
    TILE + 47,
  );
}

function drawOverlay(message: string): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawWrappedText(message, WIDTH / 2, HEIGHT / 2, WIDTH * 0.82, 30);
}

function drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  ctx.font = "bold 26px Inter, sans-serif";
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;

    if (ctx.measureText(nextLine).width <= maxWidth || !line) {
      line = nextLine;
      continue;
    }

    lines.push(line);
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((wrappedLine, index) => {
    ctx.fillText(wrappedLine, x, startY + index * lineHeight);
  });
}

function unlockAudio(): void {
  if (audioUnlocked) {
    return;
  }

  audioUnlocked = true;
  if (!audioState.context) {
    audioState.context = createAudioContext();
    audioState.gain = audioState.context?.createGain() ?? null;

    if (audioState.context && audioState.gain) {
      audioState.gain.gain.value = 0.55;
      audioState.gain.connect(audioState.context.destination);
    }
  }

  if (!audioState.context) {
    return;
  }

  void audioState.context.resume().catch(() => undefined);
  audioState.decodePromise ??= decodeSounds(audioState);
}

async function decodeSounds(target: AudioState): Promise<void> {
  const audioContext = target.context;

  if (!audioContext) {
    return;
  }

  await target.preloadPromise;
  await Promise.all(
    Object.entries(target.bufferFiles).map(async ([name, file]) => {
      const soundName = name as SoundName;

      if (!file || target.buffers[soundName] || target.failed.has(soundName)) {
        return;
      }

      try {
        target.buffers[soundName] = await audioContext.decodeAudioData(file.slice(0));
      } catch {
        target.failed.add(soundName);
      }
    }),
  );
}

function playSound(name: SoundName): void {
  if (muted || !audioUnlocked) {
    return;
  }

  const audioContext = audioState.context;
  const gain = audioState.gain;
  const buffer = audioState.buffers[name];

  if (!audioContext || !gain || !buffer || audioState.failed.has(name)) {
    return;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start(0);
}

function updateMuteButton(): void {
  muteButton.textContent = muted ? "Muted" : "Sound On";
  muteButton.setAttribute("aria-pressed", String(muted));
}

export function createTankBattleTestSnapshot(level = 1): {
  activePickups: number;
  baseApproachCells: Vec2[];
  baseOverheadColumnsBlocked: boolean;
  bottomDefenseCellsBlocked: boolean;
  piercingEnemyDirection: Direction | null;
  activePickupsAfterRefill: number;
  pickupRespawnedElsewhere: boolean;
  piercingDestroyedBrickCount: number;
  bulletStoppedAfterTwoBricks: boolean;
  stuckEnemyEscaped: boolean;
  stuckRecoveryWasMovementOnly: boolean;
  openAreaWatchdogRecovered: boolean;
  openAreaWatchdogWasMovementOnly: boolean;
  screenshotAreaWatchdogRecovered: boolean;
  screenshotAreaWatchdogWasMovementOnly: boolean;
  flatWallSlideWorked: boolean;
  wallTurnRecoveryStarted: boolean;
  wallTurnRecoveryRepeatedSameSide: boolean;
  wallTurnRecoveryResetAfterOneCell: boolean;
  committedMovementHeldUntilOneCell: boolean;
  immediateReverseAvoidedInOpenArea: boolean;
  verticalOscillationEscaped: boolean;
  horizontalOscillationEscaped: boolean;
  playerContactAvoided: boolean;
  enemyContactAvoided: boolean;
} {
  const testState = createLevelState(level);
  const enemy = testState.enemies[0];
  enemy.piercingTime = PIERCING_DURATION;
  const pickupState = createLevelState(level);
  const pickup = pickupState.pickups[0];
  const consumedCell = rectToCell(pickup);

  pickupState.player.x = pickup.x;
  pickupState.player.y = pickup.y;
  updatePickups(pickupState);
  const respawnedAtConsumedCell = pickupState.pickups.some((nextPickup) => {
    const cell = rectToCell(nextPickup);
    return cell.x === consumedCell.x && cell.y === consumedCell.y;
  });

  const piercingState = createLevelState(level);
  piercingState.blocks = [
    createBlock("brick", 5, 5),
    createBlock("brick", 6, 5),
  ];
  piercingState.bullets = [
    {
      team: "player",
      direction: "right",
      speed: 280,
      piercing: true,
      pierceRemaining: 2,
      x: 5 * TILE - 8,
      y: 5 * TILE + 13,
      w: BULLET_SIZE,
      h: BULLET_SIZE,
    },
  ];
  updateBullets(piercingState, 0.04);
  updateBullets(piercingState, 0.12);

  const stuckState = createLevelState(level);
  const stuckEnemy = stuckState.enemies[0];
  stuckState.blocks = [
    createBlock("brick", 10, 8),
    createBlock("brick", 10, 9),
  ];
  stuckEnemy.x = cellToX(9);
  stuckEnemy.y = cellToY(8);
  stuckEnemy.direction = "right";
  const stuckStart = { x: stuckEnemy.x, y: stuckEnemy.y };
  const stuckEnemyEscaped = escapeEnemyFromStuck(stuckState, stuckEnemy);
  const stuckRecoveryDistance = Math.hypot(stuckEnemy.x - stuckStart.x, stuckEnemy.y - stuckStart.y);
  const openAreaState = createLevelState(level);
  const openAreaEnemy = openAreaState.enemies[0];
  openAreaEnemy.x = cellToX(6);
  openAreaEnemy.y = cellToY(8);
  openAreaEnemy.watchdogX = openAreaEnemy.x;
  openAreaEnemy.watchdogY = openAreaEnemy.y;
  openAreaEnemy.watchdogTime = 1.2;
  const openAreaStart = { x: openAreaEnemy.x, y: openAreaEnemy.y };
  updateEnemyWatchdog(openAreaState, openAreaEnemy, 0.1);
  const openAreaRecoveryDistance = Math.hypot(openAreaEnemy.x - openAreaStart.x, openAreaEnemy.y - openAreaStart.y);
  const screenshotAreaState = createLevelState(level);
  const screenshotEnemy = screenshotAreaState.enemies[0];
  screenshotEnemy.x = cellToX(16);
  screenshotEnemy.y = cellToY(3);
  screenshotEnemy.watchdogX = screenshotEnemy.x;
  screenshotEnemy.watchdogY = screenshotEnemy.y;
  screenshotEnemy.watchdogTime = 1.2;
  const screenshotStart = { x: screenshotEnemy.x, y: screenshotEnemy.y };
  updateEnemyWatchdog(screenshotAreaState, screenshotEnemy, 0.1);
  const screenshotRecoveryDistance = Math.hypot(
    screenshotEnemy.x - screenshotStart.x,
    screenshotEnemy.y - screenshotStart.y,
  );
  const flatWallState = createLevelState(level);
  const flatWallEnemy = flatWallState.enemies[0];
  flatWallState.blocks = [
    createBlock("brick", 10, 3),
    createBlock("brick", 10, 4),
    createBlock("brick", 10, 5),
  ];
  flatWallEnemy.x = cellToX(9);
  flatWallEnemy.y = cellToY(4);
  flatWallEnemy.direction = "right";
  const flatWallStart = { x: flatWallEnemy.x, y: flatWallEnemy.y };
  const flatWallOptions = getEnemyMoveOptions(flatWallState, flatWallEnemy, "right");
  flatWallOptions.some((direction) => {
    flatWallEnemy.direction = direction;
    return moveTank(flatWallEnemy, direction, 0.12, flatWallState);
  });
  const wallTurnState = createLevelState(level);
  const wallTurnEnemy = wallTurnState.enemies[0];
  wallTurnState.blocks = [createBlock("brick", 10, 4)];
  wallTurnEnemy.x = cellToX(9);
  wallTurnEnemy.y = cellToY(4);
  wallTurnEnemy.direction = "right";
  const wallTurnOptions = getEnemyMoveOptions(wallTurnState, wallTurnEnemy, "right");
  const wallTurnSide = wallTurnEnemy.turnRecoverySide;
  const wallTurnExpected = wallTurnSide ? turnDirection("right", wallTurnSide) : null;
  const wallTurnRecoveryStarted =
    wallTurnSide !== null && wallTurnOptions[0] === wallTurnExpected && !wallTurnOptions.includes("right");
  const deadEndState = createLevelState(level);
  const deadEndEnemy = deadEndState.enemies[0];
  deadEndState.blocks = [
    createBlock("brick", 10, 4),
    createBlock("brick", 9, 5),
  ];
  deadEndEnemy.x = cellToX(9);
  deadEndEnemy.y = cellToY(4);
  deadEndEnemy.direction = "right";
  deadEndEnemy.turnRecoverySide = "right";
  const deadEndStart = { x: deadEndEnemy.x, y: deadEndEnemy.y };
  const deadEndOptions = getEnemyMoveOptions(deadEndState, deadEndEnemy, "right");
  let deadEndMovedDirection: Direction | null = null;
  deadEndOptions.some((direction) => {
    deadEndEnemy.direction = direction;
    const moved = moveTank(deadEndEnemy, direction, 0.12, deadEndState);
    deadEndMovedDirection = moved ? direction : deadEndMovedDirection;
    return moved;
  });
  const wallTurnRecoveryRepeatedSameSide =
    deadEndMovedDirection === "left" && deadEndEnemy.x < deadEndStart.x;
  const resetEnemy = createTank("enemy", cellToX(6), cellToY(6), "right", level);
  resetEnemy.turnRecoverySide = "left";
  resetEnemy.turnRecoveryDistance = TILE - 1;
  updateTurnRecoveryState(resetEnemy, 1.1);
  const wallTurnRecoveryResetAfterOneCell =
    resetEnemy.turnRecoverySide === null && resetEnemy.turnRecoveryDistance === 0;
  const commitmentState = createLevelState(level);
  const commitmentEnemy = commitmentState.enemies[0];
  commitmentState.blocks = [];
  commitmentEnemy.x = cellToX(8);
  commitmentEnemy.y = cellToY(8);
  commitmentEnemy.direction = "down";
  commitmentEnemy.moveCommitDirection = "down";
  commitmentEnemy.moveCommitDistance = TILE / 2;
  const committedOptions = getEnemyMoveOptions(commitmentState, commitmentEnemy, "up");
  updateMoveCommitmentState(commitmentEnemy, "down", TILE / 2 + 1);
  const releasedOptions = getEnemyMoveOptions(commitmentState, commitmentEnemy, "up");
  const committedMovementHeldUntilOneCell =
    committedOptions[0] === "down" &&
    commitmentEnemy.moveCommitDirection === null &&
    releasedOptions[0] === "up";
  const antiLoopState = createLevelState(level);
  const antiLoopEnemy = antiLoopState.enemies[0];
  antiLoopState.blocks = [];
  antiLoopEnemy.x = cellToX(8);
  antiLoopEnemy.y = cellToY(8);
  antiLoopEnemy.direction = "up";
  antiLoopEnemy.lastMoveDirection = "up";
  const antiLoopOptions = getEnemyMoveOptions(antiLoopState, antiLoopEnemy, "down");
  const immediateReverseAvoidedInOpenArea =
    antiLoopOptions[0] !== "down" && getDirectionAxis(antiLoopOptions[0]) === "horizontal";
  const verticalOscillationState = createLevelState(level);
  const verticalOscillationEnemy = verticalOscillationState.enemies[0];
  verticalOscillationState.blocks = [];
  verticalOscillationEnemy.direction = "down";
  verticalOscillationEnemy.lastMoveDirection = "up";
  verticalOscillationEnemy.oscillationTurns = 2;
  updateOscillationState(verticalOscillationEnemy, "down", TILE / 2);
  const verticalEscapeDirection = verticalOscillationEnemy.oscillationEscapeDirection;
  const verticalOscillationOptions = getEnemyMoveOptions(
    verticalOscillationState,
    verticalOscillationEnemy,
    "up",
  );
  const verticalOscillationEscaped =
    verticalEscapeDirection !== null &&
    getDirectionAxis(verticalEscapeDirection) === "horizontal" &&
    getDirectionAxis(verticalOscillationOptions[0]) === "horizontal";
  const horizontalOscillationState = createLevelState(level);
  const horizontalOscillationEnemy = horizontalOscillationState.enemies[0];
  horizontalOscillationState.blocks = [];
  horizontalOscillationEnemy.direction = "right";
  horizontalOscillationEnemy.lastMoveDirection = "left";
  horizontalOscillationEnemy.oscillationTurns = 2;
  updateOscillationState(horizontalOscillationEnemy, "right", TILE / 2);
  const horizontalEscapeDirection = horizontalOscillationEnemy.oscillationEscapeDirection;
  const horizontalOscillationOptions = getEnemyMoveOptions(
    horizontalOscillationState,
    horizontalOscillationEnemy,
    "left",
  );
  const horizontalOscillationEscaped =
    horizontalEscapeDirection !== null &&
    getDirectionAxis(horizontalEscapeDirection) === "vertical" &&
    getDirectionAxis(horizontalOscillationOptions[0]) === "vertical";
  const contactState = createLevelState(level);
  const contactEnemy = contactState.enemies[0];
  contactState.blocks = [];
  contactState.player.x = cellToX(10);
  contactState.player.y = cellToY(4);
  contactEnemy.x = cellToX(9);
  contactEnemy.y = cellToY(4);
  contactEnemy.direction = "right";
  const contactStart = { x: contactEnemy.x, y: contactEnemy.y };
  const contactOptions = getEnemyMoveOptions(contactState, contactEnemy, "right");
  contactOptions.some((direction) => {
    contactEnemy.direction = direction;
    return moveTank(contactEnemy, direction, 0.12, contactState);
  });
  const enemyContactState = createLevelState(level);
  const enemyContactEnemy = enemyContactState.enemies[0];
  const blockingEnemy = createTank("enemy", cellToX(10), cellToY(4), "left", level);
  enemyContactState.blocks = [];
  enemyContactState.enemies = [enemyContactEnemy, blockingEnemy];
  enemyContactEnemy.x = cellToX(9);
  enemyContactEnemy.y = cellToY(4);
  enemyContactEnemy.direction = "right";
  const enemyContactStart = { x: enemyContactEnemy.x, y: enemyContactEnemy.y };
  const enemyContactOptions = getEnemyMoveOptions(enemyContactState, enemyContactEnemy, "right");
  enemyContactOptions.some((direction) => {
    enemyContactEnemy.direction = direction;
    return moveTank(enemyContactEnemy, direction, 0.12, enemyContactState);
  });

  return {
    activePickups: getActivePickupCount(testState),
    baseApproachCells: getBaseApproachCells(testState),
    baseOverheadColumnsBlocked: [9, 10].every((x) =>
      Array.from({ length: 11 }, (_, index) => index + 3).some((y) => hasBlockAt(testState.blocks, x, y)),
    ),
    bottomDefenseCellsBlocked: [9, 10, 11].every((x) => isBlockedCellForPath(x, 17, testState.blocks)),
    piercingEnemyDirection: chooseEnemyMoveDirection(testState, enemy),
    activePickupsAfterRefill: getActivePickupCount(pickupState),
    pickupRespawnedElsewhere: !respawnedAtConsumedCell,
    piercingDestroyedBrickCount: 2 - piercingState.blocks.filter((block) => block.kind === "brick").length,
    bulletStoppedAfterTwoBricks: piercingState.bullets.length === 0,
    stuckEnemyEscaped: stuckEnemyEscaped && stuckRecoveryDistance > 0,
    stuckRecoveryWasMovementOnly: stuckRecoveryDistance > 0 && stuckRecoveryDistance < TILE,
    openAreaWatchdogRecovered: openAreaRecoveryDistance > 0,
    openAreaWatchdogWasMovementOnly: openAreaRecoveryDistance > 0 && openAreaRecoveryDistance < TILE,
    screenshotAreaWatchdogRecovered: screenshotRecoveryDistance > 0,
    screenshotAreaWatchdogWasMovementOnly: screenshotRecoveryDistance > 0 && screenshotRecoveryDistance < TILE,
    flatWallSlideWorked:
      flatWallEnemy.x === flatWallStart.x && Math.abs(flatWallEnemy.y - flatWallStart.y) > 0,
    wallTurnRecoveryStarted,
    wallTurnRecoveryRepeatedSameSide,
    wallTurnRecoveryResetAfterOneCell,
    committedMovementHeldUntilOneCell,
    immediateReverseAvoidedInOpenArea,
    verticalOscillationEscaped,
    horizontalOscillationEscaped,
    playerContactAvoided:
      contactEnemy.x <= contactStart.x && Math.hypot(contactEnemy.x - contactStart.x, contactEnemy.y - contactStart.y) > 0,
    enemyContactAvoided:
      enemyContactEnemy.x <= enemyContactStart.x &&
      Math.hypot(enemyContactEnemy.x - enemyContactStart.x, enemyContactEnemy.y - enemyContactStart.y) > 0,
  };
}
