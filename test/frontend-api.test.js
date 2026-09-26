import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')

test('src/api.js exists and exports api function with credentials include', () => {
  const apiPath = path.join(ROOT_DIR, 'src', 'api.js')
  assert.ok(fs.existsSync(apiPath), 'src/api.js must exist')
  const code = fs.readFileSync(apiPath, 'utf8')
  assert.match(code, /export\s+async\s+function\s+api/i, 'Must export async function api')
  assert.match(code, /credentials:\s*['"]include['"]/i, 'Must specify credentials: include')
})

test('vite.config.js contains /api proxy configuration targeting backend', () => {
  const vitePath = path.join(ROOT_DIR, 'vite.config.js')
  assert.ok(fs.existsSync(vitePath), 'vite.config.js must exist')
  const code = fs.readFileSync(vitePath, 'utf8')
  assert.match(code, /proxy:\s*\{/i, 'vite.config.js must define server.proxy')
  assert.match(code, /['"]\/api['"]\s*:\s*\{/i, 'proxy must include /api route')
  assert.match(code, /target:\s*['"]http:\/\/localhost\/kickcraft['"]/i, 'proxy must target http://localhost/kickcraft')
  assert.match(code, /changeOrigin:\s*true/i, 'proxy must set changeOrigin: true')
})

test('api() performs GET request with normalized endpoint and credentials', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  let calledUrl = null
  let calledOptions = null

  globalThis.fetch = async (url, options) => {
    calledUrl = url
    calledOptions = options
    return {
      ok: true,
      status: 200,
      json: async () => ({ shoes: [{ id: 'kickcraft-classic' }] }),
    }
  }

  try {
    const result = await api('shoes/list.php')
    assert.equal(calledUrl, '/api/shoes/list.php', 'Should prepend /api/ to relative endpoint')
    assert.equal(calledOptions.method, 'GET', 'Default method should be GET')
    assert.equal(calledOptions.credentials, 'include', 'Should pass credentials: include')
    assert.deepEqual(result, { shoes: [{ id: 'kickcraft-classic' }] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() normalizes various endpoint formats', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  const calledUrls = []
  globalThis.fetch = async (url) => {
    calledUrls.push(url)
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }
  }

  try {
    await api('/shoes/list.php')
    await api('/api/shoes/list.php')
    await api('api/shoes/list.php')

    assert.equal(calledUrls[0], '/api/shoes/list.php')
    assert.equal(calledUrls[1], '/api/shoes/list.php')
    assert.equal(calledUrls[2], '/api/shoes/list.php')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() stringifies JSON body on POST and sets Content-Type header', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  let calledUrl = null
  let calledOptions = null

  globalThis.fetch = async (url, options) => {
    calledUrl = url
    calledOptions = options
    return {
      ok: true,
      status: 201,
      json: async () => ({ success: true, id: 42 }),
    }
  }

  const payload = { customerName: 'Jordan', size: '10' }

  try {
    const result = await api('reservations/create.php', {
      method: 'POST',
      body: payload,
    })

    assert.equal(calledUrl, '/api/reservations/create.php')
    assert.equal(calledOptions.method, 'POST')
    assert.equal(calledOptions.credentials, 'include')
    assert.equal(calledOptions.headers['Content-Type'], 'application/json')
    assert.equal(calledOptions.body, JSON.stringify(payload))
    assert.deepEqual(result, { success: true, id: 42 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() preserves custom headers and handles existing string body', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  let calledOptions = null

  globalThis.fetch = async (url, options) => {
    calledOptions = options
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }
  }

  try {
    await api('test', {
      method: 'POST',
      headers: { 'X-Custom-Header': 'KickCraftVal' },
      body: 'raw-string-body',
    })

    assert.equal(calledOptions.headers['Content-Type'], 'application/json')
    assert.equal(calledOptions.headers['X-Custom-Header'], 'KickCraftVal')
    assert.equal(calledOptions.body, 'raw-string-body')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() throws Error with error message, status, and data when !res.ok', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized session' }),
  })

  try {
    await assert.rejects(
      async () => {
        await api('admin/shoes.php')
      },
      (err) => {
        assert.equal(err.message, 'Unauthorized session')
        assert.equal(err.status, 401)
        assert.deepEqual(err.data, { error: 'Unauthorized session' })
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() fallback error message uses data.message or HTTP status code', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch

  // Case 1: data.message present
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: 'Validation failed' }),
  })

  try {
    await assert.rejects(
      async () => {
        await api('reservations/create.php')
      },
      (err) => {
        assert.equal(err.message, 'Validation failed')
        assert.equal(err.status, 422)
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  // Case 2: non-JSON or empty response fallback to status
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('Invalid JSON')
    },
  })

  try {
    await assert.rejects(
      async () => {
        await api('server-crash.php')
      },
      (err) => {
        assert.match(err.message, /500/)
        assert.equal(err.status, 500)
        assert.equal(err.data, null)
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api() turns network failures into actionable XAMPP guidance', async () => {
  const { api } = await import('../src/api.js')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }

  try {
    await assert.rejects(
      () => api('shoes/list.php'),
      /Cannot reach KickCraft services\. Start Apache and MySQL in XAMPP, then try again\./
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
