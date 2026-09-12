#!/usr/bin/env node
/**
 * Seed script for MinIO and Redis.
 *
 * Uploads test files to MinIO and sets cache keys in Redis.
 * Reads connection info from environment variables with defaults matching docker-compose.yml.
 *
 * Usage: node seed.js
 */

const { Client: MinioClient } = require('minio');
const { createClient } = require('redis');

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9100');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:63791';

async function waitForRedis(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = createClient({ url });
      client.on('error', () => {});
      await client.connect();
      await client.ping();
      return client;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Redis not ready after 30s');
}

async function waitForMinio(endpoint, port, maxRetries = 30) {
  const client = new MinioClient({
    endPoint: endpoint,
    port,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    useSSL: false,
  });
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.listBuckets();
      return client;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('MinIO not ready after 30s');
}

async function seedRedis(redisClient) {
  console.log('Seeding Redis...');

  await redisClient.set('cache:users:list', JSON.stringify(['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Eve Wilson']));
  await redisClient.set('cache:products:list', JSON.stringify(['Widget A', 'Widget B', 'Gadget X', 'Gadget Y', 'Tool Alpha', 'Tool Beta', 'Part 001', 'Part 002']));
  await redisClient.set('config:app', JSON.stringify({ version: '1.0.0', env: 'demo', name: 'demo-project' }));
  await redisClient.set('session:user:1', JSON.stringify({ userId: 1, role: 'admin', lastLogin: new Date().toISOString() }));
  await redisClient.set('session:user:2', JSON.stringify({ userId: 2, role: 'user', lastLogin: new Date().toISOString() }));

  console.log('Redis seeded: 5 keys');
}

async function seedMinio(minioClient) {
  console.log('Seeding MinIO...');

  const bucket = 'demo-files';
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
    console.log(`Created bucket: ${bucket}`);
  }

  const files = [
    { name: 'report.pdf', content: '%PDF-1.4 demo report content\nPage 1: Quarterly Sales Report\nTotal revenue: $594.61\nOrders: 10\nTop product: Gadget Y ($199.98)' },
    { name: 'data.csv', content: 'id,name,price,stock\n1,Widget A,9.99,100\n2,Widget B,19.99,50\n3,Gadget X,49.99,30\n4,Gadget Y,99.99,15\n5,Tool Alpha,24.99,75' },
    { name: 'readme.md', content: '# Demo Project\n\nThis is a demo project for testing qoder-proxy MCP capabilities.\n\n## Services\n- PostgreSQL: users, products, orders tables\n- Redis: cache keys for users and products\n- MinIO: document storage\n- NATS: math microservice communication' },
    { name: 'config.json', content: JSON.stringify({ app: 'demo-project', version: '1.0.0', features: ['math', 'orders', 'users', 'products'] }, null, 2) },
    { name: 'logo.png', content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') },
  ];

  for (const file of files) {
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf-8');
    const contentType = file.name.endsWith('.png') ? 'image/png'
      : file.name.endsWith('.pdf') ? 'application/pdf'
      : file.name.endsWith('.csv') ? 'text/csv'
      : file.name.endsWith('.json') ? 'application/json'
      : 'text/plain';
    await minioClient.putObject(bucket, file.name, buf, buf.length, { 'Content-Type': contentType });
    console.log(`  Uploaded: ${file.name} (${buf.length} bytes)`);
  }

  console.log(`MinIO seeded: ${files.length} files in bucket "${bucket}"`);
}

async function main() {
  console.log('Starting seed...');
  console.log(`  MinIO: ${MINIO_ENDPOINT}:${MINIO_PORT}`);
  console.log(`  Redis: ${REDIS_URL}`);

  const [redisClient, minioClient] = await Promise.all([
    waitForRedis(REDIS_URL),
    waitForMinio(MINIO_ENDPOINT, MINIO_PORT),
  ]);

  try {
    await Promise.all([
      seedRedis(redisClient),
      seedMinio(minioClient),
    ]);
    console.log('Seed complete!');
  } finally {
    await redisClient.disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
