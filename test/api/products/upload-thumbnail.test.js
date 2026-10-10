import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const PRODUCTS_DIR = path.join(ROOT_DIR, 'api', 'products')
const UPLOAD_THUMB_PATH = path.join(PRODUCTS_DIR, 'upload-thumbnail.php')

const PHP_MOCK_PDO_DEFINITION = `
class MockPDOStatement extends PDOStatement {
    private $onExecute;
    private $result = null;
    public int $affectedRows = 0;

    public function __construct(callable $onExecute) {
        $this->onExecute = $onExecute;
    }
    public function execute(?array $params = null): bool {
        $this->result = ($this->onExecute)($params ?? []);
        if (is_int($this->result)) {
            $this->affectedRows = $this->result;
        } elseif (is_array($this->result)) {
            $this->affectedRows = count($this->result);
        } else {
            $this->affectedRows = $this->result ? 1 : 0;
        }
        return true;
    }
    public function rowCount(): int {
        return $this->affectedRows;
    }
    public function fetch($mode = PDO::FETCH_DEFAULT, $cursorOrientation = PDO::FETCH_ORI_NEXT, $cursorOffset = 0): mixed {
        if (is_array($this->result) && isset($this->result[0]) && is_array($this->result[0])) {
            return array_shift($this->result);
        }
        return is_array($this->result) ? $this->result : false;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
        if (is_array($this->result)) {
            $rows = $this->result;
            $this->result = [];
            return $rows;
        }
        return [];
    }
}

class MockPDO extends PDO {
    public array $users = [];
    public array $sellerProfiles = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            if (stripos($query, 'FROM users') !== false && stripos($query, 'id = ?') !== false) {
                $id = (int)($params[0] ?? 0);
                foreach ($this->users as $u) {
                    if ((int)$u['id'] === $id && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                        return $u;
                    }
                }
                return false;
            }
            if (stripos($query, 'SELECT status FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return ['status' => $sp['status']];
                    }
                }
                return false;
            }
            return false;
        });
    }
}
`

function runPhpUploadThumb({
  method = 'POST',
  session = { user_id: 10, user_role: 'seller' },
  fileData = null,
  fileKey = 'thumbnail',
}) {
  const runner = path.join(ROOT_DIR, `test_run_upload_thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_upload_thumb_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)

  let sessionPhp = ''
  if (session) {
    if (session.user_id !== undefined) sessionPhp += `$_SESSION['user_id'] = ${JSON.stringify(session.user_id)};\n`
    if (session.user_role !== undefined) sessionPhp += `$_SESSION['user_role'] = ${JSON.stringify(session.user_role)};\n`
    if (session.seller_status !== undefined) sessionPhp += `$_SESSION['seller_status'] = ${JSON.stringify(session.seller_status)};\n`
  }

  let filesPhp = ''
  if (fileData) {
    filesPhp = `$_FILES[${JSON.stringify(fileKey)}] = [
      'name' => ${JSON.stringify(fileData.name ?? 'test.png')},
      'type' => ${JSON.stringify(fileData.type ?? 'image/png')},
      'tmp_name' => ${JSON.stringify(fileData.tmp_name ?? '')},
      'error' => ${fileData.error ?? 'UPLOAD_ERR_OK'},
      'size' => ${fileData.size ?? 1024},
    ];\n`
  }

  const code = `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
    ['id' => 20, 'name' => 'Customer User', 'email' => 'customer@example.com', 'role' => 'customer', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;

${sessionPhp}
${filesPhp}

register_shutdown_function(function() {
    $code = http_response_code();
    file_put_contents(${JSON.stringify(statusFile)}, (string)($code === false ? 200 : $code));
});

require '${UPLOAD_THUMB_PATH.replace(/\\/g, '/')}';
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

test('api/products/upload-thumbnail.php: file exists, valid syntax, zero physical SQL DELETE statements', () => {
  assert.ok(fs.existsSync(UPLOAD_THUMB_PATH), 'api/products/upload-thumbnail.php must exist')
  const content = fs.readFileSync(UPLOAD_THUMB_PATH, 'utf8')
  assert.doesNotMatch(content, /\bDELETE\s+FROM\b/i, 'Strictly zero physical SQL DELETE statements')

  const syntax = execSync(`php -l "${UPLOAD_THUMB_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('api/products/upload-thumbnail.php: enforces POST method (rejects GET with 405)', () => {
  const res = runPhpUploadThumb({ method: 'GET' })
  assert.equal(res.statusCode, 405)
  assert.match(res.json?.error || '', /Method not allowed/i)
})

test('api/products/upload-thumbnail.php: requireSeller rejects unauthenticated user with 401/403', () => {
  const res = runPhpUploadThumb({
    method: 'POST',
    session: null,
  })
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `Expected 401 or 403, got ${res.statusCode}`)
  assert.match(res.json?.error || '', /privileges required|authentication required/i)
})

test('api/products/upload-thumbnail.php: requireSeller rejects non-seller customer user with 403', () => {
  const res = runPhpUploadThumb({
    method: 'POST',
    session: { user_id: 20, user_role: 'customer' },
  })
  assert.equal(res.statusCode, 403)
  assert.match(res.json?.error || '', /Seller privileges required/i)
})

test('api/products/upload-thumbnail.php: rejects missing file with 400', () => {
  // 1. No $_FILES set
  const resEmpty = runPhpUploadThumb({
    method: 'POST',
    session: { user_id: 10, user_role: 'seller' },
    fileData: null,
  })
  assert.equal(resEmpty.statusCode, 400)
  assert.match(resEmpty.json?.error || '', /File is required/i)

  // 2. $_FILES set with empty name or UPLOAD_ERR_NO_FILE
  const resNoFile = runPhpUploadThumb({
    method: 'POST',
    session: { user_id: 10, user_role: 'seller' },
    fileData: {
      name: '',
      tmp_name: '',
      error: 4, // UPLOAD_ERR_NO_FILE
      size: 0,
    },
  })
  assert.equal(resNoFile.statusCode, 400)
  assert.match(resNoFile.json?.error || '', /File is required/i)
})

test('api/products/upload-thumbnail.php: rejects files exceeding 5MB with 413', () => {
  const dummyFile = path.join(ROOT_DIR, `test_dummy_5mb_${Date.now()}.png`)
  fs.writeFileSync(dummyFile, 'PNG_DATA')

  try {
    // Exceeds 5MB size (5 * 1024 * 1024 + 1 bytes)
    const resOver = runPhpUploadThumb({
      method: 'POST',
      session: { user_id: 10, user_role: 'seller' },
      fileData: {
        name: 'huge_image.png',
        type: 'image/png',
        tmp_name: dummyFile.replace(/\\/g, '/'),
        error: 0, // UPLOAD_ERR_OK
        size: 5 * 1024 * 1024 + 1,
      },
    })
    assert.equal(resOver.statusCode, 413)
    assert.match(resOver.json?.error || '', /exceeds maximum limit of 5MB/i)

    // UPLOAD_ERR_INI_SIZE (1)
    const resIniSize = runPhpUploadThumb({
      method: 'POST',
      session: { user_id: 10, user_role: 'seller' },
      fileData: {
        name: 'huge_image2.png',
        type: 'image/png',
        tmp_name: dummyFile.replace(/\\/g, '/'),
        error: 1, // UPLOAD_ERR_INI_SIZE
        size: 0,
      },
    })
    assert.equal(resIniSize.statusCode, 413)
    assert.match(resIniSize.json?.error || '', /exceeds maximum limit of 5MB/i)
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('api/products/upload-thumbnail.php: rejects unsupported file extensions with 415', () => {
  const dummyFile = path.join(ROOT_DIR, `test_dummy_badext_${Date.now()}.bin`)
  fs.writeFileSync(dummyFile, 'BINARY')

  try {
    for (const badExt of ['malware.exe', 'model.glb', 'document.txt', 'image.svg']) {
      const res = runPhpUploadThumb({
        method: 'POST',
        session: { user_id: 10, user_role: 'seller' },
        fileData: {
          name: badExt,
          type: 'application/octet-stream',
          tmp_name: dummyFile.replace(/\\/g, '/'),
          error: 0,
          size: 100,
        },
      })
      assert.equal(res.statusCode, 415, `Extension ${badExt} should return 415`)
      assert.match(res.json?.error || '', /Only PNG, JPG, JPEG, and WebP images are supported/i)
    }
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('api/products/upload-thumbnail.php: successfully uploads PNG thumbnail and returns path', () => {
  const dummyFile = path.join(ROOT_DIR, `test_valid_${Date.now()}.png`)
  fs.writeFileSync(dummyFile, '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR')

  let createdFile = null
  try {
    const res = runPhpUploadThumb({
      method: 'POST',
      session: { user_id: 10, user_role: 'seller' },
      fileData: {
        name: 'custom_sneaker_thumb.png',
        type: 'image/png',
        tmp_name: dummyFile.replace(/\\/g, '/'),
        error: 0,
        size: 500,
      },
      fileKey: 'thumbnail',
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json?.success, true)
    assert.ok(res.json?.path, 'Response must include path')
    assert.match(res.json.path, /^\/images\/seller-uploads\/[a-f0-9]+\.png$/i, 'Path must match /images/seller-uploads/{hash}.png')

    const baseDir = fs.existsSync(path.join(ROOT_DIR, 'public')) ? path.join(ROOT_DIR, 'public') : ROOT_DIR
    createdFile = path.join(baseDir, res.json.path.replace(/^\//, ''))
    assert.ok(fs.existsSync(createdFile), `Uploaded file must exist on disk: ${createdFile}`)
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
    if (createdFile && fs.existsSync(createdFile)) fs.unlinkSync(createdFile)
  }
})

test('api/products/upload-thumbnail.php: accepts $_FILES["file"] fallback and supports JPG and WebP', () => {
  const dummyFile = path.join(ROOT_DIR, `test_valid_jpg_${Date.now()}.jpg`)
  fs.writeFileSync(dummyFile, '\xFF\xD8\xFF\xE0\x00\x10JFIF')

  let createdFile = null
  try {
    const res = runPhpUploadThumb({
      method: 'POST',
      session: { user_id: 10, user_role: 'seller' },
      fileData: {
        name: 'custom_sneaker_photo.JPG', // testing uppercase extension
        type: 'image/jpeg',
        tmp_name: dummyFile.replace(/\\/g, '/'),
        error: 0,
        size: 1200,
      },
      fileKey: 'file', // testing $_FILES['file'] fallback
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json?.success, true)
    assert.ok(res.json?.path, 'Response must include path')
    assert.match(res.json.path, /^\/images\/seller-uploads\/[a-f0-9]+\.jpg$/i, 'Path must match /images/seller-uploads/{hash}.jpg')

    const baseDir = fs.existsSync(path.join(ROOT_DIR, 'public')) ? path.join(ROOT_DIR, 'public') : ROOT_DIR
    createdFile = path.join(baseDir, res.json.path.replace(/^\//, ''))
    assert.ok(fs.existsSync(createdFile), `Uploaded file must exist on disk: ${createdFile}`)
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
    if (createdFile && fs.existsSync(createdFile)) fs.unlinkSync(createdFile)
  }
})
