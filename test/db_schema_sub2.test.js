import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const SQL_PATH = path.join(ROOT_DIR, 'api', 'database', 'setup.sql')

test('setup.sql exists and contains no physical DELETE FROM statements', () => {
  assert.ok(fs.existsSync(SQL_PATH), 'setup.sql must exist')
  const sql = fs.readFileSync(SQL_PATH, 'utf8')
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'setup.sql must not contain any physical DELETE FROM statements')
})

test('setup.sql defines products table with all required columns and constraints', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8')

  // Table definition
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?products\s*\(/i, 'Must define products table')

  // Columns & types
  assert.match(sql, /id\s+VARCHAR\(64\)\s+PRIMARY\s+KEY/i, 'products must have id VARCHAR(64) PRIMARY KEY')
  assert.match(sql, /seller_id\s+INT\s+NOT\s+NULL/i, 'products must have seller_id INT NOT NULL')
  assert.match(sql, /name\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'products must have name VARCHAR(255) NOT NULL')
  assert.match(sql, /price\s+DECIMAL\(10,\s*2\)\s+NOT\s+NULL/i, 'products must have price DECIMAL(10,2) NOT NULL')
  assert.match(sql, /stock\s+INT\s+NOT\s+NULL\s+DEFAULT\s+0/i, 'products must have stock INT NOT NULL DEFAULT 0')
  assert.match(
    sql,
    /creation_method\s+ENUM\('upload',\s*'ai_generate',\s*'template'\)\s+NOT\s+NULL/i,
    'products must have creation_method ENUM'
  )
  assert.match(sql, /glb_path\s+VARCHAR\(500\)/i, 'products must have glb_path VARCHAR(500)')
  assert.match(sql, /thumbnail_path\s+VARCHAR\(500\)/i, 'products must have thumbnail_path VARCHAR(500)')
  assert.match(sql, /base_shoe_id\s+VARCHAR\(100\)/i, 'products must have base_shoe_id VARCHAR(100)')
  assert.match(sql, /part_colors\s+JSON/i, 'products must have part_colors JSON')
  assert.match(sql, /charm_id\s+VARCHAR\(50\)\s+DEFAULT\s+'none'/i, "products must have charm_id VARCHAR(50) DEFAULT 'none'")
  assert.match(sql, /mesh_map\s+JSON/i, 'products must have mesh_map JSON')
  assert.match(sql, /sizes_available\s+JSON/i, 'products must have sizes_available JSON')
  assert.match(
    sql,
    /status\s+ENUM\('draft',\s*'pending',\s*'approved',\s*'rejected',\s*'suspended'\)\s+NOT\s+NULL\s+DEFAULT\s+'draft'/i,
    'products must have status ENUM'
  )
  assert.match(sql, /admin_notes\s+TEXT/i, 'products must have admin_notes TEXT')
  assert.match(sql, /approved_at\s+TIMESTAMP\s+NULL/i, 'products must have approved_at TIMESTAMP NULL')
  assert.match(sql, /created_at\s+TIMESTAMP/i, 'products must have created_at TIMESTAMP')
  assert.match(sql, /updated_at\s+TIMESTAMP/i, 'products must have updated_at TIMESTAMP')

  // Soft delete columns
  assert.match(sql, /deleted_at\s+TIMESTAMP\s+NULL/i, 'products must have deleted_at TIMESTAMP NULL')
  assert.match(
    sql,
    /permanently_deleted\s+TINYINT\(1\)\s+NOT\s+NULL\s+DEFAULT\s+0/i,
    'products must have permanently_deleted TINYINT(1) NOT NULL DEFAULT 0'
  )

  // Indexes
  assert.match(sql, /INDEX\s+idx_products_seller\s*\(\s*seller_id\s*\)/i, 'products must have idx_products_seller')
  assert.match(sql, /INDEX\s+idx_products_status\s*\(\s*status\s*\)/i, 'products must have idx_products_status')
  assert.match(sql, /INDEX\s+idx_products_method\s*\(\s*creation_method\s*\)/i, 'products must have idx_products_method')
})

test('setup.sql defines ai_generations table with all required columns and constraints', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8')

  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?ai_generations\s*\(/i, 'Must define ai_generations table')
  assert.match(sql, /id\s+VARCHAR\(64\)\s+PRIMARY\s+KEY/i, 'ai_generations must have id VARCHAR(64) PRIMARY KEY')
  assert.match(sql, /seller_id\s+INT\s+NOT\s+NULL/i, 'ai_generations must have seller_id INT NOT NULL')
  assert.match(sql, /source_image_path\s+VARCHAR\(500\)\s+NOT\s+NULL/i, 'ai_generations must have source_image_path')
  assert.match(
    sql,
    /status\s+ENUM\('queued',\s*'processing',\s*'completed',\s*'failed'\)\s+NOT\s+NULL\s+DEFAULT\s+'queued'/i,
    'ai_generations must have status ENUM'
  )
  assert.match(sql, /result_glb_path\s+VARCHAR\(500\)/i, 'ai_generations must have result_glb_path')
  assert.match(
    sql,
    /provider\s+VARCHAR\(50\)\s+NOT\s+NULL\s+DEFAULT\s+'huggingface_triposr'/i,
    'ai_generations must have provider DEFAULT huggingface_triposr'
  )
  assert.match(sql, /error_message\s+TEXT/i, 'ai_generations must have error_message TEXT')
  assert.match(sql, /started_at\s+TIMESTAMP\s+NULL/i, 'ai_generations must have started_at TIMESTAMP NULL')
  assert.match(sql, /completed_at\s+TIMESTAMP\s+NULL/i, 'ai_generations must have completed_at TIMESTAMP NULL')
  assert.match(sql, /created_at\s+TIMESTAMP/i, 'ai_generations must have created_at TIMESTAMP')
  assert.match(sql, /INDEX\s+idx_ai_seller\s*\(\s*seller_id\s*\)/i, 'ai_generations must have idx_ai_seller')
  assert.match(sql, /INDEX\s+idx_ai_status\s*\(\s*status\s*\)/i, 'ai_generations must have idx_ai_status')
})

test('setup.sql defines tutorial_progress table with all required columns and constraints', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8')

  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?tutorial_progress\s*\(/i, 'Must define tutorial_progress table')
  assert.match(sql, /id\s+INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/i, 'tutorial_progress must have id INT AUTO_INCREMENT PRIMARY KEY')
  assert.match(sql, /user_id\s+INT\s+NOT\s+NULL\s+UNIQUE/i, 'tutorial_progress must have user_id INT NOT NULL UNIQUE')
  assert.match(sql, /completed_steps\s+JSON\s+NOT\s+NULL/i, 'tutorial_progress must have completed_steps JSON NOT NULL')
  assert.match(sql, /current_step\s+VARCHAR\(50\)\s+DEFAULT\s+'welcome'/i, "tutorial_progress must have current_step DEFAULT 'welcome'")
  assert.match(
    sql,
    /tutorial_completed\s+TINYINT\(1\)\s+NOT\s+NULL\s+DEFAULT\s+0/i,
    'tutorial_progress must have tutorial_completed TINYINT(1) NOT NULL DEFAULT 0'
  )
  assert.match(sql, /started_at\s+TIMESTAMP/i, 'tutorial_progress must have started_at TIMESTAMP')
  assert.match(sql, /completed_at\s+TIMESTAMP\s+NULL/i, 'tutorial_progress must have completed_at TIMESTAMP NULL')
  assert.match(sql, /updated_at\s+TIMESTAMP/i, 'tutorial_progress must have updated_at TIMESTAMP')
})
