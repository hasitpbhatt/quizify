# Usability Critique: Quizify

Composite evaluation from 10 senior UX designers reviewing the current codebase and UI.

**Date:** July 21, 2026
**Severity scale:** 🔴 Critical | 🟡 Major | 🔵 Minor | ⚪ Enhancement

---

## Designer 1 — Don Norman (Author, *The Design of Everyday Things*)
**Focus:** Discoverability, signifiers, conceptual models

### 🔴 The toolbar is a junk drawer
The top bar smashes together three unrelated things: **brand identity** ("Quizify by hasit.in"), **navigation** (session dropdown), and **actions** (New, theme, session CRUD). These have different priorities depending on context:
- On welcome page: brand + session list make sense, but "New" is redundant
- On canvas: I need navigation and actions, but the brand name is irrelevant real estate
- The user said it best: "concept, notebook button and brand name quizify all is at the same place"

**Fix:** Split into two tiers. Top tier: brand (left) + session name + notebook toggle. Bottom tier or context-adaptive bar: actions (New, Export, theme, etc.). Never mix identity and tools in the same row.

### 🟡 Notebook mode entry has no signifier
In graph mode, the notebook toggle is a small `BookOpen` icon in a bottom action bar — no label, no tooltip that explains "Switch to notebook reading mode." Users don't know what it does until they click it.

**Fix:** Label the button "Notebook view" or add a brief tooltip. Better: make the transition a more deliberate action (a slide-in panel with preview of what notebook mode looks like).

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

### 🔴 Export dropdown opens upward, overlapping other actions
The export menu in the bottom action bar opens *above* the trigger button (`bottom: calc(100% + 6px)`). On a 24px bottom bar, a 130px dropdown covers the button and spills into the canvas area. The user can't see what they're exporting from.

**Fix:** Open the dropdown *above or below based on available space*, or make it a modal sheet. Pill-style buttons with dropdowns need careful placement.

---

## Designer 8 — Harry Brignull (Creator, Dark Patterns)
**Focus:** Ethics, deceptive design, confirmation (anti-patterns)

### 🟡 Session delete uses alarming "Confirm?" language
The delete button replaces its `X` icon with unlabeled text "Confirm?" on first click. This is confusing — the user isn't sure what they're confirming. The text has no styling difference (no red, no bold), so it looks like a bug or a broken button more than a confirmation flow.

**Fix:** Show a proper confirmation tooltip or dialog: "Delete this session? [Delete] [Cancel]". The "Confirm?" pattern is ambiguous and creates anxiety. WelcomeModal already has a proper alertdialog for delete — use the same pattern in the toolbar.

### 🔵 No indication that sessions are local-only
Nothing in the UI tells the user that all their data lives in IndexedDB and will be lost if they clear browser storage or switch devices. A user who spends hours building canvases could lose everything with no warning.

**Fix:** Add a discreet note in the session list or settings: "Sessions are stored locally in this browser." Better: add export-all or backup functionality.

---

## Designer 9 — Andy Budd (Co-founder, Clearleft; *CSS Mastery*)
**Focus:** Interaction design, responsive design, prototyping

### 🔴 Mobile view cannot answer quizzes
`MobileFocusView` renders concept cards and shows quiz info but clicking a quiz just shows metadata ("Attempts: 0 · untested") — there's no quiz interaction affordance. Mobile users can see there's a quiz but cannot take it.

**Fix:** Open the same `QuizInteraction` modal on mobile. The component exists and works — it's just not wired into the mobile view's click handler. This is a gap, not a redesign.

### 🟡 No progress indicator during generation on canvas
Once the canvas mounts and nodes start streaming in, the only feedback is a `progressBadge` at the top center showing the pipeline step label. There's no visual indication that nodes are *about to appear* or that generation is progressing. Users may think nothing is happening.

**Fix:** Show skeleton/shadow nodes where concepts will appear. As each concept finishes generating, swap the skeleton for the real node with a gentle reveal animation. This shows progress even before content loads.

---

## Designer 10 — Pasquale D'Silva (Former Design Lead, Medium)
**Focus:** Editorial UX, reading experience, content-first design

### 🔴 Notebook mode is a hidden superpower
The notebook view (ruled lines, handwriting font, TTS, typewriter animation) is the most distinctive and delightful part of Quizify. But it's a toggle button with a book icon in a bottom action bar. New users may never discover it, or discover it after they've already consumed content in graph mode and bounced.

**Fix:** Make notebook mode the *default* experience for all new sessions. Show graph mode as the "advanced" view. The toggle should be prominent, persistent, and labeled. Consider: when generation completes, auto-enter notebook mode with a gentle "Welcome to your Notebook" overlay.

### ⚪ Typewriter animation adds value but needs intent
The character-by-character typewriter is charming. But it animates every time a concept becomes visible, even on re-visit. If I scroll back to Concept 1, I watch it type out again. This creates unnecessary friction for returning users.

**Fix:** Mark concepts as "read" once their animation completes. On re-visit, show content immediately with a subtle fade-in instead. The typewriter magic should be a first-time delight, not a recurring tax.

---

## Summary: Actionable Priority Matrix

| ID | Issue | Severity | Effort | Impact |
|----|-------|----------|--------|--------|
| D1 | Toolbar overload (brand + nav + actions crammed) | 🔴 Critical | Small | High |
| D1 | Notebook toggle has no label/signifier | 🟡 Major | Trivial | High |
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
| D7 | Export dropdown opens upward, overlaps | 🔵 Minor | Trivial | Low |
| D8 | Session delete uses ambiguous "Confirm?" text | 🔵 Minor | Trivial | Medium |
| D8 | No indication data is local-only | 🔵 Minor | Small | Medium |
| D9 | Mobile view cannot answer quizzes | 🔴 Critical | Small | High |
| D9 | No skeleton loading during generation on canvas | 🟡 Major | Medium | Medium |
| D10 | Notebook mode is hidden superpower | 🔴 Critical | Small | High |
| D10 | Typewriter re-animates on re-visit | 🔵 Minor | Small | Low |

### Quick Wins (Fix this week)

1. Label the notebook toggle button ("Notebook view")
2. Wire quiz interaction into MobileFocusView
3. Split toolbar: identity in top-left, actions in context-adaptive bar
4. Make notebook mode the default entry for new sessions
5. Add skeleton nodes during generation
6. Fix the export dropdown direction

### Medium-term (Next sprint)

7. Progressive disclosure on welcome modal (step-by-step)
8. Proper first-canvas orientation overlay
9. Consistent visual language across graph and notebook modes
10. Accessibility pass (caption persistence, reduced-motion, font legibility)

### Long-term (Next quarter)

11. Mobile view unification with notebook mode
12. Cross-session learning dashboard
13. Typewriter speed → TTS rate synchronization
