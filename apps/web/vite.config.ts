import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Forward `/api/*` to the Fastify backend. Default port 8080; override
    // via `JHEO_API_PORT` env var (e.g. when running alongside the docker
    // stack on a remapped port).
    proxy: { '/api': `http://127.0.0.1:${process.env.JHEO_API_PORT ?? '8080'}` },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    // Hidden sourcemap for prod error monitoring without shipping the full
    // .map to end users.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Long-term cache stability: separate vendor chunks so app-only
        // changes don't invalidate React / TanStack / react-markdown.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          markdown: ['react-markdown'],
          state: ['zustand'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // Cap parallel workers so heavy fixtures don't OOM in CI.
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
});
