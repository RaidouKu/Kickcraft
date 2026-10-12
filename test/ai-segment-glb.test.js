import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const SCRIPT_PATH = path.resolve('tools/segment-shoe-glb.py')
const FIXTURE_PATH = path.resolve('public/models/seller-ai/62b6d15a2e5118335eeab8b8d7073dd3.glb')
const FIXTURE_2_PATH = path.resolve('public/models/seller-ai/c3a3b044523adac4509c294478d9b77d.glb')
const TEMP_OUTPUT_DIR = path.resolve('public/models/seller-ai/tmp-test')
const TEMP_OUTPUT_PATH = path.join(TEMP_OUTPUT_DIR, 'test-segmented.glb')
const TEMP_OUTPUT_2_PATH = path.join(TEMP_OUTPUT_DIR, 'test-segmented-2.glb')

// Helper to parse binary GLB file into { header, gltf, binBuffer }
function parseGlb(filePath) {
  const buf = fs.readFileSync(filePath)
  assert.ok(buf.length >= 20, 'File must be at least 20 bytes')

  const magic = buf.readUInt32LE(0)
  assert.equal(magic, 0x46546C67, 'Magic header must be 0x46546C67 (glTF)')

  const version = buf.readUInt32LE(4)
  assert.equal(version, 2, 'glTF version must be 2')

  const totalLength = buf.readUInt32LE(8)
  assert.equal(buf.length, totalLength, 'Total length must match header length')

  const jsonLen = buf.readUInt32LE(12)
  const jsonType = buf.readUInt32LE(16)
  assert.equal(jsonType, 0x4E4F534A, 'Chunk 0 type must be JSON (0x4E4F534A)')

  const jsonBytes = buf.subarray(20, 20 + jsonLen)
  const gltf = JSON.parse(jsonBytes.toString('utf8'))

  const binOffset = 20 + jsonLen
  let binBuffer = Buffer.alloc(0)
  if (binOffset < totalLength) {
    const binLen = buf.readUInt32LE(binOffset)
    const binType = buf.readUInt32LE(binOffset + 4)
    assert.equal(binType, 0x004E4942, 'Chunk 1 type must be BIN (0x004E4942)')
    binBuffer = buf.subarray(binOffset + 8, binOffset + 8 + binLen)
  }

  return { magic, version, totalLength, gltf, binBuffer, rawBytes: buf }
}

test('tools/segment-shoe-glb.py exists and is non-empty', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'tools/segment-shoe-glb.py must exist')
  const content = fs.readFileSync(SCRIPT_PATH, 'utf8')
  assert.ok(content.length > 50, 'tools/segment-shoe-glb.py must contain code')
})

test('segment-shoe-glb.py CLI handles arguments and help properly', () => {
  // Test --help exits with 0
  const helpRes = spawnSync('python', [SCRIPT_PATH, '--help'], { encoding: 'utf8' })
  assert.equal(helpRes.status, 0, '--help must exit 0')
  assert.match(helpRes.stdout, /Usage:/i, 'Must output usage info')

  // Test no arguments exits with 1
  const noArgRes = spawnSync('python', [SCRIPT_PATH], { encoding: 'utf8' })
  assert.equal(noArgRes.status, 1, 'No arguments must exit 1')

  // Test nonexistent file exits with 1
  const missingRes = spawnSync('python', [SCRIPT_PATH, 'nonexistent_file.glb'], { encoding: 'utf8' })
  assert.equal(missingRes.status, 1, 'Missing file must exit 1')
})

test('segment-shoe-glb.py partitions a single-mesh AI shoe into 8 distinct KickCraft parts', () => {
  assert.ok(fs.existsSync(FIXTURE_PATH), 'Input fixture GLB must exist')

  if (!fs.existsSync(TEMP_OUTPUT_DIR)) {
    fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true })
  }

  // Parse input fixture to record baseline
  const input = parseGlb(FIXTURE_PATH)
  assert.equal(input.gltf.meshes[0].primitives.length, 1, 'Input fixture must have exactly 1 primitive')
  const origIndexAcc = input.gltf.accessors[input.gltf.meshes[0].primitives[0].indices]
  const totalOriginalTriangles = origIndexAcc.count / 3

  // Execute segment-shoe-glb.py
  execFileSync('python', [SCRIPT_PATH, FIXTURE_PATH, TEMP_OUTPUT_PATH], {
    encoding: 'utf8',
  })
  assert.ok(fs.existsSync(TEMP_OUTPUT_PATH), 'Segmented output GLB must exist')

  // Parse segmented output GLB
  const output = parseGlb(TEMP_OUTPUT_PATH)

  // 1. Check primitives count: must partition into 8 primitives (or at least 6-8 if any part empty)
  const primitives = output.gltf.meshes[0].primitives
  assert.ok(primitives.length >= 6 && primitives.length <= 8, `Expected 6 to 8 primitives, got ${primitives.length}`)

  // 2. Check canonical materials
  const expectedMaterials = [
    'UpperMaterial',
    'ToeCapMaterial',
    'TongueMaterial',
    'LacesMaterial',
    'HeelPanelMaterial',
    'SideAccentsMaterial',
    'MidsoleMaterial',
    'OutsoleMaterial',
  ]

  const outputMaterialNames = output.gltf.materials.map(m => m.name)
  for (const name of expectedMaterials) {
    assert.ok(outputMaterialNames.includes(name), `Materials must contain ${name}`)
  }

  // 3. Ensure all primitives have valid non-empty indices preserving all triangles
  let totalOutputIndices = 0
  for (const prim of primitives) {
    const matIndex = prim.material
    const mat = output.gltf.materials[matIndex]
    assert.ok(mat, 'Primitive must have valid material index')
    assert.ok(expectedMaterials.includes(mat.name), `Material name ${mat.name} must be canonical`)

    const idxAcc = output.gltf.accessors[prim.indices]
    assert.ok(idxAcc, 'Primitive must have valid index accessor')
    assert.ok(idxAcc.count > 0, 'Primitive index count must be > 0')
    assert.equal(idxAcc.count % 3, 0, 'Primitive index count must be multiple of 3 (triangles)')
    totalOutputIndices += idxAcc.count

    // Primitive attributes must retain POSITION, NORMAL, TEXCOORD_0
    assert.ok(prim.attributes.POSITION !== undefined, 'Primitive must retain POSITION attribute')
    assert.ok(prim.attributes.NORMAL !== undefined, 'Primitive must retain NORMAL attribute')
    assert.ok(prim.attributes.TEXCOORD_0 !== undefined, 'Primitive must retain TEXCOORD_0 attribute')
  }

  // All triangles must be accounted for
  assert.equal(totalOutputIndices, totalOriginalTriangles * 3, 'Total indices across primitives must match original count')

  // Cleanup temp test file
  try {
    fs.unlinkSync(TEMP_OUTPUT_PATH)
    fs.rmdirSync(TEMP_OUTPUT_DIR)
  } catch {}
})

test('segment-shoe-glb.py successfully partitions second AI model c3a3b044523adac4509c294478d9b77d.glb', () => {
  if (!fs.existsSync(FIXTURE_2_PATH)) return

  if (!fs.existsSync(TEMP_OUTPUT_DIR)) {
    fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true })
  }

  execFileSync('python', [SCRIPT_PATH, FIXTURE_2_PATH, TEMP_OUTPUT_2_PATH], {
    encoding: 'utf8',
  })
  assert.ok(fs.existsSync(TEMP_OUTPUT_2_PATH), 'Segmented second GLB must exist')

  const output = parseGlb(TEMP_OUTPUT_2_PATH)
  const primitives = output.gltf.meshes[0].primitives
  assert.ok(primitives.length >= 6 && primitives.length <= 8, `Expected 6 to 8 primitives, got ${primitives.length}`)

  try {
    fs.unlinkSync(TEMP_OUTPUT_2_PATH)
    fs.rmdirSync(TEMP_OUTPUT_DIR)
  } catch {}
})

test('segment-shoe-glb.py delights texture into neutral grayscale ambient shading map', () => {
  if (!fs.existsSync(TEMP_OUTPUT_DIR)) {
    fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true })
  }

  execFileSync('python', [SCRIPT_PATH, FIXTURE_PATH, TEMP_OUTPUT_PATH], {
    encoding: 'utf8',
  })

  const output = parseGlb(TEMP_OUTPUT_PATH)

  // Verify image exists
  assert.ok(output.gltf.images && output.gltf.images.length > 0, 'Model must have image')
  const imgBv = output.gltf.bufferViews[output.gltf.images[0].bufferView]
  const imgOffset = imgBv.byteOffset || 0
  const imgBytes = output.binBuffer.subarray(imgOffset, imgOffset + imgBv.byteLength)

  // Check JPEG magic
  assert.ok(imgBytes.length > 100, 'Image bytes must be valid')
  assert.equal(imgBytes[0], 0xFF, 'JPEG SOI byte 0')
  assert.equal(imgBytes[1], 0xD8, 'JPEG SOI byte 1')

  // Check 4-byte alignment
  assert.equal(output.rawBytes.length % 4, 0, 'Total GLB length must be 4-byte aligned')
  assert.equal(output.binBuffer.length % 4, 0, 'BIN buffer must be 4-byte aligned')

  // Verify image is neutral grayscale via Python PIL inspection
  const pyCheck = spawnSync('python', ['-c', `
import io, sys
from PIL import Image
data = open(r"${TEMP_OUTPUT_PATH}", "rb").read()
import struct, json
json_len, = struct.unpack("<I", data[12:16])
gltf = json.loads(data[20:20+json_len].decode("utf-8"))
img_bv = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
img_data = data[20+json_len+8 + img_bv.get("byteOffset", 0) : 20+json_len+8 + img_bv.get("byteOffset", 0) + img_bv["byteLength"]]
im = Image.open(io.BytesIO(img_data)).convert("RGB")
r, g, b = im.split()
import math
# Check if R, G, B channels are identical (pure neutral grayscale)
diff_rg = sum(abs(p1 - p2) for p1, p2 in zip(r.getdata(), g.getdata()))
diff_rb = sum(abs(p1 - p2) for p1, p2 in zip(r.getdata(), b.getdata()))
avg_lum = sum(r.getdata()) / len(r.getdata())
assert diff_rg == 0, f"R and G differ by {diff_rg}"
assert diff_rb == 0, f"R and B differ by {diff_rb}"
assert avg_lum >= 140, f"Average luminance {avg_lum} too low (must lift dark shadows)"
print("NEUTRAL_GRAYSCALE_OK")
`], { encoding: 'utf8' })

  assert.equal(pyCheck.status, 0, `Python grayscale check failed: ${pyCheck.stderr}`)
  assert.match(pyCheck.stdout, /NEUTRAL_GRAYSCALE_OK/)

  // Cleanup
  try {
    fs.unlinkSync(TEMP_OUTPUT_PATH)
    fs.rmdirSync(TEMP_OUTPUT_DIR)
  } catch {}
})

test('segment-shoe-glb.py contains zero physical SQL DELETE statements', () => {
  const content = fs.existsSync(SCRIPT_PATH) ? fs.readFileSync(SCRIPT_PATH, 'utf8') : ''
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Script must never contain physical DELETE FROM')
})
