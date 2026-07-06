/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const OPENCODE_BASE = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_MODEL = 'deepseek-v4-flash-free';
const OPENCODE_TOKEN = 'public';
const OPENCODE_HEADERS: Record<string, string> = {
  'User-Agent': 'opencode/1.17.13 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
  'x-opencode-client': 'cli',
  'x-opencode-project': 'global',
};

async function opencodeFallback(res: ServerResponse, body: string) {
  try {
    const parsed = JSON.parse(body);
    parsed.model = OPENCODE_MODEL;
    const opencodeResponse = await fetch(OPENCODE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCODE_TOKEN}`,
        ...OPENCODE_HEADERS,
      },
      body: JSON.stringify(parsed),
    });
    const text = await opencodeResponse.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.statusCode = opencodeResponse.ok ? opencodeResponse.status : 502;
    res.end(text);
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Both Mistral and OpenCode failed' }));
  }
}

function devProxyPlugin(): import('vite').Plugin {
  return {
    name: 'dev-proxy',
    configureServer(server) {
      // Register as early as possible so Vite's indexHtmlFallback / static
      // middlewares don't swallow /api/* or /__proxy requests. Returning a
      // post-hook from configureServer would run *after* Vite's internals,
      // which is too late for the default provider's /api/chat path.
      server.middlewares.use('/api/chat', async (req: IncomingMessage, res: ServerResponse) => {
        // CORS preflight — let the dev server (and Cloudflare in prod) be reachable
        // from any origin while developing.
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST, OPTIONS');
          res.end('Method not allowed');
          return;
        }

        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        // Phase 1: Try Mistral
        const mistralApiKey = process.env.MISTRAL_API_KEY;
        if (mistralApiKey) {
          try {
            const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${mistralApiKey}`,
              },
              body,
            });

            if (mistralResponse.ok) {
              const text = await mistralResponse.text();
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.statusCode = mistralResponse.status;
              res.end(text);
              return;
            }
          } catch {
            // fall through to OpenCode
          }
        }

        // Phase 2: Fallback to OpenCode
        await opencodeFallback(res, body);
      });

      server.middlewares.use('/api/fetch', async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const target = url.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url query param' }));
          return;
        }
        try {
          const response = await fetch(target);
          const text = await response.text();
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.statusCode = response.ok ? 200 : response.status;
          res.end(text);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
        }
      });

      server.middlewares.use('/__proxy', async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const target = url.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url query param' }));
          return;
        }
        try {
          const response = await fetch(target);
          const text = await response.text();
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.statusCode = response.ok ? 200 : response.status;
          res.end(text);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          reactflow: ['@xyflow/react'],
          rough: ['roughjs'],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
