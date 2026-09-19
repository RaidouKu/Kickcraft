/**
 * Frontend API client wrapper for KickCraft PHP backend.
 * Automatically handles endpoint normalization, JSON body serialization,
 * session credentials, and standardized error extraction.
 *
 * @param {string} endpoint - Relative or absolute API endpoint (e.g. 'shoes/list.php')
 * @param {RequestInit} [options={}] - Standard fetch options
 * @returns {Promise<any>} Parsed JSON response body
 */
export async function api(endpoint, options = {}) {
  let url = endpoint
  if (!url.startsWith('/api/')) {
    if (url.startsWith('api/')) {
      url = '/' + url
    } else if (url.startsWith('/')) {
      url = '/api' + url
    } else {
      url = '/api/' + url
    }
  }

  const method = (options.method || 'GET').toUpperCase()

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  let body = options.body
  if (body !== undefined && typeof body === 'object') {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      delete headers['Content-Type']
    } else {
      body = JSON.stringify(body)
    }
  }

  const fetchOptions = {
    ...options,
    method,
    headers,
    credentials: 'include',
  }

  if (body !== undefined) {
    fetchOptions.body = body
  } else {
    delete fetchOptions.body
  }

  const res = await fetch(url, fetchOptions)

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed with status ${res.status}`
    const error = new Error(message)
    error.status = res.status
    error.data = data
    throw error
  }

  return data
}
