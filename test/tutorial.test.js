import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PROGRESS_PATH = path.join(ROOT_DIR, 'api', 'tutorial', 'progress.php')
const UPDATE_PATH = path.join(ROOT_DIR, 'api', 'tutorial', 'update.php')

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
        return false;
    }
}

class MockPDO extends PDO {
    public array $queries = [];
    public array $users = [];
    public array $sellerProfiles = [];
    public array $tutorialProgress = [];

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

            // 3. Tutorial progress lookup: SELECT ... FROM tutorial_progress WHERE user_id = ?
            if (stripos($query, 'FROM tutorial_progress') !== false && stripos($query, 'WHERE user_id = ?') !== false) {
                $userId = (int)($params[0] ?? 0);
                if (isset($this->tutorialProgress[$userId])) {
                    return $this->tutorialProgress[$userId];
                }
                return false;
            }

            // 4. Tutorial progress UPSERT: INSERT INTO tutorial_progress ... ON DUPLICATE KEY UPDATE ...
            if (stripos($query, 'INSERT INTO tutorial_progress') !== false) {
                $userId = (int)($params[0] ?? 0);
                $completedSteps = $params[1] ?? '[]';
                $currentStep = $params[2] ?? 'welcome';
                $tutorialCompleted = (int)($params[3] ?? 0);
                $completedAt = $params[4] ?? null;

                if (isset($this->tutorialProgress[$userId])) {
                    $this->tutorialProgress[$userId]['completed_steps'] = $completedSteps;
                    $this->tutorialProgress[$userId]['current_step'] = $currentStep;
                    $this->tutorialProgress[$userId]['tutorial_completed'] = $tutorialCompleted;
                    $this->tutorialProgress[$userId]['completed_at'] = $completedAt;
                    $this->tutorialProgress[$userId]['updated_at'] = date('Y-m-d H:i:s');
                } else {
                    $this->tutorialProgress[$userId] = [
                        'id' => count($this->tutorialProgress) + 1,
                        'user_id' => $userId,
                        'completed_steps' => $completedSteps,
                        'current_step' => $currentStep,
                        'tutorial_completed' => $tutorialCompleted,
                        'started_at' => date('Y-m-d H:i:s'),
                        'completed_at' => $completedAt,
                        'updated_at' => date('Y-m-d H:i:s'),
                    ];
                }
                return 1;
            }

            return false;
        });
    }
}
`

test('Tutorial endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(PROGRESS_PATH), 'api/tutorial/progress.php must exist')
  assert.ok(fs.existsSync(UPDATE_PATH), 'api/tutorial/update.php must exist')

  const progressSyntax = execSync(`php -l "${PROGRESS_PATH}"`, { encoding: 'utf8' })
  assert.match(progressSyntax, /No syntax errors detected/i)

  const updateSyntax = execSync(`php -l "${UPDATE_PATH}"`, { encoding: 'utf8' })
  assert.match(updateSyntax, /No syntax errors detected/i)
})

test('Tutorial endpoint files contain zero physical DELETE statements', () => {
  for (const filePath of [PROGRESS_PATH, UPDATE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must not contain DELETE statements`
    )
  }
})

test('Tutorial endpoint files enforce config, db, helpers, and prepared statements', () => {
  for (const filePath of [PROGRESS_PATH, UPDATE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('Tutorial endpoint files enforce correct HTTP methods', () => {
  const progressCode = fs.readFileSync(PROGRESS_PATH, 'utf8')
  assert.match(progressCode, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'progress.php must enforce GET')

  const updateCode = fs.readFileSync(UPDATE_PATH, 'utf8')
  assert.match(updateCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'update.php must enforce POST')
})

test('runtime: progress.php rejects non-GET methods with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_tutorial_progress_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/api/tutorial/progress.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Method not allowed')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: update.php rejects non-POST methods with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_tutorial_update_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/api/tutorial/update.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Method not allowed')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: progress.php and update.php reject unauthenticated requests and customer role', () => {
  for (const endpoint of ['progress.php', 'update.php']) {
    const method = endpoint === 'progress.php' ? 'GET' : 'POST'

    // 1. Unauthenticated -> 403 Seller privileges required (or 401)
    const runnerUnauth = path.join(ROOT_DIR, `test_tut_unauth_${method}.php`)
    fs.writeFileSync(
      runnerUnauth,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
require __DIR__ . '/api/tutorial/${endpoint}';
`
    )
    try {
      const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.ok(json.error, `Unauthenticated request to ${endpoint} must be rejected`)
      assert.match(json.error, /(seller privileges required|authentication required)/i)
    } finally {
      if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
    }

    // 2. Customer role -> 403 Seller privileges required
    const runnerCustomer = path.join(ROOT_DIR, `test_tut_customer_${method}.php`)
    fs.writeFileSync(
      runnerCustomer,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 5;
$_SESSION['user_role'] = 'customer';
require __DIR__ . '/api/tutorial/${endpoint}';
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

test('runtime: progress.php returns default tutorial progress when no record exists', () => {
  const runner = path.join(ROOT_DIR, 'test_tutorial_default_progress.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 12,
        'name' => 'Maria Santos',
        'email' => 'maria@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 2,
        'user_id' => 12,
        'store_name' => 'Maria Kicks',
        'status' => 'pending',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->tutorialProgress = []; // No progress record

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 12;
$_SESSION['user_role'] = 'seller';

require __DIR__ . '/api/tutorial/progress.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.progress, 'Should return progress object')
    assert.equal(json.progress.current_step, 'welcome')
    assert.deepEqual(json.progress.completed_steps, [])
    assert.equal(json.progress.tutorial_completed, 0)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: update.php updates step and completed steps with prepared UPSERT statement', () => {
  const runner = path.join(ROOT_DIR, 'test_tutorial_update_step.php')
  const body = {
    currentStep: 'product_creation',
    completedSteps: ['welcome'],
  }

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 12,
        'name' => 'Maria Santos',
        'email' => 'maria@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 2,
        'user_id' => 12,
        'store_name' => 'Maria Kicks',
        'status' => 'pending',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 12;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

require __DIR__ . '/api/tutorial/update.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: update.php sets tutorial_completed = 1 and completed_at when manage_orders in completedSteps', () => {
  const runner = path.join(ROOT_DIR, 'test_tutorial_complete.php')
  const body = {
    currentStep: 'completed',
    completedSteps: ['welcome', 'product_creation', 'mesh_tagger', 'customizer', 'submit_review', 'manage_orders'],
  }

  const stateFile = path.join(ROOT_DIR, 'test_tutorial_complete_state.json')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 12,
        'name' => 'Maria Santos',
        'email' => 'maria@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 2,
        'user_id' => 12,
        'store_name' => 'Maria Kicks',
        'status' => 'approved',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 12;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(stateFile)}, json_encode($pdo->tutorialProgress[12] ?? []));
});

require __DIR__ . '/api/tutorial/update.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)

    assert.ok(fs.existsSync(stateFile), 'State file must be written on update shutdown')
    const record = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    assert.equal(record.tutorial_completed, 1, 'tutorial_completed must be 1')
    assert.ok(record.completed_at, 'completed_at must not be empty')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
  }
})

test('runtime: progress.php returns updated progress after update', () => {
  const stateFile = path.join(ROOT_DIR, 'test_tutorial_flow_state.json')
  const runnerUpdate = path.join(ROOT_DIR, 'test_tutorial_flow_update.php')
  const runnerProgress = path.join(ROOT_DIR, 'test_tutorial_flow_progress.php')

  try {
    // 1. Run update.php to persist progress
    fs.writeFileSync(
      runnerUpdate,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 15,
        'name' => 'Carlo Rossi',
        'email' => 'carlo@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 3,
        'user_id' => 15,
        'store_name' => 'Rossi Kicks',
        'status' => 'approved',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 15;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = [
    'currentStep' => 'mesh_tagger',
    'completedSteps' => ['welcome', 'product_creation'],
];

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(stateFile)}, json_encode($pdo->tutorialProgress));
});

require __DIR__ . '/api/tutorial/update.php';
`
    )

    const updateOutput = execSync(`php "${runnerUpdate}"`, { encoding: 'utf8' })
    const updateJson = JSON.parse(updateOutput)
    assert.equal(updateJson.success, true)
    assert.ok(fs.existsSync(stateFile), 'State file must be created by update execution')

    // 2. Run progress.php with the updated state
    fs.writeFileSync(
      runnerProgress,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 15,
        'name' => 'Carlo Rossi',
        'email' => 'carlo@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 3,
        'user_id' => 15,
        'store_name' => 'Rossi Kicks',
        'status' => 'approved',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->tutorialProgress = json_decode(file_get_contents(${JSON.stringify(stateFile)}), true);

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 15;
$_SESSION['user_role'] = 'seller';

require __DIR__ . '/api/tutorial/progress.php';
`
    )

    const progressOutput = execSync(`php "${runnerProgress}"`, { encoding: 'utf8' })
    const progressJson = JSON.parse(progressOutput)
    assert.equal(progressJson.success, true)
    assert.equal(progressJson.progress.current_step, 'mesh_tagger')
    assert.deepEqual(progressJson.progress.completed_steps, ['welcome', 'product_creation'])
    assert.equal(progressJson.progress.tutorial_completed, 0)
  } finally {
    if (fs.existsSync(runnerUpdate)) fs.unlinkSync(runnerUpdate)
    if (fs.existsSync(runnerProgress)) fs.unlinkSync(runnerProgress)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
  }
})
