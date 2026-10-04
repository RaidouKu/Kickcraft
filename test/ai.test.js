import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const AI_DIR = path.join(ROOT_DIR, 'api', 'ai')
const GENERATE_PATH = path.join(AI_DIR, 'generate.php')
const STATUS_PATH = path.join(AI_DIR, 'status.php')
const LIST_PATH = path.join(AI_DIR, 'list.php')

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
    public function fetchColumn(int $column = 0): mixed {
        $row = $this->fetch();
        if (is_array($row)) {
            $vals = array_values($row);
            return $vals[$column] ?? false;
        }
        return is_numeric($this->result) ? $this->result : false;
    }
}

class MockPDO extends PDO {
    public array $queries = [];
    public array $users = [];
    public array $sellerProfiles = [];
    public array $aiGenerations = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];

            // 1. User lookup for currentSessionUser
            if (stripos($query, 'FROM users') !== false && stripos($query, 'JOIN') === false) {
                if (stripos($query, 'id = ?') !== false) {
                    $id = (int)($params[0] ?? 0);
                    foreach ($this->users as $u) {
                        if ((int)$u['id'] === $id && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                            return $u;
                        }
                    }
                    return false;
                }
            }

            // 2. Profile lookup from currentSessionUser
            if (stripos($query, 'SELECT status FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return ['status' => $sp['status']];
                    }
                }
                return false;
            }

            // 3. ID uniqueness check: SELECT COUNT(*) FROM ai_generations WHERE id = ?
            if (stripos($query, 'SELECT COUNT(*)') !== false && stripos($query, 'ai_generations') !== false) {
                $id = $params[0] ?? '';
                return isset($this->aiGenerations[$id]) ? 1 : 0;
            }

            // 4. Insert generation: INSERT INTO ai_generations
            if (stripos($query, 'INSERT INTO ai_generations') !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);
                $sourcePath = $params[2] ?? '';
                $status = $params[3] ?? 'processing';
                $provider = $params[4] ?? 'huggingface_trellis';
                $now = date('Y-m-d H:i:s');
                $record = [
                    'id' => $id,
                    'seller_id' => $sellerId,
                    'source_image_path' => $sourcePath,
                    'status' => $status,
                    'result_glb_path' => null,
                    'provider' => $provider,
                    'error_message' => null,
                    'started_at' => $now,
                    'completed_at' => null,
                    'created_at' => $now,
                ];
                $this->aiGenerations[$id] = $record;
                return 1;
            }

            // 4b. Update generation: UPDATE ai_generations
            if (stripos($query, 'UPDATE ai_generations') !== false) {
                $now = date('Y-m-d H:i:s');
                if (stripos($query, "status = 'completed'") !== false) {
                    $resultGlb = $params[0] ?? '';
                    $id = $params[1] ?? '';
                    if (isset($this->aiGenerations[$id])) {
                        $this->aiGenerations[$id]['status'] = 'completed';
                        $this->aiGenerations[$id]['result_glb_path'] = $resultGlb;
                        $this->aiGenerations[$id]['completed_at'] = $now;
                    }
                } elseif (stripos($query, "status = 'failed'") !== false) {
                    $errMsg = $params[0] ?? '';
                    $id = $params[1] ?? '';
                    if (isset($this->aiGenerations[$id])) {
                        $this->aiGenerations[$id]['status'] = 'failed';
                        $this->aiGenerations[$id]['error_message'] = $errMsg;
                        $this->aiGenerations[$id]['completed_at'] = $now;
                    }
                }
                return 1;
            }

            // 5. Query status by ID and seller_id: SELECT ... FROM ai_generations WHERE id = ? AND seller_id = ?
            if (stripos($query, 'FROM ai_generations') !== false && stripos($query, 'WHERE id = ?') !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);
                if (isset($this->aiGenerations[$id]) && (int)$this->aiGenerations[$id]['seller_id'] === $sellerId) {
                    return $this->aiGenerations[$id];
                }
                return false;
            }

            // 6. Query list by seller_id: SELECT ... FROM ai_generations WHERE seller_id = ? ORDER BY created_at DESC
            if (stripos($query, 'FROM ai_generations') !== false && stripos($query, 'WHERE seller_id = ?') !== false) {
                $sellerId = (int)($params[0] ?? 0);
                $rows = [];
                foreach ($this->aiGenerations as $g) {
                    if ((int)$g['seller_id'] === $sellerId) {
                        $rows[] = $g;
                    }
                }
                usort($rows, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
                return $rows;
            }

            return false;
        });
    }
}
`

test('AI endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(GENERATE_PATH), 'api/ai/generate.php must exist')
  assert.ok(fs.existsSync(STATUS_PATH), 'api/ai/status.php must exist')
  assert.ok(fs.existsSync(LIST_PATH), 'api/ai/list.php must exist')

  const genSyntax = execSync(`php -l "${GENERATE_PATH}"`, { encoding: 'utf8' })
  assert.match(genSyntax, /No syntax errors detected/i)

  const statusSyntax = execSync(`php -l "${STATUS_PATH}"`, { encoding: 'utf8' })
  assert.match(statusSyntax, /No syntax errors detected/i)

  const listSyntax = execSync(`php -l "${LIST_PATH}"`, { encoding: 'utf8' })
  assert.match(listSyntax, /No syntax errors detected/i)
})

test('AI endpoint files contain zero physical DELETE statements', () => {
  for (const filePath of [GENERATE_PATH, STATUS_PATH, LIST_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must not contain DELETE statements`
    )
  }
})

test('AI endpoint files enforce config, db, helpers, and prepared statements', () => {
  for (const filePath of [GENERATE_PATH, STATUS_PATH, LIST_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('AI endpoint files enforce correct HTTP methods', () => {
  const genCode = fs.readFileSync(GENERATE_PATH, 'utf8')
  assert.match(genCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'generate.php must enforce POST')

  const statusCode = fs.readFileSync(STATUS_PATH, 'utf8')
  assert.match(statusCode, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'status.php must enforce GET')

  const listCode = fs.readFileSync(LIST_PATH, 'utf8')
  assert.match(listCode, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'list.php must enforce GET')
})

test('runtime: AI endpoints reject invalid HTTP methods with 405', () => {
  const testCases = [
    { file: GENERATE_PATH, invalidMethod: 'GET' },
    { file: STATUS_PATH, invalidMethod: 'POST' },
    { file: LIST_PATH, invalidMethod: 'POST' },
  ]

  for (const { file, invalidMethod } of testCases) {
    const runner = path.join(ROOT_DIR, `test_ai_method_${invalidMethod}_${path.basename(file, '.php')}.php`)
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${invalidMethod}';
require '${file.replace(/\\/g, '/')}';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Method not allowed')
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }
})

test('runtime: AI endpoints reject unauthenticated requests and customer role with 403/401', () => {
  const endpoints = [
    { file: GENERATE_PATH, method: 'POST' },
    { file: STATUS_PATH, method: 'GET' },
    { file: LIST_PATH, method: 'GET' },
  ]

  for (const { file, method } of endpoints) {
    const name = path.basename(file, '.php')

    // 1. Unauthenticated -> 403 / 401
    const runnerUnauth = path.join(ROOT_DIR, `test_ai_unauth_${name}.php`)
    fs.writeFileSync(
      runnerUnauth,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
require '${file.replace(/\\/g, '/')}';
`
    )
    try {
      const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.ok(json.error, `Unauthenticated request to ${name}.php must be rejected`)
      assert.match(json.error, /(seller privileges required|authentication required)/i)
    } finally {
      if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
    }

    // 2. Customer role -> 403 Seller privileges required
    const runnerCustomer = path.join(ROOT_DIR, `test_ai_customer_${name}.php`)
    fs.writeFileSync(
      runnerCustomer,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';
$_SESSION['user_id'] = 5;
$_SESSION['user_role'] = 'customer';
require '${file.replace(/\\/g, '/')}';
`
    )
    try {
      const output = execSync(`php "${runnerCustomer}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Seller privileges required')
    } finally {
      if (fs.existsSync(runnerCustomer)) fs.unlinkSync(runnerCustomer)
    }
  }
})

test('runtime: generate.php rejects missing file with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_generate_missing_file.php')
  const statusFile = path.join(ROOT_DIR, 'test_ai_generate_missing_status.txt')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /image file is required/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: generate.php rejects invalid image extension / MIME with 415', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_generate_invalid_ext.php')
  const statusFile = path.join(ROOT_DIR, 'test_ai_generate_invalid_ext_status.txt')
  const dummyFile = path.join(ROOT_DIR, 'test_dummy.txt')
  fs.writeFileSync(dummyFile, 'not an image')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

$_FILES['image'] = [
    'name' => 'design.txt',
    'type' => 'text/plain',
    'tmp_name' => '${dummyFile.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 12,
];

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /invalid image format|only jpg and png/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 415)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('runtime: generate.php rejects file exceeding 10MB with 413', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_generate_oversize.php')
  const statusFile = path.join(ROOT_DIR, 'test_ai_generate_oversize_status.txt')
  const dummyFile = path.join(ROOT_DIR, 'test_dummy_large.png')
  fs.writeFileSync(dummyFile, 'dummy')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

$_FILES['image'] = [
    'name' => 'huge_shoe.png',
    'type' => 'image/png',
    'tmp_name' => '${dummyFile.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 11 * 1024 * 1024, // 11MB
];

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /exceeds maximum limit of 10MB|10MB/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 413)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('runtime: generate.php processes valid upload, generates ID, stores image, creates GLB and DB record', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_generate_valid.php')
  const dummyImage = path.join(ROOT_DIR, 'test_shoe_concept.png')
  fs.writeFileSync(dummyImage, '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4')

  const stateFile = path.join(ROOT_DIR, 'test_ai_generate_valid_state.json')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Creative Seller', 'email' => 'creator@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Future Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

$GLOBALS['__TEST_AI_GENERATOR__'] = function($sourceImg, $destGlb) {
    file_put_contents($destGlb, "glTF\x02\x00\x00\x00\x20\x00\x00\x00\x00\x00\x00\x00JSON-MOCK-3D-ASSET");
    return ['ok' => true];
};

$_FILES['image'] = [
    'name' => 'test_shoe_concept.png',
    'type' => 'image/png',
    'tmp_name' => '${dummyImage.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 1024,
];

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(stateFile)}, json_encode($pdo->aiGenerations));
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  )

  let savedImageRelative = null
  let savedGlbRelative = null

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.generation, 'Response must include generation object')

    const gen = json.generation
    assert.match(gen.id, /^KCAI-\d{4}-\d{4}$/, 'ID must match KCAI-YYYY-XXXX format')
    assert.equal(gen.status, 'completed')

    const glbPath = gen.resultGlbPath || gen.result_glb_path
    assert.ok(glbPath, 'Generation must include resultGlbPath')
    assert.match(glbPath, /^\/models\/seller-ai\/[a-f0-9]+\.glb$/i, 'GLB path must be in /models/seller-ai/')
    savedGlbRelative = glbPath

    const imgPath = gen.sourceImagePath || gen.source_image_path
    assert.ok(imgPath, 'Generation must include sourceImagePath')
    assert.match(imgPath, /^\/images\/ai-source\/[a-f0-9]+\.png$/i, 'Source image path must be in /images/ai-source/')
    savedImageRelative = imgPath

    // Check files were physically created on disk
    const glbDiskPath = path.join(ROOT_DIR, 'public', glbPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(glbDiskPath), `Result GLB must exist on disk: ${glbDiskPath}`)

    const imgDiskPath = path.join(ROOT_DIR, 'public', imgPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(imgDiskPath), `Source image must exist on disk: ${imgDiskPath}`)

    // Check DB record
    assert.ok(fs.existsSync(stateFile), 'State file must be created')
    const dbGenerations = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    assert.ok(dbGenerations[gen.id], 'Database must contain generation record')
    assert.equal(dbGenerations[gen.id].seller_id, 20)
    assert.equal(dbGenerations[gen.id].status, 'completed')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
    if (fs.existsSync(dummyImage)) fs.unlinkSync(dummyImage)
    if (savedGlbRelative) {
      const glbDisk = path.join(ROOT_DIR, 'public', savedGlbRelative.replace(/^\//, ''))
      if (fs.existsSync(glbDisk)) fs.unlinkSync(glbDisk)
    }
    if (savedImageRelative) {
      const imgDisk = path.join(ROOT_DIR, 'public', savedImageRelative.replace(/^\//, ''))
      if (fs.existsSync(imgDisk)) fs.unlinkSync(imgDisk)
    }
  }
})

test('runtime: generate.php returns 502, marks job failed, and leaves zero GLB files when AI fails', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_generate_fail.php')
  const dummyImage = path.join(ROOT_DIR, 'test_shoe_fail.png')
  fs.writeFileSync(dummyImage, '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4')

  const stateFile = path.join(ROOT_DIR, 'test_ai_generate_fail_state.json')
  const statusFile = path.join(ROOT_DIR, 'test_ai_generate_fail_status.txt')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Creative Seller', 'email' => 'creator@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Future Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

$GLOBALS['__TEST_AI_GENERATOR__'] = function($sourceImg, $destGlb) {
    return ['ok' => false, 'error' => 'The free AI GPU quota is used up for now. Add a free Hugging Face token (HF_TOKEN) in api/.env or try again in a few minutes.'];
};

$_FILES['image'] = [
    'name' => 'test_shoe_fail.png',
    'type' => 'image/png',
    'tmp_name' => '${dummyImage.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 1024,
];

$stateFilePath = ${JSON.stringify(stateFile)};
$statusFilePath = ${JSON.stringify(statusFile)};

register_shutdown_function(function() use ($pdo, $stateFilePath, $statusFilePath) {
    file_put_contents($stateFilePath, json_encode($pdo->aiGenerations));
    file_put_contents($statusFilePath, (string)http_response_code());
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /quota is used up|AI 3D generation failed/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 502)
    }

    // Check DB record was marked failed
    assert.ok(fs.existsSync(stateFile), 'State file must be created')
    const dbGenerations = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const record = Object.values(dbGenerations)[0]
    assert.ok(record, 'Must record generation in DB')
    assert.equal(record.status, 'failed')
    assert.match(record.error_message, /quota/i)
    assert.equal(record.result_glb_path, null)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dummyImage)) fs.unlinkSync(dummyImage)
  }
})

test('generate.php strictly avoids copying template shoes as fake AI models', () => {
  const code = fs.readFileSync(GENERATE_PATH, 'utf8')
  assert.doesNotMatch(code, /shoe-soleview-final\.glb/i, 'generate.php must never copy shoe-soleview-final.glb as an AI output')
  assert.doesNotMatch(code, /copy\s*\(\s*\$templateGlb/i, 'generate.php must never copy a template GLB')
})

test('runtime: status.php retrieves generation by ID for authenticated seller', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_status_valid.php')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['id'] = 'KCAI-2026-9876';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Creative Seller', 'email' => 'creator@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Future Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->aiGenerations['KCAI-2026-9876'] = [
    'id' => 'KCAI-2026-9876',
    'seller_id' => 20,
    'source_image_path' => '/images/ai-source/abc123.png',
    'status' => 'completed',
    'result_glb_path' => '/models/seller-ai/abc123.glb',
    'provider' => 'huggingface_triposr',
    'error_message' => null,
    'started_at' => '2026-10-02 10:00:00',
    'completed_at' => '2026-10-02 10:01:00',
    'created_at' => '2026-10-02 10:00:00',
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

require '${STATUS_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.generation, 'Response must include generation object')
    assert.equal(json.generation.id, 'KCAI-2026-9876')
    assert.equal(json.generation.status, 'completed')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: status.php returns 404 for unknown job ID or another seller job', () => {
  // 1. Unknown job ID -> 404
  const runnerUnknown = path.join(ROOT_DIR, 'test_ai_status_unknown.php')
  const statusUnknownFile = path.join(ROOT_DIR, 'test_ai_status_unknown_status.txt')

  fs.writeFileSync(
    runnerUnknown,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['id'] = 'KCAI-2026-0000';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Creative Seller', 'email' => 'creator@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Future Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusUnknownFile)}, (string)http_response_code());
});

require '${STATUS_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runnerUnknown}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /not found/i)
    if (fs.existsSync(statusUnknownFile)) {
      const code = parseInt(fs.readFileSync(statusUnknownFile, 'utf8'), 10)
      assert.equal(code, 404)
    }
  } finally {
    if (fs.existsSync(runnerUnknown)) fs.unlinkSync(runnerUnknown)
    if (fs.existsSync(statusUnknownFile)) fs.unlinkSync(statusUnknownFile)
  }

  // 2. Another seller's job -> 404
  const runnerForbidden = path.join(ROOT_DIR, 'test_ai_status_forbidden.php')
  const statusForbiddenFile = path.join(ROOT_DIR, 'test_ai_status_forbidden_status.txt')

  fs.writeFileSync(
    runnerForbidden,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['id'] = 'KCAI-2026-5555';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Seller Twenty', 'email' => 'twenty@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Twenty Shoes', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->aiGenerations['KCAI-2026-5555'] = [
    'id' => 'KCAI-2026-5555',
    'seller_id' => 99, // belongs to seller 99
    'source_image_path' => '/images/ai-source/other.png',
    'status' => 'completed',
    'result_glb_path' => '/models/seller-ai/other.glb',
    'provider' => 'huggingface_triposr',
    'error_message' => null,
    'started_at' => '2026-10-02 10:00:00',
    'completed_at' => '2026-10-02 10:01:00',
    'created_at' => '2026-10-02 10:00:00',
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20; // logged in as seller 20
$_SESSION['user_role'] = 'seller';

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusForbiddenFile)}, (string)http_response_code());
});

require '${STATUS_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runnerForbidden}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /not found/i)
    if (fs.existsSync(statusForbiddenFile)) {
      const code = parseInt(fs.readFileSync(statusForbiddenFile, 'utf8'), 10)
      assert.equal(code, 404)
    }
  } finally {
    if (fs.existsSync(runnerForbidden)) fs.unlinkSync(runnerForbidden)
    if (fs.existsSync(statusForbiddenFile)) fs.unlinkSync(statusForbiddenFile)
  }

  // 3. Missing id parameter -> 400
  const runnerMissingId = path.join(ROOT_DIR, 'test_ai_status_missing_id.php')
  const statusMissingIdFile = path.join(ROOT_DIR, 'test_ai_status_missing_id_status.txt')

  fs.writeFileSync(
    runnerMissingId,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
unset($_GET['id']);
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Seller Twenty', 'email' => 'twenty@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Twenty Shoes', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusMissingIdFile)}, (string)http_response_code());
});

require '${STATUS_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runnerMissingId}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /job id is required|id is required/i)
    if (fs.existsSync(statusMissingIdFile)) {
      const code = parseInt(fs.readFileSync(statusMissingIdFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runnerMissingId)) fs.unlinkSync(runnerMissingId)
    if (fs.existsSync(statusMissingIdFile)) fs.unlinkSync(statusMissingIdFile)
  }
})

test('runtime: list.php lists generations for authenticated seller ordered by created_at DESC', () => {
  const runner = path.join(ROOT_DIR, 'test_ai_list_valid.php')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Creative Seller', 'email' => 'creator@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 5, 'user_id' => 20, 'store_name' => 'Future Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->aiGenerations['KCAI-2026-0001'] = [
    'id' => 'KCAI-2026-0001',
    'seller_id' => 20,
    'source_image_path' => '/images/ai-source/gen1.png',
    'status' => 'completed',
    'result_glb_path' => '/models/seller-ai/gen1.glb',
    'provider' => 'huggingface_triposr',
    'error_message' => null,
    'started_at' => '2026-10-01 09:00:00',
    'completed_at' => '2026-10-01 09:01:00',
    'created_at' => '2026-10-01 09:00:00',
];
$pdo->aiGenerations['KCAI-2026-0002'] = [
    'id' => 'KCAI-2026-0002',
    'seller_id' => 20,
    'source_image_path' => '/images/ai-source/gen2.png',
    'status' => 'completed',
    'result_glb_path' => '/models/seller-ai/gen2.glb',
    'provider' => 'huggingface_triposr',
    'error_message' => null,
    'started_at' => '2026-10-02 14:00:00',
    'completed_at' => '2026-10-02 14:02:00',
    'created_at' => '2026-10-02 14:00:00',
];
$pdo->aiGenerations['KCAI-2026-0003'] = [
    'id' => 'KCAI-2026-0003',
    'seller_id' => 99, // Another seller
    'source_image_path' => '/images/ai-source/gen3.png',
    'status' => 'completed',
    'result_glb_path' => '/models/seller-ai/gen3.glb',
    'provider' => 'huggingface_triposr',
    'error_message' => null,
    'started_at' => '2026-10-03 10:00:00',
    'completed_at' => '2026-10-03 10:01:00',
    'created_at' => '2026-10-03 10:00:00',
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';

require '${LIST_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(Array.isArray(json.generations), 'Response must include generations array')
    assert.equal(json.generations.length, 2, 'Should only return the 2 generations for seller 20')

    // Ordered by created_at DESC: KCAI-2026-0002 was created on Oct 2, 0001 on Oct 1
    assert.equal(json.generations[0].id, 'KCAI-2026-0002')
    assert.equal(json.generations[1].id, 'KCAI-2026-0001')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})
