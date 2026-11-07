import { test, expect } from '@playwright/test';
test('home, real keyboard play, pause and return', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TETRIS', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('TETRIS');
  await expect(page.locator('.home-page canvas, .little-blocks, .brand-mark')).toHaveCount(0);
  await page.screenshot({ path: '.local/home.png', fullPage: true });
  await page.getByRole('button', { name: /40 LINES タイムアタック/ }).click();
  await expect(page.getByRole('heading', { name: '40 LINES', exact: true })).toBeVisible();
  await expect(page.getByText('LEVEL', { exact: true })).toHaveCount(0);
  await expect(page.locator('.chain-display')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyC');
  await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TETRIS', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('three completed games can be retried without stale hold or board state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /MARATHON マラソン/ }).click();
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole('heading', { name: 'GAME OVER' }).isVisible()) break;
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(45);
    }
    await expect(page.getByRole('heading', { name: 'GAME OVER' })).toBeVisible();
    await expect(page.locator('.defeat-reason')).toBeVisible();
    await page.getByRole('button', { name: /もう一度プレイ/ }).click();
    await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(0);
  }
});
test('input and accessibility settings survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '設定を開く' }).click();
  await page.getByLabel('DAS (ms)', { exact: true }).fill('0');
  await page.getByLabel('ARR (ms)', { exact: true }).fill('0');
  await page.getByRole('button', { name: '画面・音', exact: true }).click();
  await page.getByLabel('ミノに文字・輪郭を表示').check();
  await page.getByRole('button', { name: /保存して閉じる/ }).click();
  await page.reload();
  await page.getByRole('button', { name: '設定を開く' }).click();
  await expect(page.getByLabel('DAS (ms)', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: '画面・音', exact: true }).click();
  await expect(page.getByLabel('ミノに文字・輪郭を表示')).toBeChecked();
});
test('CPU plays a real board and reaches a battle result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /CPU BATTLE CPU対戦/ }).click();
  await expect(page.locator('.opponent')).toHaveCount(1);
  const before = await page.locator('.opponent canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await expect
    .poll(() => page.locator('.opponent canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL()), {
      timeout: 5000,
    })
    .not.toBe(before);
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.results-modal').isVisible()) break;
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(45);
  }
  await expect(page.locator('.results-modal')).toBeVisible();
  await expect(page.locator('.results-modal tbody tr')).toHaveCount(2);
});
