import { expect, test } from '@playwright/test';

test('opens the game shelf home with the Drop Four card', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '小游戏架' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '四子棋' })).toBeVisible();
  await expect(page.getByText('Drop Four')).toBeVisible();
  await expect(page.getByRole('heading', { name: '坦克大战' })).toBeVisible();
  await expect(page.getByText('Tank Battle')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始游戏' })).toHaveCount(2);
});

test('enters Drop Four from the home page', async ({ page }) => {
  await page.goto('/');

  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '四子棋' }) })
    .getByRole('button', { name: '开始游戏' })
    .click();

  await expect(page).toHaveURL(/\/games\/drop-four$/);
  await expect(page.getByRole('heading', { name: 'Drop Four' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText("Player 1's turn");
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeVisible();
});

test('enters Tank Battle from the home page', async ({ page }) => {
  await page.goto('/');

  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '坦克大战' }) })
    .getByRole('button', { name: '开始游戏' })
    .click();

  await expect(page).toHaveURL(/\/games\/tank-battle$/);
  await expect(page.getByRole('heading', { name: 'Tank Battle' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Level 1/10');
  await expect(page.getByTestId('tank-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sound On' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full Screen' })).toHaveCount(0);
});

test('recovers from an unknown route', async ({ page }) => {
  await page.goto('/games/not-here');

  await expect(page.getByRole('heading', { name: '这里还没有小游戏' })).toBeVisible();
  await page.getByRole('button', { name: '返回首页' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '小游戏架' })).toBeVisible();
});

test('starts a local Drop Four game with a 9x9 board', async ({ page }) => {
  await page.goto('/games/drop-four');

  await expect(page.getByRole('heading', { name: 'Drop Four' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText("Player 1's turn");
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeVisible();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId(/^cell-/)).toHaveCount(81);
});

test('drops a piece and switches turns', async ({ page }) => {
  await page.goto('/games/drop-four');

  await dropInColumn(page, 1);

  await expect(page.getByTestId('cell-8-0')).toHaveAttribute(
    'data-state',
    'player-one',
  );
  await expect(page.getByRole('status')).toContainText("Player 2's turn");
});

test('rejects a full column without switching turns', async ({ page }) => {
  await page.goto('/games/drop-four');

  for (let index = 0; index < 9; index += 1) {
    await dropInColumn(page, 1);
  }

  await expect(page.getByRole('status')).toContainText("Player 2's turn");
  await page.getByRole('button', { name: 'Drop in column 1' }).click();

  await expect(page.getByTestId('feedback')).toContainText('Column 1 is full');
  await expect(page.getByRole('status')).toContainText("Player 2's turn");
  await expect(page.locator('[data-testid$="-0"][data-state="empty"]')).toHaveCount(
    0,
  );
});

test('locks input during the drop animation', async ({ page }) => {
  await page.goto('/games/drop-four');

  await page.getByRole('button', { name: 'Drop in column 1' }).click();
  await page.getByRole('button', { name: 'Drop in column 2' }).click({
    force: true,
  });

  await expect(page.getByTestId('cell-8-0')).toHaveAttribute(
    'data-state',
    'player-one',
  );
  await expect(page.getByTestId('cell-8-1')).toHaveAttribute('data-state', 'empty');

  await page.waitForTimeout(300);
  await expect(page.getByRole('status')).toContainText("Player 2's turn");
});

test('shows a win and prevents further moves', async ({ page }) => {
  await page.goto('/games/drop-four');

  await dropInColumn(page, 1);
  await dropInColumn(page, 9);
  await dropInColumn(page, 2);
  await dropInColumn(page, 9);
  await dropInColumn(page, 3);
  await dropInColumn(page, 9);
  await dropInColumn(page, 4);

  await expect(page.getByRole('status')).toContainText('Player 1 wins!');
  await expect(page.getByTestId('final-banner')).toContainText('Player 1 wins');
  await expect(page.locator('[data-winning="true"]')).toHaveCount(4);

  await page.getByRole('button', { name: 'Drop in column 5' }).click({
    force: true,
  });
  await expect(page.getByTestId('cell-8-4')).toHaveAttribute('data-state', 'empty');
});

test('restarts after active play', async ({ page }) => {
  await page.goto('/games/drop-four');

  await dropInColumn(page, 1);
  await page.getByRole('button', { name: 'Restart game' }).click();

  await expect(page.getByRole('status')).toContainText("Player 1's turn");
  await expect(page.locator('[data-state="empty"]')).toHaveCount(81);
});

test('keeps the home and game playable at a 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '小游戏架' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始游戏' })).toHaveCount(2);
  await assertNoHorizontalScroll(page);

  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '四子棋' }) })
    .getByRole('button', { name: '开始游戏' })
    .click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeVisible();
  await dropInColumn(page, 1);
  await assertNoHorizontalScroll(page);
});

test('keeps Tank Battle playable at a 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/games/tank-battle');
  await page.waitForTimeout(600);

  const status = page.getByRole('status');
  const initialStatusBox = await status.boundingBox();
  const initialCanvasBox = await page.getByTestId('tank-canvas').boundingBox();
  expect(initialStatusBox).not.toBeNull();
  expect(initialCanvasBox).not.toBeNull();
  await expect(page.getByTestId('tank-canvas')).toBeVisible();
  await expect(status).toContainText('Level 1/10');
  await status.evaluate((element) => {
    element.textContent = 'Level 1/10 | AP 10.0s | Headquarters destroyed. Tap RST to retry this level.';
  });
  const longStatusBox = await status.boundingBox();
  const longCanvasBox = await page.getByTestId('tank-canvas').boundingBox();
  expect(longStatusBox).not.toBeNull();
  expect(longCanvasBox).not.toBeNull();
  expect(longStatusBox?.height).toBe(initialStatusBox?.height);
  expect(Math.abs((longCanvasBox?.y ?? 0) - (initialCanvasBox?.y ?? 0))).toBeLessThan(0.5);
  await expect(page.getByTestId('tank-controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full Screen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart current level' })).toBeVisible();
  await assertNoHorizontalScroll(page);
});

async function dropInColumn(page: import('@playwright/test').Page, column: number) {
  const columnIndex = column - 1;
  const filledCells = await page
    .locator(`[data-testid$="-${columnIndex}"]:not([data-state="empty"])`)
    .count();
  const targetRow = 8 - filledCells;
  const board = page.getByTestId('board');

  await page.getByRole('button', { name: `Drop in column ${column}` }).click();
  await expect(page.getByTestId(`cell-${targetRow}-${columnIndex}`)).not.toHaveAttribute(
    'data-state',
    'empty',
  );
  await expect(board).not.toHaveClass(/is-settling/);
}

async function assertNoHorizontalScroll(page: import('@playwright/test').Page) {
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
}
