import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built site works on any static host and any
  // sub-path (GitHub Pages project site, Cloudflare Pages, etc.) —
  // absolute "/assets/..." links would 404 and render a blank page.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    // Allow the Arena preview host through.
    allowedHosts: ['5173-ioedrk931lyez7vib8ndx.e2b.app'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
