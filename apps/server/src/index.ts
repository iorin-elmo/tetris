import { createGameServer } from './transport/server';
const app = createGameServer({
  database: process.env.DATABASE_PATH || 'data/stacklane.sqlite',
  origins: (
    process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,https://iorin-elmo.github.io'
  )
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
});
const port = await app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1');
console.log(`Stacklane server listening at http://${process.env.HOST || '127.0.0.1'}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
