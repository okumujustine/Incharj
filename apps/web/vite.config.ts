import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiUrl = process.env.VITE_API_URL

if (!apiUrl) {
  throw new Error('VITE_API_URL is required')
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      }
    }
  }
})
