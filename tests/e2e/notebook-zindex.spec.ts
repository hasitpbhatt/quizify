import { test, expect } from '@playwright/test';
import { setupPage, cleanupSession, setCanvasSession, SEED_SESSION_ID } from './setup';

test.describe('Notebook z-index layering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupSession(page, SEED_SESSION_ID);
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    await setupPage(page);
  });

  test('quiz overlay renders above notebook controls', async ({ page }) => {
    await setCanvasSession(page, SEED_SESSION_ID);
    await page.reload();

    await expect(page.getByText('Light-Dependent Reactions', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Dismiss orientation overlay if present
    const orientationClose = page.locator('.notebookOrientationClose');
    if (await orientationClose.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await orientationClose.click();
    }

    // Wait for quiz nodes to be visible
    const quizBtn = page.getByRole('button', { name: /Quiz:/ }).first();
    await expect(quizBtn).toBeVisible({ timeout: 10_000 });

    // Open the quiz
    await quizBtn.click();

    // Wait for quiz dialog to appear
    const quizDialog = page.locator('[role="dialog"]');
    await expect(quizDialog).toBeVisible({ timeout: 5_000 });

    // Verify quiz overlay z-index is higher than notebook controls
    const quizOverlayZ = await page.locator('[role="dialog"]').evaluate((el) =>
      window.getComputedStyle(el).zIndex,
    );
    const controlsZ = await page.locator('.notebookControls').evaluate((el) =>
      window.getComputedStyle(el).zIndex,
    );

    expect(Number(quizOverlayZ)).toBeGreaterThan(Number(controlsZ));

    // Verify quiz dialog is visually above controls by checking bounding boxes
    const quizBox = await quizDialog.boundingBox();
    const controlsBox = await page.locator('.notebookControls').boundingBox();

    expect(quizBox).toBeTruthy();
    expect(controlsBox).toBeTruthy();

    // Quiz dialog should be rendered above the controls bar
    // (quiz dialog is centered, controls are at bottom)
    if (quizBox && controlsBox) {
      // Quiz dialog top should be above controls bottom, or quiz bottom below controls top
      // Since quiz is a full overlay, it should cover the controls area
      expect(quizBox.y).toBeLessThan(controlsBox.y + controlsBox.height);
    }
  });

  test('continue-to-quiz button clears notebook controls bar', async ({ page }) => {
    await setCanvasSession(page, SEED_SESSION_ID);
    await page.reload();

    await expect(page.getByText('Light-Dependent Reactions', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Dismiss orientation overlay if present
    const orientationClose = page.locator('.notebookOrientationClose');
    if (await orientationClose.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await orientationClose.click();
    }

    // Check if the continue-to-quiz button is present
    const continueBtn = page.locator('.continueToQuiz');
    const hasContinue = await continueBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasContinue) {
      // Get bottom offsets via computed styles
      const continueBottom = await continueBtn.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return parseFloat(style.bottom);
      });
      const controlsBottom = await page.locator('.notebookControls').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return parseFloat(style.bottom);
      });

      // continueToQuiz bottom must be greater than notebookControls bottom
      expect(continueBottom).toBeGreaterThan(controlsBottom);

      // Verify no vertical overlap: continue button top must be above controls bottom
      const continueBox = await continueBtn.boundingBox();
      const controlsBox = await page.locator('.notebookControls').boundingBox();

      if (continueBox && controlsBox) {
        // Continue button bottom edge must be above controls top edge
        expect(continueBox.y + continueBox.height).toBeLessThanOrEqual(controlsBox.y);
      }
    }
  });

  test('learning cue does not overlap orientation cue', async ({ page }) => {
    // Clear the dismissed state so both cues can appear
    await page.evaluate(() => {
      sessionStorage.clear();
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('quizify:'));
      for (const k of keys) localStorage.removeItem(k);
    });

    await setCanvasSession(page, SEED_SESSION_ID);
    await page.reload();

    await expect(page.getByText('Light-Dependent Reactions', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Check if both cues are visible
    const orientation = page.locator('.notebookOrientation');
    const learningCue = page.locator('.notebookLearningCue');

    const hasOrientation = await orientation.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasLearningCue = await learningCue.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasOrientation && hasLearningCue) {
      const orientationBox = await orientation.boundingBox();
      const learningCueBox = await learningCue.boundingBox();

      if (orientationBox && learningCueBox) {
        // Learning cue top must be at or below orientation cue bottom
        expect(learningCueBox.y).toBeGreaterThanOrEqual(
          orientationBox.y + orientationBox.height - 5, // 5px tolerance for rounding
        );
      }
    }
  });

  test('notebook controls z-index is lower than quiz overlay z-index via CSS', async ({ page }) => {
    await setCanvasSession(page, SEED_SESSION_ID);
    await page.reload();

    await expect(page.getByText('Light-Dependent Reactions', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Verify controls z-index via stylesheet rules
    const controlsZ = await page.locator('.notebookControls').evaluate((el) =>
      window.getComputedStyle(el).zIndex,
    );

    // Controls should be z-index 100
    expect(Number(controlsZ)).toBe(100);

    // Open a quiz to check overlay z-index
    const quizBtn = page.getByRole('button', { name: /Quiz:/ }).first();
    await expect(quizBtn).toBeVisible({ timeout: 10_000 });
    await quizBtn.click();

    const quizDialog = page.locator('[role="dialog"]');
    await expect(quizDialog).toBeVisible({ timeout: 5_000 });

    const quizZ = await quizDialog.evaluate((el) =>
      window.getComputedStyle(el).zIndex,
    );

    // Quiz overlay should be z-index 200
    expect(Number(quizZ)).toBe(200);
  });
});
