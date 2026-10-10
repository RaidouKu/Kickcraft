import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const STREAM_PATH = path.join(ROOT_DIR, 'api', 'models', 'stream.php')

function runPhpStream({ method = 'GET', getParams = {} }) {
  const runner = path.join(ROOT_DIR, `test_run_stream_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_stream_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)

  const getArrayPhp = Object.entries(getParams)
    .map(([k, v]) => `$_GET['${k}'] = ${JSON.stringify(String(v))};`)
    .join('\n')

  const code = `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
${getArrayPhp}

register_shutdown_function(function() {
    $code = http_response_code();
    file_put_contents(${JSON.stringify(statusFile)}, (string)($code === false ? 200 : $code));
});

require '${STREAM_PATH.replace(/\\/g, '/')}';
`
  fs.writeFileSync(runner, code, 'utf8')
  try {
    let output = ''
    try {
      output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    } catch (e) {
      output = e.stdout || ''
    }
    let json = null
    try {
      json = JSON.parse(output)
    } catch {
      json = { rawOutput: output }
    }
    const statusCode = fs.existsSync(statusFile)
      ? parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      : 200
    return { json, statusCode, raw: output }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
}

test('api/models/stream.php: syntax check and zero physical DELETE statements', () => {
  assert.ok(fs.existsSync(STREAM_PATH), 'stream.php must exist')
  const content = fs.readFileSync(STREAM_PATH, 'utf8')
  assert.doesNotMatch(content, /\bDELETE\s+FROM\b/i, 'Strictly zero physical DELETE statements')

  const syntax = execSync(`php -l "${STREAM_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('api/models/stream.php: enforces GET method and validates paths', () => {
  // Reject non-GET
  const postRes = runPhpStream({ method: 'POST', getParams: { path: 'models/shoe-soleview-final.glb' } })
  assert.equal(postRes.statusCode, 405)
  assert.match(postRes.json.error, /Method not allowed/i)

  // Reject missing path
  const emptyRes = runPhpStream({ method: 'GET', getParams: {} })
  assert.equal(emptyRes.statusCode, 400)
  assert.match(emptyRes.json.error, /Path is required/i)

  // Reject traversal
  const traversalRes = runPhpStream({ method: 'GET', getParams: { path: '../../etc/passwd' } })
  assert.equal(traversalRes.statusCode, 403)
  assert.match(traversalRes.json.error, /Invalid file type or path/i)

  // Reject unauthorized file type
  const phpRes = runPhpStream({ method: 'GET', getParams: { path: 'models/test.php' } })
  assert.equal(phpRes.statusCode, 403)
  assert.match(phpRes.json.error, /Invalid file type or path/i)
})

test('api/models/stream.php: successfully streams existing GLB model', () => {
  const res = runPhpStream({ method: 'GET', getParams: { path: 'models/shoe-soleview-final.glb' } })
  assert.equal(res.statusCode, 200)
  // Check magic bytes 'glTF' in raw output
  assert.ok(res.raw.startsWith('glTF'), 'Output must start with glTF magic bytes')
})

test('api/models/stream.php: successfully streams existing image asset', () => {
  const res = runPhpStream({ method: 'GET', getParams: { path: 'images/kickcraft-one-card.png' } })
  assert.equal(res.statusCode, 200)
  assert.ok(res.raw.includes('PNG'), 'Output must contain PNG binary signature')
})

test('api/models/stream.php: handles OPTIONS preflight request with 200', () => {
  const res = runPhpStream({ method: 'OPTIONS', getParams: {} })
  assert.equal(res.statusCode, 200)
})
