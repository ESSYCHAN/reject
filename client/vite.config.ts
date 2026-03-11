import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Agents API (FastAPI on 8080)
      '/api/agents': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agents/, '')
      },
      // Main API (Express on 8787)
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});
