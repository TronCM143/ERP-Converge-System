import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5090',
        changeOrigin: true,
        secure: false
      },
      '/images': {
        target: 'http://localhost:5090',
        changeOrigin: true,
        secure: false
      },
      '/hubs': {
        target: 'http://localhost:5090',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
});

