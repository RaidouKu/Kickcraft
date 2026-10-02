import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('AGENTS.md reflects seller marketplace and scope expansion', async (t) => {
  const content = fs.readFileSync('./AGENTS.md', 'utf8');

  await t.test('System identity reflects seller-driven 3D shoe marketplace', () => {
    assert.match(content, /seller-driven 3D shoe marketplace/i);
    assert.match(content, /customization/i);
    assert.match(content, /pickup/i);
  });

  await t.test('Users section defines Seller role', () => {
    assert.match(content, /- \*\*Seller:\*\*/i);
    assert.match(content, /admin-approved/i);
    assert.match(content, /AI-generate|2D→3D|AI 2D/i);
    assert.match(content, /marketplace/i);
  });

  await t.test('Architecture includes seller dashboard and endpoints', () => {
    assert.match(content, /seller/i);
    assert.match(content, /api\/sellers|api\/products|api\/ai|Seller Dashboard/i);
  });

  await t.test('Scope limits (Included) contains all seller features', () => {
    assert.match(content, /Seller registration & admin review system/i);
    assert.match(content, /Seller product creation/i);
    assert.match(content, /GLB upload/i);
    assert.match(content, /AI 2D→3D generation/i);
    assert.match(content, /Visual mesh tagger \+ auto-detection/i);
    assert.match(content, /In-system color & charm customizer/i);
    assert.match(content, /In-app interactive tutorial walkthrough/i);
    assert.match(content, /Public marketplace catalog with 3D preview/i);
    assert.match(content, /Seller order management & admin oversight/i);
  });

  await t.test('Scope limits (Excluded) excludes third-party seller accounts from exclusion and keeps expected limits', () => {
    // Should NOT exclude multi-store or third-party seller accounts
    assert.doesNotMatch(content, /Excluded[^#]*Multi-store or third-party seller accounts/i);
    // Should retain core exclusions
    assert.match(content, /Online payment/i);
    assert.match(content, /Delivery and shipping/i);
    assert.match(content, /Full accounting or physical POS/i);
    assert.match(content, /Branded third-party shoe models/i);
  });
});
