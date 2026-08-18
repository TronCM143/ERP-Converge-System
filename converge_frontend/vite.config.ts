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
    /* Hostnames the dev server will answer to.

       Vite 5.4.12+ rejects requests whose Host header it doesn't recognise
       (a DNS-rebinding protection), so reaching this server through a tunnel
       fails with "Blocked request. This host is not allowed." — the app never
       loads at all.

       A LEADING DOT means "this domain and any subdomain", which is what an
       ngrok URL needs since the hostname changes on every restart of a free
       tunnel (e.g. https://a1b2-136-158-x-x.ngrok-free.app).

       Note this is the DEV SERVER's host allow-list, not CORS. The backend has
       no CORS policy and needs none: the proxy below forwards /api, /images and
       /hubs server-side, so the browser only ever talks to one origin. */
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
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

