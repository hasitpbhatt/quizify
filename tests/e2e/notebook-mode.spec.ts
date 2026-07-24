import { test, expect } from '@playwright/test';
import { setupPage, cleanupSession, setCanvasSession, SEED_SESSION_ID } from './setup';

test.describe('Notebook mode', () => {
  test.afterEach(async ({ page }) => {
    await cleanupSession(page, SEED_SESSION_ID);
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    await setupPage(page);
  });

  test('renders notebook UI with typewriter animation and gated quizzes', async ({
    page,
  }) => {
    await setCanvasSession(page, SEED_SESSION_ID, true);
    await page.reload();
    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    // Notebook-specific UI elements
    await expect(page.locator('.notebookModePill')).toBeVisible();
    await expect(page.locator('.notebookControls')).toBeVisible();
    await expect(page.locator('.notebookConceptProgress')).toBeVisible();

    // Container has notebook data attribute
    await expect(page.locator('[data-notebook="true"]')).toHaveCount(1);

    // Concept nodes have transparent card styling in notebook mode
    const conceptCard = page.locator('.react-flow__node-concept > div').first();
    await expect(conceptCard).toHaveCSS('background', /rgba\(0,\s*0,\s*0,\s*0\)|transparent/i);

    // Typewriter animation active on at least one element
    await expect(page.locator('[data-typing="true"]')).not.toHaveCount(0);

    // Graph-only elements are absent in notebook mode
    await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
    await expect(page.locator('.react-flow__controls')).toHaveCount(0);

    // Only current concept visible in notebook mode (progressive reveal)
    await expect(page.locator('.react-flow__node-concept')).toHaveCount(1);

    // No error boundary
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('restores reading position and reveals quizzes from localStorage', async ({
    page,
  }) => {
    await setCanvasSession(page, SEED_SESSION_ID, true);

    const quizIds = [
      `${SEED_SESSION_ID}-c1-quiz-0`,
      `${SEED_SESSION_ID}-c1-quiz-1`,
    ];
    const nbPosKey = `quizify:nbpos:${SEED_SESSION_ID}`;
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: nbPosKey,
        value: { revealedQuizIds: quizIds },
      },
    );

    await page.reload();
    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    // Dismiss orientation overlay if present
    const orientationClose = page.locator('.notebookOrientationClose');
    if (await orientationClose.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await orientationClose.click();
    }

    // Quizzes for concept 1 are now visible — wait for typewriter to finish
    const quizNodes = page.locator('.react-flow__node-quiz');
    await expect(quizNodes).toHaveCount(2);

    await expect(
      quizNodes.getByText('What is the primary output of Light-Dependent Reactions?'),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      quizNodes.getByText('True or false: Light-Dependent Reactions occurs in all plants.'),
    ).toBeVisible({ timeout: 10_000 });

    // No error boundary
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});
