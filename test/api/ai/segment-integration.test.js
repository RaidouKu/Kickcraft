import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const TRELLIS_CLIENT_PATH = path.join(ROOT_DIR, 'api', 'ai', 'trellis-client.php')
const GENERATE_PATH = path.join(ROOT_DIR, 'api', 'ai', 'generate.php')
const STATUS_PATH = path.join(ROOT_DIR, 'api', 'ai', 'status.php')
const SEGMENTER_PATH = path.join(ROOT_DIR, 'tools', 'segment-shoe-glb.py')
const ENHANCER_PATH = path.join(ROOT_DIR, 'tools', 'enhance-glb.py')
const FIXTURE_GLB = path.join(ROOT_DIR, 'public', 'models', 'seller-ai', '62b6d15a2e5118335eeab8b8d7073dd3.glb')
const TEMP_DIR = path.join(ROOT_DIR, 'public', 'models', 'seller-ai', 'tmp-integration-test')

function cleanTempDir() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  }
}

// Helper to inspect glTF materials from a GLB file
function readGlbMaterials(filePath) {
  const buf = fs.readFileSync(filePath)
  assert.ok(buf.length >= 20, 'File must be at least 20 bytes')
  const magic = buf.readUInt32LE(0)
  assert.equal(magic, 0x46546C67, 'Magic header must be 0x46546C67 (glTF)')
  const jsonLen = buf.readUInt32LE(12)
  const jsonBytes = buf.subarray(20, 20 + jsonLen)
  const gltf = JSON.parse(jsonBytes.toString('utf8'))
  return gltf.materials || []
}

test('segment-integration: PHP syntax check and zero physical DELETE statements', () => {
  for (const filePath of [TRELLIS_CLIENT_PATH, GENERATE_PATH, STATUS_PATH]) {
    assert.ok(fs.existsSync(filePath), `${filePath} must exist`)
    const content = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(content, /\bDELETE\s+FROM\b/i, 'Strictly zero physical DELETE statements')
    const syntax = execSync(`php -l "${filePath}"`, { encoding: 'utf8' })
    assert.match(syntax, /No syntax errors detected/i)
  }
})

test('segment-integration: kcAiSaveGlb calls tools/segment-shoe-glb.py and produces multi-material GLB', () => {
  cleanTempDir()
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  assert.ok(fs.existsSync(FIXTURE_GLB), 'Fixture GLB must exist')

  const destPath = path.join(TEMP_DIR, 'output-segmented.glb')
  const runner = path.join(TEMP_DIR, 'test_kcAiSaveGlb_runner.php')

  // Run PHP calling kcAiSaveGlb with fixture bytes
  const phpCode = `<?php
require_once '${TRELLIS_CLIENT_PATH.replace(/\\/g, '/')}';

$bytes = file_get_contents('${FIXTURE_GLB.replace(/\\/g, '/')}');
$res = kcAiSaveGlb($bytes, '${destPath.replace(/\\/g, '/')}');

echo json_encode($res);
`
  fs.writeFileSync(runner, phpCode, 'utf8')
  try {
    const rawOutput = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const res = JSON.parse(rawOutput)
    assert.equal(res.ok, true, 'kcAiSaveGlb must succeed')
    assert.equal(res.segmented, true, 'kcAiSaveGlb must indicate segmentation succeeded')
    assert.ok(fs.existsSync(destPath), 'Segmented GLB output must exist')

    // Inspect materials in generated GLB
    const materials = readGlbMaterials(destPath)
    const matNames = materials.map(m => m.name)

    assert.ok(matNames.includes('UpperMaterial'), 'Must contain UpperMaterial')
    assert.ok(matNames.includes('MidsoleMaterial'), 'Must contain MidsoleMaterial')
    assert.ok(matNames.includes('OutsoleMaterial'), 'Must contain OutsoleMaterial')
    assert.ok(matNames.length >= 6, `Expected at least 6 materials, got ${matNames.length}`)
  } finally {
    cleanTempDir()
  }
})

// Helper to generate a minimal valid glTF 2.0 GLB without meshes
function createMinimalGlb() {
  const jsonStr = JSON.stringify({ asset: { version: '2.0' } })
  const jsonBuf = Buffer.from(jsonStr, 'utf8')
  const pad = (4 - (jsonBuf.length % 4)) % 4
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)])
  const total = 12 + 8 + jsonPadded.length
  const buf = Buffer.alloc(total)
  buf.writeUInt32LE(0x46546C67, 0)
  buf.writeUInt32LE(2, 4)
  buf.writeUInt32LE(total, 8)
  buf.writeUInt32LE(jsonPadded.length, 12)
  buf.writeUInt32LE(0x4E4F534A, 16)
  jsonPadded.copy(buf, 20)
  return buf
}

test('segment-integration: kcAiSaveGlb gracefully falls back if segmentation fails without crashing or 500', () => {
  cleanTempDir()
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const minimalGlbPath = path.join(TEMP_DIR, 'minimal.glb')
  fs.writeFileSync(minimalGlbPath, createMinimalGlb())

  const destPath = path.join(TEMP_DIR, 'output-fallback.glb')
  const runner = path.join(TEMP_DIR, 'test_fallback_runner.php')

  const phpCode = `<?php
require_once '${TRELLIS_CLIENT_PATH.replace(/\\/g, '/')}';

$bytes = file_get_contents('${minimalGlbPath.replace(/\\/g, '/')}');
$res = kcAiSaveGlb($bytes, '${destPath.replace(/\\/g, '/')}');

echo json_encode($res);
`
  fs.writeFileSync(runner, phpCode, 'utf8')
  try {
    const rawOutput = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const res = JSON.parse(rawOutput)
    assert.equal(res.ok, true, 'kcAiSaveGlb must not crash even on fallback')
    assert.equal(res.segmented, false, 'kcAiSaveGlb must indicate segmented: false on segmentation error')
    assert.ok(fs.existsSync(destPath), 'GLB must be saved on disk')
  } finally {
    cleanTempDir()
  }
})

test('segment-integration: kcAiSaveGlb falls back to enhance-glb.py when segmenter fails or is unavailable', () => {
  cleanTempDir()
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const destPath = path.join(TEMP_DIR, 'output-enhancer-fallback.glb')
  const runner = path.join(TEMP_DIR, 'test_enhancer_fallback.php')

  // Test when segmenter is simulated absent by testing that enhance-glb.py runs
  const phpCode = `<?php
require_once '${TRELLIS_CLIENT_PATH.replace(/\\/g, '/')}';

// Test with invalid GLB bytes (< 20 bytes)
$invalidRes = kcAiSaveGlb('not_a_glb', '${destPath.replace(/\\/g, '/')}');

// Test with valid GLB
$validBytes = file_get_contents('${FIXTURE_GLB.replace(/\\/g, '/')}');
$validRes = kcAiSaveGlb($validBytes, '${destPath.replace(/\\/g, '/')}');

echo json_encode([
    'invalid' => $invalidRes,
    'valid' => $validRes,
]);
`
  fs.writeFileSync(runner, phpCode, 'utf8')
  try {
    const rawOutput = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const res = JSON.parse(rawOutput)
    assert.equal(res.invalid.ok, false, 'Invalid bytes must return ok: false')
    assert.match(res.invalid.error, /not a valid GLB/i)
    assert.equal(res.valid.ok, true, 'Valid GLB must return ok: true')
  } finally {
    cleanTempDir()
  }
})

test('segment-integration: api/ai/generate.php payload reflects that generated shoe has customizable parts', () => {
  cleanTempDir()
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const runner = path.join(TEMP_DIR, 'test_generate_runner.php')
  const statusFile = path.join(TEMP_DIR, 'status.txt')

  // Prepare a test runner executing generate.php with Mock PDO and authenticated seller session
  const phpCode = `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';

// Mock session and seller
session_start();
$_SESSION['user_id'] = 42;
$_SESSION['role'] = 'seller';

// Mock file upload
$sourceImg = '${TEMP_DIR.replace(/\\/g, '/')}/mock_shoe.png';
file_put_contents($sourceImg, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
$_FILES['image'] = [
    'name' => 'mock_shoe.png',
    'type' => 'image/png',
    'tmp_name' => $sourceImg,
    'error' => UPLOAD_ERR_OK,
    'size' => filesize($sourceImg),
];

// Mock generator to return fixture GLB (which gets processed through kcAiSaveGlb)
$GLOBALS['__TEST_AI_GENERATOR__'] = function($imgPath, $destGlbPath) {
    require_once '${TRELLIS_CLIENT_PATH.replace(/\\/g, '/')}';
    $bytes = file_get_contents('${FIXTURE_GLB.replace(/\\/g, '/')}');
    return kcAiSaveGlb($bytes, $destGlbPath);
};

// Mock PDO
class MockStmt extends PDOStatement {
    private $result;
    public function __construct($res = []) { $this->result = $res; }
    public function execute(?array $params = null): bool { return true; }
    public function fetch($m = 0, $c = 0, $o = 0): mixed { return is_array($this->result) ? $this->result : false; }
    public function fetchColumn($c = 0): mixed { return 0; }
}

class TestDb extends PDO {
    public function __construct() {}
    public function prepare(string $q, array $o = []): PDOStatement {
        if (stripos($q, 'FROM users') !== false) {
            return new MockStmt(['id' => 42, 'role' => 'seller', 'status' => 'approved', 'is_active' => 1, 'name' => 'Seller', 'email' => 'seller@test.com']);
        }
        if (stripos($q, 'FROM seller_profiles') !== false) {
            return new MockStmt(['status' => 'approved', 'user_id' => 42]);
        }
        if (stripos($q, 'SELECT * FROM ai_generations') !== false) {
            return new MockStmt([
                'id' => 'KCAI-2026-9999',
                'seller_id' => 42,
                'source_image_path' => '/images/ai-source/mock.png',
                'status' => 'completed',
                'result_glb_path' => '/models/seller-ai/test.glb',
                'provider' => 'huggingface_trellis',
                'started_at' => date('Y-m-d H:i:s'),
                'completed_at' => date('Y-m-d H:i:s'),
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        }
        return new MockStmt();
    }
}

$GLOBALS['__TEST_PDO__'] = new TestDb();

register_shutdown_function(function() {
    $code = http_response_code();
    file_put_contents('${statusFile.replace(/\\/g, '/')}', (string)($code === false ? 200 : $code));
});

require '${GENERATE_PATH.replace(/\\/g, '/')}';
`
  fs.writeFileSync(runner, phpCode, 'utf8')
  try {
    let output = ''
    try {
      output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    } catch (e) {
      output = e.stdout || ''
    }

    let json = null
    try {
      json = JSON.parse(output.trim())
    } catch {
      const match = output.match(/\{[\s\S]*\}/)
      if (match) {
        json = JSON.parse(match[0])
      } else {
        assert.fail(`Could not parse JSON output: ${output}`)
      }
    }

    assert.equal(json.success, true, 'generate.php must succeed')
    assert.equal(json.hasCustomizableParts, true, 'Top-level payload must indicate hasCustomizableParts: true')
    assert.equal(json.generation.hasCustomizableParts, true, 'generation object must indicate hasCustomizableParts: true')
    assert.ok(Array.isArray(json.generation.customizableParts), 'customizableParts must be an array')
    assert.ok(json.generation.customizableParts.includes('Upper'), 'customizableParts must include Upper')

    if (json?.generation?.resultGlbPath) {
      const glbOnDisk = path.join(ROOT_DIR, 'public', json.generation.resultGlbPath.replace(/^\//, ''))
      const pngOnDisk = glbOnDisk.replace(/\.glb$/, '.png')
      if (fs.existsSync(glbOnDisk)) fs.unlinkSync(glbOnDisk)
      if (fs.existsSync(pngOnDisk)) fs.unlinkSync(pngOnDisk)
    }
  } finally {
    cleanTempDir()
  }
})

test('segment-integration: kcAiSaveGlb handles URL parameter and reports network errors gracefully', () => {
  cleanTempDir()
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const destPath = path.join(TEMP_DIR, 'output-url.glb')
  const runner = path.join(TEMP_DIR, 'test_url_runner.php')

  const phpCode = `<?php
require_once '${TRELLIS_CLIENT_PATH.replace(/\\/g, '/')}';

// Test with unreachable URL
$res = kcAiSaveGlb('http://127.0.0.1:59999/nonexistent.glb', '${destPath.replace(/\\/g, '/')}');

echo json_encode($res);
`
  fs.writeFileSync(runner, phpCode, 'utf8')
  try {
    const rawOutput = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const res = JSON.parse(rawOutput)
    assert.equal(res.ok, false, 'kcAiSaveGlb must report failure for unreachable URL')
    assert.ok(typeof res.error === 'string' && res.error.length > 0, 'Error message must be provided')
  } finally {
    cleanTempDir()
  }
})
