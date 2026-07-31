# UX Decisions — Quizify Notebook

> Source of truth for product UX. Every decision here was explicitly approved.
> **Do not deviate** without user confirmation.

---

## 1. Layout

| Decision | Value |
|---|---|
| Concept/quizzes layout | Alternating columns: concept → quizzes → concept → quizzes |
| Concept column | Single concept per column |
| Quiz column | Quizzes for preceding concept in adjacent column (not same column as concept) |
| Ruled-paper background | **Continuous** single sheet across the entire scrollArea (not per-column) |
| Container layout | `overflow: hidden` + `position: relative` on container; `.scrollArea` has `overflow-y: auto` + `padding-top: 48px` |
| Fixed/overlay elements | Siblings of `.scrollArea` inside `.container` (not inside the scrollable area) |
| Content alignment | nodeGrid has `padding: 24px 96px 96px 96px` — left padding (96px) aligns text after the red ruled-paper margin line (80px), bottom padding (96px) clears the fixed toolbar |
| Grid centering | **Disabled** in notebook mode (`max-width: none; margin: 0`) — content aligns with ruled-paper margin, not centered |

## 2. Typography

| Decision | Value |
|---|---|
| Headers / titles | Caveat cursive font |
| Desktop body text (explanation) | Georgia serif |
| Mobile body text | Caveat cursive |
| UI controls / toolbar | System UI font (`var(--font-ui)`) |

## 3. Typing Animation

| Decision | Value |
|---|---|
| Animation trigger | Character-by-character reveal **ONLY when TTS is actively speaking** |
| Re-render throttle | 50ms chase interval (not 20ms — reduces layout contention) |
| CSS containment | `contain: layout style` on concept/summary nodes during animation |
| Auto-scroll during typing | **Disabled** (was too jumpy) |
| Keyboard focus | **Never steal focus** during typing; only `scrollIntoView` |
| "Receiving" badge | Shown during streaming with animated dot |
| "Click to reveal faster" hint | Shown **only** when TTS is actively speaking and animation is in progress |
| TTS dependency | **Text only animates when TTS is playing** — if TTS is disabled or not playing, text appears immediately (no animation) |

## 4. Concept Visibility

| Decision | Value |
|---|---|
| Locked concepts (future) | **Hidden entirely** — not shown in the notebook |
| Past concepts | Fully visible, no typing animation replay |
| Current concept | Visible, typing animation plays |

## 5. Quiz Visibility

| Decision | Value |
|---|---|
| Current / past concept quizzes | Always visible (no `revealedQuizIds` gating) |
| Future concept quizzes | Hidden (concept is locked) |

## 6. Node Styles (Notebook Mode)

| Decision | Value |
|---|---|
| Concept / summary nodes | **Transparent** — ruled-paper background shows through; no background, border, or shadow |
| Quiz nodes | Subtle card style — `bg-glass` background, 2px dashed accent border |
| Note nodes | Sticky-note style — `var(--note-bg)` background with shadow |

## 7. Export

| Decision | Value |
|---|---|
| Trigger | Button in notebook toolbar |
| UI pattern | **Modal dialog** (not dropdown — dropdown broke toolbar layout) |
| Formats | JSON, Markdown |
| `showFullText` | **Removed** from store and all components |

## 8. Toolbar

| Decision | Value |
|---|---|
| Type | Linear notebook controls bar (not React Flow toolbar) |
| Position | Fixed above scrollArea |

## 9. Product Identity

| Decision | Value |
|---|---|
| Description | "Source-grounded adaptive study coach" / "guided study notebook" |
| NOT described as | React Flow / node-graph canvas (that model was removed) |
