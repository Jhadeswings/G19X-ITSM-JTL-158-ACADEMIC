import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración de Vite para el frontend (Style Guide v1.1).
// Bloque `test`: Vitest con jsdom para los tests de la vista.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
})

