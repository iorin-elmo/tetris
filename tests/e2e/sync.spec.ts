import { expect, test } from '@playwright/test';
import { createGameServer } from '../../apps/server/src/transport/server';
import { createGame } from '../../packages/engine/src/index';

test('garbage and a rejected drop recover without an input-error loop or a false KO', async ({
  page,
  browser,
}) => {
  const app = createGameServer({ database: ':memory:', countdownMs: 500 });
  const port = await app.listen(0);
  const endpoint = `ws://127.0.0.1:${port}/ws`;
  const other = await browser.newContext();
  const guest = await other.newPage();
  let fault = false,
    resets = 0,
    serverKO = false;
  const errors: string[] = [];
  const inputErrors: string[] = [];
  for (const p of [page, guest]) {
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(
      (url) => localStorage.setItem('stacklane.preferences', JSON.stringify({ wsUrl: url })),
      endpoint,
    );
  }
  await page.routeWebSocket('**/ws', (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const m = JSON.parse(raw.toString());
      if (
        !fault &&
        m.type === 'input.batch' &&
        m.frames.some((f: { input: { hard?: boolean } }) => f.input.hard)
      ) {
        fault = true;
        // Lose this whole batch, then deliver a later seq over the same ordered
        // transport. The authority rejects the gap; the client must recover.
        return;
      }
      if (m.type === 'input.resync') resets++;
      server.send(raw);
    });
    server.onMessage((raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'match.event' && m.kind === 'ko') serverKO = true;
      if (m.type === 'error' && m.code.startsWith('INPUT_')) inputErrors.push(m.code);
      ws.send(raw);
    });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /オンラインで遊ぶ/ }).click();
    await page.getByRole('button', { name: /新しい部屋を作る/ }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    const code = (await page.locator('.room-code').textContent())!;
    await guest.goto(`/?room=${code}`);
    await guest.getByRole('button', { name: /コードで参加する/ }).click();
    await expect(page.locator('.member-row')).toHaveCount(2);
    await page.getByRole('button', { name: /対戦をはじめる/ }).click();
    const match = app.service.rooms.get(code)!.match!;
    const [defender, attacker] = match.players;
    attacker.state = createGame(5, attacker.rules);
    attacker.state.board[30 * 10] = 8; // avoid a perfect-clear bonus
    for (let y = 36; y < 40; y++)
      for (let x = 0; x < 10; x++) if (x !== 4) attacker.state.board[y * 10 + x] = 8;
    attacker.state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
    await expect(page.locator('.field')).toBeVisible({ timeout: 10000 });
    await expect(guest.locator('.field')).toBeVisible();
    await Promise.all([page.keyboard.press('ArrowUp'), guest.keyboard.press('ArrowUp')]);
    await expect.poll(() => resets).toBe(1);
    await expect.poll(() => attacker.state.stats.attackGenerated).toBe(4);
    await expect.poll(() => defender.state.garbage.reduce((n, p) => n + p.lines, 0)).toBe(4);
    // The rejected drop did not place anything; the next genuine press must
    // place exactly one piece and receive this packet exactly once.
    expect(defender.state.stats.placements).toBe(0);
    await page.waitForTimeout(650);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => defender.state.stats.receivedGarbage).toBe(4);
    expect(defender.state.stats.placements).toBe(1);
    expect(serverKO).toBe(false);
    await expect(page.locator('.field-caption')).not.toContainText('KO');
    await expect(page.locator('.connection-banner.error')).toHaveCount(0);
    // Confirm the actual painted garbage rows agree with the authority, rather
    // than just checking a message or a local prediction counter.
    await expect
      .poll(() =>
        page.locator('.field canvas').evaluate((canvas: HTMLCanvasElement) => {
          const scale = canvas.width / 280;
          const ctx = canvas.getContext('2d')!;
          let gray = 0;
          for (let y = 18; y < 22; y++)
            for (let x = 0; x < 10; x++) {
              const pixel = ctx.getImageData((x * 28 + 14) * scale, (y * 28 + 14) * scale, 1, 1).data;
              if (pixel[0] === 105 && pixel[1] === 115 && pixel[2] === 129) gray++;
            }
          return gray;
        }),
      )
      .toBe(36);
    // A busy/suspended tab used to send >120-tick-old frames after resuming,
    // which rejected a batch and left every later seq permanently invalid.
    await page.evaluate(() => {
      const until = performance.now() + 2250;
      while (performance.now() < until) {
        /* deliberately stall this client only */
      }
    });
    await page.waitForTimeout(250);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => defender.state.stats.placements).toBe(2);
    expect(defender.state.stats.receivedGarbage).toBe(4);
    expect(resets).toBe(2);
    expect(inputErrors).toEqual(['INPUT_SEQUENCE']);
    await page.evaluate(() => {
      const original = Date.now;
      Date.now = () => original() + 10000;
    });
    await expect.poll(() => resets).toBe(3);
    await page.waitForTimeout(300);
    expect(resets).toBe(3);
    expect(inputErrors).toEqual(['INPUT_SEQUENCE']);
    for (let i = 0; i < 40 && !match.finished; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(70);
    }
    await expect(page.locator('.results-modal')).toBeVisible();
    expect(serverKO).toBe(true);
    expect(defender.state.alive).toBe(false);
    await page.waitForTimeout(250);
    await expect(page.locator('.field-caption')).toContainText('KO');
    await expect(page.locator('.connection-banner.error')).toHaveCount(0);
    expect(resets).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await other.close();
    await app.close();
  }
});
