# Implementation Plan — UX Fixes, Drag-and-Drop Ordering, and Progression Regressions

This plan details the visual and behavioral updates to fix the remaining UX bugs, implement native HTML5 drag-and-drop for the ordering quiz format, and prevent progression rollbacks when a quiz is failed.

## Proposed Changes

### 1. Desktop Canvas & TTS Orchestration
#### [MODIFY] [CanvasPage.tsx](file:///c:/Users/Lenovo/daily/quizify/src/features/canvas/CanvasPage.tsx)
* **Auto-Stop TTS on Exiting Notebook Mode**: Add a `useEffect` hook listening to `notebookMode` changes. If `notebookMode` becomes `false`, call `ttsManager.stop()`.
* **Fix Quiz Click Flickering Bug**: Use a `useRef` to track the last concept index, and only call `setRevealedQuizIds(new Set())` and refocus the concept when the concept index actually changes. This prevents the quiz nodes from being unmounted/reset when a quiz is selected.

### 2. Progression Lock Protection
#### [MODIFY] [progression.ts](file:///c:/Users/Lenovo/daily/quizify/src/lib/progression.ts)
* **Prevent Progression Rollback**: Update `getUnlockedConceptIndex` to check if a quiz has *ever* been answered correctly in the past (by inspecting the attempts history), rather than relying solely on the current state. This ensures that failing a quiz on a retake does not lock subsequent concepts or restart older concept TTS.

### 3. Drag-and-Drop Ordering Format
#### [MODIFY] [Ordering.tsx](file:///c:/Users/Lenovo/daily/quizify/src/features/quiz/formats/Ordering.tsx)
* **HTML5 Drag-and-Drop**: Replace the `moveItem` click handlers with standard drag-and-drop handlers: `onDragStart`, `onDragOver`, and `onDragEnd`.
* **Remove Arrow Controls**: Clean up the UI markup by removing the arrow buttons.

#### [MODIFY] [Ordering.module.css](file:///c:/Users/Lenovo/daily/quizify/src/features/quiz/formats/Ordering.module.css)
* **Remove Arrow Classes**: Delete `.arrowGroup` and `.arrowBtn`.
* **Add Drag Indicators**: Add styles for active drag grabs, drag handle icons (`☰`), grabbing states, and hover effects on items.

---

## Verification Plan

### Automated Tests
- Run `npm run typecheck` to verify TypeScript builds successfully.
- Run `npm run build` to verify the production bundle compilation is clean.

### Manual Verification
- **TTS Stop Test**: Toggle Notebook mode on, start listening to TTS, then exit Notebook mode. Confirm the speech audio stops immediately.
- **Quiz Selection Test**: Click on a quiz card. Ensure it opens the quiz modal smoothly without flickering or unmounting the quiz card from the canvas.
- **Progression Regression Test**: Complete Concept 1 quizzes successfully to unlock Concept 2. Retake a Concept 1 quiz and answer incorrectly. Verify that Concept 2 remains unlocked and the viewport does not jump back to Concept 1.
- **Drag-and-Drop Test**: Open an ordering quiz. Drag items around dynamically and verify they animate and reorder. Click submit and check that the answer evaluates.
