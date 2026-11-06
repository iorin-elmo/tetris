import { test, expect } from '@playwright/test';
for (const rtt of [30, 100, 200])
  test(`battle holds with RTT ${rtt}ms, jitter and missing snapshots`, async ({ page, browser }) => {
    let number = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    };
    await page.routeWebSocket('**/ws', (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => later(() => server.send(message), rtt / 2));
      server.onMessage((message) => {
        const m = JSON.parse(message.toString());
        number++;
        if (m.type === 'match.snapshot' && number % 11 === 0) return;
        later(() => ws.send(message), Math.max(0, rtt / 2 + ((number % 3) - 1) * 5));
      });
    });
    const other = await browser.newContext(),
      guest = await other.newPage();
    try {
      await page.goto('/');
      await page.getByRole('button', { name: /オンラインで遊ぶ/ }).click();
      await page.getByRole('button', { name: /新しい部屋を作る/ }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      const code = await page.locator('.room-code').textContent();
      await guest.goto(`/?room=${code}`);
      await guest.getByRole('button', { name: /コードで参加する/ }).click();
      await expect(page.locator('.member-row')).toHaveCount(2);
      await page.getByRole('button', { name: /対戦をはじめる/ }).click();
      await expect(page.getByRole('heading', { name: 'FREE FOR ALL' })).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('KeyC');
      await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);
      for (let i = 0; i < 35; i++) {
        if (await page.locator('.results-modal').isVisible()) break;
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);
      }
      await expect(page.locator('.results-modal')).toBeVisible({ timeout: 10000 });
      await expect(guest.locator('.results-modal')).toBeVisible();
      await expect(page.locator('.connection-banner.error')).toHaveCount(0);
    } finally {
      await other.close();
      for (const timer of timers) clearTimeout(timer);
    }
  });
