# Implementation Plan — UX and Theme Parity Improvements

This plan outlines the visual and behavioral modifications to Quizify to resolve critical UX bugs (e.g., the notebook mode navigation trap), enhance the physical paper skeuomorphism on desktop, establish legibility/script typographic contrast, and align the mobile experience with desktop parity.

## User Review Required

> [!IMPORTANT]
> **Key Design Decisions:**
> 1. **Typographic Split**: We will explicitly exclude functional UI controls (buttons, badges, progress counts) from the cursive font `Caveat` in notebook mode. Cursive will be reserved for written content (titles, body paragraphs, and notes).
> 2. **Notebook Background**: The ruled notebook background will be applied to the `.react-flow__pane` class rather than `.react-flow__background` because the `<Background>` component is unmounted when notebook mode is active.
> 3. **Persistent HUD**: Instead of hiding controls when TTS is inactive, the controller bar will remain visible, adding an `[Exit Notebook]` option so the user can easily leave the notebook screen.

---

## Proposed Changes

### 1. Desktop Canvas & Notebook Orchestration
#### [MODIFY] [CanvasPage.tsx](file:///c:/Users/Lenovo/daily/quizify/src/features/canvas/CanvasPage.tsx)
* **Exit Button in Notebook HUD**: Modify the `notebookControls` UI to include an Exit button (represented by an elegant exit icon/button next to the play controls).
* **Persistent Controls**: Ensure `notebookControls` is always visible when `notebookMode` is active (not hidden when `!ttsPlaying && !ttsPaused`).
* **Clean Action Bars**: Maintain the current display separation between standard actions bar and notebook controls.

### 2. Styling and Skeuomorphism
#### [MODIFY] [notebook.css](file:///c:/Users/Lenovo/daily/quizify/src/styles/notebook.css)
* **Warm Cream Paper Texture**: Update the background styling of the workspace pane. Add a pinkish-red vertical margin line on the left side, and a warm cream color (`#FAF8F5` in light mode, soft slate in dark mode).
* **Target `.react-flow__pane`**: Apply ruled lines directly to `.react-flow__pane` or container background instead of the unmounted `.react-flow__background` element.
* **Restore UI Font Legibility**: Exclude buttons (`.actionBtn`, `.playButton`, `.notebookControls button`), badge text (`.badge`), and numerical progress labels from `Caveat` by explicitly declaring `font-family: var(--font-ui), sans-serif` for those elements under notebook mode.

### 3. Mobile Parity & Controls
#### [MODIFY] [MobileFocusView.tsx](file:///c:/Users/Lenovo/daily/quizify/src/features/canvas/MobileFocusView.tsx)
* **State Parity**: Read `notebookMode` from `useNotebookStore` and add a `data-notebook` attribute to the outer container.
* **Mobile TTS Controls**: Render a floating control bar (Play/Pause, Stop, progress count) on mobile when `notebookMode` is active.
* **Outline Jump Drawer**: Add a list/index button next to the Map button that toggles a scrollable bottom sheet/drawer listing all nodes. Tapping a node jumps the carousel directly to that node's index.

#### [MODIFY] [MobileFocusView.module.css](file:///c:/Users/Lenovo/daily/quizify/src/features/canvas/MobileFocusView.module.css)
* **Aesthetics Overrides**: Style cards, backgrounds, and fonts for mobile when `[data-notebook="true"]` is active.
* **Warm Cream & Red Margin**: Render cards on mobile as cream paper pages with a red margin stripe and script font overrides.

---

## Verification Plan

### Automated Tests
- Run `npm run typecheck` to verify TypeScript builds successfully.
- Run `npm run build` to verify the production bundle compilation is clean.

### Manual Verification
- **Exit Toggle Test**: Verify that entering notebook mode displays the controller bar with the Exit button, and clicking it correctly returns the user to the standard canvas.
- **Visual Design Audit**: Inspect the ruled lines, margin stripe, and cream paper background on desktop. Ensure buttons and labels remain in `Inter` (sans-serif) while headings and body use `Caveat`.
- **Mobile Experience Verification**: Resize the browser to mobile viewport (triggering `MobileFocusView`). Ensure notebook styling (cream background, cursive font) updates dynamically when toggling notebook mode. Verify the outline drawer jumps to cards properly, and the play/pause buttons successfully control the TTS narration.
