import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Community Designs Backend', () => {
  // ── Schema ──
  describe('Database Schema', () => {
    it('setup.sql contains community_designs table', () => {
      const sql = fs.readFileSync('api/database/setup.sql', 'utf8')
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS community_designs'), 'community_designs table must exist')
      assert.ok(sql.includes('designer_name'), 'must have designer_name column')
      assert.ok(sql.includes('designer_email'), 'must have designer_email column')
      assert.ok(sql.includes('design_name'), 'must have design_name column')
      assert.ok(sql.includes('part_colors'), 'must have part_colors JSON column')
      assert.ok(sql.includes("ENUM('pending', 'approved', 'rejected', 'featured')"), 'must have correct status enum')
      assert.ok(sql.includes('deleted_at'), 'must support soft deletion')
      assert.ok(sql.includes('permanently_deleted'), 'must support permanent deletion flag')
    })

    it('setup.sql does NOT contain DELETE FROM', () => {
      const sql = fs.readFileSync('api/database/setup.sql', 'utf8')
      assert.ok(!sql.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })

  // ── submit.php ──
  describe('api/designs/submit.php', () => {
    const filePath = 'api/designs/submit.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'submit.php must exist')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare('), 'must use PDO prepare()')
      assert.ok(src.includes('execute('), 'must use PDO execute()')
      assert.ok(!src.match(/\$_(POST|GET|REQUEST)\[/), 'must not use superglobals directly in SQL')
    })

    it('validates required fields', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('designerName') || src.includes('designer_name'), 'must validate designerName')
      assert.ok(src.includes('designerEmail') || src.includes('designer_email'), 'must validate designerEmail')
      assert.ok(src.includes('designName') || src.includes('design_name'), 'must validate designName')
      assert.ok(src.includes('shoeId') || src.includes('shoe_id'), 'must validate shoeId')
      assert.ok(src.includes('partColors') || src.includes('part_colors'), 'must validate partColors')
    })

    it('generates KCD-YYYY-XXXX design ID', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('KCD-'), 'must generate KCD- prefixed IDs')
    })

    it('verifies shoe exists before accepting submission', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('shoes') && src.includes('SELECT'), 'must verify shoe_id references a valid shoe')
    })

    it('does NOT contain DELETE FROM', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(!src.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })

  // ── list.php ──
  describe('api/designs/list.php', () => {
    const filePath = 'api/designs/list.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'list.php must exist')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare(') || src.includes('query('), 'must use PDO')
    })

    it('filters by approved+featured for public requests', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('approved') && src.includes('featured'), 'must filter public results to approved/featured')
    })

    it('supports include_all for admin users', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('include_all'), 'must support include_all parameter for admin')
    })

    it('excludes soft-deleted designs', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('deleted_at IS NULL'), 'must exclude soft-deleted designs')
    })
  })

  // ── review.php ──
  describe('api/designs/review.php', () => {
    const filePath = 'api/designs/review.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'review.php must exist')
    })

    it('requires admin authentication', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('requireAdmin'), 'must call requireAdmin()')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare('), 'must use PDO prepare()')
      assert.ok(src.includes('execute('), 'must use PDO execute()')
    })

    it('validates status transitions', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('approved'), 'must handle approved status')
      assert.ok(src.includes('rejected'), 'must handle rejected status')
      assert.ok(src.includes('featured'), 'must handle featured status')
    })

    it('does NOT contain DELETE FROM', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(!src.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })
})
