import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { seedDatabase, SEED_SESSION_ID } from './seed-data';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(DIR, '..', '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

test.describe('Canvas restore from IndexedDB', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(
      (sessionId) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.open('quizify');
          request.onupgradeneeded = () => resolve();
          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('sessions')) {
              db.close();
              resolve();
              return;
            }
            const tx = db.transaction('sessions', 'readwrite');
            tx.objectStore('sessions').delete(sessionId);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
          };
          request.onerror = () => resolve();
        }),
      SEED_SESSION_ID,
    );
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        await route.continue();
        return;
      }
      const reqPath = url.pathname;
      let filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      const ext = path.extname(filePath);
      if (!ext) {
        filePath = path.join(DIST, 'index.html');
      }
      if (fs.existsSync(filePath)) {
        const mimeType = MIME[path.extname(filePath)] ?? 'application/octet-stream';
        await route.fulfill({ path: filePath, contentType: mimeType });
      } else {
        const index = path.join(DIST, 'index.html');
        await route.fulfill({ path: index, contentType: 'text/html' });
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedDatabase(page);
    await page.evaluate(() => {
      sessionStorage.clear();
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith('quizify:'),
      );
      for (const k of keys) localStorage.removeItem(k);
    });
  });

  test('restores canvas and renders concept and quiz nodes', async ({
    page,
  }) => {
    await page.evaluate((sessionId) => {
      sessionStorage.setItem('quizify:page', 'canvas');
      sessionStorage.setItem('quizify:currentId', sessionId);
      sessionStorage.setItem(`quizify:notebookMode:${sessionId}`, 'graph');
    }, SEED_SESSION_ID);

    await page.reload();

    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    const conceptNodes = page.locator('.react-flow__node-concept');
    await expect(conceptNodes).toHaveCount(3);

    const quizNodes = page.locator('.react-flow__node-quiz');

    await expect(conceptNodes.getByText('Light-Dependent Reactions')).toBeVisible();
    await expect(conceptNodes.getByText('Calvin Cycle')).toBeVisible();
    await expect(conceptNodes.getByText('Chlorophyll')).toBeVisible();

    await expect(
      quizNodes.getByText(
        'What is the primary output of Light-Dependent Reactions?',
      ),
    ).toBeVisible();

    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    const count = await conceptNodes.count();
    const boxes: { x: number; y: number; width: number; height: number }[] =
      [];
    for (let i = 0; i < count; i++) {
      const box = await conceptNodes.nth(i).boundingBox();
      if (box) boxes.push(box);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap, `Concept nodes ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
});
