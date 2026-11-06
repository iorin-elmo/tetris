import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
test('ten online players retain a large own field and nine small fields', async ({ page }) => {
  const guests: WebSocket[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /オンラインで遊ぶ/ }).click();
    await page.getByRole('button', { name: /新しい部屋を作る/ }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    const code = await page.locator('.room-code').textContent();
    for (let i = 0; i < 9; i++) {
      const ws = new WebSocket('ws://127.0.0.1:3001/ws', { origin: 'http://127.0.0.1:5173' });
      guests.push(ws);
      await new Promise<void>((resolve, reject) => {
        ws.on('error', reject);
        ws.on('open', () =>
          ws.send(
            JSON.stringify({ type: 'hello', requestId: 'hello', protocolVersion: 1, clientBuild: 'layout' }),
          ),
        );
        ws.on('message', (raw) => {
          const m = JSON.parse(raw.toString());
          if (m.type === 'welcome')
            ws.send(
              JSON.stringify({ type: 'room.join', requestId: 'join', code, displayName: `PLAYER ${i + 1}` }),
            );
          if (m.type === 'ack' && m.requestId === 'join') resolve();
          if (m.type === 'error') reject(new Error(m.message));
        });
      });
    }
    await expect(page.locator('.member-row')).toHaveCount(10);
    await page.getByRole('button', { name: /対戦をはじめる/ }).click();
    await expect(page.locator('.opponent')).toHaveCount(9, { timeout: 10000 });
    const own = await page.locator('.field canvas').boundingBox(),
      small = await page.locator('.opponent canvas').first().boundingBox();
    expect(own!.width).toBeGreaterThan(small!.width * 2);
    await page.screenshot({ path: '.local/ten-players.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  } finally {
    for (const ws of guests) ws.close();
  }
});
test('mock Gamepad API supports hold, menu and disconnect release', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Test Xbox Pad',
      index: 0,
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    (window as unknown as { testPad: typeof pad }).testPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => (pad.connected ? [pad] : [null]) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /02 \/ TIME ATTACK/ }).click();
  const press = async (i: number) => {
    await page.evaluate((index) => {
      (window as unknown as { testPad: { buttons: { pressed: boolean }[] } }).testPad.buttons[index].pressed =
        true;
    }, i);
    await page.waitForTimeout(100);
    await page.evaluate((index) => {
      (window as unknown as { testPad: { buttons: { pressed: boolean }[] } }).testPad.buttons[index].pressed =
        false;
    }, i);
    await page.waitForTimeout(100);
  };
  await press(4);
  await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);
  await press(9);
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await press(9);
  await expect(page.getByRole('heading', { name: 'PAUSED' })).not.toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { testPad: { connected: boolean } }).testPad.connected = false;
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
});
