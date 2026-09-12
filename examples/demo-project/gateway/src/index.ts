import express from 'express';
import { Pool } from 'pg';
import { createRoutes, connectRedis, closeRedis } from './routes';
import { connectNats, closeNats } from './nats';

const PORT = parseInt(process.env.PORT || '3001');
const PG_HOST = process.env.PG_HOST || 'localhost';
const PG_PORT = parseInt(process.env.PG_PORT || '54321');
const PG_USER = process.env.PG_USER || 'demo';
const PG_PASSWORD = process.env.PG_PASSWORD || 'demo';
const PG_DATABASE = process.env.PG_DATABASE || 'demo';

async function main() {
  // PostgreSQL
  const pgPool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
  });

  // Verify PG connection
  const pgClient = await pgPool.connect();
  await pgClient.release();
  console.log(`Connected to PostgreSQL: ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);

  // Redis
  await connectRedis();

  // NATS
  await connectNats();

  // Express app
  const app = express();
  app.use(express.json());
  app.use(createRoutes(pgPool));

  const server = app.listen(PORT, () => {
    console.log(`Gateway listening on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await closeNats();
    await closeRedis();
    await pgPool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Gateway failed to start:', err);
  process.exit(1);
});
