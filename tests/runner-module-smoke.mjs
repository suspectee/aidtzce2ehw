import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

if (isMainThread) {
  await new Promise((resolveTest, rejectTest) => {
    const worker = new Worker(new URL(import.meta.url), {
      type: 'module',
      workerData: { runner: true },
    })
    const timeout = setTimeout(() => {
      void worker.terminate()
      rejectTest(new Error('Python runner smoke test timed out.'))
    }, 30_000)

    worker.on('message', (message) => {
      if (message.type === 'ready') {
        worker.postMessage({
          type: 'run',
          runId: 1,
          language: 'python',
          code: 'print(sum([12, 4, 8]))',
        })
      }

      if (message.type === 'fatal') {
        clearTimeout(timeout)
        void worker.terminate()
        rejectTest(new Error(message.text))
      }

      if (message.type === 'result') {
        clearTimeout(timeout)
        try {
          assert.equal(message.runId, 1)
          assert.deepEqual(message.lines, [{ stream: 'stdout', text: '24' }])
          console.log('Python module worker returned: 24')
          void worker.terminate()
          resolveTest()
        } catch (error) {
          void worker.terminate()
          rejectTest(error)
        }
      }
    })

    worker.on('error', (error) => {
      clearTimeout(timeout)
      rejectTest(error)
    })
  })
} else if (workerData?.runner) {
  globalThis.self = globalThis
  globalThis.location = {
    origin: resolve('dist'),
  }
  globalThis.postMessage = (message) => parentPort.postMessage(message)
  parentPort.on('message', (data) => self.onmessage({ data }))

  await import(pathToFileURL(resolve('public/runner.worker.js')).href)
  parentPort.postMessage({ type: 'ready' })
}
