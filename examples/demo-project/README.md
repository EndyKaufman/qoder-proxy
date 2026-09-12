# Demo Project

A gateway + microservice example used as a real project for qoder-proxy e2e tests.

## Architecture

```
┌──────────┐     HTTP      ┌──────────┐     NATS      ┌──────────────┐
│  Client  │ ────────────> │ Gateway  │ ────────────> │ Microservice │
│          │ <──────────── │ (Express)│ <──────────── │ (Math)       │
└──────────┘     JSON      └────┬─────┘     JSON      └──────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               ┌────┴───┐ ┌────┴───┐ ┌────┴───┐
               │   PG   │ │ Redis  │ │ MinIO  │
               │ :54321 │ │ :63791 │ │ :9100  │
               └────────┘ └────────┘ └────────┘
```

## Services

- **Gateway** (port 3001): Express HTTP API that queries PostgreSQL, caches via Redis, and delegates math operations to the microservice via NATS.
- **Microservice**: NATS subscriber that handles `math.add`, `math.multiply`, `math.divide`, `math.subtract` operations.

## Infrastructure

| Service    | Port  | Credentials              |
|------------|-------|--------------------------|
| PostgreSQL | 54321 | demo/demo, database: demo |
| Redis      | 63791 | no auth                  |
| MinIO      | 9100  | minioadmin/minioadmin    |
| NATS       | 42222 | no auth                  |

## Quick Start

```bash
# Start infrastructure
docker-compose up -d

# Wait for services to be healthy, then seed MinIO and Redis
cd seed && npm install && node seed.js

# Start gateway (requires npm install first)
cd gateway && npm install && npm start

# Start microservice (requires npm install first)
cd microservice && npm install && npm start
```

## API Endpoints

| Method | Path            | Description                          |
|--------|-----------------|--------------------------------------|
| GET    | /users          | List all users                       |
| GET    | /users/:id      | Get user by ID                       |
| GET    | /products       | List products (Redis cache check)    |
| GET    | /orders         | List orders with user/product joins  |
| GET    | /orders/stats   | Order statistics                     |
| POST   | /math/add       | Add via NATS microservice            |
| GET    | /health         | Health check                         |

## Seed Data

- **PostgreSQL**: 5 users, 8 products, 10 orders across 3 tables
- **MinIO**: `demo-files` bucket with report.pdf, data.csv, readme.md, config.json, logo.png
- **Redis**: cache:users:list, cache:products:list, config:app, session:user:1, session:user:2
