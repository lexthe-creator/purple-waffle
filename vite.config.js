import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Use a normal root base in dev so the Vite client can derive its URLs
  // correctly, but keep relative asset paths for portable production builds.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    // Allow both localhost and 127.0.0.1 during local QA without custom HMR wiring.
    host: true,
    port: 4173,
    strictPort: true,
  },
}));
