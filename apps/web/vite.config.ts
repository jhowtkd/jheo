import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sendBackendUnavailable } from './src/dev/backendUnavailable';

const apiTarget = `http://127.0.0.1:${process.env.JHEO_API_PORT ?? '8080'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Forward `/api/*` to the Fastify backend. Default port 8080; override
    // via `JHEO_API_PORT` env var (e.g. when running alongside the docker
    // stack on a remapped port).
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            // http-proxy may pass a Socket; only Node ServerResponse has writeHead.
            const r = res as { headersSent?: boolean; writeHead?: Function; end?: Function };
            if (r && typeof r.writeHead === 'function' && typeof r.end === 'function') {
              sendBackendUnavailable(
                { headersSent: r.headersSent, writeHead: r.writeHead.bind(r), end: r.end.bind(r) },
                5,
              );
            }
          });
        },
      },
    },
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
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // Wire up the jsdom Storage shim — see test/setup.ts for the Node 24+
    // localStorage polyfill workaround.
    setupFiles: ['./test/setup.ts'],
    // Cap parallel workers so heavy fixtures don't OOM in CI.
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
});
