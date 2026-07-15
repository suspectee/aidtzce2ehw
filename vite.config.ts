import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pyodide/{pyodide.mjs,pyodide.asm.mjs,pyodide.asm.wasm,pyodide-lock.json,python_stdlib.zip}',
          dest: 'pyodide',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/codemirror')) {
            return 'editor'
          }
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
})
