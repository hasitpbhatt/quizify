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

  test('restores canvas and renders concept and quiz nodes', async ({
    page,
  }) => {
    await setCanvasSession(page, SEED_SESSION_ID, false);
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
