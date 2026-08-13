import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network interfaces so other devices on the office LAN can
    // reach the app at http://<this-machine-ip>:5173 (e.g. 192.168.10.95:5173).
    // API/SignalR calls stay relative and are proxied to the backend below, so
    // only this port needs to be exposed.
    host: true,
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

