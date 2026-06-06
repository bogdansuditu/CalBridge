import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
      '/caldav': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
      '/.well-known': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
    },
  },
});
