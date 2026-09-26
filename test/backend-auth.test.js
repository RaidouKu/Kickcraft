import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const AUTH_DIR = path.join(ROOT_DIR, 'api', 'auth')

const REQUIRED_FILES = [
  'login.php',
  'logout.php',
  'session.php',
  'users.php',
  'delete-user.php',
  'restore-user.php',
  'create-user.php',
  'update-user.php',
]

test('all authentication and user management endpoint files exist', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(AUTH_DIR, file)
    assert.ok(fs.existsSync(filePath), `Expected endpoint file to exist: api/auth/${file}`)
  }
})

test('endpoints are syntactically valid PHP files', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(AUTH_DIR, file)
    assert.ok(fs.existsSync(filePath), `api/auth/${file} must exist before checking syntax`)
    const output = execSync(`php -l "${filePath}"`, { encoding: 'utf8' })
    assert.match(output, /No syntax errors detected/i, `Syntax error in ${file}`)
  }
})

test('zero physical DELETE FROM statements in api/auth/', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(AUTH_DIR, file)
    if (!fs.existsSync(filePath)) continue
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in api/auth/${file} - must use soft/hard delete flags instead`
    )
  }
})

test('all endpoints require config, db, and helpers', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(AUTH_DIR, file)
    if (!fs.existsSync(filePath)) continue
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${file} must include config.php`)
    assert.match(code, /db\.php/i, `${file} must include db.php`)
    assert.match(code, /helpers\.php/i, `${file} must include helpers.php`)
  }
})

test('login.php enforces POST, prepared statements, bcrypt verification, and session regeneration', () => {
  const filePath = path.join(AUTH_DIR, 'login.php')
  assert.ok(fs.existsSync(filePath), 'login.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /getJsonBody\s*\(\s*\)/i, 'Must read request body with getJsonBody()')
  assert.match(code, /password_verify\s*\(/i, 'Must verify password using password_verify')
  assert.match(code, /session_regenerate_id\s*\(\s*true\s*\)/i, 'Must regenerate session ID on login')
  assert.match(code, /\$_SESSION\[['"]user_id['"]\]/, 'Must store user_id in session')
  assert.match(code, /\$_SESSION\[['"]user_role['"]\]/, 'Must store user_role in session')
  assert.match(code, /deleted_at\s+IS\s+NULL/i, 'Must check deleted_at IS NULL')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must check permanently_deleted = 0')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.match(code, /role\s*=\s*['"]owner['"]/i, 'Customer accounts must not be able to log in')
})

test('logout.php destroys session and returns success', () => {
  const filePath = path.join(AUTH_DIR, 'logout.php')
  assert.ok(fs.existsSync(filePath), 'logout.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /session_unset\s*\(\s*\)/i, 'Must unset session variables')
  assert.match(code, /session_destroy\s*\(\s*\)/i, 'Must destroy session')
  assert.match(code, /jsonResponse/i, 'Must return JSON response')
})

test('session.php checks active user session and validates in DB', () => {
  const filePath = path.join(AUTH_DIR, 'session.php')
  assert.ok(fs.existsSync(filePath), 'session.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'Must enforce GET method')
  assert.match(code, /\$_SESSION\[['"]user_id['"]\]/, 'Must check session user_id')
  assert.match(code, /deleted_at\s+IS\s+NULL/i, 'Must check that active user is not soft-deleted')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must check permanently_deleted = 0')
  assert.match(code, /prepare\s*\(/i, 'Must use prepared statement')
  assert.match(code, /authenticated/i, 'Must return authenticated flag')
})

test('public customer registration endpoint is removed', () => {
  assert.equal(fs.existsSync(path.join(AUTH_DIR, 'register.php')), false)
})

test('users.php enforces requireAdmin and supports archived toggle', () => {
  const filePath = path.join(AUTH_DIR, 'users.php')
  assert.ok(fs.existsSync(filePath), 'users.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'Must enforce GET method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require admin role')
  assert.match(code, /include_archived/i, 'Must handle include_archived parameter')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must never return permanently deleted users')
  assert.match(code, /prepare\s*\(/i, 'Must use prepared statement')
  assert.match(code, /role\s*=\s*['"]owner['"]/i, 'Must list owner accounts only')
})

test('delete-user.php prevents self-deletion, enforces requireAdmin, and supports soft/hard modes without DELETE FROM', () => {
  const filePath = path.join(AUTH_DIR, 'delete-user.php')
  assert.ok(fs.existsSync(filePath), 'delete-user.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require admin role')
  assert.match(code, /\$_SESSION\[['"]user_id['"]\]/, 'Must check current session user_id to prevent self-deletion')
  assert.match(code, /deleted_at\s*=\s*NOW\(\)/i, 'Must set deleted_at = NOW()')
  assert.match(code, /permanently_deleted\s*=\s*1/i, 'Must set permanently_deleted = 1 on hard delete')
  assert.match(code, /prepare\s*\(/i, 'Must use prepared statement')
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i, 'Must never use physical DELETE FROM')
})

test('restore-user.php enforces requireAdmin and restores soft-deleted user only', () => {
  const filePath = path.join(AUTH_DIR, 'restore-user.php')
  assert.ok(fs.existsSync(filePath), 'restore-user.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require admin role')
  assert.match(code, /deleted_at\s*=\s*NULL/i, 'Must clear deleted_at')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must guard against restoring permanently deleted user')
  assert.match(code, /prepare\s*\(/i, 'Must use prepared statement')
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i, 'Must never use physical DELETE FROM')
})

test('runtime: session.php returns authenticated false when no session exists', () => {
  const runnerScript = path.join(AUTH_DIR, 'test_session_unauth.php')
  fs.writeFileSync(
    runnerScript,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/session.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.deepEqual(json, { authenticated: false })
  } finally {
    if (fs.existsSync(runnerScript)) fs.unlinkSync(runnerScript)
  }
})

test('runtime: login.php rejects GET method with 405', () => {
  const runnerScript = path.join(AUTH_DIR, 'test_login_method.php')
  fs.writeFileSync(
    runnerScript,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/login.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Method not allowed')
  } finally {
    if (fs.existsSync(runnerScript)) fs.unlinkSync(runnerScript)
  }
})

test('runtime: users.php rejects unauthenticated requests with 401 and customers with 403', () => {
  const runnerScript1 = path.join(AUTH_DIR, 'test_users_unauth.php')
  fs.writeFileSync(
    runnerScript1,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/users.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript1}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Authentication required')
  } finally {
    if (fs.existsSync(runnerScript1)) fs.unlinkSync(runnerScript1)
  }

  const runnerScript2 = path.join(AUTH_DIR, 'test_users_customer.php')
  fs.writeFileSync(
    runnerScript2,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/../config.php';
$_SESSION['user_id'] = 999;
$_SESSION['user_role'] = 'customer';
require __DIR__ . '/users.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript2}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Owner privileges required')
  } finally {
    if (fs.existsSync(runnerScript2)) fs.unlinkSync(runnerScript2)
  }
})

test('runtime: delete-user.php rejects non-admin and self-deletion', () => {
  const runnerScript1 = path.join(AUTH_DIR, 'test_delete_unauth.php')
  fs.writeFileSync(
    runnerScript1,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/delete-user.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript1}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Authentication required')
  } finally {
    if (fs.existsSync(runnerScript1)) fs.unlinkSync(runnerScript1)
  }
})

test('create-user.php enforces POST, requireAdmin, prepared statements, and password hashing', () => {
  const code = fs.readFileSync(path.join(AUTH_DIR, 'create-user.php'), 'utf8')
  assert.match(code, /requireMethod\(['"]POST['"]\)/)
  assert.match(code, /requireAdmin\(\)/)
  assert.match(code, /password_hash\(/)
  assert.match(code, /PASSWORD_BCRYPT/)
  assert.match(code, /prepare\(/)
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i)
})

test('update-user.php enforces POST, requireAdmin, prepared statements, and guards permanently_deleted', () => {
  const code = fs.readFileSync(path.join(AUTH_DIR, 'update-user.php'), 'utf8')
  assert.match(code, /requireMethod\(['"]POST['"]\)/)
  assert.match(code, /requireAdmin\(\)/)
  assert.match(code, /prepare\(/)
  assert.match(code, /permanently_deleted\s*=\s*0/)
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i)
})


