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

  let body = options.body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }

  if (body !== undefined && typeof body === 'object' && !isFormData) {
    body = JSON.stringify(body)
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

  let res
  try {
    res = await fetch(url, fetchOptions)
  } catch (cause) {
    const error = new Error('Cannot reach KickCraft services. Start Apache and MySQL in XAMPP, then try again.')
    error.cause = cause
    throw error
  }

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
