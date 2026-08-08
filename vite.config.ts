/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchBookSummaryDev(title: string, author?: string): Promise<string> {
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
  const authorSlug = author ? author.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim() : '';

  const candidates: string[] = [];
  if (authorSlug) {
    candidates.push(`https://blinkist.com/en/books/${authorSlug}/${titleSlug}`);
    candidates.push(`https://jamesclear.com/books/${titleSlug}`);
  }
  candidates.push(
    `https://blinkist.com/en/books/${titleSlug}`,
    `https://jamesclear.com/books/${titleSlug}`,
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
  );

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { headers: BROWSER_HEADERS });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length > 300) return text;
    } catch {
      // try next
    }
  }

  const apiKey = process.env.EXA_API_KEY;
  if (apiKey) {
    try {
      const query = author ? `${title} ${author} book summary` : `${title} book summary`;
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ query, numResults: 3, type: 'auto', useAutoprompt: true }),
      });
      if (response.ok) {
        const data = await response.json();
        const contents = data.results
          ?.filter((r: { text: string }) => r.text && r.text.length > 100)
          ?.map((r: { text: string }) => r.text)
          ?.join('\n\n');
        if (contents) return contents;
      }
    } catch {
      // fall through
    }
  }

  throw new Error('No book summary found');
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

        // Read .env directly — Vite's loadEnv doesn't reliably populate process.env at middleware time.
        const envPath = path.resolve(process.cwd(), '.env');
        let mistralApiKey = '';
        let debugInfo = `cwd=${process.cwd()};envPath=${envPath};exists=${fs.existsSync(envPath)}`;
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugInfo += `;file_len=${envContent.length}`;
          const match = envContent.match(/^MISTRAL_API_KEY=(.+)$/m);
          if (match) { mistralApiKey = match[1].trim(); debugInfo += `;key_found=len_${mistralApiKey.length}`; }
          else debugInfo += ';key_regex_not_found;content=' + JSON.stringify(envContent);
        } catch (e: any) { debugInfo += ';err=' + e.message; }
        if (!mistralApiKey) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Default provider unavailable — set MISTRAL_API_KEY in your .env to use the Default provider in dev.', debug: debugInfo }));
          return;
        }

        try {
          const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mistralApiKey}`,
            },
            body,
          });

          const text = await mistralResponse.text();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = mistralResponse.status;
          res.end(text);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Upstream Mistral request failed.' }));
        }
      });

       server.middlewares.use('/api/agents', async (req: IncomingMessage, res: ServerResponse) => {
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

        const envPath = path.resolve(process.cwd(), '.env');
        let mistralApiKey = '';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/^MISTRAL_API_KEY=(.+)$/m);
          if (match) mistralApiKey = match[1].trim();
        } catch {
          // leave empty → agents core will surface the missing-key error
        }

        let jsonBody: unknown;
        try {
          jsonBody = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        try {
          const { handleAgentsRequest } = await import('./functions/_agents-core');
          const response = await handleAgentsRequest(jsonBody as Parameters<typeof handleAgentsRequest>[0], mistralApiKey);
          const buf = Buffer.from(await response.arrayBuffer());
          res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = response.status;
          res.end(buf);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Agents request failed.' }));
        }
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
           const response = await fetch(target, { headers: BROWSER_HEADERS });
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

       server.middlewares.use('/api/book-summary', async (req: IncomingMessage, res: ServerResponse) => {
         const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
         const title = url.searchParams.get('title');
         if (!title) {
           res.statusCode = 400;
           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify({ error: 'Missing title query param' }));
           return;
         }
         const author = url.searchParams.get('author') ?? undefined;
         try {
           const summary = await fetchBookSummaryDev(title, author);
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.setHeader('Content-Type', 'text/plain; charset=utf-8');
           res.statusCode = 200;
           res.end(summary);
         } catch {
           res.statusCode = 502;
           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify({ error: 'Book summary proxy failed' }));
         }
       });

       // Debug endpoint to check env loading (POST to avoid Vite SPA fallback)
      server.middlewares.use('/__debug', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const envPath = path.resolve(process.cwd(), '.env');
        let debug = `cwd=${process.cwd()}\nenvPath=${envPath}\nexists=${fs.existsSync(envPath)}`;
        try {
          const c = fs.readFileSync(envPath, 'utf8');
          debug += `\nfile_len=${c.length}\nfile_content=${JSON.stringify(c)}`;
          const match = c.match(/^MISTRAL_API_KEY=(.+)$/m);
          debug += `\nmatch=${match ? 'found len=' + match[1].trim().length : 'not found'}`;
        } catch (e: any) {
          debug += `\nerror=${e.message}`;
        }
        res.setHeader('Content-Type', 'text/plain');
        res.end(debug);
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
          const response = await fetch(target, { headers: BROWSER_HEADERS });
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
    manualChunks: {},
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
    exclude: ['node_modules/**', '.opencode/**', 'tests/e2e/**'],
  },
});

