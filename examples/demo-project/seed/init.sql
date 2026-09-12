-- Demo project seed data
-- Automatically loaded by PostgreSQL on first start via docker-entrypoint-initdb.d

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO users (name, email, role) VALUES
  ('Alice Johnson', 'alice@example.com', 'admin'),
  ('Bob Smith', 'bob@example.com', 'user'),
  ('Charlie Brown', 'charlie@example.com', 'user'),
  ('Diana Prince', 'diana@example.com', 'moderator'),
  ('Eve Wilson', 'eve@example.com', 'user');

-- Products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO products (name, description, price, stock, category) VALUES
  ('Widget A', 'Standard widget for everyday use', 9.99, 100, 'widgets'),
  ('Widget B', 'Premium widget with extra features', 19.99, 50, 'widgets'),
  ('Gadget X', 'Compact gadget for professionals', 49.99, 30, 'gadgets'),
  ('Gadget Y', 'Enterprise-grade gadget', 99.99, 15, 'gadgets'),
  ('Tool Alpha', 'Multi-purpose tool', 24.99, 75, 'tools'),
  ('Tool Beta', 'Specialized cutting tool', 34.99, 40, 'tools'),
  ('Part 001', 'Replacement part for Widget A', 4.99, 200, 'parts'),
  ('Part 002', 'Replacement part for Gadget X', 14.99, 120, 'parts');

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO orders (user_id, product_id, quantity, total, status) VALUES
  (1, 1, 2, 19.98, 'completed'),
  (1, 3, 1, 49.99, 'completed'),
  (2, 2, 3, 59.97, 'shipped'),
  (2, 5, 1, 24.99, 'pending'),
  (3, 4, 2, 199.98, 'completed'),
  (3, 7, 10, 49.90, 'shipped'),
  (4, 6, 1, 34.99, 'completed'),
  (4, 8, 5, 74.95, 'pending'),
  (5, 1, 4, 39.96, 'completed'),
  (5, 3, 1, 49.99, 'shipped');
