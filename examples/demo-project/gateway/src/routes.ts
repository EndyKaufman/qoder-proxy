import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { publishMathRequest } from './nats';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:63791';

let redisClient: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  if (redisClient) return redisClient;
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis error:', err));
  await redisClient.connect();
  console.log(`Connected to Redis: ${REDIS_URL}`);
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
  }
}

export function createRoutes(pgPool: Pool): Router {
  const router = Router();

  // GET /users - list all users
  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const result = await pgPool.query('SELECT id, name, email, role, created_at FROM users ORDER BY id');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /users/:id - get user by id
  router.get('/users/:id', async (req: Request, res: Response) => {
    try {
      const result = await pgPool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /products - list all products (with Redis cache)
  router.get('/products', async (_req: Request, res: Response) => {
    try {
      // Check Redis cache first
      if (redisClient) {
        const cached = await redisClient.get('cache:products:list');
        if (cached) {
          return res.json({ source: 'cache', products: JSON.parse(cached) });
        }
      }
      const result = await pgPool.query('SELECT id, name, description, price, stock, category FROM products ORDER BY id');
      res.json({ source: 'database', products: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /orders - list all orders with user and product info
  router.get('/orders', async (_req: Request, res: Response) => {
    try {
      const result = await pgPool.query(`
        SELECT o.id, u.name AS user_name, p.name AS product_name,
               o.quantity, o.total, o.status, o.created_at
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN products p ON o.product_id = p.id
        ORDER BY o.id
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /orders/stats - order statistics
  router.get('/orders/stats', async (_req: Request, res: Response) => {
    try {
      const result = await pgPool.query(`
        SELECT
          COUNT(*) AS total_orders,
          SUM(total) AS total_revenue,
          COUNT(DISTINCT user_id) AS unique_customers,
          COUNT(DISTINCT product_id) AS unique_products
        FROM orders
      `);
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /math/add - add two numbers via NATS microservice
  router.post('/math/add', async (req: Request, res: Response) => {
    try {
      const { a, b } = req.body;
      if (typeof a !== 'number' || typeof b !== 'number') {
        return res.status(400).json({ error: 'Both a and b must be numbers' });
      }
      const result = await publishMathRequest('add', [a, b]);
      res.json({ operation: 'add', a, b, result: JSON.parse(result) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /health - health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'demo-gateway' });
  });

  return router;
}
