import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In development, requests to /api are forwarded to the backend on port 5000,
// so the browser sees one origin (no CORS problems). In production, Nginx does the same job.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
