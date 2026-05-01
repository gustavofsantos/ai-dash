import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join } from 'path'

export default defineConfig({
  plugins: [react()],
  root: join(process.cwd(), 'src', 'client'),
  build: {
    outDir: join(process.cwd(), 'dist', 'client'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3333',
      '/ws': {
        target: 'ws://localhost:3333',
        ws: true,
      },
    },
  },
})
