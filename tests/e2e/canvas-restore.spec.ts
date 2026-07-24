import { test, expect } from '@playwright/test';
import { setupPage, cleanupSession, setCanvasSession, SEED_SESSION_ID } from './setup';

test.describe('Canvas restore from IndexedDB', () => {
  test.afterEach(async ({ page }) => {
    await cleanupSession(page, SEED_SESSION_ID);
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    await setupPage(page);
  });

  test('restores canvas from IndexedDB and renders the first concept', async ({ page }) => {
    await setCanvasSession(page, SEED_SESSION_ID, true);
    await page.reload();

    // Wait for concept node to render
    await expect(page.getByText('Light-Dependent Reactions', { exact: true })).toBeVisible({ timeout: 15_000 });

    // No error boundary
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});
