import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Use a normal root base in dev so the Vite client can derive its URLs
  // correctly, but keep relative asset paths for portable production builds.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react-dom/')) return 'react-dom';
          if (id.includes('/react/')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    // Allow both localhost and 127.0.0.1 during local QA without custom HMR wiring.
    host: true,
    port: 4173,
    // Prefer 4173, but automatically fall back if it's already occupied.
    strictPort: false,
  },
}));
