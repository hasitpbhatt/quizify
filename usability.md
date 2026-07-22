# Usability Critique: Quizify

Composite evaluation from 10 senior UX designers reviewing the current codebase and UI.

**Date:** July 21, 2026
**Severity scale:** 🔴 Critical | 🟡 Major | 🔵 Minor | ⚪ Enhancement

---

## Designer 1 — Don Norman — ✅ All Resolved

---

## Designer 2 — Julie Zhuo (Former VP Product Design, Facebook)
**Focus:** Product growth loops, user onboarding, first-run experience

### 🔴 The welcome page asks too much, too soon
I land on a modal asking me to: choose a persona (4 cards), paste a URL, pick an example, select an LLM provider, enter an API key, and see my session history. That's 6 distinct decisions before I've ever experienced the product. The "Generate" button is competing with a full session list.

**Fix:** Progressive disclosure. Step 1: "Paste a URL or topic" (big input, centered). Step 2 (first-time only): quick persona picker. Everything else (provider settings, session history) is secondary — collapse behind a gear icon or "See past sessions" link.

### 🟡 No "aha moment" gating
After generation completes, the canvas appears with zero fanfare. No animation, no "Here's your canvas!" overlay, no suggested first action. Users who don't instinctively click a node will look at a graph of boxes and leave.

**Fix:** On first canvas load, auto-highlight Concept 1, pulse it gently, and show a tooltip: "Click any concept to expand →" or "Press Space to start the Notebook tour."

---

## Designer 3 — Jared Spool (Founder, UIE)
**Focus:** Usability testing methodology, cognitive load

### 🔴 The graph mode is overwhelming without a reading order
A horizontal chain of nodes with hand-drawn edges makes sense *after* you understand the mental model. But first-timers see a wall of cards connected by lines with no clear "start here" cue. The MiniMap + Controls in the corner add visual noise without helping comprehension.

**Fix:** When a canvas is fresh (no concepts interacted with), dim all nodes except the first concept and the first quiz. Reveal progressively as the user engages. This also teaches the layout model organically.

### 🟡 Modal quiz takes you out of context
Clicking a quiz node opens a full modal overlay that covers the canvas. I lose spatial awareness of where this quiz lives in the concept chain. The modal has no "show me where this fits" button.

**Fix:** Use a side panel or a half-sheet that keeps the canvas visible behind a scrim. Show the parent concept title prominently and keep the edge connection visible.

---

## Designer 4 — Marcin Wichary (Former Design Lead, Figma)
**Focus:** Craft, micro-interactions, typography, tool design

### 🔵 The mobile view is a separate app
`MobileFocusView` is an entirely different code path with zero visual connection to the desktop experience. No notebook mode on mobile. No node graph. It's a card swiper that happens to share data with the desktop app. This feels like two different teams built two different products.

**Fix:** Mobile should render the same notebook mode (ruled lines, handwriting font, typewriter) as a progressive enhancement of the desktop view, not a fork. The minimap already exists — use it as the "node graph overview" on mobile.

### ⚪ Typewriter animation + TTS race condition
In notebook mode, the typewriter animation and TTS narration fire simultaneously but the typewriter speed is not synced to the TTS rate. A user who sets TTS to 2× speed watches text appear at normal pace while the audio races ahead.

**Fix:** Calculate typewriter speed as a function of TTS rate. At 2× audio, typewriter should render ~2× faster so the text keeps up with the spoken word.

---

## Designer 5 — Irene Au (Former Design Partner, Khosla Ventures; ex-Google/Udacity)
**Focus:** Design operations, learning UX, accessibility

### 🟡 No learning progress visualization across sessions
The session list shows concept count and mastery percentage, but there's no aggregate view of what I've learned across multiple sessions. I can't see my learning history or what topics I've covered over time.

**Fix:** Add a dashboard view — even a simple list with "Last studied" + "Concepts mastered" + "Quizzes answered correctly" totals. This turns Quizify from a single-use tool into a learning companion.

### 🔴 Accessibility gaps in notebook mode
- The typewriter animation cannot be paused independently of TTS (reduced-motion users have a workaround, but there's no explicit toggle)
- The ruled-line background is decorative but not removable for users with visual processing disorders
- TTS caption bar appears and disappears; there's no persistent "show captions always" setting
- Font choice: Caveat (handwriting) at small sizes has low legibility; WCAG 2.2 requires minimum 4.5:1 contrast ratio

**Fix:** Add `prefers-reduced-motion` gating for typewriter. Add a "Disable ruled lines" accessibility toggle. Make captions persistent with a toggle. Ensure Caveat only appears at ≥16px with sufficient contrast.

---

## Designer 6 — Raluca Budiu (Director, Nielsen Norman Group)
**Focus:** Usability heuristics, user research, information architecture

### 🔴 Violation: Consistency and standards
The product has three distinct visual languages:
1. **Welcome page** — polished card UI with glassmorphism
2. **Canvas (graph mode)** — dot-grid background, glass cards, wiggly edges
3. **Notebook mode** — ruled paper, handwriting font, transparent nodes

Three different modes with different UI conventions, navigation patterns, and visual cues. Users must learn each one independently.

**Fix:** Establish a visual hierarchy: notebook mode is the *primary consumption experience*, graph mode is the *overview/editing mode*. Make notebook the default on session resume, graph the power-user view. Reduce the visual shock of transition with a morph animation (cards folding into notebook paper).

### 🟡 Violation: User control and freedom
The Escape key exits notebook mode. But Escape is also the standard key to close modals, dismiss dialogs, and cancel actions. When a quiz modal is open inside notebook mode, pressing Escape closes the quiz — but the user might have expected to exit notebook first.

**Fix:** Layer the Escape handlers. Modal → close modal. No modal → exit notebook. No notebook → deselect node. Communicate this with a toast or tooltip on first use.

---

## Designer 7 — Tobias van Schneider (Former Soho House, solo designer)
**Focus:** Minimalism, brand experience, emotional design

### 🟡 The brand vanishes inside the product
"Quizify" appears in the toolbar and nowhere else on the canvas. The empty canvas states, loading screens, and progress screen have no brand presence. The product feels functionally complete but emotionally hollow — there's no personality in the moments between actions.

**Fix:** Use the accent color and the sparkle motif consistently. Add a subtle branded illustration to empty states. Make the generation loading screen show brand-forward animations. The notebook view's ruled lines are a strong brand asset — lean into it.

### 🔴 Export dropdown opens upward, overlapping other actions — ✅

---

## Designer 8 — Harry Brignull — ✅ All Resolved

---

## Designer 9 — Andy Budd — ✅ All Resolved

---

## Designer 10 — Pasquale D'Silva (Former Design Lead, Medium)
**Focus:** Editorial UX, reading experience, content-first design

### 🔴 Notebook mode is a hidden superpower — ✅

### ⚪ Typewriter animation adds value but needs intent
The character-by-character typewriter is charming. But it animates every time a concept becomes visible, even on re-visit. If I scroll back to Concept 1, I watch it type out again. This creates unnecessary friction for returning users.

**Fix:** Mark concepts as "read" once their animation completes. On re-visit, show content immediately with a subtle fade-in instead. The typewriter magic should be a first-time delight, not a recurring tax.

---

## Summary: Actionable Priority Matrix

| ID | Issue | Severity | Effort | Impact |
|----|-------|----------|--------|--------|
| D2 | Welcome modal decision overload | 🔴 Critical | Medium | High |
| D2 | No "aha moment" on first canvas load | 🟡 Major | Medium | High |
| D3 | Graph mode overwhelming without reading order | 🟡 Major | Medium | Medium |
| D3 | Quiz modal kills spatial context | 🟡 Major | Medium | Medium |
| D4 | Mobile view is a separate, broken app | 🔴 Critical | Large | High |
| D4 | Typewriter speed not synced to TTS rate | 🔵 Minor | Small | Low |
| D5 | No cross-session learning dashboard | 🔵 Minor | Medium | Medium |
| D5 | WCAG accessibility gaps in notebook mode | 🟡 Major | Medium | High |
| D6 | Three inconsistent visual modes | 🟡 Major | Large | Medium |
| D6 | Escape key handler layering conflict | 🔵 Minor | Small | Medium |
| D7 | Brand disappears inside product | ⚪ Enhancement | Small | Low |
| D8 | Session delete uses ambiguous "Confirm?" text | 🔵 Minor | Trivial | Medium |
| D10 | Typewriter re-animates on re-visit | 🔵 Minor | Small | Low |

### Medium-term (Next sprint)

7. Progressive disclosure on welcome modal (step-by-step)
8. Proper first-canvas orientation overlay
9. Consistent visual language across graph and notebook modes
10. Accessibility pass (caption persistence, reduced-motion, font legibility)

### Long-term (Next quarter)

11. Mobile view unification with notebook mode
12. Cross-session learning dashboard
13. Typewriter speed → TTS rate synchronization
