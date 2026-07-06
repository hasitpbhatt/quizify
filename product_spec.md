# Quizify — Product Specification

> **Status:** v1 (MVP) scope
> **Last updated:** 2026-07-05
> **Owner:** Product

---

## 1. Overview

**Quizify** is a canvas-based learning application. The user provides a URL (article, blog, Wikipedia, PDF, or similar), and Quizify generates a spatial, explorable canvas of concept explanations and verification quizzes — letting them learn, verify what they know, and revisit anything later.

The primary interaction model is an **infinite pannable canvas** (Miro/Figma-style) where concepts and quizzes live as connected nodes.

### 1.1 Jobs-to-be-done (priority order)

1. **Verify learning** — confirm understanding after reading/studying something.
2. **Learn a new topic fast** — get a primed, structured primer from a source.
3. **Retain knowledge long-term** — revisit the canvas, re-read nodes, and retake quizzes.

### 1.2 Target users

No fixed persona. On first launch the user self-selects into one of **4 persona cards** (see §4.1). The selection tailors explanation depth and quiz difficulty. Selection is stored locally; no account needed.

---

## 2. Scope

### 2.1 In scope (v1 / MVP — core loop only)

- URL input → AI generates content → canvas with concept + quiz nodes → user answers quizzes → scores recorded → session saved locally.
- Persona onboarding (4 cards).
- Multiple named sessions persisted in the browser.
- Inline immediate quiz feedback.
- Live-streaming node generation.

### 2.2 Out of scope (v1)

- Login / accounts / cloud sync.
- Export, share link, read-only sharing.
- Real-time multiplayer collaboration.
- SRS / spaced-repetition engine.
- Book-title lookup, file upload, free-text topic input.
- Backend proxy (key is user-supplied, stored locally).
- Inline regeneration of individual nodes.

These are deferred but architecture should not preclude them — see §9.

---

## 3. Platforms & Non-functional

| Item | Decision |
|---|---|
| Platform | Web, responsive — desktop and mobile browsers |
| Canvas | Infinite pannable + zoomable, touch-friendly (pinch/drag) and pointer-friendly (drag/wheel) |
| Accounts | None — fully local |
| Persistence | Browser storage (IndexedDB recommended) — multiple named sessions |
| AI provider | Three providers: Quizify Default (proxy-managed, no key needed, experimental), Mistral or NVIDIA (user-supplied API key, stored locally). Selected via buttons in Welcome modal. |
| Content fetching | App fetches URL content server-side-ish via a lightweight function/edge route and streams to LLM. Unknown/un-fetchable URLs fall back to LLM's own knowledge. |

---

## 4. Onboarding & First Run

### 4.1 Persona selection

On first launch (no saved persona), a **welcome modal** appears with **4 persona cards** in a row, each a single click — no typing, no LLM tokens spent:

- **Curious beginner** — simple language, everyday analogies, foundational quizzes.
- **Student** — textbook depth, exam-style questions.
- **Professional** — practical/business framing, applied scenarios.
- **Expert** — terse, technical, edge-case-heavy quizzes.

Selection is saved locally as `persona` and reused on every generation until the user changes it in settings. No re-prompt on subsequent visits.

### 4.2 API key setup

Same welcome modal asks the user to select a provider. For Mistral or NVIDIA, the user pastes the corresponding **API key** (stored in localStorage, sent only to the selected provider's API). For the default "Quizify (Default)" provider, no API key is needed — requests go through a server-side proxy (experimental, may not always work). When a key-requiring provider is selected, the key field is masked with a "show/hide" toggle.

If no key is entered when required, the Generate button is disabled with a tooltip: *"Add your API key in settings."*

---

## 5. The Canvas

### 5.1 Empty state

Before any canvas is generated:

- The welcome modal (§4) is shown.
- Behind/below the modal, the canvas is intentionally blank — a subtle hint ("Generate a canvas to begin") — but generation is only triggered from the modal's URL field.

### 5.2 Layout

- Nodes are placed by Quizify in a **horizontal chain**:
  - Concept 1 → Quiz 1 → Concept 2 → Quiz 2 → ... → Summary.
  - All nodes sit on a single horizontal line, spaced by estimated width + gap.
  - Reading order: left to right.
- A **final summary node** is placed after the last quiz node.

```
Concept 1 → Quiz 1 → Concept 2 → Quiz 2 → … → Concept N → Quiz N → Summary
```

- Nodes are fully **draggable**; connectors re-route. Initial positions are a starting layout — once the user moves a node it stays where placed.
- Standard canvas controls: zoom (wheel/pinch), pan (drag background / two-finger), fit-to-view button, zoom-to-100% button.

### 5.3 Node types

| Node | Purpose | Contents |
|---|---|---|
| **Concept node** | Teach one concept | Title, 2–4 sentence explanation matched to persona depth, a concrete example, "source reference" (quote or URL anchor if fetchable). |
| **Quiz node** | Verify the preceding concept | Question + answer affordance depends on format (§6). Placed immediately below/after its parent concept node. |
| **Note / annotation node** | User-added freeform note | Created by the user via canvas toolbar; can be attached (linked) to any concept node by drawing a connector. Text only in v1. |
| **Summary node** | Recap + final mixed quiz | (a) A 4–6 bullet recap of the strongest insights, and (b) a **final summary quiz** pulling questions across multiple concepts. |

### 5.4 Number of concepts (depth)

**Deep dive — 10 to 15 concepts** per generated canvas, irrespective of persona (persona affects wording/depth, not count). Final summary quiz pulls 5–8 questions spanning the 10–15 concepts.

### 5.5 Generation UX

- While generating, nodes are **streamed onto the canvas live** as each concept+quiz pair completes. The user sees the canvas physically fill up left to right.
- Each node animates in (fade/scale up).
- A small status chip in the corner shows: *"Generating concept 3 of ~12…"*
- The URL field / Generate button is disabled until generation completes (with a "Cancel" option that stops further node generation and keeps what's already been produced).

---

## 6. Quizzes

### 6.1 Question formats (all supported in v1)

Per-concept quiz node randomly picks a format; the summary quiz intentionally mixes formats.

1. **Multiple choice** — pick one correct from several options.
2. **True / False** — single statement, T/F.
3. **Short answer (LLM-graded)** — user types a short answer; the LLM grades it correct/partial/incorrect with rationale.
4. **Free-text explanation** — user explains in their own words; LLM grades understanding (0–100% or rubric bands).
5. **Fill-in-the-blank** — sentence with missing word/phrase; user types it; exact or LLM-graded fuzzy match.
6. **Ordering / sequencing** — user reorders a shuffled list into correct order (drag to reorder).

### 6.2 Feedback model

**Immediate, inline feedback** for every quiz node the moment the user submits:

- Correct / incorrect (or graded score for short answer / free text).
- The correct answer is revealed.
- A **1–2 line explanation tied specifically to the parent concept** (not generic) — anchors the right answer back to the learning.
- For LLM-graded formats: the model returns a qualitative judgment + the ideal answer + the rationale.

After answering, the quiz node shows a **state badge** (e.g. ✓ Correct, ✗ Try again) and stays on the canvas for revisit. Quizzes can be **retaken** — retake updates the score history (kept locally, last 3 attempts shown collapsed).

### 6.3 Scoring

- Each quiz node records: format, attempt count, last score, best score, timestamp.
- **Summary node** aggregates: total questions, % correct (best attempt per node), and a per-concept mastery indicator (mastered / shaky / untested).
- Scores live on the node and in lightweight local history — no separate analytics screen in v1.

---

## 7. Sessions & Persistence

- Everything is local (no login, no server-side user data).
- A **session** = one named canvas (a URL + generated nodes + user notes + scores).
- Users manage sessions via a small sessions dropdown in the top toolbar: create new, rename, switch, delete.
- On New generation: user is prompted to name (or auto-name from URL hostname + date).
- Storage recommendation: **IndexedDB** (canvas state is large; localStorage limits will bite). Structure:
  - `sessions[]` → `{ id, name, url, persona, createdAt, updatedAt, nodes[], edges[], scores{} }`
- Auto-save on every change (debounced), plus an explicit "Saved ✓" indicator.

---

## 8. Key User Flows

### 8.1 First-time user
1. Open Quizify → welcome modal.
2. Pick a persona card (one click).
3. Select provider (Default / Mistral / NVIDIA), paste API key if needed → confirm.
4. Paste URL → **Generate**.
5. Watch canvas stream in (~10–15 concepts). 
6. Open concept 1 → read → answer quiz 1 → see feedback. Repeat.
7. Hit summary node → take mixed quiz → see mastery %.
8. Sessions dropdown shows the canvas saved with an auto-name.

### 8.2 Returning user
1. Open Quizify → canvas list or last session.
2. Resume: re-read nodes, retake quizzes, revisit wrong-concept areas visually on the canvas.

### 8.3 Change persona / API key
Via top-right settings gear → re-shows persona cards and API key field. Change applies to *future* generations only.

---

## 9. Architecture notes (forward-compatible)

Design so these later changes are low-cost:

- **AI provider abstraction** — already done: `chat.ts` is provider-agnostic, `providers.ts` defines per-provider config. Adding OpenAI/Anthropic/Gemini/Ollama is a one-file config addition. The default provider (`'default'`) shows how to add a proxy-based provider with `requiresApiKey: false`.
- **Auth/sync later** — keep `sessions[]` shape server-ready; an optional `/sessions` REST endpoint could mirror local state.
- **Other input types later** — input pipeline should accept a generic "source" object `{ type: 'url' | 'topic' | 'file' | 'book', payload }`; only `type='url'` is wired in v1.
- **Node-level regeneration later** — store per-node generation inputs separately so a single concept can be re-rolled without re-running the whole pipeline.
- **SRS later** — store per-concept last-attempt timestamp + score; an SRS scheduler can read this without schema changes.

Recommended stack: React + **React Flow** canvas, IndexedDB via **idb**, LLM calls via raw `fetch` to the selected provider's API (Default / Mistral / NVIDIA), Vite dev-proxy for CORS-free development.

---

## 10. Open questions / TBD

- [ ] Exact set of 4 persona card labels and copy.
- [ ] Which quiz format(s) appear most often (should MCQ be the default weight, with the others as variety)?
- [ ] How to handle PDFs at URLs — fetch and text-extract, or pass as-is to the LLM where supported?
- [ ] Token budget per generation (10–15 concepts × explanations × quizzes could be heavy in a single call). Decide chunking strategy and max concepts for v1.
- [ ] Failure handling when URL content can't be fetched (fallback to LLM knowledge — confirm this fallback is silent or surfaces a banner).
- [ ] Mobile-specific canvas gestures and node sizing (need design pass for touch targets ≥44px).

---

*End of spec.*
