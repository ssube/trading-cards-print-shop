import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  define: { 'globalThis.__OFFLINE_DEMO__': JSON.stringify(process.env.VITE_OFFLINE_DEMO === '1') },
  server: { proxy: { '/api': 'http://127.0.0.1:8000', '/assets': 'http://127.0.0.1:8000' } },
})
