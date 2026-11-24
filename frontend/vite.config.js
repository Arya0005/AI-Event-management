import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, /api is proxied to FastAPI so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:8000' },
  },
})
