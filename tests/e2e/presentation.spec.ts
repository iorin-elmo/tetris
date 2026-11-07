import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { createGame, step, type GameState, type LockEvent } from '../../packages/engine/src/index';
import { PROJECT_DEFAULT as rules } from '../../packages/rulesets/src/index';
import { publicState } from '../../packages/protocol/src/index';

async function fixture(page: Page, state: GameState) {
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/ws', (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'input.configure') ws.send(JSON.stringify({ type: 'ack', requestId: m.requestId }));
      if (m.type === 'hello')
        ws.send(
          JSON.stringify({
            type: 'welcome',
            requestId: m.requestId,
            sessionId: 'me',
            resumeToken: 'fixture'.repeat(8),
            serverTime: Date.now(),
            roomCode: null,
            limits: { maxPlayers: 10, tickRate: 60, resumeSeconds: 30 },
          }),
        );
      if (m.type === 'room.create') {
        ws.send(JSON.stringify({ type: 'ack', requestId: m.requestId }));
        ws.send(
          JSON.stringify({
            type: 'match.start',
            matchId: 'fixture',
            tick: state.tick,
            rules,
            self: state,
            selfRules: rules,
            ackSeq: -1,
            startAt: Date.now() + 600000,
            players: [
              {
                id: 'me',
                name: 'YOU',
                team: 0,
                state: publicState(state),
                target: null,
                ko: 0,
                placement: null,
              },
            ],
          }),
        );
      }
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /オンラインで遊ぶ/ }).click();
  await page.getByRole('button', { name: /新しい部屋を作る/ }).click();
  await expect(page.locator('.field canvas')).toBeVisible();
  return (value: unknown) => socket.send(JSON.stringify(value));
}

test('T-spin, B2B and REN are legible together and fit on a narrow screen', async ({ page }) => {
  const state = createGame(1);
  state.b2b = true;
  state.streak = 4;
  state.tick = 100;
  const send = await fixture(page, state);
  const event: LockEvent = {
    type: 'lock',
    piece: 'T',
    lines: 2,
    spin: 'full',
    b2b: true,
    ren: 3,
    perfectClear: false,
    generated: 6,
    attack: 6,
    cancelled: 0,
    inserted: 0,
  };
  send({
    type: 'match.event',
    matchId: 'fixture',
    tick: 100,
    kind: 'lock',
    payload: { playerId: 'me', ...event },
  });
  await expect(page.getByLabel('B2B 継続中')).toBeVisible();
  await expect(page.getByLabel('3 REN')).toBeVisible();
  await expect(page.locator('.clear-announcement')).toContainText('T-SPIN');
  await expect(page.locator('.clear-announcement')).toContainText('DOUBLE');
  await expect(page.locator('.clear-announcement')).toContainText('BACK-TO-BACK');
  await expect(page.locator('.clear-attack')).toContainText('+6');
  await page.screenshot({ path: '.local/game-feedback.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const eventBox = await page.locator('.clear-announcement').boundingBox();
  const fieldBox = await page.locator('.field').boundingBox();
  expect(eventBox!.x + eventBox!.width).toBeLessThanOrEqual(fieldBox!.x);
  await page.screenshot({ path: '.local/game-feedback-mobile.png', fullPage: true });
});

test('warns about a fatal placement with ghost disabled and explains the eventual defeat', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('stacklane.preferences', JSON.stringify({ ghost: false })),
  );
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 36 };
  state.queue[0] = 'O';
  state.board[19 * 10 + 4] = 8;
  const send = await fixture(page, state);
  await expect(page.locator('.field')).toHaveClass(/fatal-placement/);
  await expect(page.locator('.field-bottom')).toContainText('この位置に置くと次のミノが出せません');
  // A red landing marker must remain visible independently of the optional ghost.
  const red = await page.locator('.field canvas').evaluate((canvas: HTMLCanvasElement) => {
    const scale = canvas.width / 280;
    const data = canvas.getContext('2d')!.getImageData(29 * scale, 560 * scale, 4 * scale, 5 * scale).data;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] > 180 && data[i + 1] < 140 && data[i + 2] < 160) return true;
    return false;
  });
  expect(red).toBe(true);
  await page.screenshot({ path: '.local/topout-warning.png', fullPage: true });
  const dead = step(state, { hard: true }, rules).state;
  send({
    type: 'match.snapshot',
    matchId: 'fixture',
    tick: dead.tick,
    rules,
    self: dead,
    selfRules: rules,
    ackSeq: -1,
    startAt: Date.now() + 600000,
    players: [
      { id: 'me', name: 'YOU', team: 0, state: publicState(dead), target: null, ko: 0, placement: 2 },
    ],
  });
  await expect(page.locator('.field-bottom')).toContainText('次のミノの出現位置がふさがりました');
});
