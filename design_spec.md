# Quizify — Design Specification

> **Status:** v1 (MVP)
> **Last updated:** 2026-07-05
> **Companion to:** `product_spec.md`
> **Owner:** Design

---

## 1. Design principles

1. **Calm by default.** The canvas is the protagonist. Chrome recedes; content reads like a personal whiteboard.
2. **Hand-drawn, not卡通.** The handwriting aesthetic signals "your notes, your learning" — not a kids' app. Wiggly lines and Caveat remind the user this is *their* canvas.
3. **One accent, used sparingly.** Color signals *action* and *state*, never decoration.
4. **Read before interact.** Concept nodes are readable end-to-end before any quiz interaction forces itself on you.
5. **Streaming feels alive.** Nodes appearing one-by-one should feel satisfying, not janky.
6. **Mobile-first on small screens, canvas-first on large.** Same data, two interaction models.

---

## 2. Visual language

### 2.1 Style direction

**Minimal / calm.** Closest references: Excalidraw (handwriting + wiggly lines), Notion (negative space and typography discipline),Linear (UI density in chrome).

### 2.2 Theme

- **Light + dark**, follows OS preference via `prefers-color-scheme`.
- Manual toggle in settings gear (Auto / Light / Dark), stored locally.
- Tokens are defined twice (see §3).

### 2.3 Color system — single accent

One accent color carries all primary actions, active states, focus rings, and canvas connectors. Everything else lives on a neutral grayscale ramp.

**Accent:** `#5B5BD6` (a calm indigo — reads well on light and dark, on-brand for "thinking / focus").
- Accent hover: `#4949C2`
- Accent pressed: `#3D3DA8`
- Accent subtle bg (selected nodes, active filters): accent @ 12% alpha

**Status colors** (used minimally, on state badges only — not as a primary palette):

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `success` | `#2E9E5B` | `#3DBE73` | Quiz correct / mastered |
| `warning` | `#D9A441` | `#E6BB66` | Quiz partial / shaky |
| `danger`  | `#D14B4B` | `#E26C6C` | Quiz incorrect / unanswered |

### 2.4 Typography

**Two families, one role each:**

| Role | Family | Why |
|---|---|---|
| **UI chrome** (toolbar, modals, buttons, dropdowns, settings) | **Inter** | Crisp, modern, low-noise — keeps controls legible. |
| **Canvas content** (node titles, explanations, notes, quiz prompts) | **Caveat** | The handwriting voice; feels like personal whiteboard notes. |

**Type scale (rem, fluid via clamp on mobile):**

| Token | Inter (UI) | Caveat (canvas) | Usage |
|---|---|---|---|
| `display` | 1.75rem / 600 | 2.25rem / 500 | Welcome modal hero, empty-state hero |
| `h1` | 1.25rem / 600 | 1.6rem / 500 | Node title (concept / summary), modal title |
| `h2` | 1rem / 600 | 1.25rem / 500 | Section labels inside nodes |
| `body` | 0.875rem / 400 | 1.05rem / 400 | Concept explanation, quiz question, note text |
| `caption` | 0.75rem / 500 | 0.9rem / 400 | Badges, timestamps, hints |
| `mono` | 0.75rem / 400 (JetBrains Mono) | — | API key field, technical strings |

**Caveat legibility rule:** Never render Caveat below **0.95rem**. If a node must compress content, switch long body text back to Inter `body` rather than shrinking Caveat.

**Line height:** Caveat body `1.35` (handwriting needs air); Inter body `1.5`.

### 2.5 Iconography

- Outline icons, **1.5px stroke**, 20px default size, `currentColor`.
- Library: **Lucide** (matches Excalidraw/Linear aesthetic).
- Generated illustrations are **not** used in v1 — node text is the content.

### 2.6 Imagery & ornament

None. No hero illustrations, no patterns, no gradients. The handwriting + wiggly connectors provide all the texture.

---

## 3. Design tokens

### 3.1 Light theme

```css
/* neutrals — warm paper-gray */
--bg-canvas:        #FBFAF7;   /* canvas background, paper feel */
--bg-elevated:      #FFFFFF;   /* modals, dropdowns */
--bg-subtle:        #F4F2EC;   /* hover bg, secondary surfaces */
--border:           #E6E2D8;
--border-strong:    #CFC8B8;

--text-primary:     #1F1E1A;
--text-secondary:   #5C5A52;
--text-tertiary:    #8A877D;

--accent:           #5B5BD6;
--accent-hover:     #4949C2;
--accent-pressed:   #3D3DA8;
--accent-subtle:    rgba(91,91,214,0.12);

--success: #2E9E5B; --warning: #D9A441; --danger: #D14B4B;
```

### 3.2 Dark theme

```css
--bg-canvas:        #14130F;   /* deep warm ink */
--bg-elevated:      #1C1B17;
--bg-subtle:        #25241E;
--border:           #34322B;
--border-strong:    #4A473D;

--text-primary:     #ECE9DF;
--text-secondary:   #B4B0A3;
--text-tertiary:    #7E7B72;

--accent:           #7C7CE6;   /* brightened for dark bg */
--accent-hover:     #9494EC;
--accent-pressed:   #6666CC;
--accent-subtle:    rgba(124,124,230,0.16);

--success: #3DBE73; --warning: #E6BB66; --danger: #E26C6C;
```

### 3.3 Spacing scale (4px grid)

`0 · 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`

### 3.4 Radii

- Node corners: **0** (borderless — no corner needed).
- UI chrome (buttons, inputs, modals): **8px**.
- Badges/pills: **999px** (fully rounded).

### 3.5 Shadows (chrome only)

- `shadow-sm`: `0 1px 2px rgba(0,0,0,0.06)` — dropdowns.
- `shadow-md`: `0 4px 12px rgba(0,0,0,0.10)` — modals, floating toolbar.
- `shadow-focus`: `0 0 0 3px var(--accent-subtle)` — focus ring, no blur shadow.

### 3.6 Motion

| Use | Duration | Easing |
|---|---|---|
| Node stream-in | 220ms | `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out expo) |
| Hover / press | 120ms | `ease-out` |
| Modal in/out | 180ms | `ease-out` |
| Pan/zoom canvas | 0ms (immediate; hand-tracked) | — |
| "Saved ✓" chip fade | 160ms | `ease-out` |

Nodes stream in with a subtle `opacity 0→1` + `translateY(6px→0)` + `scale(0.98→1)`. Stagger **80ms** between consecutive nodes so the chain visibly *builds* left-to-right.

---

## 4. Components

### 4.1 Welcome modal

**Trigger:** first visit (no `persona` in storage) **or** "Getting started" from the settings gear when no session exists.

**Layout:** centered, **max-width 560px**, vertical stack, generous `2rem` padding.

```
┌─────────────────────────────────────────────┐
│   (no logo yet)                             │
│                                             │
│   What brings you here today?               │ ← display, Inter
│   Pick a profile — we'll match the depth    │ ← body, Inter, secondary
│   and quiz difficulty to you.               │
│                                             │
│   ┌─Curious─┐ ┌─Student─┐ ┌──Pro──┐ ┌Expert┐│
│   │beginner │ │textbook │ │practi-│ │terse ││ ← 4 persona cards
│   │analogies │ │exam     │ │cal   │ │edge  ││
│   └─────────┘ └─────────┘ └──────┘ └──────┘│
│                                             │
│   Provider: ○ Quizify  ○ Mistral  ● NVIDIA  │ ← caption Inter, seg buttons
│                                             │
│   Paste API key                             │ ← h2, Inter
│   ┌─────────────────────────┐  [show]       │
│   │ ••••••••••••••••••••••  │               │ ← mono, masked
│   └─────────────────────────┘               │
│                                             │
│   What do you want to learn?                │ ← h2, Inter
│   ┌────────────────────────────┐  [Generate]│
│   │ Paste a URL…                │            │
│   └────────────────────────────┘            │
│   Try: https://en.wikipedia.org/…  (chips)  │
└─────────────────────────────────────────────┘
```

**Persona card anatomy (each):**

```
┌──────────────────┐
│  ✷               │   ← 24px Lucide icon, accent on select
│                  │
│  Curious         │   ← h1, Inter
│  beginner        │
│                  │
│  Simple language │   ← caption, Inter, secondary
│  & analogies     │
└──────────────────┘
```

- **States:** default (borderless, subtle `--bg-subtle`), hover (border `--border-strong`), selected (`--accent` outline 2px + `--accent-subtle` fill + icon `--accent`).
- **One select locks the others.** Confirm by visual state alone — no "Next" button.
- **Tap target:** min 80×120px (mobile), 96×140px (desktop).

**API key field:**

- Masked by default (`type=password`-style dots but with JetBrains Mono).
- "show" link toggles plain text.
- Validation: only check *non-empty* in v1 (no live key check — confirm on first Generate). On Generate failure with 401, surface inline error under the field: *"That key didn't work. Check your API provider's console →"*.

**URL field:**

- Placeholder: `Paste a URL — article, blog, Wikipedia, or PDF`.
- Enter submits. Generate button is primary (accent bg), disabled until URL + key present.
- Below the field: **2 example chip-links**: `Wikipedia: photosynthesis`, `Article: Why async/await`. Clicking fills the field.
- Generate is disabled and reads `Add API key` with the tooltip *"Add your API key above"* until a key is entered. Once present, button reads `Generate`.

**Button to use:** primary accent; on disabled, gray border, gray text, no fill (do not tope the accent for disabled states).

### 4.2 Top toolbar

**Sticky top**, 56px tall, `--bg-elevated` with `--border` bottom.

```
[≡ sessions ▾]  Quizify           (canvas name, inline rename)        [⚙ gear]
                         (left of center: sessions breadcrumb)   (right)
```

- **Sessions dropdown (`≡`)**: button + caret. Opens a list of sessions:
  - Each row: name, source hostname (caption), relative time.
  - Active session: ✓ + `--accent-subtle` bg.
  - Footer: `+ New canvas` (accent).
  - Swipe row to delete on mobile; on desktop a trailing trash icon on hover.
  - Inline rename via double-click on name in the **breadcrumb**, Enter to save, Esc to cancel.
- **Canvas name** center-left: editable text. Subtle underline on hover.
- **Save chip** (right of name): `Saved ✓` (success, caption) — appears on save, fades after 1.5s.
- **Settings gear**: opens a 320px right-side sheet with: persona reselect (4 buttons, current marked), provider selector (Default / Mistral / NVIDIA buttons), API key field (hidden when Default selected), theme toggle (Auto / Light / Dark), and an "About" link.

### 4.3 Floating canvas controls

Bottom-right cluster, vertical stack, borderless circular buttons (32px, `--bg-elevated`, `shadow-md`):

- `[+]` Zoom in
- `[−]` Zoom out
- `[⊡]` Fit-to-view
- `[1:1]` Zoom to 100%
- `[↺]` Reset layout (reserved for future — fixed-width layout at creation time means no "reset" needed in v1)

On mobile, this cluster collapses to a single `[map]` button (see §5.4).

### 4.4 Concept node

**Container:** borderless — no box, no background. The node is its *content*. A faint hover affordance (`--bg-subtle`, 120ms) suggests interactivity.

**Anatomy (vertical stack, left-aligned, max-width 280px desktop / full available on mobile focus):**

```
1  (small accent counter, e.g. "03", caption, Caveat, secondary)
Concept title                              ← h1, Caveat
────────────────────────────               ← short accent underline (24px, 2px, accent)
2–4 sentence explanation matched to persona. ← body, Caveat, 1.35 line height
This is where the actual teaching happens and
it should breathe — line spacing is generous.

Example: a concrete, real-world instance.   ← body, Caveat, secondary color
                                            (label "Example:" in caption Inter for contrast)

source reference                            ← caption, Inter, tertiary, with 🔗 icon
```

- **Number counter** (`01`…`15`) in the top-left helps wayfinding the chain.
- **Source reference**: a one-line quote or anchored citation to the source URL. Clicking expands to the exact snippet; a small `↗` opens the source URL in a new tab. If the URL wasn't fetchable (LLM fallback), this row reads `from model knowledge` in tertiary.
- **Interactive states:** hover → subtle `--bg-subtle` plate behind content; selected (clicked) → accent outline at 2px with `--accent-subtle` fill and a small `↑/↓/⇄/✎` handle bar at the top.
- **Drag affordance:** entire node is draggable from anywhere within its bounds; drag cursor = `grab` / `grabbing`.

### 4.5 Quiz node

**Container:** borderless like concept nodes, but visually offset — **indented 24px** from the concept's left edge to signal "follow-up", and the title carries a small ▸ glyph + accent color marker.

**States (driven by answer history):**

| State | Visual cue |
|---|---|
| Untested | title marker is an **open circle** in `--text-tertiary` |
| In progress (multiple-attempt quiz) | **half-filled circle** in `--warning` |
| Best attempt correct | **filled circle** in `--success` |
| Best attempt incorrect | **filled circle** in `--danger` |
| Mastered (best ≥ 80% across retakes) | **ring** in `--success` |

**Anatomy (collapsed pre-answer):**

```
▸  Quiz · multiple choice          ← h2, Caveat, with format chip on right (caption Inter)
Which statement best describes X? ← body, Caveat
[ concept links: see Concept 3 ↑ ] ← caption Inter tertiary (anchor to parent)
```

**Anatomy (expanded answer affordance per format):**

- **Multiple choice** — radio list, 2–4 options, each a tappable row with generous height (44px min on mobile). Selected row: accent fill @ 12%, accent left border 2px.
- **True / False** — two large pill buttons side-by-side.
- **Short answer** — single-line text input, accent border on focus.
- **Free-text explanation** — textarea (3 rows), accent border on focus, character count (caption tertiary) below.
- **Fill-in-the-blank** — sentence with an inline inline input replacing the blank; placeholder `____`.
- **Ordering** — vertical list of items with drag handles (⋮⋮), shuffle-only on first render.

Primary **Submit** button (accent, full width of node) below the affordance.

**Post-submit feedback (inline, replaces the affordance):**

```
 ✓ Correct                              ← h2, Caveat, --success
────────────────────────────
Answer: <the correct answer>            ← body, Caveat
Why: 1–2 lines tied to this concept.    ← body, Caveat (longer if LLM-graded)
────────────────────────────
Attempts: 2 · Best: ✓ · [Retake] [Next] ← caption Inter
```

- For LLM-graded (short answer / free text): a **grade badge** on the right of the title — `✓` / `~` (partial) / `✗` — with the model's ideal answer and rationale under the divider.
- `Retake` reopens the answer affordance without clearing history (best score preserved). Cap visible history at 3 attempts; older attempts collapse into a chevron.
- `Next` scrolls/centers the canvas view on the next concept node (acts as "continue" — recommended over forcing scroll).

### 4.6 Summary node

Same borderless treatment as concept, but visually distinct: **slightly wider** (max-width 480px desktop, default estimated 300px at creation), placed after the last quiz node in the horizontal chain.

```
              ◆  Summary                ← h1, Caveat, with ✦ glyph accent
              ────────────────────────  ← 32px accent underline, centered
              
              • strongest insight 1     ← bullets, body + Inter bullet
              • strongest insight 2
              • strongest insight 3
              (4–6 bullets total)
              
              ────────────────────────
              
              Final quiz · mixed formats  ← h2, Caveat + format chips
              
              (a sequence of 5–8 mixed-format questions rendered as the
               per-concept quiz affordances, paginated inline with 
               [Prev][Next] — closing on a results screen:)
              
              ────────────────────────
              Mastery    83%             ← display, Inter, accent
              Concepts mastered   9/12
              Shaky               2
              Untested           1
              ────────────────────────
              [Retake all]  [New canvas]
```

- The final quiz interaction is **sequential** (one question at a time) for focus, despite the node being on a canvas — a small "3 of 8" caption tracks position.
- Results surface **per-concept mastery** list mapping concepts → state badges, so users know which concept nodes on the canvas to scroll back to and re-read.

### 4.7 Note / annotation node

**Created by:** a `+ Note` button in a tiny floating toolbar at top-left of the canvas (only when a session exists, above the bottom controls).

- **Empty note:** a single cavesat placeholder `Jot a thought…`; auto-saves.
- **Styling:** lives on the canvas; treated like any other node, draggable.
- **Connector:** if the user wants to link a note to a concept, they tap a "link" affordance on the note then tap a target concept — a `--border-strong` wiggly connector is drawn between them, with a small paperclip icon at the midpoint. Per spec, connectors are hand-drawn wiggly.
- Note text is Caveat body throughout.

### 4.8 Generation status chip

Bottom-left, small pill (`--bg-elevated`, `shadow-sm`, 32px tall), with a small spinner (`--accent`):
- `"Generating concept 3 of ~12…"`
- On completion for <100ms: `"Done ✓"` (success) before fading.
- During generation: a thin accent progress bar runs along the very **bottom edge of the canvas viewport** (2px tall, indeterminate shimmer) — feels alive without being noisy.
- A `Cancel` link sits to the right of the chip; on cancel, the chip reads `"Generation stopped · 4 concepts produced"` and the canvas stays usable.

### 4.9 Empty / initial canvas state (behind modal)

When the welcome modal is dismissed or no canvas exists:

- Canvas viewport is `--bg-canvas`.
- Centered, very faint placeholder text Inter caption tertiary: `"Paste a URL to start learning \n Your concepts and quizzes will appear here."`
- A subtle 12-step grid dot pattern at 4% alpha (white dots on the paper bg, dark dots on dark bg) — signals "this is a canvas" without being distracting.

---

## 5. Layout & responsive behavior

### 5.1 Breakpoints

| Token | Min width | Behavior |
|---|---|---|
| `mobile` | <640px | One-node focus + map toggle |
| `tablet` | 640–1024 | Same canvas behavior as desktop, tighter node sizes |
| `desktop` | ≥1024px | Multi-column canvas, full multi-node view |

### 5.2 Desktop canvas layout

- Per `product_spec.md §5.2`: **horizontal chain** — concept → quiz → concept → quiz → … → summary.
- All nodes sit at `y = 100` (single horizontal line).
- Estimated widths assigned at creation: concept ~260px, quiz ~240px, summary ~300px.
- Gap between nodes: **120px**.
- Users drag nodes freely; initial positions are a starting layout, not enforced after creation.

### 5.3 Connectors & routing

- **Hand-drawn wiggly** lines (Excalidraw's `roughjs` style) between:
  - each concept node → its quiz node (horizontal wiggly link with subtle accent at 60% opacity),
  - concept nodes in reading order (very faint `--text-tertiary` wiggly line at 40% alpha as "flow guide"),
  - notes → their linked concept (paperclip icon at midpoint).
- The "flow guide" connectors can be toggled off in settings (default on).
- When the user drags a node the connector to its quiz / parent / linked note naturally re-routes; wiggly segments regenerate but stay consistent in style.

### 5.4 Mobile: one-node focus + map toggle

On `mobile` (`<640px`):

- Default view is **single-node focus**: one node (concept or quiz) centered, with horizontal edge swipe to move to the previous/next node in reading order. A thin accent progress bar at the top reads, e.g., `3 / 15`.
- A small floating "map" button (bottom-right) opens a **minimap overlay**: the full canvas rendered tiny; tap any node to close the overlay and focus that node. Pinch-to-zoom the minimap, scroll to pan. The current focus node is highlighted with an accent pill on the minimap.
- Concept-vs-quiz focus treats them as separate steps in reading order — so you read concept 3, then quiz 3, then concept 4.
- All inputs grow to 44px tap targets; buttons span at least 200px width.
- The wiggly connector style is reserved for the map view (you don't see connectors in focus view).

### 5.5 Touch targets & accessibility

- All interactive non-canvas controls are ≥44px min target (WCAG 2.5.5).
- Canvas content text remains at ≥16px effective (Caveat's stated min 0.95rem).
- Focus rings: `--accent-subtle` 3px halo, visible on keyboard nav (not on mouse/tap).
- AA contrast verified on: text-primary on bg-canvas (light 14.2:1, dark 12.4:1), accent on bg-canvas (light 5.7:1 ✓, dark 5.1:1 ✓) — both pass AA for normal and large text.
- Reduced motion (`prefers-reduced-motion: reduce`): node stream-in becomes a 0ms fade-in; canvas pan/zoom already instant.

---

## 6 Interaction states

### 6.1 Canvas pan/zoom

| Input | Action |
|---|---|
| Mouse drag on background | Pan |
| Wheel | Pan vertically / scroll |
| `Shift` + Wheel | Pan horizontally |
| `Cmd/Ctrl` + Wheel | Zoom |
| Pinch (trackpad / touch) | Zoom |
| Two-finger drag (touch) | Pan |
| Double-click background | Reset zoom to 100% at that point |
| `0` / `1` / `f` keys | 0 = 100%, 1 = 100%, f = fit |

### 6.2 Node selection

- Single click selects a node (accent outline + top handle bar with position controls for adjacent slots).
- Esc deselects.
- Click on background also deselects.

### 6.3 Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | New note at center of viewport |
| `F` | Fit-to-view |
| `Esc` | Deselect / close modal / close map |
| `Enter` (on a selected quiz node) | Open answer affordance |
| `Tab` | Move focus to next concept in reading order |
| `←/→` (mobile-equivalent: swipe) | Prev / Next in reading order (mobile focus view) |

Shortcuts appear as small caption hints at the bottom of modals ("Esc to close", "Enter to submit") — not in a separate help dialog in v1.

---

## 7. Animations & micro-interactions

- **Persona card selection:** subtle 120ms pop (scale 1.02 → 1) when chosen; deselected cards dim to 60% opacity.
- **Successful quiz answer:** the success badge circle fills in 200ms; the node does a subtle 4px vertical bounce. No confetti — calm wins.
- **Incorrect quiz answer:** the danger badge appears with a 40ms × 3 horizontal jitter (subtle, no audio).
- **Summary results screen:** mastery % counts up from 0 over 800ms, the rest of the stats fade in 80ms staggered.
- **Save indicator:** `Saved ✓` fades in 120ms, holds 1.5s, fades out 160ms. Only triggers on actual write to IndexedDB.
- **Node stream-in stagger:** 80ms between consecutive nodes so the chain visibly builds left-to-right (per design principle 5).

---

## 8. Copy & voice

- The product *voice* is encouraging but not chirpy.
- UI copy in Inter components stays crisp and friendly; canvas content in Caveat uses warm, first-person phrasing ("This is how X works", "Try this").
- Quiz calibration feels personal: "Got it!" rather than "Well done, learner!". Avoid emojis in UI copy (per general style guide).
- Empty states always suggest the next action; never say "Nothing here".

---

## 9. Iconography detail

All from Lucide (1.5px stroke, 20px default unless specified).

| Use | Icon |
|---|---|
| Persona: Curious | `Sparkles` |
| Persona: Student | `GraduationCap` |
| Persona: Professional | `Briefcase` |
| Persona: Expert | `Microscope` |
| Sessions | `GalleryHorizontal` |
| Settings | `Settings2` |
| Zoom in / out | `Plus` / `Minus` |
| Fit-to-view | `Maximize2` |
| 100% | `Scan` |
| Reset layout (reserved) | `RotateCcw` |
| Add note | `StickyNote` |
| Map toggle (mobile) | `Map` |
| Save | `Check` |
| Trash | `Trash2` |
| External link | `ArrowUpRight` |
| Search concepts (post-MVP) | `Search` |

---

## 10. Outstanding design questions (forward list)

- [ ] **Loading state for URL fetch network call** vs generation itself — single combined chip or two-stage?
- [ ] **Mobile minimap rendering**: full fidelity of nodes vs simplified blocks — needs performance pass on phones.
- [ ] **Persona card copy** (final labels + 1-line descriptions per persona) — pending product review of §4.1 verbatim.
- [ ] **Quiz format distribution**: spec implies random per node; do we cap to, say, max 2 short-answer formats per canvas to reduce token cost on grading calls?
- [ ] **Roughjs vs hand-drawn alternative**: confirm `roughjs` outputs the wiggly style we want on Retina displays (may need stroke variance tuning).
- [ ] **Empty state copy** — needs final wording and whether it tilts between "encouraging" vs "functional".
- [ ] **Printer-friendly view** (post-MVP) — confirm borderless nodes don't print blankly; pending dark/light considerations.
- [ ] **Pointer/touch detection for tutorial hints** — should we ever show a "drag to pan" hint? Modal only on first canvas generation, then stored?

---

*End of design spec.*
