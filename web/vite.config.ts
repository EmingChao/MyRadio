import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:15620',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:15620',
        ws: true,
      },
    },
  },
})
