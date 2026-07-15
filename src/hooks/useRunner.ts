import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageId, OutputLine, RunnerResult } from '../types'

const initialResult: RunnerResult = {
  lines: [],
  duration: null,
  status: 'idle',
  statusText: 'Console ready',
}

export function useRunner() {
  const [result, setResult] = useState<RunnerResult>(initialResult)
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const runIdRef = useRef(0)

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
  }, [])

  useEffect(() => stopWorker, [stopWorker])

  const run = useCallback(
    (language: LanguageId, code: string) => {
      if (language !== 'javascript' && language !== 'python') {
        const label = language[0].toUpperCase() + language.slice(1)
        setResult({
          lines: [
            {
              stream: 'system',
              text: `${label} is available for collaborative editing and highlighting. Choose JavaScript or Python to run code in the browser.`,
            },
          ],
          duration: null,
          status: 'error',
          statusText: 'Preview-only language',
        })
        return
      }

      stopWorker()
      const runId = ++runIdRef.current
      const worker = new Worker('/runner.worker.js', {
        type: 'module',
        name: 'pairwise-runner',
      })
      workerRef.current = worker
      setResult({
        lines: [],
        duration: null,
        status: 'running',
        statusText: language === 'python' ? 'Preparing Python runtime…' : 'Starting sandbox…',
      })

      worker.onmessage = (event: MessageEvent) => {
        const message = event.data as {
          type: string
          runId: number
          lines?: OutputLine[]
          duration?: number
          text?: string
        }
        if (message.runId !== runId) return

        if (message.type === 'status') {
          setResult((current) => ({ ...current, statusText: message.text || current.statusText }))
        }

        if (message.type === 'execution:start') {
          setResult((current) => ({ ...current, statusText: 'Running in browser sandbox…' }))
          timeoutRef.current = window.setTimeout(() => {
            stopWorker()
            setResult({
              lines: [{ stream: 'stderr', text: 'Execution stopped after the 5 second limit.' }],
              duration: 5000,
              status: 'timeout',
              statusText: 'Time limit exceeded',
            })
          }, 5000)
        }

        if (message.type === 'result') {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
          const lines = message.lines || []
          const hasError = lines.some((line) => line.stream === 'stderr')
          setResult({
            lines,
            duration: message.duration ?? null,
            status: hasError ? 'error' : 'success',
            statusText: hasError ? 'Finished with errors' : 'Run completed',
          })
          stopWorker()
        }

        if (message.type === 'fatal') {
          stopWorker()
          setResult({
            lines: [{ stream: 'stderr', text: message.text || 'The runner could not start.' }],
            duration: null,
            status: 'error',
            statusText: 'Runner error',
          })
        }
      }

      worker.onerror = (event) => {
        stopWorker()
        setResult({
          lines: [{ stream: 'stderr', text: event.message || 'The runner stopped unexpectedly.' }],
          duration: null,
          status: 'error',
          statusText: 'Runner error',
        })
      }

      worker.postMessage({ type: 'run', runId, language, code })
    },
    [stopWorker],
  )

  const clear = useCallback(() => setResult(initialResult), [])

  return { result, run, clear }
}
