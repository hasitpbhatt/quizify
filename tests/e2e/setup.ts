import type { Page } from '@playwright/test';
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

export async function setupPage(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      await route.continue();
      return;
    }
    let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath);
    if (!ext) {
      filePath = path.join(DIST, 'index.html');
    }
    if (fs.existsSync(filePath)) {
      await route.fulfill({
        path: filePath,
        contentType: MIME[path.extname(filePath)] ?? 'application/octet-stream',
      });
    } else {
      await route.fulfill({
        path: path.join(DIST, 'index.html'),
        contentType: 'text/html',
      });
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedDatabase(page);
  await page.evaluate(() => {
    sessionStorage.clear();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('quizify:'));
    for (const k of keys) localStorage.removeItem(k);
  });
}

export async function cleanupSession(page: Page, sessionId: string): Promise<void> {
  await page.evaluate(
    (sid) =>
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
          tx.objectStore('sessions').delete(sid);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); resolve(); };
        };
        request.onerror = () => resolve();
      }),
    sessionId,
  );
}

export function setCanvasSession(page: Page, sessionId: string, notebookMode = false) {
  return page.evaluate(({ id, notebook }) => {
    sessionStorage.setItem('quizify:page', 'canvas');
    sessionStorage.setItem('quizify:currentId', id);
    sessionStorage.setItem(`quizify:notebookMode:${id}`, notebook ? 'notebook' : 'graph');
  }, { id: sessionId, notebook: notebookMode });
}

export { SEED_SESSION_ID };
