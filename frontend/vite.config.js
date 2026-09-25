import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración de Vite para el frontend (Style Guide v1.1).
// Bloque `test`: Vitest con jsdom para los tests de la vista.
//
// Proxy de desarrollo (Bloque 2): el navegador llama a rutas RELATIVAS
// (`/api/...`) en el MISMO origen que sirve Vite y Vite reenvía la petición
// al backend. Al ser mismo origen no hay CORS, así que el backend NO necesita
// `CORSMiddleware` ni ningún cambio (contrato intacto).
//
// Destino configurable con `VITE_API_PROXY_TARGET`:
// - host: http://localhost:8000 (valor por defecto);
// - Docker: http://backend:8000 (nombre del servicio en la red de compose).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const destinoApi = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: destinoApi,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      css: false,
    },
  }
})

