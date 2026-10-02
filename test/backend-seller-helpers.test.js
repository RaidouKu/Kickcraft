import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const HELPERS_PATH = path.join(ROOT_DIR, 'api', 'helpers.php')
const SETUP_SQL_PATH = path.join(ROOT_DIR, 'api', 'database', 'setup.sql')

test('Seller auth helpers exist', () => {
  const tempScript = path.join(ROOT_DIR, 'test_helpers_exists.php')
  const phpCode = `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 1;
    $_SESSION['user_role'] = 'seller';
    $_SESSION['user_email'] = 'test@example.com';
    $GLOBALS['__JSON_BODY__'] = [];
    
    // We can't easily mock PDO here, but we can check if functions exist
    echo function_exists('requireSeller') ? 'YES' : 'NO';
    echo function_exists('requireApprovedSeller') ? 'YES' : 'NO';
  `
  fs.writeFileSync(tempScript, phpCode)
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    assert.match(output, /YESYES/, 'Helpers should be defined')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }
})

test('setup.sql contains updated users role enum and seller_profiles table', () => {
  assert.ok(fs.existsSync(SETUP_SQL_PATH), 'setup.sql must exist')
  const sql = fs.readFileSync(SETUP_SQL_PATH, 'utf8')

  // Zero physical DELETE FROM
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'setup.sql must not contain any physical DELETE FROM statements')

  // Users role enum includes 'seller'
  assert.match(
    sql,
    /role\s+ENUM\('customer',\s*'owner',\s*'seller'\)/i,
    "users table role ENUM must include 'seller'"
  )

  // seller_profiles table definition
  assert.match(
    sql,
    /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?seller_profiles/i,
    'setup.sql must define seller_profiles table'
  )
  assert.match(sql, /user_id\s+INT\s+NOT\s+NULL/i, 'seller_profiles must have user_id INT NOT NULL')
  assert.match(sql, /store_name\s+VARCHAR\(255\)\s+NOT\s+NULL/i, 'seller_profiles must have store_name VARCHAR(255) NOT NULL')
  assert.match(sql, /store_description\s+TEXT/i, 'seller_profiles must have store_description TEXT')
  assert.match(
    sql,
    /status\s+ENUM\('pending',\s*'approved',\s*'suspended',\s*'rejected'\)\s+NOT\s+NULL\s+DEFAULT\s+'pending'/i,
    'seller_profiles must have status ENUM with pending, approved, suspended, rejected defaults to pending'
  )
  assert.match(sql, /admin_notes\s+TEXT/i, 'seller_profiles must have admin_notes TEXT')
  assert.match(sql, /approved_at\s+TIMESTAMP\s+NULL/i, 'seller_profiles must have approved_at TIMESTAMP NULL')
  assert.match(sql, /deleted_at\s+TIMESTAMP\s+NULL/i, 'seller_profiles must have deleted_at TIMESTAMP NULL')
  assert.match(sql, /permanently_deleted\s+TINYINT/i, 'seller_profiles must have permanently_deleted TINYINT')
  assert.match(sql, /idx_seller_user_id/i, 'seller_profiles must have idx_seller_user_id index')
  assert.match(sql, /idx_seller_status/i, 'seller_profiles must have idx_seller_status index')
})

test('requireSeller allows seller role and blocks others', () => {
  const tempScript = path.join(ROOT_DIR, 'test_require_seller.php')

  // 1. Seller succeeds
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';
    requireSeller();
    echo "SELLER_ALLOWED";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    assert.match(output, /SELLER_ALLOWED/, 'Seller should be allowed')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }

  // 2. Customer blocked
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 11;
    $_SESSION['user_role'] = 'customer';
    requireSeller();
    echo "SHOULD_NOT_REACH";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller privileges required')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }

  // 3. Owner blocked
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 12;
    $_SESSION['user_role'] = 'owner';
    requireSeller();
    echo "SHOULD_NOT_REACH";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller privileges required')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }
})

test('requireApprovedSeller allows approved sellers only', () => {
  const tempScript = path.join(ROOT_DIR, 'test_require_approved_seller.php')

  // 1. Approved seller succeeds
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 20;
    $_SESSION['user_role'] = 'seller';
    $_SESSION['seller_status'] = 'approved';
    requireApprovedSeller();
    echo "APPROVED_ALLOWED";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    assert.match(output, /APPROVED_ALLOWED/, 'Approved seller should be allowed')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }

  // 2. Pending seller blocked
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 21;
    $_SESSION['user_role'] = 'seller';
    $_SESSION['seller_status'] = 'pending';
    requireApprovedSeller();
    echo "SHOULD_NOT_REACH";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Approved seller privileges required')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }

  // 3. Unapproved (no seller_status) blocked
  fs.writeFileSync(
    tempScript,
    `<?php
    require_once __DIR__ . '/api/helpers.php';
    $_SESSION['user_id'] = 22;
    $_SESSION['user_role'] = 'seller';
    unset($_SESSION['seller_status']);
    requireApprovedSeller();
    echo "SHOULD_NOT_REACH";
  `
  )
  try {
    const output = execSync(`php "${tempScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Approved seller privileges required')
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript)
  }
})

test('currentSessionUser selects role IN (owner, seller) and handles seller status', () => {
  const helpersCode = fs.readFileSync(HELPERS_PATH, 'utf8')
  assert.match(
    helpersCode,
    /role\s+IN\s+\(['"]owner['"],\s*['"]seller['"]\)/i,
    "currentSessionUser must query role IN ('owner', 'seller')"
  )
  assert.match(
    helpersCode,
    /seller_profiles/i,
    'currentSessionUser must query seller_profiles table'
  )
  assert.match(
    helpersCode,
    /\$_SESSION\['seller_status'\]/i,
    'currentSessionUser must set $_SESSION seller_status'
  )
})
