const PYODIDE_URL = `${self.location.origin}/pyodide/`
const LOAD_ATTEMPTS = 5

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function shouldRetry(response) {
  return response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500
}

async function fetchWithRetry(fetchFunction, input, init) {
  let lastError

  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchFunction(input, init)
      if (!shouldRetry(response) || attempt === LOAD_ATTEMPTS - 1) return response
      lastError = new Error(`Request failed with HTTP ${response.status}.`)
    } catch (error) {
      lastError = error
      if (attempt === LOAD_ATTEMPTS - 1) throw error
    }

    await sleep(400 * 2 ** attempt)
  }

  throw lastError
}

async function importWithRetry(url) {
  let lastError

  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
    try {
      // A unique URL prevents the browser from reusing a rejected module request.
      return await import(`${url}?load-attempt=${attempt}`)
    } catch (error) {
      lastError = error
      if (attempt < LOAD_ATTEMPTS - 1) await sleep(400 * 2 ** attempt)
    }
  }

  throw lastError
}

function displayValue(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  try {
    const seen = new WeakSet()
    return JSON.stringify(
      value,
      (_key, nestedValue) => {
        if (typeof nestedValue === 'bigint') return `${nestedValue}n`
        if (typeof nestedValue === 'object' && nestedValue !== null) {
          if (seen.has(nestedValue)) return '[Circular]'
          seen.add(nestedValue)
        }
        return nestedValue
      },
      2,
    )
  } catch {
    return String(value)
  }
}

function formattedError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function disableNetwork() {
  const blocked = () => Promise.reject(new Error('Network access is disabled in this sandbox.'))
  const blockedConstructor = function () {
    throw new Error('Network access is disabled in this sandbox.')
  }

  for (const [key, value] of [
    ['fetch', blocked],
    ['WebSocket', blockedConstructor],
    ['XMLHttpRequest', blockedConstructor],
    ['EventSource', blockedConstructor],
  ]) {
    try {
      Object.defineProperty(self, key, { value, configurable: false, writable: false })
    } catch {
      self[key] = value
    }
  }
}

async function runJavaScript(runId, code) {
  const lines = []
  const write = (stream, values) => {
    lines.push({ stream, text: values.map(displayValue).join(' ') })
  }
  const sandboxConsole = {
    log: (...values) => write('stdout', values),
    info: (...values) => write('stdout', values),
    debug: (...values) => write('stdout', values),
    warn: (...values) => write('stderr', values),
    error: (...values) => write('stderr', values),
    table: (...values) => write('stdout', values),
  }

  disableNetwork()
  self.postMessage({ type: 'execution:start', runId })
  const startedAt = performance.now()

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const blocked = () => Promise.reject(new Error('Network access is disabled in this sandbox.'))
    const blockedConstructor = function () {
      throw new Error('Network access is disabled in this sandbox.')
    }
    const execute = new AsyncFunction(
      'console',
      'fetch',
      'WebSocket',
      'XMLHttpRequest',
      'EventSource',
      'importScripts',
      `"use strict";\n${code}`,
    )
    await execute(
      sandboxConsole,
      blocked,
      blockedConstructor,
      blockedConstructor,
      blockedConstructor,
      blockedConstructor,
    )
  } catch (error) {
    lines.push({ stream: 'stderr', text: formattedError(error) })
  }

  if (lines.length === 0) {
    lines.push({ stream: 'system', text: 'Program finished with no output.' })
  }
  self.postMessage({
    type: 'result',
    runId,
    lines,
    duration: Math.round((performance.now() - startedAt) * 10) / 10,
  })
}

async function runPython(runId, code) {
  const lines = []
  try {
    self.postMessage({ type: 'status', runId, text: 'Loading Python runtime…' })
    const nativeFetch = self.fetch.bind(self)
    self.fetch = (input, init) => fetchWithRetry(nativeFetch, input, init)
    const [{ loadPyodide }, wasmModule] = await Promise.all([
      importWithRetry(`${PYODIDE_URL}pyodide.mjs`),
      importWithRetry(`${PYODIDE_URL}pyodide.asm.mjs`),
    ])
    const pyodide = await loadPyodide({
      indexURL: PYODIDE_URL,
      createPyodideModule: wasmModule.default,
    })
    disableNetwork()
    pyodide.setStdout({ batched: (text) => lines.push({ stream: 'stdout', text }) })
    pyodide.setStderr({ batched: (text) => lines.push({ stream: 'stderr', text }) })

    self.postMessage({ type: 'execution:start', runId })
    const startedAt = performance.now()
    try {
      await pyodide.runPythonAsync(code)
    } catch (error) {
      lines.push({ stream: 'stderr', text: formattedError(error) })
    }

    if (lines.length === 0) {
      lines.push({ stream: 'system', text: 'Program finished with no output.' })
    }
    self.postMessage({
      type: 'result',
      runId,
      lines,
      duration: Math.round((performance.now() - startedAt) * 10) / 10,
    })
  } catch (error) {
    self.postMessage({ type: 'fatal', runId, text: formattedError(error) })
  }
}

self.onmessage = (event) => {
  const { type, runId, language, code } = event.data || {}
  if (type !== 'run') return
  if (language === 'python') void runPython(runId, code)
  else void runJavaScript(runId, code)
}
