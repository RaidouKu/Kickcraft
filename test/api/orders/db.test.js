import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const SQL_PATH = path.join(ROOT_DIR, 'api', 'database', 'setup.sql')

test('setup.sql exists and contains no physical DELETE FROM statements', () => {
  assert.ok(fs.existsSync(SQL_PATH), 'setup.sql must exist')
  const sql = fs.readFileSync(SQL_PATH, 'utf8')
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'setup.sql must not contain any physical DELETE FROM statements')
})

test('setup.sql defines orders table with all required columns and constraints', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8')

  // Table definition
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?orders\s*\(/i, 'Must define orders table')

  // Columns & types
  assert.match(sql, /id\s+VARCHAR\(64\)\s+PRIMARY\s+KEY/i, 'orders must have id VARCHAR(64) PRIMARY KEY')
  assert.match(sql, /seller_id\s+INT\s+NOT\s+NULL/i, 'orders must have seller_id INT NOT NULL')
  assert.match(sql, /product_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i, 'orders must have product_id VARCHAR(64) NOT NULL')
  assert.match(sql, /buyer_name\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'orders must have buyer_name VARCHAR(255) NOT NULL')
  assert.match(sql, /buyer_email\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'orders must have buyer_email VARCHAR(255) NOT NULL')
  assert.match(sql, /custom_colors\s+JSON\s+NOT\s+NULL/i, 'orders must have custom_colors JSON NOT NULL')
  assert.match(sql, /custom_charm\s+VARCHAR\(50\)\s+NOT\s+NULL/i, 'orders must have custom_charm VARCHAR(50) NOT NULL')
  assert.match(sql, /unit_price\s+DECIMAL\(10,\s*2\)\s+NOT\s+NULL/i, 'orders must have unit_price DECIMAL(10,2) NOT NULL')
  assert.match(sql, /total_price\s+DECIMAL\(10,\s*2\)\s+NOT\s+NULL/i, 'orders must have total_price DECIMAL(10,2) NOT NULL')
  assert.match(sql, /product_name\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'orders must have product_name VARCHAR(255) NOT NULL')
  assert.match(sql, /product_thumbnail\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'orders must have product_thumbnail VARCHAR(255) NOT NULL')
  assert.match(sql, /seller_store_name\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'orders must have seller_store_name VARCHAR(255) NOT NULL')
  assert.match(
    sql,
    /status\s+ENUM\('pending',\s*'confirmed',\s*'ready',\s*'completed',\s*'cancelled'\)\s+NOT\s+NULL\s+DEFAULT\s+'pending'/i,
    'orders must have status ENUM'
  )
  assert.match(sql, /pickup_date\s+DATE\s+NOT\s+NULL/i, 'orders must have pickup_date DATE NOT NULL')
  assert.match(sql, /notes\s+TEXT(\s+DEFAULT\s+NULL)?/i, 'orders must have notes TEXT')
  assert.match(sql, /created_at\s+TIMESTAMP/i, 'orders must have created_at TIMESTAMP')
  assert.match(sql, /updated_at\s+TIMESTAMP/i, 'orders must have updated_at TIMESTAMP')

  // Soft delete columns
  assert.match(sql, /deleted_at\s+TIMESTAMP\s+NULL/i, 'orders must have deleted_at TIMESTAMP NULL')
  assert.match(
    sql,
    /permanently_deleted\s+TINYINT\(1\)\s+NOT\s+NULL\s+DEFAULT\s+0/i,
    'orders must have permanently_deleted TINYINT(1) NOT NULL DEFAULT 0'
  )

  // Indexes
  assert.match(sql, /INDEX\s+idx_orders_seller\s*\(\s*seller_id\s*\)/i, 'orders must have idx_orders_seller')
  assert.match(sql, /INDEX\s+idx_orders_email\s*\(\s*buyer_email\s*\)/i, 'orders must have idx_orders_email')
  assert.match(sql, /INDEX\s+idx_orders_status\s*\(\s*status\s*\)/i, 'orders must have idx_orders_status')
})
