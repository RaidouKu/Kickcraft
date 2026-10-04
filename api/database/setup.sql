-- KickCraft Database Setup Script
-- Schema definition and seed data
-- Note: KickCraft uses soft and permanent deletion flags; physical row deletion is forbidden.

CREATE DATABASE IF NOT EXISTS kickcraft_db;
USE kickcraft_db;

-- --------------------------------------------------------
-- Users Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'owner', 'seller') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role ENUM migration: expands role ENUM('customer', 'owner') to include 'seller'
ALTER TABLE users
  MODIFY COLUMN role ENUM('customer', 'owner', 'seller') NOT NULL DEFAULT 'customer';

-- Disable the old demo credential if this migration is run on an existing database.
UPDATE users SET deleted_at = CURRENT_TIMESTAMP, permanently_deleted = 1
WHERE email = 'admin@kickcraft.local';

-- --------------------------------------------------------
-- Seller Profiles Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS seller_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  store_name VARCHAR(255) NOT NULL,
  store_description TEXT DEFAULT NULL,
  status ENUM('pending', 'approved', 'suspended', 'rejected') NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_seller_user_id (user_id),
  INDEX idx_seller_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Shoes Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS shoes (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 4890.00,
  stock INT NOT NULL DEFAULT 0,
  status ENUM('available', 'in_stock', 'coming_soon', 'out_of_stock') NOT NULL DEFAULT 'available',
  glb_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(2048) DEFAULT '/images/kickcraft-one-card.png',
  charms_enabled TINYINT(1) NOT NULL DEFAULT 1,
  charm_offset VARCHAR(100) DEFAULT NULL,
  charm_scale VARCHAR(100) DEFAULT '1 1 1',
  charm_dir VARCHAR(500) DEFAULT NULL,
  categories JSON NOT NULL,
  parts JSON NOT NULL,
  colors JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Reservations Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id VARCHAR(64) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  pickup_date DATE NOT NULL,
  shoe_id VARCHAR(100) NOT NULL,
  shoe_name VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  part_colors JSON NOT NULL,
  charm_id VARCHAR(50) NOT NULL DEFAULT 'none',
  charm_label VARCHAR(50) NOT NULL DEFAULT 'None',
  status ENUM('pending', 'approved', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_reservations_email (email),
  KEY idx_reservations_status (status),
  KEY idx_reservations_pickup_date (pickup_date),
  KEY idx_reservations_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration for existing databases: collapse legacy payment/arrival states.
UPDATE reservations SET status = 'completed' WHERE status IN ('paid', 'arrived');
ALTER TABLE reservations
  MODIFY COLUMN status ENUM('pending', 'approved', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations (email);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_pickup_date ON reservations (pickup_date);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations (created_at);

-- --------------------------------------------------------
-- Community Designs Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_designs (
  id VARCHAR(64) PRIMARY KEY,
  designer_name VARCHAR(255) NOT NULL,
  designer_email VARCHAR(255) NOT NULL,
  design_name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  shoe_id VARCHAR(100) NOT NULL,
  shoe_name VARCHAR(255) NOT NULL,
  part_colors JSON NOT NULL,
  charm_id VARCHAR(50) NOT NULL DEFAULT 'none',
  charm_label VARCHAR(50) NOT NULL DEFAULT 'None',
  status ENUM('pending', 'approved', 'rejected', 'featured') NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT NULL,
  featured_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_designs_status (status),
  INDEX idx_designs_shoe_id (shoe_id),
  INDEX idx_designs_email (designer_email),
  INDEX idx_designs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed Data: Initial Shoes
-- --------------------------------------------------------
INSERT INTO shoes (
  id, name, description, price, stock, status, glb_path, thumbnail_path,
  charms_enabled, charm_offset, charm_scale, charm_dir,
  categories, parts, colors
) VALUES
(
  'kickcraft-one',
  'KickCraft One',
  'Our original customizable sneaker concept.',
  4890.00,
  50,
  'available',
  '/models/shoe-soleview-final.glb',
  '/images/kickcraft-one-card.png',
  1,
  NULL,
  '1 1 1',
  NULL,
  '["kickcraft", "sneakers"]',
  '[{"id":"upper","label":"Upper","material":"UpperMaterial"},{"id":"toe-cap","label":"Toe cap","material":"ToeCapMaterial"},{"id":"tongue","label":"Tongue","material":"TongueMaterial"},{"id":"laces","label":"Laces","material":"LacesMaterial"},{"id":"heel-panel","label":"Heel panel","material":"HeelPanelMaterial"},{"id":"side-accents","label":"Side accents","material":"SideAccentsMaterial"},{"id":"midsole","label":"Midsole","material":"MidsoleMaterial"},{"id":"outsole","label":"Outsole","material":"OutsoleMaterial"}]',
  '[{"name":"Chalk","value":"#f1efe8"},{"name":"Graphite","value":"#292b2d"},{"name":"Cobalt","value":"#245fa8"},{"name":"Rust","value":"#b94d27"},{"name":"Moss","value":"#52684f"},{"name":"Burgundy","value":"#713741"}]'
),
(
  'nike-air-max',
  'Nike Air Max',
  'A 3D shoe with three simple customization zones.',
  4890.00,
  50,
  'available',
  '/models/nike-air-max-custom.glb',
  '/images/nike-air-max-card.png',
  1,
  '0.003800 0.005100 0.085800',
  '0.25 0.25 0.25',
  '/models/charms/air-max/',
  '["sneakers", "running", "fashion"]',
  '[{"id":"upper","label":"Upper","material":"UpperMaterial"},{"id":"laces","label":"Laces","material":"LacesMaterial"},{"id":"midsole","label":"Midsole","material":"MidsoleMaterial"}]',
  '[{"name":"Chalk","value":"#f1efe8"},{"name":"Graphite","value":"#292b2d"},{"name":"Cobalt","value":"#245fa8"},{"name":"Rust","value":"#b94d27"},{"name":"Moss","value":"#52684f"},{"name":"Burgundy","value":"#713741"}]'
),
(
  'nike-dunk',
  'Nike Dunk',
  'An iconic silhouette with customizable upper, laces, and midsole.',
  4890.00,
  50,
  'available',
  '/models/nike-dunk.glb',
  '/images/nike-dunk-card.png',
  1,
  NULL,
  '0.35 0.35 0.35',
  NULL,
  '["sneakers", "fashion", "basketball"]',
  '[{"id":"upper","label":"Upper","material":"UpperMaterial"},{"id":"laces","label":"Laces","material":"LacesMaterial"},{"id":"midsole","label":"Midsole","material":"MidsoleMaterial"}]',
  '[{"name":"Chalk","value":"#f1efe8"},{"name":"Graphite","value":"#292b2d"},{"name":"Cobalt","value":"#245fa8"},{"name":"Rust","value":"#b94d27"},{"name":"Moss","value":"#52684f"},{"name":"Burgundy","value":"#713741"}]'
),
(
  'kickcraft-canvas-shoe',
  'KickCraft Canvas Shoe',
  'Customizable silhouette based on canvas_shoe.glb.',
  4990.00,
  25,
  'available',
  '/models/canvas_shoe.glb',
  '/images/kickcraft-canvas-card.png',
  0,
  NULL,
  '1 1 1',
  NULL,
  '["kickcraft", "sneakers", "fashion"]',
  '[{"id":"initial-shading-group","label":"Upper","material":"initialShadingGroup","customizable":true}]',
  '[{"name":"Chalk","value":"#f1efe8"},{"name":"Graphite","value":"#292b2d"},{"name":"Cobalt","value":"#245fa8"},{"name":"Rust","value":"#b94d27"},{"name":"Yellow","value":"#c8f000"},{"name":"Orange","value":"#b86b00"}]'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  price = VALUES(price),
  stock = VALUES(stock),
  status = VALUES(status);

-- --------------------------------------------------------
-- Seed Data: Sample Reservations
-- --------------------------------------------------------
INSERT INTO reservations (
  id, customer_name, email, pickup_date, shoe_id, shoe_name,
  size, price, part_colors, charm_id, charm_label,
  status, notes, created_at
) VALUES
(
  'KC-2026-1041',
  'Alex Reyes',
  'alex.reyes@example.com',
  '2026-09-18',
  'kickcraft-one',
  'KickCraft One',
  9,
  4890.00,
  '{"upper":{"name":"Cobalt","value":"#245fa8"},"toe-cap":{"name":"Chalk","value":"#f1efe8"},"laces":{"name":"Rust","value":"#b94d27"},"midsole":{"name":"Graphite","value":"#292b2d"}}',
  'star',
  'Star',
  'completed',
  'Pickup completed.',
  '2026-09-11 14:32:00'
),
(
  'KC-2026-1042',
  'Bea Gomez',
  'bea.gomez@example.com',
  '2026-09-19',
  'nike-air-max',
  'Nike Air Max',
  8,
  4890.00,
  '{"upper":{"name":"Burgundy","value":"#713741"},"laces":{"name":"Chalk","value":"#f1efe8"},"midsole":{"name":"Chalk","value":"#f1efe8"}}',
  'k-tag',
  'K tag',
  'completed',
  'Pickup completed.',
  '2026-09-12 10:15:00'
),
(
  'KC-2026-1043',
  'Carlos Mendoza',
  'carlos.m@example.com',
  '2026-09-20',
  'kickcraft-one',
  'KickCraft One',
  10,
  4890.00,
  '{"upper":{"name":"Moss","value":"#52684f"},"laces":{"name":"Graphite","value":"#292b2d"},"midsole":{"name":"Chalk","value":"#f1efe8"},"outsole":{"name":"Rust","value":"#b94d27"}}',
  'lightning',
  'Lightning',
  'completed',
  'Pickup completed.',
  '2026-09-13 16:45:00'
),
(
  'KC-2026-1044',
  'Danica Cruz',
  'danica.cruz@example.com',
  '2026-09-21',
  'nike-dunk',
  'Nike Dunk',
  7,
  4890.00,
  '{"upper":{"name":"Cobalt","value":"#245fa8"},"laces":{"name":"Chalk","value":"#f1efe8"},"midsole":{"name":"Graphite","value":"#292b2d"}}',
  'none',
  'None',
  'pending',
  'Customer reservation placed online.',
  '2026-09-14 09:20:00'
)
ON DUPLICATE KEY UPDATE
  status = VALUES(status);

-- --------------------------------------------------------
-- Products Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  creation_method ENUM('upload', 'ai_generate', 'template') NOT NULL,
  glb_path VARCHAR(500) DEFAULT NULL,
  thumbnail_path VARCHAR(500) DEFAULT NULL,
  base_shoe_id VARCHAR(100) DEFAULT NULL,
  part_colors JSON DEFAULT NULL,
  charm_id VARCHAR(50) DEFAULT 'none',
  mesh_map JSON DEFAULT NULL,
  sizes_available JSON NOT NULL DEFAULT '[]',
  status ENUM('draft', 'pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'draft',
  admin_notes TEXT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_products_seller (seller_id),
  INDEX idx_products_status (status),
  INDEX idx_products_method (creation_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- AI Generations Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_generations (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  source_image_path VARCHAR(500) NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  result_glb_path VARCHAR(500) DEFAULT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'huggingface_triposr',
  error_message TEXT DEFAULT NULL,
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_seller (seller_id),
  INDEX idx_ai_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Tutorial Progress Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tutorial_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  completed_steps JSON NOT NULL DEFAULT '[]',
  current_step VARCHAR(50) DEFAULT 'welcome',
  tutorial_completed TINYINT(1) NOT NULL DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tutorial_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Orders Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  buyer_email VARCHAR(255) NOT NULL,
  custom_colors JSON NOT NULL,
  custom_charm VARCHAR(50) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_thumbnail VARCHAR(255) NOT NULL,
  seller_store_name VARCHAR(255) NOT NULL,
  status ENUM('pending', 'confirmed', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  pickup_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_orders_seller (seller_id),
  INDEX idx_orders_email (buyer_email),
  INDEX idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clean up any existing AI-generated products to ensure mesh_map and part_colors are NULL
UPDATE products SET mesh_map = NULL, part_colors = NULL WHERE creation_method = 'ai_generate';


