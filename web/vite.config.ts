import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Development: `ssh -L 8799:127.0.0.1:8799 root@<server>` to a swizdash started with
// SWIZDASH_PORT=8799, and SWIZDASH_DEV_TOKEN set to its token.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'echarts'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8799',
        headers: { 'x-swizdash-token': process.env.SWIZDASH_DEV_TOKEN ?? '' },
      },
    },
  },
})
