/* global loadPyodide */

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.2/full/'

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
    importScripts(`${PYODIDE_URL}pyodide.js`)
    const pyodide = await loadPyodide({ indexURL: PYODIDE_URL })
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
